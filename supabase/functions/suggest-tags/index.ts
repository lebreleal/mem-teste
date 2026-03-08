/**
 * suggest-tags edge function
 * Analyzes text content and suggests relevant tags using AI.
 * Prioritizes existing "Leader Tags" and respects tag hierarchy.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logTokenUsage } from "../_shared/utils.ts";

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

    // Fetch top existing tags with hierarchy info
    const { data: leaderTags } = await supabase
      .from("tags")
      .select("id, name, slug, usage_count, parent_id, synonyms")
      .is("merged_into_id", null)
      .order("usage_count", { ascending: false })
      .limit(100);

    const allTags = leaderTags ?? [];
    
    // Build hierarchy labels for context
    const tagMap = new Map(allTags.map((t: any) => [t.id, t]));
    const getPath = (t: any): string => {
      if (!t.parent_id) return t.name;
      const parent = tagMap.get(t.parent_id);
      return parent ? `${getPath(parent)} > ${t.name}` : t.name;
    };

    const tagListWithHierarchy = allTags
      .map((t: any) => {
        const path = getPath(t);
        const syns = (t.synonyms ?? []).length > 0 ? ` (sinônimos: ${t.synonyms.join(", ")})` : "";
        return `${path}${syns} [${t.usage_count} usos]`;
      })
      .join("\n");

    const alreadyApplied = (existingTagNames ?? []).join(", ");

    const apiKey = Deno.env.get("GOOGLE_AI_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `Analise o seguinte conteúdo de estudo e sugira de 3 a 8 tags relevantes para categorização.

REGRAS:
1. Prefira tags da lista de tags existentes quando possível (Leader Tags)
2. Respeite a hierarquia: se existe "Medicina > Cardiologia > Hipertensão", sugira a tag mais específica aplicável
3. Crie novas tags apenas se nenhuma existente se encaixa
4. Tags devem ser curtas (1-3 palavras), em português
5. Use termos técnicos padronizados da área
6. Não repita tags já aplicadas
7. Retorne APENAS um JSON array de strings com os NOMES exatos das tags (sem o caminho hierárquico)

TAGS EXISTENTES (com hierarquia e sinônimos):
${tagListWithHierarchy || "nenhuma ainda"}

TAGS JÁ APLICADAS (não repita): ${alreadyApplied || "nenhuma"}

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
          model: "gemini-2.5-flash",
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
    const result = suggestedTags.map((name: string) => {
      const existing = tagNameMap.get(name.toLowerCase());
      return {
        name: existing ? existing.name : name,
        isExisting: !!existing,
        usageCount: existing?.usage_count ?? 0,
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
