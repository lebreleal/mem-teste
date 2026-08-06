import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, handleCors, jsonResponse, getModelMap, estimateCredits, holdCredits, refundCredits, settleCredits, logTokenUsage, fetchPromptConfig, getAIConfig, fetchWithRetry, aiHeaders, extractUsage, resolveCostUSD } from "../_shared/utils.ts";

const DEFAULT_SYSTEM_PROMPT = `Você é um especialista em educação e criação de flashcards, aplicando rigorosamente as 20 Regras de Formulação do Conhecimento do Dr. Piotr Wozniak (SuperMemo).

Sua missão: criar flashcards que garantam DOMÍNIO REAL do conteúdo — compreensão profunda, recuperação ativa e aplicação prática.

REGRA CRÍTICA DE LINGUAGEM:
Os cartões NUNCA devem referenciar a origem do conhecimento. PROIBIDO usar expressões como "de acordo com o material", "segundo o texto", "conforme mencionado", "o conteúdo aborda", "como visto", "no texto", "o autor afirma" ou QUALQUER variação que sugira que existe uma fonte sendo consultada. Cada cartão deve soar como conhecimento factual independente, como se viesse de um livro didático ou enciclopédia.

PRINCÍPIOS FUNDAMENTAIS (SuperMemo):

1. COMPREENSÃO PRIMEIRO: Se o conteúdo menciona um conceito sem explicação profunda, crie um cartão factual simples em vez de ignorá-lo. Nenhum tópico mencionado deve ser negligenciado.
2. MÍNIMO DE INFORMAÇÃO: Cada cartão testa UMA ÚNICA memória atômica. Resposta concisa no verso: MÁXIMO 15 palavras. Se precisa de mais, divida em 2 cartões. REGRA DE OURO: se a resposta não cabe em 1 linha, o cartão está mal formulado.
3. CLOZE É REI: Cloze deletion é o formato mais poderoso para retenção. Use-o para fatos, termos, valores e nomes. Crie afirmações completas onde a lacuna é naturalmente dedutível pelo contexto.
4. EVITE LISTAS: NUNCA coloque uma lista como resposta. Se houver 5 itens, crie 5 cartões separados — cada um testando um item com contexto suficiente.
5. REDUNDÂNCIA ESTRATÉGICA: Para conceitos CENTRAIS, teste ÂNGULOS COGNITIVOS DISTINTOS:
   - Ângulo 1: FATO (o que é/qual valor)
   - Ângulo 2: MECANISMO (como funciona)
   - Ângulo 3: CONSEQUÊNCIA (o que acontece se falhar)
   ERRADO: 'X causa Y' + 'Y é causado por X' (mesma informação invertida)
   CERTO: 'X causa Y' + 'Se X falhar, qual a consequência?'
   Use redundância apenas para conceitos CENTRAIS, não para cada detalhe.
6. CONTEXTO MÍNIMO SUFICIENTE: A pergunta deve conter contexto suficiente para ter UMA ÚNICA resposta possível, sem ambiguidade.
7. PERSONALIZAÇÃO: Quando possível, use exemplos práticos/clínicos em vez de definições abstratas.
8. EXCLUSIVIDADE: Use APENAS informações presentes no conteúdo fornecido. NUNCA invente dados, NUNCA adicione informações externas.
9. AUTOCONTIDO: Cada cartão deve conter TODO o contexto necessário. NUNCA referencie "anexo", "figura", "imagem acima", "tabela ao lado" ou qualquer elemento externo.
10. SEM DECOREBA: NÃO faça perguntas que podem ser respondidas citando uma definição de memória. Formule de modo que o estudante precise RACIOCINAR sobre o mecanismo, a causa ou a consequência.
11. PROGRESSÃO LÓGICA: Os cartões devem construir uma NARRATIVA de aprendizado. Antes de testar um detalhe, garanta que o conceito-pai já foi coberto. Ex: primeiro "O que o diafragma faz na inspiração", depois "Por que a paralisia do diafragma causa dispneia". O estudante nunca deve encontrar um cartão que depende de um conceito não coberto por cartões anteriores.

ANTI-PADRÕES (PROIBIDO):
❌ Perguntas "O que é X?" com respostas de dicionário
❌ Respostas que são listas ("A, B, C e D")
❌ Cards que agrupam múltiplos conceitos
❌ Cloze com lacunas em palavras triviais (artigos, preposições)
❌ Cards que copiam frases inteiras do texto sem reformulação
❌ Cards que copiam frases inteiras do texto sem reformulação
❌ Cards que dizem "de acordo com", "segundo o texto", "conforme mencionado" ou qualquer referência à fonte
❌ Cards que testam informação ÓBVIA que qualquer leigo saberia (ex: "O coração bombeia {{c1::sangue}}")
❌ Cards com respostas que podem ser adivinhadas sem estudar o conteúdo

MÉTODO ATIVO (obrigatório):
- INTERROGAÇÃO ELABORATIVA: Pergunte "Por quê?" e "Como?" em vez de "O que é?". O estudante deve raciocinar, não recitar.
- CONEXÕES: Crie cards que conectam conceitos entre si ("Como X se relaciona com Y?").
- APLICAÇÃO: Sempre que possível, use cenários práticos/clínicos em vez de definições abstratas.
- CONTRASTE: Compare conceitos similares para forçar diferenciação ("Qual a diferença entre X e Y?").

Responda APENAS com o JSON solicitado, sem texto adicional.`;

