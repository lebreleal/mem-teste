import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, handleCors, jsonResponse, getModelMap, deductEnergy, logTokenUsage, fetchPromptConfig } from "../_shared/utils.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

const DEFAULT_SYSTEM_PROMPT = "Você é um gerador de flashcards educacionais de alta qualidade.";

function getDetailInstruction(level: string): string {
  switch (level) {
    case "essential": return "Crie poucos cartões focados APENAS nos conceitos mais fundamentais. Priorize definições-chave e fatos essenciais. Seja conciso.";
    case "comprehensive": return "Crie muitos cartões com cobertura detalhada. Inclua conceitos principais, secundários, exemplos, exceções e relações entre tópicos.";
    default: return "Crie um bom equilíbrio de cartões cobrindo as informações-chave sem excesso de detalhes.";
  }
}

function getFormatInstructions(formats: string[]): string {
  const parts: string[] = [];
  if (formats.includes("definition")) parts.push('- "definition": Frente com o termo/conceito, verso com a definição/significado. Use type:"basic".');
  if (formats.includes("cloze")) parts.push('- "cloze": Texto com lacunas usando {{c1::resposta}}. "front" contém o texto com {{c1::...}}, "back" fica vazio. Use type:"cloze".');
  if (formats.includes("qa")) parts.push('- "qa": Pergunta direta na frente, resposta concisa no verso. Use type:"basic".');
  if (formats.includes("multiple_choice")) parts.push('- "multiple_choice": Pergunta na frente ("front"), sem texto no "back". Adicione "options" (array de 4-5 strings) e "correctIndex" (índice da resposta correta, 0-based). Use type:"multiple_choice".');
  if (parts.length === 0) parts.push('- Use type:"basic" com pergunta na frente e resposta no verso.');
  const total = formats.length;
  const formatNames = formats.map(f => f === "definition" ? "definição" : f === "cloze" ? "cloze" : f === "qa" ? "pergunta/resposta" : "múltipla escolha");
  if (total === 1) { parts.push(`\nIMPORTANTE: Use EXCLUSIVAMENTE o formato "${formatNames[0]}" para TODOS os cartões.`); }
  else { parts.push(`\nIMPORTANTE: Use APENAS os ${total} formatos listados acima (${formatNames.join(", ")}). Distribua uniformemente entre eles.`); }
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

    const { textContent, cardCount, detailLevel, cardFormats, customInstructions, action, existingCards, aiModel, energyCost } = await req.json();

    if (!OPENAI_API_KEY) return jsonResponse({ error: "OPENAI_API_KEY não configurada" }, 500);
    if (!textContent) return jsonResponse({ error: "textContent é obrigatório" }, 400);

    const cost = energyCost || 0;
    if (cost > 0) {
      const ok = await deductEnergy(supabase, userId, cost);
      if (!ok) return jsonResponse({ error: "Créditos IA insuficientes", requiresCredits: true }, 402);
    }

    const promptConfig = await fetchPromptConfig(supabase, "generate_deck");
    const MODEL_MAP = await getModelMap(supabase);
    const selectedModel = MODEL_MAP[aiModel || promptConfig?.default_model || "flash"] || "gpt-4o-mini";
    const temperature = promptConfig?.temperature ?? 0.4;

    const trimmedContent = textContent.slice(0, 15000);
    const requestedCount = cardCount > 0 ? Math.min(Math.max(cardCount, 3), 50) : 0; // 0 = auto
    const formats = cardFormats?.length ? cardFormats : ["definition", "qa"];
    const detail = detailLevel || "standard";

    let systemPrompt = promptConfig?.system_prompt || DEFAULT_SYSTEM_PROMPT;
    
    // If customInstructions mention "PROVA", switch system prompt to exam mode
    if (customInstructions && /prova|exame|questões/i.test(customInstructions)) {
      systemPrompt = "Você é um gerador de questões de prova acadêmica de alta qualidade. Gere apenas o JSON solicitado, sem texto adicional.";
    }
    
    let prompt: string;

    if (action === "analyze") {
      const existingJson = JSON.stringify(existingCards || []);
      prompt = `Você é um analisador de cobertura educacional. Analise o material e os cartões já criados.\n\nMATERIAL:\n${trimmedContent}\n\nCARTÕES EXISTENTES:\n${existingJson}\n\nResponda APENAS com JSON válido:\n{\n  "coveragePercent": <0-100>,\n  "missingTopics": ["tópico 1", "tópico 2"],\n  "summary": "Resumo da cobertura em português"\n}`;
    } else if (action === "fill-gaps") {
      const existingJson = JSON.stringify(existingCards || []);
      prompt = `Você é um gerador de flashcards. Crie cartões para tópicos AINDA NÃO cobertos.\n\nMATERIAL:\n${trimmedContent}\n\nCARTÕES EXISTENTES (NÃO repita):\n${existingJson}\n\nREGRAS:\n- ${requestedCount > 0 ? `Crie ${requestedCount} cartões novos.` : 'Crie a quantidade de cartões necessária para cobrir os tópicos faltantes.'}\n- ${getDetailInstruction(detail)}\n- TUDO em PORTUGUÊS (ou na língua do material).\n\nFORMATOS PERMITIDOS:\n${getFormatInstructions(formats)}\n\nFORMATO DE SAÍDA (apenas JSON array):\n[{"front":"...","back":"...","type":"basic ou cloze"},...]\nPara type "multiple_choice": {"front":"pergunta","back":"","type":"multiple_choice","options":["A","B","C","D"],"correctIndex":0}`;
    } else {
      if (promptConfig?.user_prompt_template) {
        prompt = promptConfig.user_prompt_template
          .replace("{{cardCount}}", requestedCount > 0 ? String(requestedCount) : "a quantidade que você julgar ideal para cobrir o conteúdo")
          .replace("{{detailInstruction}}", getDetailInstruction(detail))
          .replace("{{customInstructions}}", customInstructions ? `\nINSTRUÇÕES ADICIONAIS DO USUÁRIO:\n${customInstructions}` : "")
          .replace("{{formatInstructions}}", getFormatInstructions(formats))
          .replace("{{material}}", trimmedContent);
      } else {
        prompt = `REGRAS:\n- ${requestedCount > 0 ? `Crie exatamente ${requestedCount} cartões.` : 'Crie a quantidade de cartões que você julgar ideal para cobrir o conteúdo de forma completa.'}\n- ${getDetailInstruction(detail)}\n- TUDO em PORTUGUÊS (ou na língua do material).\n- Cubra conceitos-chave, definições, fatos e relações.\n- Evite perguntas triviais ou vagas.\n${customInstructions ? `\nINSTRUÇÕES ADICIONAIS DO USUÁRIO:\n${customInstructions}` : ""}\n\nFORMATOS PERMITIDOS:\n${getFormatInstructions(formats)}\n\nMATERIAL:\n${trimmedContent}\n\nFORMATO DE SAÍDA (apenas JSON array, sem texto extra):\n[{"front":"...","back":"...","type":"basic ou cloze"},...]\nPara type "multiple_choice", use:\n{"front":"pergunta","back":"","type":"multiple_choice","options":["A","B","C","D"],"correctIndex":0}`;
      }
    }

    const aiResponse = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({ model: selectedModel, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: prompt }], temperature }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("OpenAI error:", aiResponse.status, errText);
      if (aiResponse.status === 429) return jsonResponse({ error: "Limite de requisições excedido. Tente em alguns segundos." }, 429);
      return jsonResponse({ error: "Serviço de IA indisponível" }, 502);
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData.choices?.[0]?.message?.content ?? "";
    await logTokenUsage(supabase, userId, "generate_deck", selectedModel, aiData.usage, cost);

    if (action === "analyze") {
      let analysis;
      try { const m = rawContent.match(/\{[\s\S]*\}/); analysis = JSON.parse(m ? m[0] : rawContent); } catch { analysis = { coveragePercent: 0, missingTopics: [], summary: "Não foi possível analisar." }; }
      return jsonResponse({ analysis });
    }

    let jsonStr = rawContent;
    const m = rawContent.match(/\[[\s\S]*\]/);
    if (m) jsonStr = m[0];

    let cards: { front: string; back: string; type: string }[];
    try { cards = JSON.parse(jsonStr); } catch {
      console.error("Parse failed:", rawContent);
      return jsonResponse({ error: "Formato inválido. Tente novamente." }, 500);
    }

    if (!Array.isArray(cards) || cards.length === 0) return jsonResponse({ error: "Nenhum cartão gerado." }, 400);

    cards = cards.map(c => ({
      front: c.front || "", back: c.back || "",
      type: c.type === "cloze" ? "cloze" : c.type === "multiple_choice" ? "multiple_choice" : "basic",
      ...(c.type === "multiple_choice" && c.options ? { options: c.options, correctIndex: c.correctIndex ?? 0 } : {}),
    }));

    return jsonResponse({ cards });
  } catch (err) {
    console.error("Error:", err);
    return jsonResponse({ error: "Erro interno do servidor" }, 500);
  }
});
