/**
 * Shared utilities for all edge functions.
 * Centralizes common patterns: auth, energy deduction, model mapping, token logging.
 */

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Standard JSON error response with CORS headers. */
export function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Handle CORS preflight. Returns Response if OPTIONS, null otherwise. */
export function handleCors(req: Request): Response | null {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  return null;
}

/** Centralized AI config */
export function getAIConfig() {
  const apiKey = Deno.env.get("GOOGLE_AI_KEY");
  const url = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
  return { apiKey, url };
}

/** Fetch model mapping from ai_settings table. */
export async function getModelMap(supabase: any): Promise<Record<string, string>> {
  const map: Record<string, string> = { pro: "gemini-2.5-pro", flash: "gemini-2.5-flash" };
  try {
    const { data } = await supabase
      .from("ai_settings")
      .select("key, value")
      .in("key", ["flash_model", "pro_model"]);
    if (data)
      for (const r of data) {
        if (r.key === "flash_model") map.flash = r.value;
        if (r.key === "pro_model") map.pro = r.value;
      }
  } catch {}
  return map;
}

/** Atomically deduct energy using the RPC. Returns false if insufficient. */
export async function deductEnergy(supabase: any, userId: string, cost: number): Promise<boolean> {
  if (cost <= 0) return true;
  const { data, error } = await supabase.rpc("deduct_energy", {
    p_user_id: userId,
    p_cost: cost,
  });
  if (error) {
    console.error("deduct_energy RPC error:", error);
    return false;
  }
  return data >= 0; // -1 means insufficient
}

/** Refund energy credits back to user (rollback on error). */
export async function refundEnergy(supabase: any, userId: string, cost: number): Promise<void> {
  if (cost <= 0 || !userId) return;
  try {
    await supabase.rpc("refund_energy", { p_user_id: userId, p_cost: cost });
    console.log(`Refunded ${cost} energy to user ${userId}`);
  } catch (e) {
    console.error("refundEnergy error:", e);
  }
}

/** Log token usage to ai_token_usage table. */
export async function logTokenUsage(
  supabase: any,
  userId: string,
  featureKey: string,
  model: string,
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number },
  energyCost = 0
) {
  try {
    await supabase.from("ai_token_usage").insert({
      user_id: userId,
      feature_key: featureKey,
      model,
      prompt_tokens: usage?.prompt_tokens || 0,
      completion_tokens: usage?.completion_tokens || 0,
      total_tokens: usage?.total_tokens || 0,
      energy_cost: energyCost,
    });
  } catch (e) {
    console.error("Token logging error:", e);
  }
}

/** Fetch with automatic retry for 503 (model overloaded). */
export async function fetchWithRetry(
  url: string, options: RequestInit, maxRetries = 2
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);
    if (response.status !== 503 || attempt === maxRetries) return response;
    console.warn(`503 retry ${attempt + 1}/${maxRetries}, waiting 2s...`);
    await new Promise(r => setTimeout(r, 2000));
  }
  return await fetch(url, options); // fallback (unreachable)
}

/** Fetch prompt config from ai_prompts table. */
export async function fetchPromptConfig(supabase: any, featureKey: string) {
  try {
    const { data } = await supabase
      .from("ai_prompts")
      .select("system_prompt, user_prompt_template, default_model, temperature")
      .eq("feature_key", featureKey)
      .single();
    return data;
  } catch {
    return null;
  }
}

/**
 * Wrap a streaming AI response to:
 * 1. Pass SSE data through to the client unchanged
 * 2. Capture token usage from the final SSE chunk
 * 3. Log actual usage after the stream completes
 *
 * Returns a Response that can be returned directly to the client.
 */
export function streamWithUsageCapture(
  response: Response,
  supabase: any,
  userId: string,
  featureKey: string,
  model: string,
  energyCost: number,
): Response {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let capturedUsage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null = null;

  const stream = new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          // Log captured usage after stream ends
          if (capturedUsage) {
            console.log(`[${featureKey}] Stream usage captured: prompt=${capturedUsage.prompt_tokens}, completion=${capturedUsage.completion_tokens}, total=${capturedUsage.total_tokens}`);
            await logTokenUsage(supabase, userId, featureKey, model, capturedUsage, energyCost);
          } else {
            console.warn(`[${featureKey}] No usage captured from stream, logging zero`);
            await logTokenUsage(supabase, userId, featureKey, model, undefined, energyCost);
          }
          return;
        }

        // Pass through to client
        controller.enqueue(value);

        // Parse SSE lines looking for usage data
        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.usage) {
              capturedUsage = {
                prompt_tokens: parsed.usage.prompt_tokens || 0,
                completion_tokens: parsed.usage.completion_tokens || 0,
                total_tokens: parsed.usage.total_tokens || 0,
              };
            }
          } catch {
            // partial JSON, ignore
          }
        }
      } catch (err) {
        console.error(`[${featureKey}] Stream error:`, err);
        controller.error(err);
      }
    },
    cancel() {
      reader.cancel();
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
