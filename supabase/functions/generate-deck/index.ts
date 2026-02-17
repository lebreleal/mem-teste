import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, handleCors, jsonResponse, getModelMap, deductEnergy, logTokenUsage, fetchPromptConfig } from "../_shared/utils.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

const DEFAULT_SYSTEM_PROMPT = "Você é um assistente educacional especializado em criar flashcards de estudo a partir de materiais acadêmicos. Sua tarefa é analisar o conteúdo educacional fornecido (texto e/ou imagens de páginas de documentos acadêmicos como PDFs, slides e apostilas) e gerar flashcards de alta qualidade. Gere cartões EXCLUSIVAMENTE sobre o conteúdo fornecido. NUNCA invente ou use conhecimento externo. REGRA IMPORTANTE: Cada cartão deve ser AUTOCONTIDO — nunca referencie 'anexo', 'figura', 'imagem acima', 'tabela ao lado' ou qualquer elemento externo. Descreva o contexto necessário diretamente no cartão. Por exemplo, ao invés de 'O que o anexo mostra?', escreva 'Qual síndrome é caracterizada por cariótipo 45,X?'. Responda APENAS com o JSON solicitado, sem texto adicional.";

function getDetailInstruction(level: string): string {
  switch (level) {
    case "essential": return "Crie poucos cartões focados APENAS nos conceitos mais fundamentais. Priorize definições-chave e fatos essenciais. Seja conciso.";
    case "comprehensive": return "Crie muitos cartões com cobertura detalhada. Inclua conceitos principais, secundários, exemplos, exceções e relações entre tópicos.";
    default: return "Crie um bom equilíbrio de cartões cobrindo as informações-chave sem excesso de detalhes.";
  }
}

