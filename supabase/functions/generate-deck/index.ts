import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, handleCors, jsonResponse, getModelMap, deductEnergy, logTokenUsage, fetchPromptConfig } from "../_shared/utils.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

const DEFAULT_SYSTEM_PROMPT = `Você é um especialista em educação e criação de flashcards usando técnicas de aprendizagem ativa (active recall, interleaving, elaborative interrogation).

Sua missão: criar flashcards que ajudem o estudante a DOMINAR o conteúdo — não apenas memorizar, mas compreender profundamente e aplicar.

PRINCÍPIOS:
1. VARIEDADE DE FORMATOS: Distribua UNIFORMEMENTE entre os formatos solicitados (pergunta/resposta, cloze, múltipla escolha). NUNCA gere todos do mesmo tipo.
2. PROFUNDIDADE: Crie perguntas que testem compreensão, não apenas memorização. Ex: "Por que X causa Y?" ao invés de "O que é X?"
3. AUTOCONTIDO: Cada cartão deve conter TODO o contexto necessário. NUNCA referencie "anexo", "figura", "imagem acima", "tabela ao lado" ou qualquer elemento externo.
4. PRÁTICO: Inclua perguntas de aplicação clínica/prática quando relevante.
5. CONEXÕES: Faça perguntas que conectem conceitos entre si.
6. EXCLUSIVIDADE: Use APENAS informações presentes no material fornecido. NUNCA invente dados.

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
  if (formats.includes("definition") || formats.includes("qa")) parts.push('- type:"basic": Pergunta direta e DESAFIADORA na frente. Resposta concisa e precisa no verso. Prefira perguntas "Por quê?", "Como?", "Qual a diferença entre?" ao invés de "O que é?". A pergunta DEVE ser autocontida.');
  if (formats.includes("cloze")) parts.push('- type:"cloze": Afirmação completa com lacuna estratégica usando {{c1::resposta}}. "front" contém o texto com {{c1::...}}, "back" fica vazio. A lacuna deve testar um conceito-chave, não uma palavra trivial.');
  if (formats.includes("multiple_choice")) parts.push('- type:"multiple_choice": Pergunta clínica/aplicada na "front", "back" vazio. "options" com 4-5 alternativas plausíveis (não absurdas). "correctIndex" com o índice correto (0-based). As alternativas incorretas devem ser distratores realistas.');
  if (parts.length === 0) parts.push('- Use type:"basic" com pergunta desafiadora na frente e resposta no verso.');

  const count = parts.length;
  const formatNames: string[] = [];
  if (formats.includes("definition") || formats.includes("qa")) formatNames.push("pergunta/resposta");
  if (formats.includes("cloze")) formatNames.push("cloze");
  if (formats.includes("multiple_choice")) formatNames.push("múltipla escolha");
  if (formatNames.length === 0) formatNames.push("pergunta/resposta");

  if (count === 1) {
    parts.push(`\nUse EXCLUSIVAMENTE o formato "${formatNames[0]}" para TODOS os cartões.`);
  } else {
    parts.push(`\nDISTRIBUÇÃO OBRIGATÓRIA: Distribua os cartões UNIFORMEMENTE entre: ${formatNames.join(", ")}. Cada formato deve ter aproximadamente ${Math.round(100/count)}% dos cartões. NÃO gere todos do tipo "basic".`);
  }
  return parts.join("\n");
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

    const { textContent, cardCount, detailLevel, cardFormats, customInstructions, action, existingCards, aiModel, energyCost, pageImages } = await req.json();

    if (!OPENAI_API_KEY) return jsonResponse({ error: "OPENAI_API_KEY não configurada" }, 500);
    const hasPageImages = Array.isArray(pageImages) && pageImages.length > 0;
    if (!textContent?.trim() && !hasPageImages) return jsonResponse({ error: "textContent ou pageImages é obrigatório" }, 400);

    const visionModel = "gpt-4o";

    const cost = energyCost || 0;
    if (cost > 0) {
      const ok = await deductEnergy(supabase, userId, cost);
      if (!ok) return jsonResponse({ error: "Créditos IA insuficientes", requiresCredits: true }, 402);
    }

    const promptConfig = await fetchPromptConfig(supabase, "generate_deck");
    const MODEL_MAP = await getModelMap(supabase);
    const selectedModel = MODEL_MAP[aiModel || promptConfig?.default_model || "flash"] || "gpt-4o-mini";
    const temperature = promptConfig?.temperature ?? 0.5;

    const trimmedContent = (textContent || "").slice(0, 8000);
    const requestedCount = cardCount > 0 ? Math.min(Math.max(cardCount, 3), 50) : 0;
    const formats = cardFormats?.length ? cardFormats : ["qa", "cloze", "multiple_choice"];
    const detail = detailLevel || "standard";

    let systemPrompt = promptConfig?.system_prompt || DEFAULT_SYSTEM_PROMPT;

    if (customInstructions && /prova|exame|questões/i.test(customInstructions)) {
      systemPrompt = "Você é um gerador de questões de prova acadêmica de alta qualidade. Gere apenas o JSON solicitado, sem texto adicional.";
    }

    let prompt: string;

    if (action === "analyze") {
      const existingJson = JSON.stringify(existingCards || []);
      prompt = `Você é um especialista em educação analisando a cobertura de um conjunto de flashcards em relação ao material de estudo original.

