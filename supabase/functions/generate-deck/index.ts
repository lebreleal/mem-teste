import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, handleCors, jsonResponse, getModelMap, deductEnergy, logTokenUsage, fetchPromptConfig, getAIConfig, fetchWithRetry } from "../_shared/utils.ts";

const DEFAULT_SYSTEM_PROMPT = `Você é um especialista em educação e criação de flashcards usando técnicas de aprendizagem ativa (active recall, interleaving, elaborative interrogation).

Sua missão: criar flashcards que ajudem o estudante a DOMINAR o conteúdo — não apenas memorizar, mas compreender profundamente e aplicar.

PRINCÍPIOS:
1. PROFUNDIDADE: Crie perguntas que testem compreensão, não apenas memorização. Ex: "Por que X causa Y?" ao invés de "O que é X?"
2. AUTOCONTIDO: Cada cartão deve conter TODO o contexto necessário. NUNCA referencie "anexo", "figura", "imagem acima", "tabela ao lado" ou qualquer elemento externo.
3. PRÁTICO: Inclua perguntas de aplicação clínica/prática quando relevante.
4. CONEXÕES: Faça perguntas que conectem conceitos entre si.
5. EXCLUSIVIDADE: Use APENAS informações presentes no material fornecido. NUNCA invente dados, NUNCA adicione informações externas. Se o material não contém informação suficiente para criar uma pergunta, NÃO crie essa pergunta.
6. FIDELIDADE: Todas as perguntas e respostas devem ser diretamente deriváveis do texto fornecido. Não extrapole.

Responda APENAS com o JSON solicitado, sem texto adicional.`;

function getDetailInstruction(level: string): string {
  switch (level) {
    case "essential": return "Crie poucos cartões focados nos 3-5 conceitos mais fundamentais. Priorize o que cairia numa prova.";
    case "comprehensive": return "Crie cartões para CADA conceito, definição, mecanismo, exemplo e detalhe presente no material. A cobertura deve ser de 100% — o estudante deve conseguir dominar TODO o conteúdo apenas com os cartões. NÃO pule NENHUM parágrafo, NENHUM conceito, NENHUM detalhe. Cada informação relevante deve ter pelo menos um cartão dedicado.";
    default: return "Crie cartões cobrindo TODOS os tópicos e conceitos presentes no material. Não pule nenhum tema mencionado. Inclua conceitos-chave, mecanismos importantes e aplicações práticas.";
  }
}

