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

/** Centralized AI config — OpenRouter (OpenAI-compatible) via OPENROUTER_API_KEY. */
export function getAIConfig() {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured in Supabase secrets");
  const url = "https://openrouter.ai/api/v1/chat/completions";
  return { apiKey, url };
}

/** Standard headers for OpenRouter calls (auth + app attribution). */
export function aiHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    "HTTP-Referer": "https://memory-test-buddy.lovable.app",
    "X-Title": "MemoCards",
  };
}

/** Normalize a model id to an OpenRouter slug (vendor/model). */
export function normalizeModelId(model: string): string {
  const m = (model || "").trim();
  if (!m) return "google/gemini-2.5-flash-lite";
  if (m.includes("/")) return m;
  if (m.startsWith("gemini")) return `google/${m}`;
  if (m.startsWith("gpt") || m.startsWith("o1") || m.startsWith("o3") || m.startsWith("o4")) return `openai/${m}`;
  if (m.startsWith("claude")) return `anthropic/${m}`;
  if (m.startsWith("llama")) return `meta-llama/${m}`;
  if (m.startsWith("deepseek")) return `deepseek/${m}`;
  if (m.startsWith("grok")) return `x-ai/${m}`;
  return `google/${m}`;
}

/** Fetch model mapping from ai_settings table (returns OpenRouter slugs). */
export async function getModelMap(supabase: any): Promise<Record<string, string>> {
  const map: Record<string, string> = { pro: "gemini-2.5-pro", flash: "gemini-2.5-flash-lite" };
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
  return { pro: normalizeModelId(map.pro), flash: normalizeModelId(map.flash) };
}

// ── Real cost tracking (DB catalog first, OpenRouter live pricing as fallback) ──

type Pricing = { prompt: number; completion: number };
let pricingCache: { at: number; map: Record<string, Pricing> } | null = null;
let catalogCache: { at: number; map: Record<string, Pricing> } | null = null;

/** Prices configured by admins in public.ai_model_catalog (USD per token). */
async function getCatalogPricing(): Promise<Record<string, Pricing>> {
  if (catalogCache && Date.now() - catalogCache.at < 10 * 60 * 1000) return catalogCache.map;
  const map: Record<string, Pricing> = {};
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (url && key) {
      const res = await fetch(
        `${url}/rest/v1/ai_model_catalog?select=model_id,prompt_usd_per_token,completion_usd_per_token`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } },
      );
      for (const r of (await res.json()) ?? []) {
        map[r.model_id] = {
          prompt: Number(r.prompt_usd_per_token) || 0,
          completion: Number(r.completion_usd_per_token) || 0,
        };
      }
      catalogCache = { at: Date.now(), map };
    }
  } catch (e) {
    console.error("model catalog pricing error:", e);
  }
  return map;
}

async function getOpenRouterPricing(): Promise<Record<string, Pricing>> {
  if (pricingCache && Date.now() - pricingCache.at < 6 * 60 * 60 * 1000) return pricingCache.map;
  const map: Record<string, Pricing> = {};
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models");
    const json = await res.json();
    for (const m of json?.data ?? []) {
      const p = m?.pricing;
      if (!p) continue;
      map[m.id] = { prompt: Number(p.prompt) || 0, completion: Number(p.completion) || 0 };
    }
    pricingCache = { at: Date.now(), map };
  } catch (e) {
    console.error("OpenRouter pricing fetch error:", e);
  }
  return map;
}

/** Real USD cost for a call, using per-token pricing (catalog > live OpenRouter). */
export async function computeCostUSD(
  model: string,
  promptTokens: number,
  completionTokens: number,
  totalTokens: number,
): Promise<number> {
  const id = normalizeModelId(model);
  const catalog = await getCatalogPricing();
  let p = catalog[id];
  if (!p || (p.prompt === 0 && p.completion === 0)) {
    const pricing = await getOpenRouterPricing();
    p = pricing[id];
  }
  if (!p) return 0;
  // total_tokens can include reasoning tokens not present in completion_tokens
  const output = Math.max(totalTokens - promptTokens, completionTokens);
  return promptTokens * p.prompt + output * p.completion;
}


// ── AI Credits (server-side pricing: never trust the client) ──

type CreditConfig = { rate: number; markup: number };
let creditConfigCache: { at: number; cfg: CreditConfig } | null = null;

