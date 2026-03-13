/**
 * suggest-tags edge function
 * Analyzes text content and suggests relevant concept-tags using AI.
 * Prioritizes user's existing global_concepts, then platform tags.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logTokenUsage, deductEnergy, refundEnergy } from "../_shared/utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader ?? "" } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { textContent, deckName, existingTagNames } = await req.json();

    if (!textContent && !deckName) {
      return new Response(JSON.stringify({ error: "No content provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Deduct 2 credits
    const COST = 2;
    const ok = await deductEnergy(supabase, user.id, COST);
    if (!ok) {
      return new Response(JSON.stringify({ error: "Créditos IA insuficientes", requiresCredits: true }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch user's global_concepts AND platform tags in parallel
    const [conceptsRes, leaderTagsRes] = await Promise.all([
      supabase
        .from("global_concepts")
        .select("id, name, slug, category, subcategory")
        .eq("user_id", user.id)
        .limit(200),
      supabase
        .from("tags")
        .select("id, name, slug, usage_count, parent_id, synonyms")
        .is("merged_into_id", null)
        .order("usage_count", { ascending: false })
        .limit(100),
    ]);

    const userConcepts = conceptsRes.data ?? [];
    const allTags = leaderTagsRes.data ?? [];
    
    // Build vocabulary: user concepts first, then platform tags
    const conceptNameSet = new Set(userConcepts.map((c: any) => c.name.toLowerCase()));
    const conceptList = userConcepts.map((c: any) => {
      const parts = [c.name];
      if (c.category) parts.push(`(${c.category}${c.subcategory ? ' > ' + c.subcategory : ''})`);
      return parts.join(' ');
    });

    // Build hierarchy labels for platform tags
    const tagMap = new Map(allTags.map((t: any) => [t.id, t]));
    const getPath = (t: any): string => {
      if (!t.parent_id) return t.name;
      const parent = tagMap.get(t.parent_id);
      return parent ? `${getPath(parent)} > ${t.name}` : t.name;
    };

    const platformTagList = allTags
      .filter((t: any) => !conceptNameSet.has(t.name.toLowerCase()))
      .map((t: any) => {
        const path = getPath(t);
        const syns = (t.synonyms ?? []).length > 0 ? ` (sinônimos: ${t.synonyms.join(", ")})` : "";
        return `${path}${syns} [${t.usage_count} usos]`;
      });

    const alreadyApplied = (existingTagNames ?? []).join(", ");

    const apiKey = Deno.env.get("GOOGLE_AI_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `Analise o seguinte conteúdo de estudo e sugira de 3 a 8 conceitos/temas relevantes.

REGRAS:
1. PRIORIZE conceitos já existentes do aluno quando o tema for equivalente
2. Se não existir, use tags da plataforma quando possível
3. Crie novas apenas se nenhuma existente se encaixa
4. Conceitos devem ser específicos (1-3 palavras), em português
5. Use termos técnicos padronizados da área
6. Não repita conceitos já aplicados
7. Retorne APENAS um JSON array de strings com os NOMES exatos

CONCEITOS DO ALUNO (prioridade máxima):
${conceptList.join("\n") || "nenhum ainda"}

TAGS DA PLATAFORMA (segunda prioridade):
${platformTagList.join("\n") || "nenhuma"}

CONCEITOS JÁ APLICADOS (não repita): ${alreadyApplied || "nenhum"}

NOME DO DECK: ${deckName || "não informado"}

CONTEÚDO (primeiros 2000 chars):
${(textContent || "").substring(0, 2000)}

Responda APENAS com o JSON array, sem explicação. Exemplo: ["Cardiologia", "Fisiopatologia", "Hipertensão"]`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gemini-2.5-flash-lite",
          messages: [
            { role: "system", content: "Você é um classificador de conteúdo educacional. Responda apenas com JSON." },
            { role: "user", content: prompt },
          ],
          temperature: 0.3,
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI error:", response.status, errText);
      return new Response(JSON.stringify({ error: "AI request failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await response.json();
    const rawUsage = aiData.usage;
    const usage = rawUsage ? {
      prompt_tokens: rawUsage.prompt_tokens || 0,
      completion_tokens: rawUsage.completion_tokens || 0,
      total_tokens: rawUsage.total_tokens || 0,
    } : undefined;
    await logTokenUsage(supabase, user!.id, "suggest_tags", "gemini-2.5-flash-lite", usage, COST);
    const rawContent = aiData.choices?.[0]?.message?.content || "[]";

    let suggestedTags: string[] = [];
    try {
      const match = rawContent.match(/\[[\s\S]*?\]/);
      if (match) {
        suggestedTags = JSON.parse(match[0]);
      }
    } catch {
      console.error("Failed to parse AI response:", rawContent);
    }

    const existingSet = new Set((existingTagNames ?? []).map((n: string) => n.toLowerCase()));
    suggestedTags = suggestedTags
      .filter((t: string) => typeof t === "string" && t.trim())
      .map((t: string) => t.trim())
      .filter((t: string) => !existingSet.has(t.toLowerCase()));

    const tagNameMap = new Map(allTags.map((t: any) => [t.name.toLowerCase(), t]));
    const conceptNameMap = new Map(userConcepts.map((c: any) => [c.name.toLowerCase(), c]));
    
    const result = suggestedTags.map((name: string) => {
      const existingTag = tagNameMap.get(name.toLowerCase());
      const existingConcept = conceptNameMap.get(name.toLowerCase());
      return {
        name: existingConcept?.name ?? existingTag?.name ?? name,
        isExisting: !!(existingTag || existingConcept),
        usageCount: existingTag?.usage_count ?? 0,
      };
    });

    return new Response(JSON.stringify({ suggestions: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("suggest-tags error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