// ── Prompt simplificado para modelos menores (flash-lite) ──
const FLASH_SYSTEM_PROMPT = `Você é um criador de flashcards de alta qualidade.

REGRAS:
1. Cada cartão testa UMA informação. Resposta: MÁXIMO 15 palavras.
2. NUNCA diga "segundo o texto", "de acordo com" ou referencie a fonte. Escreva como fato direto.
3. Use APENAS informações do conteúdo fornecido. NÃO invente.
4. Cada cartão deve ser autocontido, sem referências a figuras ou anexos.
5. EVITE listas como resposta. Crie cartões separados para cada item.
6. Pergunte "Por quê?" e "Como?" — NUNCA "O que é X?" com resposta de dicionário.
7. Siga a ordem dos tópicos no conteúdo.

FORMATOS:
- type:"cloze" → Afirmação com {{c1::resposta}}. back DEVE ser "". NUNCA use formato de pergunta em cloze.
  ✅ "O principal músculo da inspiração é o {{c1::diafragma}}."
  ❌ "Qual é o principal músculo? {{c1::diafragma}}" (PROIBIDO: pergunta com cloze)
- type:"basic" → Pergunta no front, resposta curta no back. Perguntas de raciocínio, não definição.

PROIBIDO: NÃO gere cartões do tipo "multiple_choice". Use apenas "basic" e "cloze".

Responda APENAS com o JSON solicitado.`;

function getFlashFormatInstructions(formats: string[]): string {
  const parts: string[] = [];
  const forbiddenNames: string[] = [];

  const allFormats = [
    { key: "qa", aliases: ["definition", "qa"], typeName: "basic",
      instruction: '- type:"basic": Pergunta de raciocínio no front. Resposta curta no back (max 15 palavras). Pergunte "Por quê?", "Como funciona?", "Qual a diferença?". PROIBIDO "O que é X?".' },
    { key: "cloze", aliases: ["cloze"], typeName: "cloze",
      instruction: `- type:"cloze": Afirmação declarativa com {{c1::conceito-chave}}. back DEVE ser "".
  REGRA: cloze é SEMPRE afirmação, NUNCA pergunta. Se o front não contém {{c1::, o card será descartado.
  ✅ "A {{c1::hematose}} ocorre nos {{c2::alvéolos pulmonares}}."
  ❌ "Qual processo ocorre nos alvéolos? {{c1::hematose}}" (PROIBIDO)` },
  ];

  for (const f of allFormats) {
    if (f.aliases.some(a => formats.includes(a))) {
      parts.push(f.instruction);
    } else {
      forbiddenNames.push(f.typeName);
    }
  }

  if (parts.length === 0) parts.push(allFormats[0].instruction);

  const hasCloze = formats.includes("cloze");
  const hasBasic = formats.includes("qa") || formats.includes("definition");

  if (hasCloze && hasBasic) {
    parts.push("\nDISTRIBUIÇÃO: ~60% cloze, ~40% basic.");
  }

  // Always forbid multiple_choice
  forbiddenNames.push("multiple_choice");

  if (forbiddenNames.length > 0) {
    parts.push(`\nPROIBIDO: NÃO gere tipo ${forbiddenNames.map(n => `"${n}"`).join(", ")}.`);
  }

  return parts.join("\n");
}

