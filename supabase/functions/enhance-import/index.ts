import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, handleCors, jsonResponse, getModelMap, estimateCredits, holdCredits, refundCredits, settleAndLog, fetchPromptConfig, getAIConfig, aiHeaders } from "../_shared/utils.ts";

const DEFAULT_SYSTEM_PROMPT = `Você é um assistente que corrige e melhora flashcards importados de CSVs malformados.

Sua tarefa:
1. Corrigir cards que foram quebrados por parsing ruim
2. Mesclar cards que pertencem ao mesmo par pergunta/resposta
3. Limpar formatação: remover aspas extras, espaços desnecessários
4. Garantir que cada card tenha frente e verso corretos
5. Manter o conteúdo original - NÃO reescreva nem resuma
6. Se um card tem frente mas verso vazio, e o próximo parece continuação, mescle-os

IMPORTANTE: Mantenha TODOS os cards válidos. Não remova conteúdo.`;

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  let creditsHeld = false;
  let heldCredits = 0;
  let supabase: any;
  let userId = "";

  try {
    const { cards, aiModel } = await req.json();
    const { apiKey: AI_KEY, url: AI_URL } = getAIConfig();
    if (!AI_KEY) throw new Error("AI API key is not configured");
    if (!cards || !Array.isArray(cards) || cards.length === 0) throw new Error("No cards provided");

    const authHeader = req.headers.get("Authorization") || "";
    supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });

    if (authHeader.startsWith("Bearer ")) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) userId = user.id;
    }

    const promptConfig = await fetchPromptConfig(supabase, "enhance_import");
    const MODEL_MAP = await getModelMap(supabase);
    const selectedModel = MODEL_MAP[aiModel || promptConfig?.default_model || "flash"] || "google/gemini-2.5-flash";

    // Server-side pricing: never trust a cost sent by the client.
    if (userId) {
      heldCredits = await estimateCredits(supabase, selectedModel, JSON.stringify(cards).length + 2000, Math.min(cards.length * 260 + 500, 16000));
      const creditsOk = await holdCredits(supabase, userId, heldCredits, "enhance_import");
      if (!creditsOk) return jsonResponse({ error: "Créditos IA insuficientes", requiresCredits: true, requiredCredits: heldCredits }, 402);
      creditsHeld = true;
    }
    const systemPrompt = promptConfig?.system_prompt || DEFAULT_SYSTEM_PROMPT;
    const cardsText = cards.map((c: { front: string; back: string }, i: number) => `[${i}] Frente: ${c.front}\nVerso: ${c.back}`).join("\n---\n");

    const response = await fetch(AI_URL, {
      method: "POST",
      headers: aiHeaders(AI_KEY),
      body: JSON.stringify({
        model: selectedModel,
        usage: { include: true },
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: `Corrija estes ${cards.length} flashcards importados. Retorne APENAS os cards corrigidos:\n\n${cardsText}` }],
        tools: [{ type: "function", function: { name: "return_corrected_cards", description: "Return the corrected flashcards", parameters: { type: "object", properties: { cards: { type: "array", items: { type: "object", properties: { front: { type: "string" }, back: { type: "string" } }, required: ["front", "back"], additionalProperties: false } } }, required: ["cards"], additionalProperties: false } } }],
        tool_choice: { type: "function", function: { name: "return_corrected_cards" } },
      }),
    });

    if (!response.ok) {
      if (creditsHeld) await refundCredits(supabase, userId, heldCredits);
      if (response.status === 429) return jsonResponse({ error: "Rate limit excedido." }, 429);
      const t = await response.text(); console.error("OpenAI error:", response.status, t); throw new Error("OpenAI error");
    }

    const data = await response.json();
    const chargedCredits = userId ? await settleAndLog(supabase, userId, heldCredits, "enhance_import", selectedModel, data) : 0;

    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      if (creditsHeld) await refundCredits(supabase, userId, heldCredits);
      throw new Error("No tool call in response");
    }
    const result = JSON.parse(toolCall.function.arguments);
    return jsonResponse({ cards: result.cards });
  } catch (e) {
    console.error("enhance-import error:", e);
    if (creditsHeld) await refundCredits(supabase, userId, heldCredits);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