MATERIAL ORIGINAL DO ALUNO:
${trimmedContent}

CARTÕES JÁ CRIADOS PELO ALUNO:
${existingJson}

TAREFA:
1. Compare CADA tópico, conceito, definição e informação importante do material com os cartões existentes.
2. Identifique quais tópicos do material NÃO estão cobertos pelos cartões.
3. Avalie a profundidade: os cartões cobrem superficialmente ou em profundidade?

Responda APENAS com JSON válido:
{
  "coveragePercent": <0-100 representando quanto do material está coberto pelos cartões>,
  "missingTopics": ["tópico específico 1 que falta", "tópico específico 2 que falta"],
  "coveredTopics": ["tópico 1 coberto", "tópico 2 coberto"],
  "summary": "Resumo detalhado em português da análise de cobertura, mencionando pontos fortes e fracos",
  "recommendation": "Recomendação prática para o aluno melhorar seus estudos"
}`;
    } else if (action === "fill-gaps") {
      const existingJson = JSON.stringify(existingCards || []);
      prompt = `Crie cartões para tópicos AINDA NÃO cobertos.\n\nMATERIAL:\n${trimmedContent}\n\nCARTÕES EXISTENTES (NÃO repita):\n${existingJson}\n\nREGRAS:\n- ${requestedCount > 0 ? `Crie ${requestedCount} cartões novos.` : 'Crie a quantidade necessária para cobrir os tópicos faltantes.'}\n- ${getDetailInstruction(detail)}\n- TUDO em PORTUGUÊS (ou na língua do material).\n\nFORMATOS PERMITIDOS:\n${getFormatInstructions(formats)}\n\nFORMATO DE SAÍDA (apenas JSON array):\n[{"front":"...","back":"...","type":"basic"},{"front":"{{c1::resposta}} completa frase","back":"","type":"cloze"},{"front":"pergunta","back":"","type":"multiple_choice","options":["A","B","C","D"],"correctIndex":0}]`;
    } else {
      const materialSection = hasPageImages
        ? (trimmedContent ? `\nTEXTO EXTRAÍDO (complementar às imagens):\n${trimmedContent}` : "\nAs imagens das páginas estão anexadas abaixo.")
        : `\nMATERIAL:\n${trimmedContent}`;

      prompt = `Crie flashcards de alta qualidade para ajudar o estudante a DOMINAR este conteúdo.

REGRAS:
- ${requestedCount > 0 ? `Crie exatamente ${requestedCount} cartões.` : 'Crie a quantidade ideal para cobrir o conteúdo de forma completa.'}
- ${getDetailInstruction(detail)}
- TUDO em PORTUGUÊS (ou na língua do material).
- Varie os TIPOS de pergunta: definição, mecanismo, comparação, aplicação clínica, causa-efeito.
- Cada cartão deve ser AUTOCONTIDO (sem referências a anexos/figuras/imagens).
${hasPageImages ? "- ANALISE as imagens das páginas. Extraia informações de diagramas, gráficos, fórmulas e tabelas. Descreva o conteúdo visual diretamente no cartão.\n" : ""}${customInstructions ? `\nINSTRUÇÕES DO USUÁRIO:\n${customInstructions}` : ""}

FORMATOS PERMITIDOS:
${getFormatInstructions(formats)}
${materialSection}

