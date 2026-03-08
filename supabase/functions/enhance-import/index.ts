import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, handleCors, jsonResponse, getModelMap, deductEnergy, refundEnergy, logTokenUsage, fetchPromptConfig, getAIConfig } from "../_shared/utils.ts";

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

  let energyDeducted = false;
  let deductedCost = 0;
  let supabase: any;
  let userId = "";

  try {
    const { cards, aiModel, energyCost } = await req.json();
    const { apiKey: AI_KEY, url: AI_URL } = getAIConfig();
    if (!AI_KEY) throw new Error("GOOGLE_AI_KEY is not configured");
    if (!cards || !Array.isArray(cards) || cards.length === 0) throw new Error("No cards provided");

    const authHeader = req.headers.get("Authorization") || "";
    supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });

    if (authHeader.startsWith("Bearer ")) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) userId = user.id;
    }

    const cost = energyCost || 0;
    if (userId && cost > 0) {
      const ok = await deductEnergy(supabase, userId, cost);
      if (!ok) return jsonResponse({ error: "Créditos IA insuficientes", requiresCredits: true }, 402);
      energyDeducted = true;
      deductedCost = cost;
    }

    const promptConfig = await fetchPromptConfig(supabase, "enhance_import");
    const MODEL_MAP = await getModelMap(supabase);
    const selectedModel = MODEL_MAP[aiModel || promptConfig?.default_model || "flash"] || "gemini-2.5-flash";
    const systemPrompt = promptConfig?.system_prompt || DEFAULT_SYSTEM_PROMPT;
    const cardsText = cards.map((c: { front: string; back: string }, i: number) => `[${i}] Frente: ${c.front}\nVerso: ${c.back}`).join("\n---\n");

    const response = await fetch(AI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${AI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: selectedModel,
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: `Corrija estes ${cards.length} flashcards importados. Retorne APENAS os cards corrigidos:\n\n${cardsText}` }],
        tools: [{ type: "function", function: { name: "return_corrected_cards", description: "Return the corrected flashcards", parameters: { type: "object", properties: { cards: { type: "array", items: { type: "object", properties: { front: { type: "string" }, back: { type: "string" } }, required: ["front", "back"], additionalProperties: false } } }, required: ["cards"], additionalProperties: false } } }],
        tool_choice: { type: "function", function: { name: "return_corrected_cards" } },
      }),
    });

    if (!response.ok) {
      if (energyDeducted) await refundEnergy(supabase, userId, deductedCost);
      if (response.status === 429) return jsonResponse({ error: "Rate limit excedido." }, 429);
      const t = await response.text(); console.error("OpenAI error:", response.status, t); throw new Error("OpenAI error");
    }

    const data = await response.json();
    if (userId) await logTokenUsage(supabase, userId, "enhance_import", selectedModel, data.usage, cost);

    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      if (energyDeducted) await refundEnergy(supabase, userId, deductedCost);
      throw new Error("No tool call in response");
    }
    const result = JSON.parse(toolCall.function.arguments);
    return jsonResponse({ cards: result.cards });
  } catch (e) {
    console.error("enhance-import error:", e);
    if (energyDeducted) await refundEnergy(supabase, userId, deductedCost);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