function getFormatInstructions(formats: string[]): string {
  const parts: string[] = [];
  // "definition" is mapped to "qa" (basic front/back) — no standalone definition format
  if (formats.includes("definition") || formats.includes("qa")) parts.push('- "qa": Pergunta direta e autocontida na frente, resposta concisa no verso. Use type:"basic". A pergunta DEVE conter todo o contexto necessário para ser respondida sem ver o material original.');
  if (formats.includes("cloze")) parts.push('- "cloze": Frase completa e autocontida com lacuna usando {{c1::resposta}}. "front" contém o texto com {{c1::...}}, "back" fica vazio. Use type:"cloze". A frase deve fazer sentido sozinha.');
  if (formats.includes("multiple_choice")) parts.push('- "multiple_choice": Pergunta autocontida na frente ("front"), sem texto no "back". Adicione "options" (array de 4-5 strings) e "correctIndex" (índice da resposta correta, 0-based). Use type:"multiple_choice". A pergunta deve ter contexto suficiente sem referenciar anexos.');
  if (parts.length === 0) parts.push('- Use type:"basic" com pergunta autocontida na frente e resposta no verso.');
  const total = parts.length;
  const formatNames: string[] = [];
  if (formats.includes("definition") || formats.includes("qa")) formatNames.push("pergunta/resposta");
  if (formats.includes("cloze")) formatNames.push("cloze");
  if (formats.includes("multiple_choice")) formatNames.push("múltipla escolha");
  if (formatNames.length === 0) formatNames.push("pergunta/resposta");
  if (total === 1) { parts.push(`\nIMPORTANTE: Use EXCLUSIVAMENTE o formato "${formatNames[0]}" para TODOS os cartões.`); }
  else { parts.push(`\nIMPORTANTE: Use APENAS os ${total} formatos listados acima (${formatNames.join(", ")}). Distribua uniformemente entre eles.\nNUNCA referencie 'anexo', 'figura', 'imagem', 'tabela' ou qualquer elemento externo nos cartões.`); }
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

    // For vision requests, always use gpt-4o (not mini) for better image understanding
    const visionModel = "gpt-4o";

    const cost = energyCost || 0;
    if (cost > 0) {
      const ok = await deductEnergy(supabase, userId, cost);
      if (!ok) return jsonResponse({ error: "Créditos IA insuficientes", requiresCredits: true }, 402);
    }

    const promptConfig = await fetchPromptConfig(supabase, "generate_deck");
    const MODEL_MAP = await getModelMap(supabase);
    const selectedModel = MODEL_MAP[aiModel || promptConfig?.default_model || "flash"] || "gpt-4o-mini";
    const temperature = promptConfig?.temperature ?? 0.4;

    const trimmedContent = (textContent || "").slice(0, 15000);
    const requestedCount = cardCount > 0 ? Math.min(Math.max(cardCount, 3), 50) : 0; // 0 = auto
    const formats = cardFormats?.length ? cardFormats : ["qa", "cloze", "multiple_choice"];
    const detail = detailLevel || "standard";

    let systemPrompt = promptConfig?.system_prompt || DEFAULT_SYSTEM_PROMPT;
    
    // If customInstructions mention "PROVA", switch system prompt to exam mode
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
        const materialSection = hasPageImages
          ? (trimmedContent ? `\nTEXTO EXTRAÍDO (complementar às imagens):\n${trimmedContent}` : "\nAs imagens das páginas estão anexadas abaixo.")
          : `\nMATERIAL:\n${trimmedContent}`;
        prompt = `REGRA CRÍTICA: Gere cards EXCLUSIVAMENTE sobre o conteúdo fornecido abaixo (texto e/ou imagens). NÃO use conhecimento externo. NÃO invente informações que não estejam no material.\n\nREGRAS:\n- ${requestedCount > 0 ? `Crie exatamente ${requestedCount} cartões.` : 'Crie a quantidade de cartões que você julgar ideal para cobrir o conteúdo de forma completa.'}\n- ${getDetailInstruction(detail)}\n- TUDO em PORTUGUÊS (ou na língua do material).\n- Cubra conceitos-chave, definições, fatos e relações PRESENTES NO MATERIAL.\n- Evite perguntas triviais ou vagas.\n${hasPageImages ? "- ANALISE as imagens das páginas fornecidas. Extraia informações de diagramas, gráficos, fórmulas, tabelas e todo conteúdo visual. Use SOMENTE o que está nas imagens.\n" : ""}${customInstructions ? `\nINSTRUÇÕES ADICIONAIS DO USUÁRIO:\n${customInstructions}` : ""}\n\nFORMATOS PERMITIDOS:\n${getFormatInstructions(formats)}${materialSection}\n\nFORMATO DE SAÍDA (apenas JSON array, sem texto extra):\n[{"front":"...","back":"...","type":"basic ou cloze"},...]\nPara type "multiple_choice", use:\n{"front":"pergunta","back":"","type":"multiple_choice","options":["A","B","C","D"],"correctIndex":0}`;
      }
    }

    // Build user message content: multimodal if pageImages exist, plain text otherwise
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

    // Use gpt-4o for vision requests (better image understanding), selectedModel for text-only
    const modelToUse = hasPageImages ? visionModel : selectedModel;
    console.log(`Using model: ${modelToUse}, hasImages: ${hasPageImages}, textLen: ${trimmedContent.length}, imageCount: ${hasPageImages ? pageImages.length : 0}`);

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
    await logTokenUsage(supabase, userId, "generate_deck", modelToUse, aiData.usage, cost);

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
      console.error("Parse failed, raw:", rawContent.substring(0, 500));
      // If AI refused or returned non-JSON with images, retry text-only BUT only if we have enough text
      if (hasPageImages && trimmedContent.trim().length > 100) {
        console.log("Retrying without images (text-only fallback), text length:", trimmedContent.length);
        const fallbackResponse = await fetch(OPENAI_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
          body: JSON.stringify({ model: selectedModel, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: prompt }], temperature, max_tokens: 4096 }),
        });
        if (fallbackResponse.ok) {
          const fallbackData = await fallbackResponse.json();
          const fallbackRaw = fallbackData.choices?.[0]?.message?.content ?? "";
          console.log("Fallback response length:", fallbackRaw.length, "first 200:", fallbackRaw.substring(0, 200));
          const fm = fallbackRaw.match(/\[[\s\S]*\]/);
          if (fm) {
            try {
              cards = JSON.parse(fm[0]);
              await logTokenUsage(supabase, userId, "generate_deck_fallback", selectedModel, fallbackData.usage, 0);
            } catch {
              console.error("Fallback parse also failed:", fallbackRaw.substring(0, 300));
              return jsonResponse({ error: "A IA não conseguiu processar este conteúdo. Tente selecionar menos páginas." }, 500);
            }
          } else {
            return jsonResponse({ error: "A IA não conseguiu gerar cards. O conteúdo pode ser muito visual — tente páginas com mais texto." }, 500);
          }
        } else {
          const errText = await fallbackResponse.text();
          console.error("Fallback API error:", fallbackResponse.status, errText);
          return jsonResponse({ error: "Falha ao processar conteúdo. Tente novamente." }, 500);
        }
      } else {
        // No fallback possible — not enough text content
        return jsonResponse({ error: "A IA não conseguiu interpretar as imagens. Verifique se o PDF tem conteúdo legível e tente novamente." }, 500);
      }
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
