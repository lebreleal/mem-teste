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