/** Credit conversion settings from ai_settings (rate = USD per credit). */
export async function getCreditConfig(supabase: any): Promise<CreditConfig> {
  if (creditConfigCache && Date.now() - creditConfigCache.at < 5 * 60 * 1000) return creditConfigCache.cfg;
  const cfg: CreditConfig = { rate: 0.001, markup: 4 };
  try {
    const { data } = await supabase
      .from("ai_settings")
      .select("key, value")
      .in("key", ["credit_usd_rate", "credit_markup"]);
    for (const r of data ?? []) {
      if (r.key === "credit_usd_rate" && Number(r.value) > 0) cfg.rate = Number(r.value);
      if (r.key === "credit_markup" && Number(r.value) > 0) cfg.markup = Number(r.value);
    }
  } catch (e) {
    console.error("getCreditConfig error:", e);
  }
  creditConfigCache = { at: Date.now(), cfg };
  return cfg;
}

/** Convert a real USD cost into billable credits (markup applied). */
export async function usdToCredits(supabase: any, usd: number): Promise<number> {
  const { rate, markup } = await getCreditConfig(supabase);
  return Math.max(Math.ceil((usd * markup) / rate), usd > 0 ? 1 : 0);
}

/**
 * Estimate the credits a call will consume, from input size and the output ceiling.
 * Used only for the pre-call hold — the final charge is settled with real usage.
 */
export async function estimateCredits(
  supabase: any,
  model: string,
  inputChars: number,
  maxOutputTokens: number,
): Promise<number> {
  const promptTokens = Math.ceil(Math.max(inputChars, 0) / 3.5);
  const usd = await computeCostUSD(model, promptTokens, maxOutputTokens, promptTokens + maxOutputTokens);
  // Models complete well below the ceiling; hold 60% of the worst case.
  return Math.max(await usdToCredits(supabase, usd * 0.6), 1);
}

/** Atomically hold credits before an AI call. Returns false if insufficient. */
export async function holdCredits(
  supabase: any, userId: string, credits: number, featureKey: string,
): Promise<boolean> {
  if (credits <= 0 || !userId) return true;
  const { data, error } = await supabase.rpc("hold_ai_credits", {
    p_user_id: userId,
    p_credits: credits,
    p_feature_key: featureKey,
  });
  if (error) {
    console.error("hold_ai_credits RPC error:", error);
    return false;
  }
  return Number(data) >= 0; // -1 means insufficient
}

/** Give credits back (rollback when a call fails). */
export async function refundCredits(supabase: any, userId: string, credits: number): Promise<void> {
  if (credits <= 0 || !userId) return;
  try {
    await supabase.rpc("grant_ai_credits", {
      p_user_id: userId,
      p_credits: credits,
      p_entry_type: "refund",
      p_description: "Estorno por falha na chamada de IA",
    });
  } catch (e) {
    console.error("refundCredits error:", e);
  }
}

export type AIUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost?: number;
  generation_id?: string;
};

/** Extract usage + generation id from a non-streaming OpenRouter response body. */
export function extractUsage(data: any): AIUsage {
  const u = data?.usage ?? {};
  const prompt = Number(u.prompt_tokens) || 0;
  const completion = Number(u.completion_tokens) || 0;
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: Number(u.total_tokens) || prompt + completion,
    // OpenRouter returns the EXACT charged amount (USD) when usage.include is on.
    cost: Number(u.cost) || 0,
    generation_id: data?.id ?? undefined,
  };
}

/**
 * Exact cost of a generation, straight from OpenRouter's accounting.
 * Polls /api/v1/generation because the record appears a moment after the call.
 */
export async function fetchGenerationCost(generationId: string): Promise<number | null> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey || !generationId) return null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(
        `https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(generationId)}`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );
      if (res.ok) {
        const json = await res.json();
        const cost = Number(json?.data?.total_cost);
        if (Number.isFinite(cost)) return cost;
      } else {
        await res.text();
      }
    } catch (e) {
      console.error("fetchGenerationCost error:", e);
    }
    await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
  }
  return null;
}

/**
 * Resolve the REAL USD cost of a call — always the number OpenRouter charged.
 * 1) usage.cost from the response, 2) the generation endpoint, 3) catalog estimate (last resort).
 */
export async function resolveCostUSD(model: string, usage?: AIUsage): Promise<number> {
  if (usage && typeof usage.cost === "number" && usage.cost > 0) return usage.cost;
  if (usage?.generation_id) {
    const exact = await fetchGenerationCost(usage.generation_id);
    if (exact !== null && exact >= 0) return exact;
  }
  console.warn(`[cost] falling back to catalog estimate for ${model} (no OpenRouter cost available)`);
  return computeCostUSD(
    model,
    usage?.prompt_tokens || 0,
    usage?.completion_tokens || 0,
    usage?.total_tokens || 0,
  );
}

