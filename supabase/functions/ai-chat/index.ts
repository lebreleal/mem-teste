import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, handleCors, jsonResponse, getModelMap, estimateCredits, holdCredits, refundCredits, getAIConfig, fetchWithRetry, streamWithUsageCapture, aiHeaders } from "../_shared/utils.ts";

const MAX_OUTPUT_TOKENS = 4096;

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  let creditsHeld = false;
  let heldCredits = 0;
  let supabase: any;
  let userId = "";

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    userId = user.id;

    const { messages, aiModel } = await req.json();
    const { apiKey: AI_KEY, url: AI_URL } = getAIConfig();
    if (!AI_KEY) return jsonResponse({ error: "AI API key não configurada" }, 500);

    const modelMap = await getModelMap(supabase);
    const selectedModel = modelMap[aiModel || "flash"] || modelMap.flash;

    const systemPrompt = `Você é um tutor de estudos inteligente e amigável chamado MemoCards IA. Você ajuda estudantes com dúvidas, explicações, resumos e qualquer tema acadêmico. Responda sempre na mesma língua que o aluno usar. Seja claro, conciso e didático. Use formatação markdown quando apropriado (listas, negrito, código). Se o aluno pedir algo fora do contexto de estudos, responda de forma educada mas redirecione para o aprendizado.`;

    const chatMessages = [
      { role: "system", content: systemPrompt },
      ...(messages || []).map((m: any) => ({ role: m.role, content: m.content })),
    ];

    // Server-side pricing: never trust a cost sent by the client.
    heldCredits = await estimateCredits(supabase, selectedModel, JSON.stringify(chatMessages).length, MAX_OUTPUT_TOKENS);
    const ok = await holdCredits(supabase, userId, heldCredits, "ai_chat");
    if (!ok) return jsonResponse({ error: "Créditos IA insuficientes", requiresCredits: true, requiredCredits: heldCredits }, 402);
    creditsHeld = true;

    const response = await fetchWithRetry(AI_URL, {
      method: "POST",
      headers: aiHeaders(AI_KEY),
      body: JSON.stringify({
        model: selectedModel,
        usage: { include: true },
        messages: chatMessages,
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: 0.7,
        stream: true,
        stream_options: { include_usage: true },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI error:", response.status, errText);
      if (creditsHeld) await refundCredits(supabase, userId, heldCredits);
      if (response.status === 429) return jsonResponse({ error: "Limite de requisições excedido." }, 429);
      if (response.status === 403) return jsonResponse({ error: "API do Google AI não ativada." }, 502);
      if (response.status === 503) return jsonResponse({ error: "Modelo sobrecarregado. Tente Flash." }, 503);
      return jsonResponse({ error: "Serviço de IA indisponível" }, 502);
    }

    // Stream started — the hold is settled against real usage when it ends.
    return streamWithUsageCapture(response, supabase, userId, "ai_chat", selectedModel, heldCredits);
  } catch (err) {
    console.error("Error:", err);
    if (creditsHeld) await refundCredits(supabase, userId, heldCredits);
    return jsonResponse({ error: "Erro interno" }, 500);
  }
});
