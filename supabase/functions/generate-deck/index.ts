import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, handleCors, jsonResponse, getModelMap, deductEnergy, logTokenUsage, fetchPromptConfig, getAIConfig, fetchWithRetry } from "../_shared/utils.ts";

const DEFAULT_SYSTEM_PROMPT = `Você é um Especialista em Educação e Neurociência do Aprendizado, focado em criar Flashcards de ALTO RENDIMENTO. Seu objetivo é transformar conteúdos densos (PDFs, anotações, artigos) em um sistema de estudo 100% autossuficiente, onde o aluno NÃO precise voltar ao material original.

═══════════════════════════════════════════════
█  DIRETRIZES DE OURO — PRINCÍPIOS INEGOCIÁVEIS  █
═══════════════════════════════════════════════

1. MEMORIZAÇÃO DE PRECISÃO TÉCNICA:
   Foque na memorização de termos técnicos, nomes de enzimas, marcadores de superfície (CDs), classificações, valores de referência, constantes, fórmulas e nomenclaturas. A "decoreba" técnica é o alicerce do raciocínio profundo. Se o texto cita "Caspases 3, 6 e 7", NÃO resuma para "caspases executoras" — crie um card que exija os números exatos.

2. COBERTURA EXAUSTIVA (100%):
   Analise o texto LINHA POR LINHA. Cada detalhe técnico, exemplo clínico/prático ou mecanismo deve ser transformado em pelo menos um card. Se houver uma lista de exemplos (ex: contextos fisiológicos, casos clínicos), crie um card individual para CADA um.

3. MÉTODO CLOZE (REI):
   Priorize o formato Cloze para mecanismos e definições. A lacuna deve cair SEMPRE no termo técnico mais importante ou no "ponto de confusão" — o dado que o estudante mais erra.

4. PRINCÍPIO DO MÍNIMO DE INFORMAÇÃO (SuperMemo):
   Cada card testa APENAS UMA ideia atômica. Se um processo tem 3 etapas, crie 3 cards diferentes. Resposta máxima: 15 palavras. Se excede, divida em 2 cards.

5. CONTEXTO MÍNIMO SUFICIENTE:
   Cada card deve ser AUTOCONTIDO — forneça contexto para que a resposta seja ÚNICA e INEQUÍVOCA. Ex: "Na via intrínseca da apoptose (mitocondrial), a proteína que se une ao Citocromo C para formar o apoptossomo é a {{c1::Apaf-1}}."

6. PROGRESSÃO LÓGICA:
   Os cards devem construir uma NARRATIVA. Conceitos-pai antes de detalhes. O estudante nunca deve encontrar um card que depende de conhecimento não coberto anteriormente.

═══════════════════════════════════════════
█  REGRAS PEDAGÓGICAS — MÉTODO ATIVO  █
═══════════════════════════════════════════

7. INTERROGAÇÃO ELABORATIVA: Pergunte "Por quê?" e "Como?" em vez de "O que é?". O estudante deve RACIOCINAR, não recitar.
8. CONEXÕES: Crie cards que conectam conceitos entre si ("Como X influencia Y?").
9. CONTRASTE: Compare conceitos similares para forçar diferenciação ("Diferença entre X e Y?").
10. APLICAÇÃO: Use cenários práticos/clínicos em vez de definições abstratas.
11. EXCLUSIVIDADE: Use APENAS informações do conteúdo fornecido. NUNCA invente dados ou adicione informações externas.
12. REDUNDÂNCIA ESTRATÉGICA (apenas para conceitos CENTRAIS):
    - Ângulo 1: FATO (o que é / qual valor)
    - Ângulo 2: MECANISMO (como funciona)
    - Ângulo 3: CONSEQUÊNCIA (o que acontece se falhar)
    ERRADO: "X causa Y" + "Y é causado por X" (inversão trivial)
    CERTO: "X causa Y" + "Se X falhar, qual a consequência?"

═══════════════════════════════════════
█  ANTI-PADRÕES (PROIBIDO — SERÁ DESCARTADO)  █
═══════════════════════════════════════

❌ Perguntas vagas "O que é X?" com respostas de dicionário
❌ Respostas em lista ("A, B, C e D") — quebre em múltiplos cards
❌ Cards que agrupam múltiplos conceitos
❌ Múltipla escolha com distratores absurdos/inventados
❌ Cloze com lacunas em palavras triviais (artigos, preposições)
❌ Cards que copiam frases inteiras do texto sem reformulação
❌ Referenciar a fonte: "de acordo com o material", "segundo o texto", "conforme mencionado", "como visto", "o autor afirma" — QUALQUER variação é PROIBIDA
❌ Cards que testam informação ÓBVIA que qualquer leigo saberia
❌ Cards com respostas que podem ser adivinhadas sem estudar o conteúdo
❌ Ignorar exemplos clínicos, fisiológicos ou práticos do texto

═══════════════════════════════════════════════
█  EXEMPLOS DE CARDS IDEAIS (FEW-SHOT)  █
═══════════════════════════════════════════════

### CLOZE — Exemplos de excelência:
✅ "A enzima responsável pela conversão de angiotensinogênio em angiotensina I é a {{c1::renina}}, secretada pelas células {{c2::justaglomerulares}} do rim."
✅ "O receptor de morte Fas também é conhecido pelo marcador de superfície {{c1::CD95}}."
✅ "As caspases executoras da apoptose são as caspases {{c1::3}}, {{c2::6}} e {{c3::7}}."
✅ "A pressão intrapleural é normalmente {{c1::negativa}} em relação à pressão atmosférica."
✅ "A {{c1::hematose}} é o processo de troca gasosa que ocorre nos {{c2::alvéolos pulmonares}}."

### BASIC (Pergunta/Resposta) — Exemplos de excelência:
✅ Front: "Por que a aldosterona causa hipocalemia?"
   Back: "Reabsorve Na⁺ e secreta K⁺ no túbulo coletor."
✅ Front: "Qual a principal diferença na integridade da membrana entre Necrose e Apoptose?"
   Back: "Necrose: ruptura da membrana. Apoptose: membrana mantida."
✅ Front: "Como a paralisia do diafragma causa dispneia?"
   Back: "Impede a expansão da caixa torácica na inspiração."

### MÚLTIPLA ESCOLHA — Exemplos de excelência (nível residência):
✅ Front: "Qual caspase inicia a via EXTRÍNSECA da apoptose?"
   Options: ["Caspase-9", "Caspase-8", "Caspase-3", "Caspase-10"]
   correctIndex: 1
   (Note: distratores são caspases REAIS do mesmo contexto — forçam diferenciação)
✅ Front: "Qual marcador de superfície identifica o receptor Fas?"
   Options: ["CD4", "CD95", "CD8", "CD25"]
   correctIndex: 1

REGRA CRÍTICA DE LINGUAGEM:
Os cartões NUNCA devem referenciar a origem do conhecimento. Cada cartão deve soar como conhecimento factual independente, como se viesse de um livro didático ou enciclopédia.`;

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

  COMO FUNCIONA: Escreva uma AFIRMAÇÃO COMPLETA e autocontida no "front", ocultando o conceito-chave com a sintaxe {{c1::resposta}}.
   A frase deve fazer sentido quando lida com a lacuna preenchida E deve ser respondível quando a lacuna estiver oculta.
   TESTE DE QUALIDADE: Leia a frase COM a lacuna oculta. Se houver MAIS DE UMA resposta plausível, o card está ruim — adicione mais contexto. A resposta deve ser ÚNICA e INEQUÍVOCA.
   ERRADO: 'O {{c1::diafragma}} é importante para a respiração' (muitos músculos são importantes)
   CERTO: 'O principal músculo motor da inspiração em repouso é o {{c1::diafragma}}, que se contrai e achata durante a inspiração.'

   REGRAS CLOZE:
    • A lacuna DEVE conter um TERMO TÉCNICO (nome de enzima, marcador, receptor, valor numérico, local anatômico), NUNCA uma palavra trivial.
    • Use múltiplos índices (c1, c2, c3) para testar conceitos diferentes na mesma frase quando relevante.
    • Cloze é SEMPRE uma AFIRMAÇÃO DECLARATIVA, NUNCA uma pergunta.
    • O front DEVE conter pelo menos um {{c1::...}} — sem exceção.

  EXEMPLOS CORRETOS:
    ✅ "O principal músculo responsável pela inspiração em repouso é o {{c1::diafragma}}."
    ✅ "A {{c1::hematose}} é o processo de troca gasosa que ocorre nos {{c2::alvéolos pulmonares}}."
    ✅ "As caspases executoras da apoptose são as caspases {{c1::3}}, {{c2::6}} e {{c3::7}}."

  EXEMPLOS INCORRETOS (serão DESCARTADOS):
    ❌ "Qual é o principal motor da inspiração?" → REJEITADO (pergunta sem lacuna)
    ❌ "A Ventilação Alveolar é crucial porque:" → REJEITADO (incompleto, sem lacuna)
    ❌ "O que é o VRE?" → REJEITADO (pergunta, não afirmação com lacuna)
    ❌ "Qual é o principal motor da inspiração? O {{c1::diafragma}}." → REJEITADO (mistura pergunta com cloze)`
    : `- type:"cloze": Cartão de LACUNA (cloze deletion). TODO o conteúdo fica SOMENTE no campo "front". O campo "back" DEVE ser SEMPRE uma string vazia "".
  COMO FUNCIONA: Escreva uma AFIRMAÇÃO COMPLETA e autocontida no "front", ocultando o conceito-chave com a sintaxe {{c1::resposta}}.
   A frase deve fazer sentido quando lida com a lacuna preenchida E deve ser respondível quando a lacuna estiver oculta.
   TESTE DE QUALIDADE: Leia a frase COM a lacuna oculta. Se houver MAIS DE UMA resposta plausível, adicione mais contexto. A resposta deve ser ÚNICA e INEQUÍVOCA.
   REGRAS CLOZE:
    • A lacuna DEVE conter um TERMO TÉCNICO (nome de enzima, marcador, receptor, valor numérico, local anatômico), NUNCA uma palavra trivial.
    • Use múltiplos índices (c1, c2, c3) para testar conceitos diferentes DENTRO DA MESMA frase quando relevante.
    • NUNCA coloque a lacuna na PERGUNTA — cloze é uma AFIRMAÇÃO com lacuna, não uma pergunta com lacuna.`;

  const allFormats = [
    { key: "qa", aliases: ["definition", "qa"], instruction: '- type:"basic": Pergunta direta e DESAFIADORA na frente. Resposta concisa no verso: MÁXIMO 15 palavras. Se precisa de mais, divida em 2 cartões. OBRIGATÓRIO: perguntas de MECANISMO ("Como funciona?"), CAUSA-EFEITO ("Por que X causa Y?"), COMPARAÇÃO ("Qual a diferença entre X e Y?") e APLICAÇÃO PRÁTICA. PROIBIDO: perguntas de dicionário ("O que é X?") — o estudante deve RACIOCINAR, não recitar.', name: "pergunta/resposta", typeName: "basic" },
    { key: "cloze", aliases: ["cloze"], instruction: clozeInstruction + '\n  Foque em TERMINOLOGIA TÉCNICA crucial, VALORES NUMÉRICOS, NOMES PRÓPRIOS e LOCAIS ANATÔMICOS. A lacuna deve ocultar a informação que o estudante PRECISA saber de cor.', name: "cloze", typeName: "cloze" },
    { key: "multiple_choice", aliases: ["multiple_choice"], instruction: '- type:"multiple_choice": Pergunta de nível RESIDÊNCIA/PROVA DIFÍCIL na "front", "back" vazio. "options" com 4 alternativas técnicas. "correctIndex" com o índice correto (0-based). REGRA CRÍTICA: Os distratores DEVEM ser termos técnicos PLAUSÍVEIS do mesmo contexto/família (ex: se a resposta é Caspase-8, os distratores devem ser Caspase-9, Caspase-3, Caspase-10). PROIBIDO: opções óbvias, "todas as anteriores", "nenhuma das anteriores", ou distratores de áreas completamente diferentes. Teste a DIFERENCIAÇÃO entre conceitos similares.', name: "múltipla escolha", typeName: "multiple_choice" },
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
    const hasAll3 = formatNames.length === 3;
    const hasCloze = formats.includes("cloze");
    const hasBasic = formats.includes("qa") || formats.includes("definition");
    const hasMCQ = formats.includes("multiple_choice");

    let distributionText: string;
    if (hasAll3) {
      distributionText = `DISTRIBUIÇÃO PEDAGÓGICA — OBRIGATÓRIA, todos os formatos DEVEM aparecer:
- Cloze: ~60% dos cartões — formato com MAIOR poder mnemônico. Use para termos técnicos, valores, nomes, mecanismos.
- Pergunta/Resposta (basic): ~30% dos cartões — para raciocínio, mecanismos, causa-efeito, comparações.
- Múltipla Escolha: ~10% dos cartões — APENAS para questões de nível residência/prova difícil que testem diferenciação entre conceitos similares. Distratores DEVEM ser termos irmãos (mesma família).`;
    } else if (hasCloze && hasBasic) {
      distributionText = `DISTRIBUIÇÃO PEDAGÓGICA:
- Cloze: ~60% dos cartões — formato dominante para retenção técnica.
- Pergunta/Resposta (basic): ~40% dos cartões — para raciocínio e compreensão.`;
    } else if (hasCloze && hasMCQ) {
      distributionText = `DISTRIBUIÇÃO PEDAGÓGICA — OBRIGATÓRIA, ambos os formatos DEVEM aparecer:
- Cloze: ~70% dos cartões — formato dominante para retenção.
- Múltipla Escolha: ~30% dos cartões (OBRIGATÓRIO) — para diferenciação de conceitos.`;
    } else {
      distributionText = `DISTRIBUIÇÃO PEDAGÓGICA — OBRIGATÓRIA, ambos os formatos DEVEM aparecer:
- Pergunta/Resposta (basic): ~70% dos cartões — para raciocínio e compreensão.
- Múltipla Escolha: ~30% dos cartões (OBRIGATÓRIO) — para diferenciação de conceitos.`;
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

function mapCardType(type: string, allowedFormats: string[]): string {
  if (type === "cloze" && allowedFormats.includes("cloze")) return "cloze";
  if (type === "multiple_choice" && allowedFormats.includes("multiple_choice")) return "multiple_choice";
  if ((type === "basic" || type === "qa" || type === "definition") && (allowedFormats.includes("qa") || allowedFormats.includes("definition"))) return "basic";

  if (allowedFormats.includes("qa") || allowedFormats.includes("definition")) return "basic";
  if (allowedFormats.includes("cloze")) return "cloze";
  if (allowedFormats.includes("multiple_choice")) return "multiple_choice";
  return "basic";
}

/** OpenAI Structured Outputs JSON Schema — forces exact card structure */
const FLASHCARDS_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "flashcards",
    strict: true,
    schema: {
      type: "object",
      properties: {
        cards: {
          type: "array",
          items: {
            type: "object",
            properties: {
              front: { type: "string" },
              back: { type: "string" },
              type: { type: "string", enum: ["basic", "cloze", "multiple_choice"] },
              options: { type: "array", items: { type: "string" } },
              correctIndex: { type: "number" },
            },
            required: ["front", "back", "type", "options", "correctIndex"],
            additionalProperties: false,
          },
        },
      },
      required: ["cards"],
      additionalProperties: false,
    },
  },
};

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
    if (!AI_KEY) return jsonResponse({ error: "OPENAI_API_KEY não configurada" }, 500);
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

    const trimmedContent = textContent;
    const requestedCount = cardCount > 0 ? Math.max(cardCount, 3) : 0;
    const formats = cardFormats?.length ? cardFormats : ["qa", "cloze", "multiple_choice"];
    const detail = detailLevel || "standard";

    let systemPrompt = promptConfig?.system_prompt || DEFAULT_SYSTEM_PROMPT;

    if (customInstructions && /prova|exame|questões/i.test(customInstructions)) {
      systemPrompt = "Você é um gerador de questões de prova acadêmica de alta qualidade.";
    }

    const countInstruction = requestedCount > 0
      ? `Crie exatamente ${requestedCount} cartões.`
      : `Crie a quantidade NECESSÁRIA de cartões para cobrir o material no nível "${detail}". NÃO limite artificialmente — gere tantos cartões quantos forem necessários para garantir cobertura adequada.`;

    const prompt = `${countInstruction}
