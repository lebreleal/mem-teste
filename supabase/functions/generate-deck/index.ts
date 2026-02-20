import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, handleCors, jsonResponse, getModelMap, deductEnergy, logTokenUsage, fetchPromptConfig, getAIConfig, fetchWithRetry } from "../_shared/utils.ts";

const DEFAULT_SYSTEM_PROMPT = `Você é um especialista em educação e criação de flashcards, aplicando rigorosamente as 20 Regras de Formulação do Conhecimento do Dr. Piotr Wozniak (SuperMemo).

Sua missão: criar flashcards que garantam DOMÍNIO REAL do conteúdo — compreensão profunda, recuperação ativa e aplicação prática.

PRINCÍPIOS FUNDAMENTAIS (SuperMemo):

1. COMPREENSÃO PRIMEIRO: Nunca crie um cartão sobre algo que o material não explica adequadamente.
2. MÍNIMO DE INFORMAÇÃO: Cada cartão testa UMA ÚNICA memória atômica. Respostas com mais de 1 frase são PROIBIDAS para basic. Se precisar de mais, divida em cartões separados.
3. CLOZE É REI: Cloze deletion é o formato mais poderoso para retenção. Use-o para fatos, termos, valores e nomes. Crie afirmações completas onde a lacuna é naturalmente dedutível pelo contexto.
4. EVITE LISTAS: NUNCA coloque uma lista como resposta. Se o material lista 5 itens, crie 5 cartões separados — cada um testando um item com contexto suficiente.
5. REDUNDÂNCIA ESTRATÉGICA: Para conceitos críticos, crie cartões que testem o MESMO conceito de ângulos diferentes. Ex: "X causa Y" num cartão e "Y é causado por {{c1::X}}" em outro.
6. CONTEXTO MÍNIMO SUFICIENTE: A pergunta deve conter contexto suficiente para ter UMA ÚNICA resposta possível, sem ambiguidade.
7. PERSONALIZAÇÃO: Quando possível, use exemplos práticos/clínicos em vez de definições abstratas.
8. EXCLUSIVIDADE: Use APENAS informações presentes no material fornecido. NUNCA invente dados, NUNCA adicione informações externas.
9. AUTOCONTIDO: Cada cartão deve conter TODO o contexto necessário. NUNCA referencie "anexo", "figura", "imagem acima", "tabela ao lado" ou qualquer elemento externo.
10. SEM DECOREBA: NÃO faça perguntas que podem ser respondidas citando uma definição de memória. Formule de modo que o estudante precise RACIOCINAR sobre o mecanismo, a causa ou a consequência.

ANTI-PADRÕES (PROIBIDO):
❌ Perguntas "O que é X?" com respostas de dicionário
❌ Respostas que são listas ("A, B, C e D")
❌ Cards que agrupam múltiplos conceitos
❌ Múltipla escolha com distratores absurdos/inventados
❌ Cloze com lacunas em palavras triviais (artigos, preposições)
❌ Cards que copiam frases inteiras do material sem reformulação

Responda APENAS com o JSON solicitado, sem texto adicional.`;