function getDetailInstruction(level: string): string {
  switch (level) {
    case "essential": return "Crie poucos cartões focados nos 3-5 conceitos mais fundamentais. Priorize o que cairia numa prova.";
    case "comprehensive": return "COBERTURA TOTAL (100%): Crie cartões para CADA conceito, definição, mecanismo, exemplo e detalhe presente no conteúdo. O estudante deve conseguir dominar TODO o conteúdo apenas com os cartões. NÃO pule NENHUM parágrafo, NENHUM conceito, NENHUM detalhe. Cada informação relevante deve ter pelo menos um cartão dedicado. Extraia cada sub-tópico, exceção, exemplo concreto e caso especial. Se o texto citar uma EXCEÇÃO, crie um cartão. Se citar um EXEMPLO, crie um cartão. Se houver listas, cada item merece seu próprio cartão atômico.";
    default: return "COBERTURA COMPLETA: Faça uma varredura FOLHA POR FOLHA do conteúdo fornecido. Para cada folha/seção, identifique os conceitos-chave e crie cartões que cubram os pontos principais. Conecte conceitos entre folhas quando relevante. Ao final, verifique: cada seção do conteúdo está representada? Se não, adicione os cartões faltantes.";
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
   TESTE DE QUALIDADE: Leia a frase COM a lacuna oculta. Se houver MAIS DE UMA resposta plausível, o card está ruim — adicione mais contexto. A resposta deve ser ÚNICA e INEQUÍVOCA.
   ERRADO: 'O {{c1::diafragma}} é importante para a respiração' (muitos músculos são importantes)
   CERTO: 'O principal músculo motor da inspiração em repouso é o {{c1::diafragma}}, que se contrai e achata durante a inspiração.'

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
   TESTE DE QUALIDADE: Leia a frase COM a lacuna oculta. Se houver MAIS DE UMA resposta plausível, o card está ruim — adicione mais contexto. A resposta deve ser ÚNICA e INEQUÍVOCA.
   ERRADO: 'O {{c1::diafragma}} é importante para a respiração' (muitos músculos são importantes)
   CERTO: 'O principal músculo motor da inspiração em repouso é o {{c1::diafragma}}, que se contrai e achata durante a inspiração.'
   REGRAS CLOZE:
    • A lacuna deve conter um CONCEITO-CHAVE (nome, mecanismo, número, local anatômico), nunca uma palavra trivial como artigos ou preposições.
    • Use múltiplos índices (c1, c2, c3) para testar conceitos diferentes DENTRO DA MESMA frase quando relevante.
    • NUNCA coloque a lacuna na PERGUNTA — cloze é uma AFIRMAÇÃO com lacuna, não uma pergunta com lacuna.
    • ERRADO: "Qual é o principal motor da inspiração? O {{c1::diafragma}}." (mistura pergunta com cloze)
    • CERTO: "O principal músculo responsável pela inspiração em repouso é o {{c1::diafragma}}."
    • CERTO: "A {{c1::hematose}} é o processo de troca gasosa que ocorre nos {{c2::alvéolos pulmonares}}."`;

  const allFormats = [
    { key: "qa", aliases: ["definition", "qa"], instruction: '- type:"basic": Pergunta direta e DESAFIADORA na frente. Resposta concisa no verso: MÁXIMO 15 palavras. Se precisa de mais, divida em 2 cartões. REGRA DE OURO: se a resposta não cabe em 1 linha, o cartão está mal formulado. OBRIGATÓRIO: perguntas de MECANISMO ("Como funciona?"), CAUSA-EFEITO ("Por que X causa Y?"), COMPARAÇÃO ("Qual a diferença entre X e Y?") e APLICAÇÃO PRÁTICA. PROIBIDO: perguntas de dicionário ("O que é X?") — o estudante deve RACIOCINAR, não recitar.', name: "pergunta/resposta", typeName: "basic" },
    { key: "cloze", aliases: ["cloze"], instruction: clozeInstruction + '\n  Foque em TERMINOLOGIA TÉCNICA crucial, VALORES NUMÉRICOS, NOMES PRÓPRIOS e LOCAIS ANATÔMICOS. A lacuna deve ocultar a informação que o estudante PRECISA saber de cor.', name: "cloze", typeName: "cloze" },
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

  // Always forbid multiple_choice
  forbiddenNames.push("multiple_choice");

  const count = formatNames.length;
  if (count === 1) {
    parts.push(`\nUse EXCLUSIVAMENTE o formato "${formatNames[0]}" para TODOS os cartões. Qualquer cartão de outro formato será DESCARTADO.`);
  } else {
    const hasCloze = formats.includes("cloze");
    const hasBasic = formats.includes("qa") || formats.includes("definition");

    let distributionText: string;
    if (hasCloze && hasBasic) {
      distributionText = `DISTRIBUIÇÃO PEDAGÓGICA:
- Cloze: ~60% dos cartões — formato dominante para retenção.
- Pergunta/Resposta (basic): ~40% dos cartões — para raciocínio e compreensão.`;
    } else {
      distributionText = `Use a distribuição que melhor se adapte ao conteúdo.`;
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
  if (examples.length === 0) {
    examples.push('{"front":"Por que a pressão intrapleural negativa é essencial para a ventilação?","back":"Porque ela mantém os pulmões expandidos contra a parede torácica.","type":"basic"}');
  }
  return `[\n  ${examples.join(',\n  ')}\n]`;
}

function mapCardType(type: string, allowedFormats: string[]): string {
  if (type === "cloze" && allowedFormats.includes("cloze")) return "cloze";
  if ((type === "basic" || type === "qa" || type === "definition") && (allowedFormats.includes("qa") || allowedFormats.includes("definition"))) return "basic";
  // Map multiple_choice to basic (no longer supported)
  if (type === "multiple_choice") return "basic";
  if (allowedFormats.includes("qa") || allowedFormats.includes("definition")) return "basic";
  if (allowedFormats.includes("cloze")) return "cloze";
  return "basic";
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  let creditsHeld = false;
  let heldCredits = 0;
  let supabase: any;
  let userId = "";

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "Não autenticado" }, 401);

    supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return jsonResponse({ error: "Token inválido" }, 401);
    userId = user.id;

    const { textContent, cardCount, detailLevel, cardFormats, customInstructions, aiModel } = await req.json();

    const { apiKey: AI_KEY, url: AI_URL } = getAIConfig();
    if (!AI_KEY) return jsonResponse({ error: "AI API key não configurada" }, 500);
    if (!textContent?.trim()) return jsonResponse({ error: "textContent é obrigatório" }, 400);

    const promptConfig = await fetchPromptConfig(supabase, "generate_deck");
    const MODEL_MAP = await getModelMap(supabase);
    const selectedModel = MODEL_MAP[aiModel || promptConfig?.default_model || "flash"] || "google/gemini-2.5-flash";
    const isFlashLite = selectedModel.includes("flash-lite");
    const temperature = promptConfig?.temperature ?? 0.5;

    // Server-side pricing: never trust a cost sent by the client.
    const outputCeiling = Math.min(Math.max((cardCount > 0 ? cardCount : 40) * 220, 4000), 65000);
    heldCredits = await estimateCredits(supabase, selectedModel, String(textContent).length + 4000, outputCeiling);
    const creditsOk = await holdCredits(supabase, userId, heldCredits, "generate_deck");
    if (!creditsOk) return jsonResponse({ error: "Créditos IA insuficientes", requiresCredits: true, requiredCredits: heldCredits }, 402);
    creditsHeld = true;


    const trimmedContent = textContent;
    const requestedCount = cardCount > 0 ? Math.min(Math.max(cardCount, 3), 80) : 0;
    // Filter out multiple_choice from formats (no longer supported)
    const formats = (cardFormats?.length ? cardFormats : ["qa", "cloze"]).filter((f: string) => f !== "multiple_choice");
    if (formats.length === 0) formats.push("qa", "cloze");

    // O prompt do admin (ai_prompts) vale para TODOS os modelos; o prompt
    // simplificado só entra como fallback quando não há prompt configurado.
    let systemPrompt: string;
    if (customInstructions && /prova|exame|questões/i.test(customInstructions)) {
      systemPrompt = "Você é um gerador de questões de prova acadêmica de alta qualidade. Gere apenas o JSON solicitado, sem texto adicional.";
    } else {
      systemPrompt = promptConfig?.system_prompt || (isFlashLite ? FLASH_SYSTEM_PROMPT : DEFAULT_SYSTEM_PROMPT);
    }


    const countInstruction = requestedCount > 0
      ? `Gere NO MÁXIMO ${requestedCount} cartões. Esse número é um TETO, não uma meta: se o conteúdo não sustentar essa quantidade de fatos distintos, gere menos. É PROIBIDO inventar, repetir ou fatiar trivialidades para atingir o número.`
      : `Gere a quantidade de cartões que o conteúdo realmente sustenta no nível "${detailLevel}". Qualidade vence quantidade: nunca invente informação nem crie cartões triviais para aumentar o total.`;


    const formatInstructions = isFlashLite ? getFlashFormatInstructions(formats) : getFormatInstructions(formats);

    const prompt = isFlashLite
      ? `Crie flashcards para este conteúdo.

- ${countInstruction}
- ${getDetailInstruction(detailLevel)}
- Idioma: mesmo do conteúdo.
${customInstructions ? `- INSTRUÇÃO DO USUÁRIO: ${customInstructions}` : ""}

FORMATOS:
${formatInstructions}

CONTEÚDO:
---
${trimmedContent}
---

Verifique: cada seção do conteúdo tem pelo menos 1 cartão?`
      : `Crie flashcards de alta qualidade para ajudar o estudante a DOMINAR este conteúdo.

REGRAS OBRIGATÓRIAS:
- ${countInstruction}
- ${getDetailInstruction(detailLevel)}
- TUDO em PORTUGUÊS (ou na língua do conteúdo fornecido).
- Varie os TIPOS de pergunta: mecanismo, comparação, aplicação clínica, causa-efeito, redundância estratégica.
- SEM DECOREBA: Formule de modo que o estudante precise RACIOCINAR sobre o mecanismo, a causa ou a consequência. PROIBIDO perguntas de "O que é X?" com resposta de dicionário.
- Cada cartão deve ser AUTOCONTIDO (sem referências a anexos/figuras/imagens).
- PROIBIDO referenciar a fonte nos cartões. NUNCA use "de acordo com", "segundo o texto", "conforme mencionado", "como visto no conteúdo", "o autor afirma" ou QUALQUER variação. Escreva como FATO DIRETO, sem indicar origem.
- Use SOMENTE informações presentes no conteúdo abaixo. NÃO invente, NÃO extrapole, NÃO adicione conhecimento externo. Se insuficiente, crie menos cartões.
- ORDEM: Os cartões DEVEM seguir a ordem dos tópicos no conteúdo. NUNCA embaralhe a ordem.
- EVITE LISTAS: Se uma resposta teria múltiplos itens, crie cartões separados para cada item.
${customInstructions ? `\nINSTRUÇÕES ESPECIAIS DO USUÁRIO (respeite obrigatoriamente):\n${customInstructions}` : ""}

FORMATOS PERMITIDOS (use SOMENTE estes):
${formatInstructions}

CONTEÚDO-BASE (use APENAS isto para gerar os cartões):
---
${trimmedContent}
---

FORMATO DE SAÍDA (apenas JSON array, sem texto extra, sem markdown):
${getOutputExamples(formats)}`;

    console.log(`Using model: ${selectedModel}, textLen: ${trimmedContent.length}, formats: ${formats.join(",")}, detail: ${detailLevel}`);

    const cardProperties: Record<string, any> = {
      front: { type: "string", description: "Card front content" },
      back: { type: "string", description: "Card back content (empty string for cloze)" },
      type: { type: "string", enum: ["basic", "cloze"], description: "Card type" },
    };
    const toolSchema: any = {
      type: "object",
      properties: {
        cards: {
          type: "array",
          items: {
            type: "object",
            properties: {
              ...cardProperties,
            },
            required: ["front", "back", "type"],
            additionalProperties: false,
          },
        },
      },
      required: ["cards"],
      additionalProperties: false,
    };

    const coverageChecklist = `\n\nCHECKLIST DE COBERTURA (execute mentalmente antes de finalizar):
1. Releia cada parágrafo/seção do conteúdo acima.
2. Para cada parágrafo, verifique se existe pelo menos 1 cartão correspondente.
3. Se algum parágrafo/conceito ficou sem cartão, ADICIONE os cartões faltantes.
4. Só finalize quando 100% do conteúdo estiver coberto.`;

    // Flash-lite already has inline coverage check; full checklist only for Pro
    const fullPrompt = isFlashLite ? prompt : prompt + coverageChecklist;

    console.log(`Using model: ${selectedModel} (flashLite=${isFlashLite}), textLen: ${trimmedContent.length}, formats: ${formats.join(",")}, detail: ${detailLevel}`);

    /**
     * Reasoning models (gemini-2.5-pro) intermittently return an EMPTY message:
     * no tool_call and content === "" (thinking budget consumed the output cap).
     * We therefore retry: 2nd attempt keeps tools but caps reasoning; 3rd attempt
     * drops tools entirely and asks for plain JSON.
     */
    type Attempt = { useTools: boolean; lowReasoning: boolean; maxTokens: number };
    const attempts: Attempt[] = [
      { useTools: true, lowReasoning: false, maxTokens: 65000 },
      { useTools: true, lowReasoning: true, maxTokens: 32000 },
      { useTools: false, lowReasoning: true, maxTokens: 32000 },
    ];

    let aiData: any = null;
    let toolCall: any = null;
    let rawContentText = "";
    let lastFinishReason = "";

    for (let i = 0; i < attempts.length; i++) {
      const a = attempts[i];
      const body: Record<string, unknown> = {
        model: selectedModel,
        usage: { include: true },
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: a.useTools
              ? fullPrompt
              : `${fullPrompt}\n\nIMPORTANTE: responda APENAS com um array JSON puro (sem markdown, sem comentários), no formato:\n${getOutputExamples(formats)}`,
          },
        ],
        temperature,
        max_tokens: a.maxTokens,
      };
      if (a.lowReasoning) body.reasoning = { effort: "low" };
      if (a.useTools) {
        body.tools = [{
          type: "function",
          function: {
            name: "return_flashcards",
            description: "Return the generated flashcards",
            parameters: toolSchema,
          },
        }];
        body.tool_choice = { type: "function", function: { name: "return_flashcards" } };
      }

      const aiResponse = await fetchWithRetry(AI_URL, {
        method: "POST",
        headers: aiHeaders(AI_KEY),
        body: JSON.stringify(body),
      });

      if (!aiResponse.ok) {
        const errText = await aiResponse.text();
        console.error("AI error:", aiResponse.status, errText);
        if (creditsHeld) await refundCredits(supabase, userId, heldCredits);
        if (aiResponse.status === 429) return jsonResponse({ error: "Limite de requisições excedido. Tente em alguns segundos." }, 429);
        if (aiResponse.status === 403) return jsonResponse({ error: "API do Google AI não ativada. Verifique o console." }, 502);
        if (aiResponse.status === 503) return jsonResponse({ error: "Modelo sobrecarregado. Tente o modelo Flash." }, 503);
        return jsonResponse({ error: "Serviço de IA indisponível" }, 502);
      }

      aiData = await aiResponse.json();
      const choice = aiData.choices?.[0];
      lastFinishReason = choice?.finish_reason ?? "";
      toolCall = choice?.message?.tool_calls?.[0];
      rawContentText = choice?.message?.content ?? "";

      const empty = !toolCall?.function?.arguments && !rawContentText.trim();
      console.log(
        `Attempt ${i + 1}/${attempts.length} — tools:${a.useTools} finish:${lastFinishReason} ` +
        `toolCall:${!!toolCall} contentLen:${rawContentText.length} ` +
        `reasoning_tokens:${aiData.usage?.completion_tokens_details?.reasoning_tokens ?? 0}`
      );
      if (!empty) break;
      if (i === attempts.length - 1) {
        console.error("Empty AI response after all attempts. finish_reason:", lastFinishReason);
        if (creditsHeld) await refundCredits(supabase, userId, heldCredits);
        return jsonResponse({ error: "A IA retornou resposta vazia. Tente novamente ou reduza o conteúdo." }, 502);
      }
    }

    const rawUsage = aiData.usage || {};
    const reasoningTokens = rawUsage.completion_tokens_details?.reasoning_tokens || 0;
    const cachedTokens = rawUsage.prompt_tokens_details?.cached_tokens || 0;

    // Exact OpenRouter accounting (usage.cost) + generation id for cost lookup.
    const usage = extractUsage(aiData);

    let cards: { front: string; back: string; type: string; options?: string[]; correctIndex?: number }[];


    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        cards = parsed.cards || [];
        console.log("Tool call parsed successfully, cards:", cards.length,
          "usage:", JSON.stringify(rawUsage),
          "reasoning_tokens:", reasoningTokens, "cached_tokens:", cachedTokens);
      } catch (parseErr) {
        console.error("Tool call parse error:", parseErr, "raw:", toolCall.function.arguments.substring(0, 500));
        if (creditsHeld) await refundCredits(supabase, userId, heldCredits);
        await logTokenUsage(supabase, userId, "generate_deck", selectedModel, usage, 0);
        return jsonResponse({ error: "A IA não conseguiu gerar cards. Tente novamente ou use menos conteúdo.", usage }, 500);
      }
    } else {
      const rawContent = aiData.choices?.[0]?.message?.content ?? "";
      console.warn("No tool call in response, falling back to content parsing. Length:", rawContent.length);

      let jsonStr = rawContent
        .replace(/^\uFEFF/, '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
        .trim();

      jsonStr = jsonStr.replace(/"((?:[^"\\]|\\.)*)"/g, (match) => {
        return match.replace(/(?<!\\)\n/g, '\\n').replace(/(?<!\\)\r/g, '\\r');
      });

      const m = jsonStr.match(/\[[\s\S]*\]/);
      if (m) {
        jsonStr = m[0];
      } else {
        const arrStart = rawContent.indexOf('[');
        if (arrStart !== -1) {
          const raw = rawContent.slice(arrStart);
          const lastBrace = raw.lastIndexOf('}');
          if (lastBrace !== -1) {
            jsonStr = raw.slice(0, lastBrace + 1).replace(/,\s*$/, '') + ']';
          } else {
            jsonStr = '[]';
          }
        }
      }
      jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');

      try {
        cards = JSON.parse(jsonStr);
      } catch {
        try {
          const objMatches = [...jsonStr.matchAll(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g)];
          if (objMatches.length > 0) {
            cards = JSON.parse('[' + objMatches.map(m => m[0]).join(',') + ']');
          } else {
            throw new Error("no objects found");
          }
        } catch {
          console.error("Parse failed, raw:", rawContent.substring(0, 500));
          if (creditsHeld) await refundCredits(supabase, userId, heldCredits);
          await logTokenUsage(supabase, userId, "generate_deck", selectedModel, usage, 0);
          return jsonResponse({ error: "A IA não conseguiu gerar cards. Tente novamente ou use menos conteúdo.", usage }, 500);
        }
      }
    }

    if (!Array.isArray(cards) || cards.length === 0) {
      if (creditsHeld) await refundCredits(supabase, userId, heldCredits);
      await logTokenUsage(supabase, userId, "generate_deck", selectedModel, usage, 0);
      return jsonResponse({ error: "Nenhum cartão gerado.", usage }, 400);
    }

    const CLOZE_REGEX = /\{\{c\d+::/;
    const PLACEHOLDER_BACK = /^(informação não fornecida|n\/a|-|\.)$/i;
    /** Remove cloze markers, keeping the hidden answer as plain text. */
    const stripCloze = (s: string) => s.replace(/\{\{c\d+::(.*?)(?:::.*?)?\}\}/g, "$1");
    let discardedCount = 0;

    cards = cards
      .map(c => {
        const mappedType = mapCardType(c.type, formats);
        let front = (c.front || "").trim();
        let back = (c.back || "").trim();

        // Field shift / empty front: the statement sometimes lands in `back`.
        // Recover it instead of persisting a card with no front (renders blank).
        if (!front && back) {
          front = back;
          back = "";
          if (CLOZE_REGEX.test(front)) return { front, back: "", type: "cloze" as string };
        }

        if (!front) {
          discardedCount++;
          return null;
        }

        // Cloze without the {{cN::}} syntax: only salvageable when there is a real answer.
        if (mappedType === "cloze" && !CLOZE_REGEX.test(front)) {
          if (!back || PLACEHOLDER_BACK.test(back)) {
            console.warn("Discarding invalid cloze card (no syntax, no usable back):", front.substring(0, 80));
            discardedCount++;
            return null;
          }
          const needsQuestionMark = front.endsWith(":") || front.endsWith("...");
          return {
            front: needsQuestionMark ? front.replace(/[:.]+$/, "?") : front,
            back: stripCloze(back),
            type: "basic" as string,
          };
        }

        // Inverse mismatch: markers present but the model declared another type.
        if (CLOZE_REGEX.test(front)) {
          return { front, back: "", type: "cloze" as string };
        }

        // Basic card whose ANSWER carries cloze markers: the model produced a
        // cloze statement in the wrong field. The statement is self-contained,
        // so promote it to a real cloze card instead of leaking `{{c1::}}` to the UI.
        if (CLOZE_REGEX.test(back)) {
          return { front: back, back: "", type: "cloze" as string };
        }

        if (mappedType !== "cloze" && (!back || PLACEHOLDER_BACK.test(back))) {
          console.warn("Discarding basic card without answer:", front.substring(0, 80));
          discardedCount++;
          return null;
        }

        return {
          front: stripCloze(front),
          back: mappedType === "cloze" ? "" : stripCloze(back),
          type: mappedType,
        };
      })
      .filter((c): c is { front: string; back: string; type: string } => c !== null);


    if (discardedCount > 0) console.warn(`Discarded ${discardedCount} malformed card(s).`);

    if (cards.length === 0) {
      if (creditsHeld) await refundCredits(supabase, userId, heldCredits);
      await logTokenUsage(supabase, userId, "generate_deck", selectedModel, usage, 0);
      return jsonResponse({ error: "Nenhum cartão válido gerado.", usage }, 400);
    }


    const costUsd = await resolveCostUSD(selectedModel, usage);
    const chargedCredits = await settleCredits(supabase, userId, heldCredits, "generate_deck", selectedModel, usage, costUsd);
    await logTokenUsage(supabase, userId, "generate_deck", selectedModel, usage, chargedCredits, usage.generation_id, costUsd);

    return jsonResponse({ cards, usage, creditsCharged: chargedCredits });
  } catch (err) {
    console.error("Error:", err);
    if (creditsHeld) await refundCredits(supabase, userId, heldCredits);
    return jsonResponse({ error: "Erro interno do servidor" }, 500);
  }
});
