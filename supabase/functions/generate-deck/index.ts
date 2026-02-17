import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, handleCors, jsonResponse, getModelMap, deductEnergy, logTokenUsage, fetchPromptConfig } from "../_shared/utils.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

const DEFAULT_SYSTEM_PROMPT = `Você é um especialista em educação e criação de flashcards usando técnicas de aprendizagem ativa (active recall, interleaving, elaborative interrogation).

Sua missão: criar flashcards que ajudem o estudante a DOMINAR o conteúdo — não apenas memorizar, mas compreender profundamente e aplicar.

PRINCÍPIOS:
1. PROFUNDIDADE: Crie perguntas que testem compreensão, não apenas memorização. Ex: "Por que X causa Y?" ao invés de "O que é X?"
2. AUTOCONTIDO: Cada cartão deve conter TODO o contexto necessário. NUNCA referencie "anexo", "figura", "imagem acima", "tabela ao lado" ou qualquer elemento externo.
3. PRÁTICO: Inclua perguntas de aplicação clínica/prática quando relevante.
4. CONEXÕES: Faça perguntas que conectem conceitos entre si.
5. EXCLUSIVIDADE: Use APENAS informações presentes no material fornecido. NUNCA invente dados.

Responda APENAS com o JSON solicitado, sem texto adicional.`;

function getDetailInstruction(level: string): string {
  switch (level) {
    case "essential": return "Crie poucos cartões focados nos conceitos mais fundamentais. Priorize o que cairia numa prova.";
    case "comprehensive": return "Crie cartões com cobertura ampla e detalhada. Inclua conceitos principais, secundários, mecanismos, exemplos clínicos, exceções e relações entre tópicos.";
    default: return "Crie um bom equilíbrio cobrindo conceitos-chave, mecanismos importantes e aplicações práticas.";
  }
}

function getFormatInstructions(formats: string[]): string {
  const parts: string[] = [];
  const formatNames: string[] = [];
  const forbiddenNames: string[] = [];

  const allFormats = [
    { key: "qa", aliases: ["definition", "qa"], instruction: '- type:"basic": Pergunta direta e DESAFIADORA na frente. Resposta concisa e precisa no verso. Prefira perguntas "Por quê?", "Como?", "Qual a diferença entre?" ao invés de "O que é?". A pergunta DEVE ser autocontida.', name: "pergunta/resposta", typeName: "basic" },
    { key: "cloze", aliases: ["cloze"], instruction: '- type:"cloze": Afirmação completa com lacuna estratégica usando {{c1::resposta}}. "front" contém o texto com {{c1::...}}, "back" fica vazio. A lacuna deve testar um conceito-chave, não uma palavra trivial.', name: "cloze", typeName: "cloze" },
    { key: "multiple_choice", aliases: ["multiple_choice"], instruction: '- type:"multiple_choice": Pergunta clínica/aplicada na "front", "back" vazio. "options" com 4-5 alternativas plausíveis (não absurdas). "correctIndex" com o índice correto (0-based). As alternativas incorretas devem ser distratores realistas.', name: "múltipla escolha", typeName: "multiple_choice" },
  ];

  for (const f of allFormats) {
    if (f.aliases.some(a => formats.includes(a))) {
      parts.push(f.instruction);
      formatNames.push(f.name);
    } else {
      forbiddenNames.push(f.typeName);
    }
  }

  if (parts.length === 0) {
    parts.push(allFormats[0].instruction);
    formatNames.push(allFormats[0].name);
  }

  const count = formatNames.length;
  if (count === 1) {
    parts.push(`\nUse EXCLUSIVAMENTE o formato "${formatNames[0]}" para TODOS os cartões.`);
  } else {
    parts.push(`\nDISTRIBUIÇÃO OBRIGATÓRIA: Distribua os cartões UNIFORMEMENTE entre: ${formatNames.join(", ")}. Cada formato deve ter aproximadamente ${Math.round(100/count)}% dos cartões.`);
  }

  if (forbiddenNames.length > 0) {
    parts.push(`\nPROIBIDO: NÃO gere cartões do tipo ${forbiddenNames.map(n => `"${n}"`).join(", ")}. Será rejeitado.`);
  }

  return parts.join("\n");
}

function getOutputExamples(formats: string[]): string {
  const examples: string[] = [];
  if (formats.includes("definition") || formats.includes("qa")) {
    examples.push('{"front":"Qual o mecanismo pelo qual X causa Y?","back":"X inibe Z, levando a...","type":"basic"}');
  }
  if (formats.includes("cloze")) {
    examples.push('{"front":"A {{c1::proteína p53}} é responsável por...","back":"","type":"cloze"}');
  }
  if (formats.includes("multiple_choice")) {
    examples.push('{"front":"Paciente com sintomas X, Y e Z. Qual o diagnóstico mais provável?","back":"","type":"multiple_choice","options":["Opção A","Opção B","Opção C","Opção D"],"correctIndex":1}');
  }
  if (examples.length === 0) {
    examples.push('{"front":"Qual o mecanismo pelo qual X causa Y?","back":"X inibe Z, levando a...","type":"basic"}');
  }
  return `[\n  ${examples.join(',\n  ')}\n]`;
}