function getDetailInstruction(level: string): string {
  switch (level) {
    case "essential": return "Crie poucos cartões focados nos 3-5 conceitos mais fundamentais. Priorize o que cairia numa prova.";
    case "comprehensive": return "COBERTURA TOTAL (100%): Crie cartões para CADA conceito, definição, mecanismo, exemplo e detalhe presente no material. O estudante deve conseguir dominar TODO o conteúdo apenas com os cartões. NÃO pule NENHUM parágrafo, NENHUM conceito, NENHUM detalhe. Cada informação relevante deve ter pelo menos um cartão dedicado. Extraia cada sub-tópico, exceção, exemplo concreto e caso especial. Se o texto citar uma EXCEÇÃO, crie um cartão. Se citar um EXEMPLO, crie um cartão. Se houver listas, cada item merece seu próprio cartão atômico.";
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
    { key: "qa", aliases: ["definition", "qa"], instruction: '- type:"basic": Pergunta direta e DESAFIADORA na frente. Resposta concisa (1 frase, máximo 2) no verso. OBRIGATÓRIO: perguntas de MECANISMO ("Como funciona?"), CAUSA-EFEITO ("Por que X causa Y?"), COMPARAÇÃO ("Qual a diferença entre X e Y?") e APLICAÇÃO PRÁTICA. PROIBIDO: perguntas de dicionário ("O que é X?") — o estudante deve RACIOCINAR, não recitar.', name: "pergunta/resposta", typeName: "basic" },
    { key: "cloze", aliases: ["cloze"], instruction: clozeInstruction + '\n  Foque em TERMINOLOGIA TÉCNICA crucial, VALORES NUMÉRICOS, NOMES PRÓPRIOS e LOCAIS ANATÔMICOS. A lacuna deve ocultar a informação que o estudante PRECISA saber de cor.', name: "cloze", typeName: "cloze" },
    { key: "multiple_choice", aliases: ["multiple_choice"], instruction: '- type:"multiple_choice": Pergunta clínica/aplicada na "front", "back" vazio. "options" com 4-5 alternativas plausíveis. "correctIndex" com o índice correto (0-based). REGRA CRÍTICA: As alternativas incorretas DEVEM ser conceitos que EXISTEM no material mas estão INCORRETOS para aquela pergunta específica. Isso força o estudante a DIFERENCIAR conceitos semelhantes. NUNCA use distratores absurdos ou inventados. Múltipla escolha serve para DIFERENCIAÇÃO entre conceitos similares, não para perguntas triviais.', name: "múltipla escolha", typeName: "multiple_choice" },
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
    // Build pedagogical distribution based on SuperMemo principles
    // Cloze dominates (50%), Basic for reasoning (30%), MCQ for differentiation (20%)
    const hasAll3 = formatNames.length === 3;
    const hasCloze = formats.includes("cloze");
    const hasBasic = formats.includes("qa") || formats.includes("definition");
    const hasMCQ = formats.includes("multiple_choice");

    let distributionText: string;
    if (hasAll3) {
      distributionText = `DISTRIBUIÇÃO PEDAGÓGICA (SuperMemo):
- Cloze: ~50% dos cartões — formato com MAIOR poder mnemônico. Use para fatos, termos, valores.
- Pergunta/Resposta (basic): ~30% dos cartões — para raciocínio, mecanismos, causa-efeito.
- Múltipla Escolha: ~20% dos cartões (MÁXIMO) — SOMENTE para diferenciação de conceitos similares.`;
    } else if (hasCloze && hasBasic) {
      distributionText = `DISTRIBUIÇÃO PEDAGÓGICA:
- Cloze: ~60% dos cartões — formato dominante para retenção.
- Pergunta/Resposta (basic): ~40% dos cartões — para raciocínio e compreensão.`;
    } else if (hasCloze && hasMCQ) {
      distributionText = `DISTRIBUIÇÃO PEDAGÓGICA:
- Cloze: ~70% dos cartões — formato dominante para retenção.
- Múltipla Escolha: ~30% dos cartões — para diferenciação de conceitos.`;
    } else {
      distributionText = `DISTRIBUIÇÃO PEDAGÓGICA:
- Pergunta/Resposta (basic): ~70% dos cartões — para raciocínio e compreensão.
- Múltipla Escolha: ~30% dos cartões — para diferenciação de conceitos.`;
    }

    parts.push(`\nREGRAS DE DISTRIBUIÇÃO (OBRIGATÓRIA):
1. Cada conceito/tópico deve ser coberto por APENAS UM formato — NUNCA repita o mesmo assunto em formatos diferentes (exceto redundância estratégica intencional).
2. ${distributionText}
3. Siga a ordem cronológica do material.
4. PROFUNDIDADE: cada cartão deve ser RICO em contexto e testar compreensão real.`);
  }

  if (forbiddenNames.length > 0) {
    parts.push(`\nPROIBIDO: NÃO gere cartões do tipo ${forbiddenNames.map(n => `"${n}"`).join(", ")}. Será rejeitado.`);
  }

  return parts.join("\n");
}