FORMATO DE SAÍDA (apenas JSON array, sem texto extra):
[
  {"front":"Qual o mecanismo pelo qual X causa Y?","back":"X inibe Z, levando a...","type":"basic"},
  {"front":"A {{c1::proteína p53}} é responsável por...","back":"","type":"cloze"},
  {"front":"Paciente com sintomas X, Y e Z. Qual o diagnóstico mais provável?","back":"","type":"multiple_choice","options":["Opção A","Opção B","Opção C","Opção D"],"correctIndex":1}
]`;
    }

    // Build user message content
    let userContent: any;
    if (hasPageImages) {
      userContent = [
        { type: "text", text: prompt },
        ...pageImages.map((img: string) => ({
          type: "image_url",
          image_url: { url: img.startsWith("data:") ? img : `data:image/jpeg;base64,${img}`, detail: "auto" },
        })),
      ];
    } else {
      userContent = prompt;
    }

    const modelToUse = hasPageImages ? visionModel : selectedModel;
    console.log(`Using model: ${modelToUse}, hasImages: ${hasPageImages}, textLen: ${trimmedContent.length}, imageCount: ${hasPageImages ? pageImages.length : 0}`);

    // Track total token usage for single log entry
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalTokensSum = 0;

    const aiResponse = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({ model: modelToUse, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userContent }], temperature, max_tokens: 4096 }),
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

    // Accumulate tokens
    if (aiData.usage) {
      totalPromptTokens += aiData.usage.prompt_tokens || 0;
      totalCompletionTokens += aiData.usage.completion_tokens || 0;
      totalTokensSum += aiData.usage.total_tokens || 0;
    }

    if (action === "analyze") {
      // Log once for analysis
      await logTokenUsage(supabase, userId, "generate_deck", modelToUse, { prompt_tokens: totalPromptTokens, completion_tokens: totalCompletionTokens, total_tokens: totalTokensSum }, cost);
      let analysis;
      try { const m = rawContent.match(/\{[\s\S]*\}/); analysis = JSON.parse(m ? m[0] : rawContent); } catch { analysis = { coveragePercent: 0, missingTopics: [], summary: "Não foi possível analisar." }; }
      return jsonResponse({ analysis });
    }

    let jsonStr = rawContent;
    const m = rawContent.match(/\[[\s\S]*\]/);
    if (m) jsonStr = m[0];

    let cards: { front: string; back: string; type: string; options?: string[]; correctIndex?: number }[];
    try { cards = JSON.parse(jsonStr); } catch {
      console.error("Parse failed, raw:", rawContent.substring(0, 500));
      if (hasPageImages && trimmedContent.trim().length > 100) {
        console.log("Retrying without images (text-only fallback)");
        const fallbackResponse = await fetch(OPENAI_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
          body: JSON.stringify({ model: selectedModel, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: prompt }], temperature, max_tokens: 4096 }),
        });
        if (fallbackResponse.ok) {
          const fallbackData = await fallbackResponse.json();
          const fallbackRaw = fallbackData.choices?.[0]?.message?.content ?? "";
          // Accumulate fallback tokens
          if (fallbackData.usage) {
            totalPromptTokens += fallbackData.usage.prompt_tokens || 0;
            totalCompletionTokens += fallbackData.usage.completion_tokens || 0;
            totalTokensSum += fallbackData.usage.total_tokens || 0;
          }
          const fm = fallbackRaw.match(/\[[\s\S]*\]/);
          if (fm) {
            try { cards = JSON.parse(fm[0]); } catch {
              await logTokenUsage(supabase, userId, "generate_deck", modelToUse, { prompt_tokens: totalPromptTokens, completion_tokens: totalCompletionTokens, total_tokens: totalTokensSum }, cost);
              return jsonResponse({ error: "A IA não conseguiu processar este conteúdo. Tente selecionar menos páginas." }, 500);
            }
          } else {
            await logTokenUsage(supabase, userId, "generate_deck", modelToUse, { prompt_tokens: totalPromptTokens, completion_tokens: totalCompletionTokens, total_tokens: totalTokensSum }, cost);
            return jsonResponse({ error: "A IA não conseguiu gerar cards. O conteúdo pode ser muito visual — tente páginas com mais texto." }, 500);
          }
        } else {
          await logTokenUsage(supabase, userId, "generate_deck", modelToUse, { prompt_tokens: totalPromptTokens, completion_tokens: totalCompletionTokens, total_tokens: totalTokensSum }, cost);
          return jsonResponse({ error: "Falha ao processar conteúdo. Tente novamente." }, 500);
        }
      } else {
        await logTokenUsage(supabase, userId, "generate_deck", modelToUse, { prompt_tokens: totalPromptTokens, completion_tokens: totalCompletionTokens, total_tokens: totalTokensSum }, cost);
        return jsonResponse({ error: "A IA não conseguiu interpretar as imagens. Verifique se o PDF tem conteúdo legível e tente novamente." }, 500);
      }
    }

    if (!Array.isArray(cards) || cards.length === 0) {
      await logTokenUsage(supabase, userId, "generate_deck", modelToUse, { prompt_tokens: totalPromptTokens, completion_tokens: totalCompletionTokens, total_tokens: totalTokensSum }, cost);
      return jsonResponse({ error: "Nenhum cartão gerado." }, 400);
    }

    cards = cards.map(c => ({
      front: c.front || "", back: c.back || "",
      type: c.type === "cloze" ? "cloze" : c.type === "multiple_choice" ? "multiple_choice" : "basic",
      ...(c.type === "multiple_choice" && c.options ? { options: c.options, correctIndex: c.correctIndex ?? 0 } : {}),
    }));

    // Single log entry per request (combining main + fallback if any)
    await logTokenUsage(supabase, userId, "generate_deck", modelToUse, { prompt_tokens: totalPromptTokens, completion_tokens: totalCompletionTokens, total_tokens: totalTokensSum }, cost);

    return jsonResponse({ cards });
  } catch (err) {
    console.error("Error:", err);
    return jsonResponse({ error: "Erro interno do servidor" }, 500);
  }
});
