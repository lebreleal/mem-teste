import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { handleCors, jsonResponse, getModelMap, deductEnergy, refundEnergy, logTokenUsage, fetchPromptConfig, getAIConfig, fetchWithRetry } from "../_shared/utils.ts";

/**
 * generate-questions — creates exam-style questions from a deck's cards.
 * 
 * Key feature: correlates MULTIPLE cards into single cross-concept questions.
 * Each question maps back to source card IDs and extracted concepts.
 * 
 * Body params:
 *   deckId: string (required)
 *   count: number (3-20, default 5)
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
      count = 5,
      optionsCount = 4,
      aiModel = "flash",
      energyCost = 0,
      customInstructions = "",
    } = body;

    if (!deckId) return jsonResponse({ error: "deckId é obrigatório" }, 400);

    const { apiKey: AI_KEY, url: AI_URL } = getAIConfig();
    if (!AI_KEY) return jsonResponse({ error: "AI key não configurada" }, 500);

    // ─── Fetch deck cards ───
    const { data: cards, error: cardsError } = await supabase
      .from("cards")
      .select("id, front_content, back_content, card_type")
      .eq("deck_id", deckId)
      .limit(200);

    if (cardsError) return jsonResponse({ error: "Erro ao buscar cards" }, 500);
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
      const front = (c.front_content || "").replace(/<[^>]*>/g, "").replace(/\\{\\{c\\d+::(.*?)\\}\\}/g, "$1").trim();
      const back = (c.back_content || "").replace(/<[^>]*>/g, "").trim();
      return `[Card ${i + 1} | ID: ${c.id}]\nFrente: ${front}\n${back ? `Verso: ${back}` : ""}`;
    }).join("\n\n");

    const MODEL_MAP = await getModelMap(supabase);
    const selectedModel = MODEL_MAP[aiModel] || "gemini-2.5-flash";
    const questionCount = Math.min(Math.max(count, 1), 20);

    // ─── Build prompt ───
    const systemPrompt = `Você é um gerador de questões de prova de alta qualidade. Sua missão é criar questões que testem COMPREENSÃO PROFUNDA, não decoreba.

REGRA FUNDAMENTAL: Questões devem CORRELACIONAR múltiplos conceitos dos cartões. Uma boa questão de prova testa se o aluno consegue CONECTAR ideias, não apenas repetir uma definição isolada.

ESTRATÉGIAS DE CORRELAÇÃO (use TODAS):
1. SÍNTESE: Combine 2-5 cards relacionados em UMA questão que exija entender a relação entre eles
2. APLICAÇÃO: Crie cenários práticos onde o aluno precisa aplicar conhecimento de vários cards
3. COMPARAÇÃO: Compare conceitos de cards diferentes que possam ser confundidos
4. CAUSA-EFEITO: Conecte cards que representam causa e consequência
5. HIERARQUIA: Teste se o aluno entende como conceitos de cards diferentes se organizam

PROIBIDO:
❌ Criar uma questão que testa apenas 1 card isolado (exceto se não houver relação possível)
❌ Copiar literalmente o texto de um card como alternativa
❌ Criar alternativas absurdas que qualquer pessoa eliminaria
❌ Usar "todas as alternativas" ou "nenhuma das alternativas"
❌ Dizer "de acordo com o material", "segundo os cards" etc.

OBRIGATÓRIO:
✅ Cada questão deve mapear quais cards foram usados (source_card_ids)
✅ Cada questão deve ter 2-5 conceitos-chave identificados
✅ Alternativas incorretas devem ser plausíveis (conceitos REAIS que aparecem nos cards mas não respondem AQUELA pergunta)
✅ Explicação deve justificar por que a correta está certa E por que cada incorreta está errada
✅ Questões na mesma língua dos cards`;

    const userPrompt = `Crie exatamente ${questionCount} questões de múltipla escolha com ${optionsCount} alternativas cada.

BASE DE CONHECIMENTO (${cards.length} cards do baralho):
---
${cardSummaries}
---

${customInstructions ? `INSTRUÇÕES DO USUÁRIO: ${customInstructions}\n` : ""}
IMPORTANTE: Correlacione MÚLTIPLOS cards por questão sempre que possível. Cada questão deve testar a COMPREENSÃO INTEGRADA de 2+ conceitos.

Para cada questão, identifique:
- source_card_ids: array com os IDs dos cards usados (copie os IDs exatos dos cards acima)
- concepts: array com 2-5 conceitos-chave testados (strings curtas de 2-6 palavras)`;

    // ─── Tool schema for structured output ───
    const toolSchema = {
      type: "object",
      properties: {
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              question_text: { type: "string", description: "Enunciado da questão (pode usar HTML)" },
              options: {
                type: "array",
                items: { type: "string" },
                description: `Exatamente ${optionsCount} alternativas`,
              },
              correct_index: { type: "integer", description: "Índice da alternativa correta (0-based)" },
              explanation: { type: "string", description: "Explicação detalhada de cada alternativa" },
              concepts: {
                type: "array",
                items: { type: "string" },
                description: "2-5 conceitos-chave testados nesta questão",
              },
              source_card_ids: {
                type: "array",
                items: { type: "string" },
                description: "IDs dos cards do baralho usados para criar esta questão",
              },
            },
            required: ["question_text", "options", "correct_index", "explanation", "concepts", "source_card_ids"],
            additionalProperties: false,
          },
        },
      },
      required: ["questions"],
      additionalProperties: false,
    };

    console.log(`generate-questions: model=${selectedModel}, cards=${cards.length}, count=${questionCount}, opts=${optionsCount}`);

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
        max_tokens: 30000,
        tools: [{
          type: "function",
          function: {
            name: "return_questions",
            description: "Return the generated exam questions",
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
    let questions: any[] = [];

    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        questions = parsed.questions || [];
        console.log("Questions parsed:", questions.length, "usage:", JSON.stringify(rawUsage));
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
        questions = Array.isArray(parsed) ? parsed : parsed.questions || [];
      } catch {
        console.error("Fallback parse failed");
        if (energyDeducted) await refundEnergy(supabase, userId, deductedCost);
        return jsonResponse({ error: "A IA não conseguiu gerar questões." }, 500);
      }
    }

    if (questions.length === 0) {
      if (energyDeducted) await refundEnergy(supabase, userId, deductedCost);
      return jsonResponse({ error: "Nenhuma questão gerada." }, 400);
    }

    // Validate and clean card IDs — only keep IDs that actually exist
    const validCardIds = new Set(cards.map((c: any) => c.id));
    questions = questions.map((q: any) => ({
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

    return jsonResponse({ questions, usage, cardCount: cards.length });
  } catch (err) {
    console.error("Error:", err);
    if (energyDeducted) await refundEnergy(supabase, userId, deductedCost);
    return jsonResponse({ error: "Erro interno do servidor" }, 500);
  }
});

