import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { handleCors, jsonResponse, getModelMap, deductEnergy, refundEnergy, logTokenUsage, getAIConfig, fetchWithRetry } from "../_shared/utils.ts";

/**
 * generate-questions — creates exam-style questions from a deck's cards.
 *
 * TWO-PASS architecture:
 *   Pass 1: AI clusters all cards into concept groups (related cards)
 *   Pass 2: AI generates ONE cross-concept question per cluster
 *
 * The AI decides how many questions to create based on concept analysis.
 * Multiple cards can map to one question when they share a concept.
 *
 * Body params:
 *   deckId: string (required)
 *   optionsCount: 4 | 5 (default 4)
 *   aiModel: string (default 'flash')
 *   energyCost: number (default 0)
 *   customInstructions?: string
 */

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  let energyDeducted = false;
  let deductedCost = 0;
  let supabase: any;
  let userId = "";

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "Não autenticado" }, 401);

    supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return jsonResponse({ error: "Token inválido" }, 401);
    userId = user.id;

    const body = await req.json();
    const {
      deckId,
      optionsCount = 4,
      aiModel = "flash",
      energyCost = 0,
      customInstructions = "",
    } = body;

    if (!deckId) return jsonResponse({ error: "deckId é obrigatório" }, 400);

    const { apiKey: AI_KEY, url: AI_URL } = getAIConfig();
    if (!AI_KEY) return jsonResponse({ error: "AI key não configurada" }, 500);

    // ─── Fetch deck cards (including sub-decks via RPC) ───
    const { data: cards, error: cardsError } = await supabase
      .rpc('get_descendant_cards_page', { p_deck_id: deckId, p_limit: 300, p_offset: 0 });

    if (cardsError) {
      console.error("Cards fetch error:", cardsError);
      return jsonResponse({ error: "Erro ao buscar cards" }, 500);
    }
    if (!cards || cards.length === 0) return jsonResponse({ error: "Nenhum card encontrado neste baralho" }, 400);

    // ─── Deduct energy ───
    const cost = energyCost || 0;
    if (cost > 0) {
      const ok = await deductEnergy(supabase, userId, cost);
      if (!ok) return jsonResponse({ error: "Créditos IA insuficientes", requiresCredits: true }, 402);
      energyDeducted = true;
      deductedCost = cost;
    }

    // ─── Prepare card content for AI ───
    const cardSummaries = cards.map((c: any, i: number) => {
      const front = (c.front_content || "").replace(/<[^>]*>/g, "").replace(/\{\{c\d+::(.*?)\}\}/g, "$1").trim();
      const back = (c.back_content || "").replace(/<[^>]*>/g, "").trim();
      return `[Card ${i + 1} | ID: ${c.id}]\nFrente: ${front}\n${back ? `Verso: ${back}` : ""}`;
    }).join("\n\n");

    const MODEL_MAP = await getModelMap(supabase);
    const selectedModel = MODEL_MAP[aiModel] || "gemini-2.5-flash";

    // ─── Build prompt: concept-cluster approach ───
    const systemPrompt = `Você é um especialista em criação de provas e avaliações. Sua missão é criar questões que testem COMPREENSÃO PROFUNDA correlacionando múltiplos conceitos.

## MÉTODO DE TRABALHO (siga EXATAMENTE nesta ordem):

### PASSO 1: ANÁLISE DE CONCEITOS
Analise TODOS os ${cards.length} cartões e identifique os CONCEITOS-CHAVE presentes. Um conceito pode aparecer em vários cartões.

### PASSO 2: AGRUPAMENTO (CLUSTERING)
Agrupe os cartões por afinidade conceitual. Cartões que compartilham temas, que são causa-efeito, que se complementam, ou que podem ser comparados devem ficar no MESMO grupo.
- Um cartão pode pertencer a mais de um grupo
- Grupos devem ter 2-6 cartões relacionados
- Cartões isolados sem relação com outros formam grupos unitários (evite isso)

### PASSO 3: GERAÇÃO DE QUESTÕES
Crie UMA questão por grupo conceitual. A questão deve exigir que o aluno INTEGRE o conhecimento de todos os cartões do grupo.

## REGRAS DE QUALIDADE:
✅ Cada questão deve testar a SÍNTESE de 2+ conceitos relacionados
✅ Alternativas incorretas devem ser plausíveis (conceitos REAIS de outros cartões)
✅ Explicação deve justificar por que a correta está certa E por que cada incorreta está errada
✅ source_card_ids deve conter os IDs EXATOS dos cartões usados
✅ Questões na mesma língua dos cartões

## CONCEPTS — KNOWLEDGE COMPONENTS:
O campo "concepts" deve conter NOMES de componentes de conhecimento (Knowledge Components).
Um Knowledge Component é a menor unidade atômica de conhecimento que pode ser avaliada independentemente.

Regras:
- 2-6 palavras: substantivo + qualificador (ex: "Fisiopatologia da ICC direita", "Critérios de Light")
- Nível Compreender/Aplicar de Bloom — NÃO fatos isolados, NÃO disciplinas amplas
- Cada conceito deve ser testável por múltiplas questões de ângulos diferentes
- 1-3 conceitos por questão (apenas os CENTRAIS, não todos os tangenciais)
- Reutilizável entre disciplinas — use terminologia padronizada

Exemplos CORRETOS: "Mecanismo de ação dos IECA", "Critérios de Light", "Diferença abscesso vs flegmão"
Exemplos ERRADOS: "Cardiologia" (amplo demais), "Dose de Captopril 25mg" (fato isolado), "Você entendeu X?" (pergunta, não conceito)

## EXPLICAÇÃO:
A explicação deve ser DIDÁTICA e ESTRUTURADA. Use markdown:
- Comece com uma frase-resumo da resposta correta
- Explique POR QUE cada alternativa incorreta está errada
- Use **negrito** para termos-chave
- Seja conciso mas completo

## PROIBIDO:
❌ Criar questões que testam apenas 1 cartão isolado (exceto se inevitável)
❌ Copiar literalmente o texto de um cartão como alternativa
❌ Criar alternativas absurdas que qualquer pessoa eliminaria
❌ Usar "todas as alternativas" ou "nenhuma das alternativas"
❌ Dizer "de acordo com o material", "segundo os cards" etc.
❌ Limitar artificialmente o número de questões — crie tantas quantos grupos conceituais existirem
❌ Colocar nomes de conceitos soltos no campo concepts — SEMPRE usar perguntas de autoavaliação`;

    const userPrompt = `Analise os ${cards.length} cartões abaixo. Identifique os grupos de conceitos relacionados e crie UMA questão de múltipla escolha (${optionsCount} alternativas) por grupo.

NÃO defina um número fixo — crie tantas questões quantos grupos conceituais você identificar. O importante é cobrir TODO o conteúdo do baralho.

CARTÕES DO BARALHO:
---
${cardSummaries}
---

${customInstructions ? `INSTRUÇÕES ADICIONAIS DO USUÁRIO: ${customInstructions}\n` : ""}
Para cada questão, retorne:
- question_text: enunciado (pode usar HTML para formatação)
- options: array com exatamente ${optionsCount} alternativas
- correct_index: índice da correta (0-based)
- explanation: explicação detalhada
- concepts: 2-5 conceitos-chave testados
- source_card_ids: IDs exatos dos cartões usados (copie do campo ID acima)`;

    // ─── Tool schema for structured output ───
    const toolSchema = {
      type: "object",
      properties: {
        concept_clusters: {
          type: "array",
          description: "Grupos conceituais identificados e suas questões",
          items: {
            type: "object",
            properties: {
              cluster_name: { type: "string", description: "Nome curto do grupo conceitual (ex: 'Princípios Constitucionais')" },
              question_text: { type: "string", description: "Enunciado da questão" },
              options: {
                type: "array",
                items: { type: "string" },
                description: `Exatamente ${optionsCount} alternativas`,
              },
              correct_index: { type: "integer", description: "Índice da alternativa correta (0-based)" },
              explanation: { type: "string", description: "Explicação detalhada" },
              concepts: {
                type: "array",
                items: { type: "string" },
                description: "2-4 perguntas de autoavaliação sobre os micro-conceitos testados nesta questão. Cada item é uma pergunta como 'Você conseguiu identificar que X é Y?'",
              },
              source_card_ids: {
                type: "array",
                items: { type: "string" },
                description: "IDs dos cartões usados para esta questão",
              },
            },
            required: ["cluster_name", "question_text", "options", "correct_index", "explanation", "concepts", "source_card_ids"],
            additionalProperties: false,
          },
        },
      },
      required: ["concept_clusters"],
      additionalProperties: false,
    };

    console.log(`generate-questions: model=${selectedModel}, cards=${cards.length}, opts=${optionsCount}, mode=concept-cluster`);

    const aiResponse = await fetchWithRetry(AI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${AI_KEY}` },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.5,
        max_tokens: 60000,
        tools: [{
          type: "function",
          function: {
            name: "return_questions",
            description: "Return the concept-clustered exam questions",
            parameters: toolSchema,
          },
        }],
        tool_choice: { type: "function", function: { name: "return_questions" } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      if (energyDeducted) await refundEnergy(supabase, userId, deductedCost);
      if (aiResponse.status === 429) return jsonResponse({ error: "Limite de requisições excedido. Tente em alguns segundos." }, 429);
      return jsonResponse({ error: "Serviço de IA indisponível" }, 502);
    }

    const aiData = await aiResponse.json();
    const rawUsage = aiData.usage || {};
    const usage = {
      prompt_tokens: rawUsage.prompt_tokens || 0,
      completion_tokens: rawUsage.completion_tokens || 0,
      total_tokens: rawUsage.total_tokens || 0,
    };

    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    let clusters: any[] = [];

    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        clusters = parsed.concept_clusters || parsed.questions || [];
        console.log("Clusters parsed:", clusters.length, "usage:", JSON.stringify(rawUsage));
      } catch (parseErr) {
        console.error("Parse error:", parseErr);
        if (energyDeducted) await refundEnergy(supabase, userId, deductedCost);
        return jsonResponse({ error: "A IA não conseguiu gerar questões. Tente novamente." }, 500);
      }
    } else {
      // Fallback: try parsing content
      const rawContent = aiData.choices?.[0]?.message?.content || "";
      try {
        const cleaned = rawContent.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(cleaned);
        clusters = Array.isArray(parsed) ? parsed : parsed.concept_clusters || parsed.questions || [];
      } catch {
        console.error("Fallback parse failed");
        if (energyDeducted) await refundEnergy(supabase, userId, deductedCost);
        return jsonResponse({ error: "A IA não conseguiu gerar questões." }, 500);
      }
    }

    if (clusters.length === 0) {
      if (energyDeducted) await refundEnergy(supabase, userId, deductedCost);
      return jsonResponse({ error: "Nenhuma questão gerada." }, 400);
    }

    // Validate and clean card IDs — only keep IDs that actually exist
    const validCardIds = new Set(cards.map((c: any) => c.id));
    const questions = clusters.map((q: any) => ({
      cluster_name: q.cluster_name || "",
      question_text: q.question_text || "",
      options: Array.isArray(q.options) ? q.options.slice(0, optionsCount) : [],
      correct_index: typeof q.correct_index === "number" ? q.correct_index : 0,
      explanation: q.explanation || "",
      concepts: Array.isArray(q.concepts) ? q.concepts.slice(0, 5) : [],
      source_card_ids: Array.isArray(q.source_card_ids)
        ? q.source_card_ids.filter((id: string) => validCardIds.has(id))
        : [],
    }));

    await logTokenUsage(supabase, userId, "generate_questions", selectedModel, usage, cost);

    return jsonResponse({ questions, usage, cardCount: cards.length, clusterCount: questions.length });
  } catch (err) {
    console.error("Error:", err);
    if (energyDeducted) await refundEnergy(supabase, userId, deductedCost);
    return jsonResponse({ error: "Erro interno do servidor" }, 500);
  }
});