function getOutputExamples(formats: string[]): string {
  const examples: string[] = [];
  if (formats.includes("definition") || formats.includes("qa")) {
    examples.push('{"front":"Por que a pressão intrapleural negativa é essencial para a ventilação?","back":"Porque ela mantém os pulmões expandidos contra a parede torácica, impedindo o colapso pulmonar.","type":"basic"}');
  }
  if (formats.includes("cloze")) {
    examples.push('{"front":"A {{c1::proteína p53}} atua como supressor tumoral ao induzir {{c2::apoptose}} em células com DNA danificado.","back":"","type":"cloze"}');
  }
  if (formats.includes("multiple_choice")) {
    examples.push('{"front":"Paciente com dispneia, murmúrio vesicular abolido à esquerda e desvio de traqueia para a direita. Qual o diagnóstico mais provável?","back":"","type":"multiple_choice","options":["Pneumotórax hipertensivo","Derrame pleural","Atelectasia","Pneumonia lobar"],"correctIndex":0}');
  }
  if (examples.length === 0) {
    examples.push('{"front":"Por que a pressão intrapleural negativa é essencial para a ventilação?","back":"Porque ela mantém os pulmões expandidos contra a parede torácica.","type":"basic"}');
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
    // Bloco 5: increased max from 50 to 80 for comprehensive batches
    const requestedCount = cardCount > 0 ? Math.min(Math.max(cardCount, 3), 80) : 0;
    const formats = cardFormats?.length ? cardFormats : ["qa", "cloze", "multiple_choice"];
    const detail = detailLevel || "standard";

    let systemPrompt = promptConfig?.system_prompt || DEFAULT_SYSTEM_PROMPT;

    if (customInstructions && /prova|exame|questões/i.test(customInstructions)) {
      systemPrompt = "Você é um gerador de questões de prova acadêmica de alta qualidade. Gere apenas o JSON solicitado, sem texto adicional.";
    }

    // Bloco 5: when cardCount=0 (auto), don't impose a numeric limit — let detailLevel drive quantity
    const countInstruction = requestedCount > 0
      ? `Crie exatamente ${requestedCount} cartões.`
      : `Crie a quantidade NECESSÁRIA de cartões para cobrir o material no nível "${detail}". NÃO limite artificialmente — gere tantos cartões quantos forem necessários para garantir cobertura adequada.`;

    const prompt = `Crie flashcards de alta qualidade para ajudar o estudante a DOMINAR este conteúdo.

REGRAS OBRIGATÓRIAS:
- ${countInstruction}
- ${getDetailInstruction(detail)}
- TUDO em PORTUGUÊS (ou na língua do material).
- Varie os TIPOS de pergunta: mecanismo, comparação, aplicação clínica, causa-efeito, redundância estratégica.
- SEM DECOREBA: Formule de modo que o estudante precise RACIOCINAR sobre o mecanismo, a causa ou a consequência. PROIBIDO perguntas de "O que é X?" com resposta de dicionário.
- Cada cartão deve ser AUTOCONTIDO (sem referências a anexos/figuras/imagens).
- CRUCIAL: Use SOMENTE informações que estão EXPLICITAMENTE no material abaixo. NÃO invente, NÃO extrapole, NÃO adicione conhecimento externo. Se o material é insuficiente, crie menos cartões.
- ORDEM: Os cartões DEVEM seguir a ORDEM CRONOLÓGICA do material. O primeiro cartão deve ser sobre o primeiro conceito que aparece no texto, e o último cartão sobre o último conceito. NUNCA embaralhe a ordem.
- EVITE LISTAS: Se uma resposta teria múltiplos itens, crie cartões separados para cada item.
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