function mapCardType(type: string, allowedFormats: string[]): string {
  // Direct matches
  if (type === "cloze" && allowedFormats.includes("cloze")) return "cloze";
  if (type === "multiple_choice" && allowedFormats.includes("multiple_choice")) return "multiple_choice";
  if ((type === "basic" || type === "qa" || type === "definition") && (allowedFormats.includes("qa") || allowedFormats.includes("definition"))) return "basic";

  // Type not allowed — map to first allowed format
  if (allowedFormats.includes("cloze")) return "cloze";
  if (allowedFormats.includes("multiple_choice")) return "multiple_choice";
  if (allowedFormats.includes("qa") || allowedFormats.includes("definition")) return "basic";
  return "basic";
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "Não autenticado" }, 401);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return jsonResponse({ error: "Token inválido" }, 401);
    const userId = user.id;

    const { textContent, cardCount, detailLevel, cardFormats, customInstructions, aiModel, energyCost } = await req.json();

    if (!OPENAI_API_KEY) return jsonResponse({ error: "OPENAI_API_KEY não configurada" }, 500);
    if (!textContent?.trim()) return jsonResponse({ error: "textContent é obrigatório" }, 400);

    const cost = energyCost || 0;
    if (cost > 0) {
      const ok = await deductEnergy(supabase, userId, cost);
      if (!ok) return jsonResponse({ error: "Créditos IA insuficientes", requiresCredits: true }, 402);
    }

    const promptConfig = await fetchPromptConfig(supabase, "generate_deck");
    const MODEL_MAP = await getModelMap(supabase);
    const selectedModel = MODEL_MAP[aiModel || promptConfig?.default_model || "flash"] || "gpt-4o-mini";
    const temperature = promptConfig?.temperature ?? 0.5;

    const trimmedContent = textContent.slice(0, 8000);
    const requestedCount = cardCount > 0 ? Math.min(Math.max(cardCount, 3), 50) : 0;
    const formats = cardFormats?.length ? cardFormats : ["qa", "cloze", "multiple_choice"];
    const detail = detailLevel || "standard";

    let systemPrompt = promptConfig?.system_prompt || DEFAULT_SYSTEM_PROMPT;

    if (customInstructions && /prova|exame|questões/i.test(customInstructions)) {
      systemPrompt = "Você é um gerador de questões de prova acadêmica de alta qualidade. Gere apenas o JSON solicitado, sem texto adicional.";
    }

    const prompt = `Crie flashcards de alta qualidade para ajudar o estudante a DOMINAR este conteúdo.

REGRAS:
- ${requestedCount > 0 ? `Crie exatamente ${requestedCount} cartões.` : 'Crie a quantidade ideal para cobrir o conteúdo de forma completa.'}
- ${getDetailInstruction(detail)}
- TUDO em PORTUGUÊS (ou na língua do material).
- Varie os TIPOS de pergunta: definição, mecanismo, comparação, aplicação clínica, causa-efeito.
- Cada cartão deve ser AUTOCONTIDO (sem referências a anexos/figuras/imagens).
${customInstructions ? `\nINSTRUÇÕES DO USUÁRIO:\n${customInstructions}` : ""}

FORMATOS PERMITIDOS:
${getFormatInstructions(formats)}

MATERIAL:
${trimmedContent}

FORMATO DE SAÍDA (apenas JSON array, sem texto extra):
${getOutputExamples(formats)}`;

    console.log(`Using model: ${selectedModel}, textLen: ${trimmedContent.length}, formats: ${formats.join(",")}`);

    const aiResponse = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({ model: selectedModel, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: prompt }], temperature, max_tokens: 4096 }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("OpenAI error:", aiResponse.status, errText);
      if (aiResponse.status === 429) return jsonResponse({ error: "Limite de requisições excedido. Tente em alguns segundos." }, 429);
      return jsonResponse({ error: "Serviço de IA indisponível" }, 502);
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData.choices?.[0]?.message?.content ?? "";
    console.log("AI response length:", rawContent.length, "first 200 chars:", rawContent.substring(0, 200));

    const totalPromptTokens = aiData.usage?.prompt_tokens || 0;
    const totalCompletionTokens = aiData.usage?.completion_tokens || 0;
    const totalTokensSum = aiData.usage?.total_tokens || 0;

    let jsonStr = rawContent;
    const m = rawContent.match(/\[[\s\S]*\]/);
    if (m) jsonStr = m[0];

    let cards: { front: string; back: string; type: string; options?: string[]; correctIndex?: number }[];
    try { cards = JSON.parse(jsonStr); } catch {
      console.error("Parse failed, raw:", rawContent.substring(0, 500));
      await logTokenUsage(supabase, userId, "generate_deck", selectedModel, { prompt_tokens: totalPromptTokens, completion_tokens: totalCompletionTokens, total_tokens: totalTokensSum }, cost);
      return jsonResponse({ error: "A IA não conseguiu gerar cards. Tente novamente ou use menos conteúdo." }, 500);
    }

    if (!Array.isArray(cards) || cards.length === 0) {
      await logTokenUsage(supabase, userId, "generate_deck", selectedModel, { prompt_tokens: totalPromptTokens, completion_tokens: totalCompletionTokens, total_tokens: totalTokensSum }, cost);
      return jsonResponse({ error: "Nenhum cartão gerado." }, 400);
    }

    // Map card types respecting user-selected formats
    cards = cards.map(c => ({
      front: c.front || "", back: c.back || "",
      type: mapCardType(c.type, formats),
      ...(c.type === "multiple_choice" && c.options ? { options: c.options, correctIndex: c.correctIndex ?? 0 } : {}),
    }));

    await logTokenUsage(supabase, userId, "generate_deck", selectedModel, { prompt_tokens: totalPromptTokens, completion_tokens: totalCompletionTokens, total_tokens: totalTokensSum }, cost);

    return jsonResponse({ cards });
  } catch (err) {
    console.error("Error:", err);
    return jsonResponse({ error: "Erro interno do servidor" }, 500);
  }
});