/**
 * Settle the held credits against the real cost of the call.
 * Returns the credits actually charged.
 */
export async function settleCredits(
  supabase: any,
  userId: string,
  held: number,
  featureKey: string,
  model: string,
  usage?: AIUsage,
  costUsdOverride?: number,
): Promise<number> {
  if (!userId) return 0;
  try {
    const costUsd = costUsdOverride ?? (await resolveCostUSD(model, usage));
    // Never charge more than the amount the user was shown (the hold).
    const actual = Math.min(await usdToCredits(supabase, costUsd), held);
    await supabase.rpc("settle_ai_credits", {
      p_user_id: userId,
      p_held: held,
      p_actual: actual,
      p_feature_key: featureKey,
      p_model: normalizeModelId(model),
      p_cost_usd: Number(costUsd.toFixed(8)),
    });
    return actual;
  } catch (e) {
    console.error("settleCredits error:", e);
    return held;
  }
}


/** Log token usage + real USD cost to ai_token_usage table. */
export async function logTokenUsage(
  supabase: any,
  userId: string,
  featureKey: string,
  model: string,
  usage?: AIUsage,
  energyCost = 0,
  generationId?: string,
  costUsdOverride?: number,
) {
  try {
    const prompt = usage?.prompt_tokens || 0;
    const completion = usage?.completion_tokens || 0;
    const total = usage?.total_tokens || prompt + completion;
    const costUsd = costUsdOverride ?? (await resolveCostUSD(model, usage));

    await supabase.from("ai_token_usage").insert({
      user_id: userId,
      feature_key: featureKey,
      model: normalizeModelId(model),
      provider: "openrouter",
      generation_id: generationId ?? usage?.generation_id ?? null,
      prompt_tokens: prompt,
      completion_tokens: completion,
      total_tokens: total,
      cost_usd: Number(costUsd.toFixed(8)),
      energy_cost: energyCost,
    });

  } catch (e) {
    console.error("Token logging error:", e);
  }
}

/**
 * Post-paid tracking for calls made without a pre-call hold: charge the exact
 * cost in credits (best effort) and log the usage row. Returns credits charged.
 */
export async function chargeAndLog(
  supabase: any,
  userId: string,
  featureKey: string,
  model: string,
  data: any,
): Promise<number> {
  const usage = extractUsage(data);
  const costUsd = await resolveCostUSD(model, usage);
  let credits = 0;
  try {
    credits = await usdToCredits(supabase, costUsd);
    if (credits > 0 && userId) await holdCredits(supabase, userId, credits, featureKey);
  } catch (e) {
    console.error("chargeAndLog charge error:", e);
  }
  await logTokenUsage(supabase, userId, featureKey, model, usage, credits, usage.generation_id, costUsd);
  return credits;
}

/**
 * Single exit point for every AI call: resolve the exact OpenRouter cost ONCE,
 * settle the credit hold with it and log the usage row. Returns credits charged.
 */
export async function settleAndLog(
  supabase: any,
  userId: string,
  held: number,
  featureKey: string,
  model: string,
  data: any,
): Promise<number> {
  const usage = extractUsage(data);
  const costUsd = await resolveCostUSD(model, usage);
  const charged = await settleCredits(supabase, userId, held, featureKey, model, usage, costUsd);
  await logTokenUsage(supabase, userId, featureKey, model, usage, charged, usage.generation_id, costUsd);
  return charged;
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
  heldCredits: number,
): Response {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let capturedUsage: AIUsage | null = null;
  let generationId: string | undefined;

  const stream = new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          // Resolve the EXACT OpenRouter cost once, then settle + log with it.
          const usage: AIUsage = capturedUsage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
          if (generationId && !usage.generation_id) usage.generation_id = generationId;
          const costUsd = await resolveCostUSD(model, usage);
          const charged = await settleCredits(supabase, userId, heldCredits, featureKey, model, usage, costUsd);
          console.log(`[${featureKey}] Stream usage: prompt=${usage.prompt_tokens}, completion=${usage.completion_tokens}, costUsd=${costUsd}, credits=${charged}`);
          await logTokenUsage(supabase, userId, featureKey, model, usage, charged, usage.generation_id, costUsd);
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
            if (parsed.id) generationId = parsed.id;
            if (parsed.usage) {
              capturedUsage = {
                prompt_tokens: parsed.usage.prompt_tokens || 0,
                completion_tokens: parsed.usage.completion_tokens || 0,
                total_tokens: parsed.usage.total_tokens || 0,
                cost: Number(parsed.usage.cost) || 0,
                generation_id: parsed.id ?? generationId,
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