${getDetailInstruction(detail)}

REGRA DE PROFUNDIDADE (OBRIGATÓRIA — NÃO SEJA CONCISO):
- Cada card Cloze DEVE ter uma frase COMPLETA com contexto rico (mínimo 15 palavras antes/depois da lacuna). NUNCA gere frases curtas e genéricas.
- Cada card Basic DEVE ter resposta que EXPLIQUE o mecanismo/causa-efeito, não apenas nomeie o conceito.
- NUNCA simplifique terminologia: se o texto diz "desnaturação proteica inativa as enzimas digestivas impedindo a destruição imediata da estrutura", o card DEVE usar ESSES termos exatos.
- Inclua TODOS os exemplos clínicos, fisiológicos ou práticos mencionados no texto — cada um merece seu próprio card.
- Conecte causa → efeito → consequência clínica em cards separados mas sequenciais.
- Use linguagem de livro didático: explicações densas, ricas em contexto, que permitam ao aluno ENTENDER sem voltar ao material.

TUDO em PORTUGUÊS (ou na língua do conteúdo fornecido).
${customInstructions ? `\nINSTRUÇÕES ESPECIAIS DO USUÁRIO (respeite obrigatoriamente):\n${customInstructions}` : ""}

FORMATOS PERMITIDOS (use SOMENTE estes):
${getFormatInstructions(formats)}