function getFormatInstructions(formats: string[]): string {
  const parts: string[] = [];
  const formatNames: string[] = [];
  const forbiddenNames: string[] = [];

  const isSingleCloze = formats.length === 1 && formats[0] === "cloze";

  const clozeInstruction = isSingleCloze
    ? `- type:"cloze": Cartão de LACUNA (cloze deletion). TODO o conteúdo fica SOMENTE no campo "front". O campo "back" DEVE ser SEMPRE uma string vazia "".

  REGRA ABSOLUTA: TODOS os cartões gerados DEVEM ser do tipo "cloze" com a sintaxe {{c1::resposta}}.
  Se o campo "front" NÃO contiver {{c1::, o cartão será DESCARTADO automaticamente.

  COMO FUNCIONA: Escreva uma AFIRMAÇÃO COMPLETA e autocontida no "front", ocultando o conceito-chave com a sintaxe {{c1::resposta}}.
  A frase deve fazer sentido quando lida com a lacuna preenchida E deve ser respondível quando a lacuna estiver oculta.

  REGRAS CLOZE:
    • A lacuna deve conter um CONCEITO-CHAVE (nome, mecanismo, número, local anatômico), nunca uma palavra trivial.
    • Use múltiplos índices (c1, c2, c3) para testar conceitos diferentes na mesma frase quando relevante.
    • Cloze é SEMPRE uma AFIRMAÇÃO DECLARATIVA, NUNCA uma pergunta.
    • O front DEVE conter pelo menos um {{c1::...}} — sem exceção.

  EXEMPLOS CORRETOS:
    ✅ "O principal músculo responsável pela inspiração em repouso é o {{c1::diafragma}}."
    ✅ "A {{c1::hematose}} é o processo de troca gasosa que ocorre nos {{c2::alvéolos pulmonares}}."
    ✅ "O volume de ar que permanece nos pulmões após expiração máxima é o {{c1::Volume Residual (VR)}}."
    ✅ "A pressão intrapleural é normalmente {{c1::negativa}} em relação à pressão atmosférica."

  EXEMPLOS INCORRETOS (serão DESCARTADOS):
    ❌ "Qual é o principal motor da inspiração?" → REJEITADO (pergunta sem lacuna)
    ❌ "A Ventilação Alveolar é crucial porque:" → REJEITADO (incompleto, sem lacuna)
    ❌ "O que é o VRE?" → REJEITADO (pergunta, não afirmação com lacuna)
    ❌ "Qual é o principal motor da inspiração? O {{c1::diafragma}}." → REJEITADO (mistura pergunta com cloze)`
    : `- type:"cloze": Cartão de LACUNA (cloze deletion). TODO o conteúdo fica SOMENTE no campo "front". O campo "back" DEVE ser SEMPRE uma string vazia "".
  COMO FUNCIONA: Escreva uma AFIRMAÇÃO COMPLETA e autocontida no "front", ocultando o conceito-chave com a sintaxe {{c1::resposta}}.
  A frase deve fazer sentido quando lida com a lacuna preenchida E deve ser respondível quando a lacuna estiver oculta (o aluno precisa ter contexto suficiente para deduzir a resposta).
  REGRAS CLOZE:
    • A lacuna deve conter um CONCEITO-CHAVE (nome, mecanismo, número, local anatômico), nunca uma palavra trivial como artigos ou preposições.
    • Use múltiplos índices (c1, c2, c3) para testar conceitos diferentes DENTRO DA MESMA frase quando relevante.
    • NUNCA coloque a lacuna na PERGUNTA — cloze é uma AFIRMAÇÃO com lacuna, não uma pergunta com lacuna.
    • ERRADO: "Qual é o principal motor da inspiração? O {{c1::diafragma}}." (mistura pergunta com cloze)
    • CERTO: "O principal músculo responsável pela inspiração em repouso é o {{c1::diafragma}}."
    • CERTO: "A {{c1::hematose}} é o processo de troca gasosa que ocorre nos {{c2::alvéolos pulmonares}}."`;

  const allFormats = [
    { key: "qa", aliases: ["definition", "qa"], instruction: '- type:"basic": Pergunta direta e DESAFIADORA na frente. Resposta concisa e precisa no verso. Prefira perguntas "Por quê?", "Como?", "Qual a diferença entre?" ao invés de "O que é?". A pergunta DEVE ser autocontida.', name: "pergunta/resposta", typeName: "basic" },
    { key: "cloze", aliases: ["cloze"], instruction: clozeInstruction, name: "cloze", typeName: "cloze" },
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
    parts.push(`\nUse EXCLUSIVAMENTE o formato "${formatNames[0]}" para TODOS os cartões. Qualquer cartão de outro formato será DESCARTADO.`);
  } else {
    parts.push(`\nREGRA DE INTERCALAÇÃO (OBRIGATÓRIA):
1. Cada conceito/tópico deve ser coberto por APENAS UM formato — NUNCA repita o mesmo assunto em formatos diferentes.
2. ALTERNE os formatos na sequência: ${formatNames.join(" → ")} → ${formatNames[0]} → ... (ciclo contínuo).
3. Distribuição IGUAL: cada formato deve ter aproximadamente o mesmo número de cartões (diferença máxima de 1).
4. PROFUNDIDADE: cada cartão deve ser RICO em contexto e testar compreensão real, não apenas memorização superficial.

EXEMPLO com ${count} formatos e 6 conceitos:
Conceito 1 → ${formatNames[0]}
Conceito 2 → ${formatNames[1 % count]}
Conceito 3 → ${formatNames[2 % count]}
Conceito 4 → ${formatNames[3 % count]}
Conceito 5 → ${formatNames[4 % count]}
Conceito 6 → ${formatNames[5 % count]}`);
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
  if (type === "cloze" && allowedFormats.includes("cloze")) return "cloze";
  if (type === "multiple_choice" && allowedFormats.includes("multiple_choice")) return "multiple_choice";
  if ((type === "basic" || type === "qa" || type === "definition") && (allowedFormats.includes("qa") || allowedFormats.includes("definition"))) return "basic";

  // Type not allowed — map to first allowed format
  if (allowedFormats.includes("qa") || allowedFormats.includes("definition")) return "basic";
  if (allowedFormats.includes("cloze")) return "cloze";
  if (allowedFormats.includes("multiple_choice")) return "multiple_choice";
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

    const { textContent, cardCount, detailLevel, cardFormats, customInstructions, aiModel, energyCost, skipLog } = await req.json();

    const { apiKey: AI_KEY, url: AI_URL } = getAIConfig();
    if (!AI_KEY) return jsonResponse({ error: "GOOGLE_AI_KEY não configurada" }, 500);
    if (!textContent?.trim()) return jsonResponse({ error: "textContent é obrigatório" }, 400);

    const cost = energyCost || 0;
    if (cost > 0) {
      const ok = await deductEnergy(supabase, userId, cost);
      if (!ok) return jsonResponse({ error: "Créditos IA insuficientes", requiresCredits: true }, 402);
    }

    const promptConfig = await fetchPromptConfig(supabase, "generate_deck");
    const MODEL_MAP = await getModelMap(supabase);
    const selectedModel = MODEL_MAP[aiModel || promptConfig?.default_model || "flash"] || "gemini-2.5-flash-lite";
    const temperature = promptConfig?.temperature ?? 0.5;

    const trimmedContent = textContent.slice(0, 16000);
    const requestedCount = cardCount > 0 ? Math.min(Math.max(cardCount, 3), 50) : 0;
    const formats = cardFormats?.length ? cardFormats : ["qa", "cloze", "multiple_choice"];
    const detail = detailLevel || "standard";

    let systemPrompt = promptConfig?.system_prompt || DEFAULT_SYSTEM_PROMPT;

    if (customInstructions && /prova|exame|questões/i.test(customInstructions)) {
      systemPrompt = "Você é um gerador de questões de prova acadêmica de alta qualidade. Gere apenas o JSON solicitado, sem texto adicional.";
    }

    const prompt = `Crie flashcards de alta qualidade para ajudar o estudante a DOMINAR este conteúdo.

REGRAS OBRIGATÓRIAS:
- ${requestedCount > 0 ? `Crie exatamente ${requestedCount} cartões.` : 'Crie a quantidade NECESSÁRIA de cartões para o nível de cobertura solicitado abaixo. NÃO limite artificialmente — gere tantos cartões quantos forem necessários.'}
- ${getDetailInstruction(detail)}
- TUDO em PORTUGUÊS (ou na língua do material).
- Varie os TIPOS de pergunta: definição, mecanismo, comparação, aplicação clínica, causa-efeito.
- Cada cartão deve ser AUTOCONTIDO (sem referências a anexos/figuras/imagens).
- CRUCIAL: Use SOMENTE informações que estão EXPLICITAMENTE no material abaixo. NÃO invente, NÃO extrapole, NÃO adicione conhecimento externo. Se o material é insuficiente, crie menos cartões.
- ORDEM: Os cartões DEVEM seguir a ORDEM CRONOLÓGICA do material. O primeiro cartão deve ser sobre o primeiro conceito que aparece no texto, e o último cartão sobre o último conceito. NUNCA embaralhe a ordem.
${customInstructions ? `\nINSTRUÇÕES ESPECIAIS DO USUÁRIO (respeite obrigatoriamente):\n${customInstructions}` : ""}

FORMATOS PERMITIDOS (use SOMENTE estes):
${getFormatInstructions(formats)}

MATERIAL DO ESTUDANTE (base ÚNICA para os cartões):
---
${trimmedContent}
---

FORMATO DE SAÍDA (apenas JSON array, sem texto extra, sem markdown):
${getOutputExamples(formats)}`;

    console.log(`Using model: ${selectedModel}, textLen: ${trimmedContent.length}, formats: ${formats.join(",")}, detail: ${detail}`);

    const aiResponse = await fetchWithRetry(AI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${AI_KEY}` },
      body: JSON.stringify({ model: selectedModel, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: prompt }], temperature, max_tokens: 16000 }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      if (aiResponse.status === 429) return jsonResponse({ error: "Limite de requisições excedido. Tente em alguns segundos." }, 429);
      if (aiResponse.status === 403) return jsonResponse({ error: "API do Google AI não ativada. Verifique o console." }, 502);
      if (aiResponse.status === 503) return jsonResponse({ error: "Modelo sobrecarregado. Tente o modelo Flash." }, 503);
      return jsonResponse({ error: "Serviço de IA indisponível" }, 502);
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData.choices?.[0]?.message?.content ?? "";
    const finishReason = aiData.choices?.[0]?.finish_reason ?? "unknown";
    console.log("AI response length:", rawContent.length, "finish_reason:", finishReason, "first 200 chars:", rawContent.substring(0, 200));

    const usage = {
      prompt_tokens: aiData.usage?.prompt_tokens || 0,
      completion_tokens: aiData.usage?.completion_tokens || 0,
      total_tokens: aiData.usage?.total_tokens || 0,
    };

    let jsonStr = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    const m = jsonStr.match(/\[[\s\S]*\]/);
    if (m) {
      jsonStr = m[0];
    } else {
      // Try to repair truncated JSON array (no closing bracket)
      const arrStart = rawContent.indexOf('[');
      if (arrStart !== -1) {
        let truncated = rawContent.slice(arrStart).replace(/,\s*$/, '');
        // Close any open strings/objects and close the array
        const openBraces = (truncated.match(/{/g) || []).length - (truncated.match(/}/g) || []).length;
        for (let i = 0; i < openBraces; i++) truncated += '}';
        truncated += ']';
        jsonStr = truncated;
      }
    }

    let cards: { front: string; back: string; type: string; options?: string[]; correctIndex?: number }[];
    try { cards = JSON.parse(jsonStr); } catch {
      console.error("Parse failed, raw:", rawContent.substring(0, 500));
      if (!skipLog) await logTokenUsage(supabase, userId, "generate_deck", selectedModel, usage, cost);
      return jsonResponse({ error: "A IA não conseguiu gerar cards. Tente novamente ou use menos conteúdo.", usage }, 500);
    }

    if (!Array.isArray(cards) || cards.length === 0) {
      if (!skipLog) await logTokenUsage(supabase, userId, "generate_deck", selectedModel, usage, cost);
      return jsonResponse({ error: "Nenhum cartão gerado.", usage }, 400);
    }

    // Map card types respecting user-selected formats + cloze safety validation
    const CLOZE_REGEX = /\{\{c\d+::/;
    cards = cards.map(c => {
      const mappedType = mapCardType(c.type, formats);

      // Safety net: if card should be cloze but lacks {{c1::...}} syntax, reclassify to basic
      if (mappedType === "cloze" && !CLOZE_REGEX.test(c.front || "")) {
        console.warn("Cloze card missing syntax, reclassifying to basic:", (c.front || "").substring(0, 80));
        const front = (c.front || "").trim();
        const needsQuestionMark = front.endsWith(":") || front.endsWith("...");
        return {
          front: needsQuestionMark ? front.replace(/[:\.]+$/, "?") : front,
          back: c.back || "Informação não fornecida",
          type: "basic" as string,
        };
      }

      return {
        front: c.front || "",
        back: mappedType === "cloze" ? "" : (c.back || ""),
        type: mappedType,
        ...(mappedType === "multiple_choice" && c.options ? { options: c.options, correctIndex: c.correctIndex ?? 0 } : {}),
      };
    });

    // Only log if not skipped (client will aggregate and log once)
    if (!skipLog) {
      await logTokenUsage(supabase, userId, "generate_deck", selectedModel, usage, cost);
    }

    return jsonResponse({ cards, usage });
  } catch (err) {
    console.error("Error:", err);
    return jsonResponse({ error: "Erro interno do servidor" }, 500);
  }
});