REGRAS DE ESTRUTURA DOS CAMPOS:
- Para "basic": "front" = pergunta, "back" = resposta, "options" = [], "correctIndex" = 0
- Para "cloze": "front" = afirmação com {{c1::...}}, "back" = "", "options" = [], "correctIndex" = 0
- Para "multiple_choice": "front" = pergunta, "back" = "", "options" = [4 alternativas técnicas], "correctIndex" = índice correto (0-based)

CONTEÚDO-BASE (use APENAS isto para gerar os cartões):
---
${trimmedContent}
---`;

    console.log(`Using model: ${selectedModel}, textLen: ${trimmedContent.length}, formats: ${formats.join(",")}, detail: ${detail}`);

    const aiResponse = await fetchWithRetry(AI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${AI_KEY}` },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature,
        max_tokens: 16384,
        response_format: FLASHCARDS_SCHEMA,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      if (aiResponse.status === 429) return jsonResponse({ error: "Limite de requisições excedido. Tente em alguns segundos." }, 429);
      if (aiResponse.status === 403) return jsonResponse({ error: "API Key inválida ou sem permissão." }, 502);
      if (aiResponse.status === 503) return jsonResponse({ error: "Modelo sobrecarregado. Tente o modelo Flash." }, 503);
      return jsonResponse({ error: "Serviço de IA indisponível" }, 502);
    }

    const aiData = await aiResponse.json();
    const finishReason = aiData.choices?.[0]?.finish_reason ?? "unknown";
    const rawContent = aiData.choices?.[0]?.message?.content ?? "";

    console.log("AI finish_reason:", finishReason, "content length:", rawContent.length);

    const usage = {
      prompt_tokens: aiData.usage?.prompt_tokens || 0,
      completion_tokens: aiData.usage?.completion_tokens || 0,
      total_tokens: aiData.usage?.total_tokens || 0,
    };

    // With Structured Outputs, the JSON is guaranteed valid by the API
    // The only failure case is finish_reason === "length" (truncated output)
    if (finishReason === "length") {
      console.error("Output truncated (finish_reason=length)");
      if (!skipLog) await logTokenUsage(supabase, userId, "generate_deck", selectedModel, usage, cost);
      return jsonResponse({ error: "O conteúdo é muito extenso e a resposta foi truncada. Tente com menos páginas ou reduza a quantidade de cartões.", usage }, 500);
    }

    let parsed: { cards: { front: string; back: string; type: string; options: string[]; correctIndex: number }[] };
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      console.error("Structured output parse failed (unexpected):", rawContent.substring(0, 300));
      if (!skipLog) await logTokenUsage(supabase, userId, "generate_deck", selectedModel, usage, cost);
      return jsonResponse({ error: "A IA não conseguiu gerar cards. Tente novamente.", usage }, 500);
    }

    let cards = parsed.cards;

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
        ...(mappedType === "multiple_choice" && c.options?.length ? { options: c.options, correctIndex: c.correctIndex ?? 0 } : {}),
      };
    });

    if (!skipLog) {
      await logTokenUsage(supabase, userId, "generate_deck", selectedModel, usage, cost);
    }

    return jsonResponse({ cards, usage });
  } catch (err) {
    console.error("Error:", err);
    return jsonResponse({ error: "Erro interno do servidor" }, 500);
  }
});
