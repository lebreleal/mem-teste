/**
 * auto-tag-cards edge function
 * Takes a deckId, fetches cards, generates keyword tags via AI, and links them.
 * Optimized for minimal DB round-trips to avoid compute limits.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logTokenUsage } from "../_shared/utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const generateSlug = (name: string): string =>
  name.trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-");

const stripHtml = (html: string) =>
  html.replace(/<[^>]*>/g, "").replace(/\{\{c\d+::/g, "").replace(/\}\}/g, "").trim();

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
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { deckId } = await req.json();
    if (!deckId) {
      return new Response(JSON.stringify({ error: "deckId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch cards and existing tags in parallel
    const [cardsRes, tagsRes] = await Promise.all([
      serviceSupabase.from("cards")
        .select("id, front_content, back_content, card_type")
        .eq("deck_id", deckId)
        .limit(100),
      serviceSupabase.from("tags")
        .select("id, name, slug")
        .is("merged_into_id", null)
        .order("usage_count", { ascending: false })
        .limit(80),
    ]);

    if (cardsRes.error) throw cardsRes.error;
    const cards = cardsRes.data ?? [];
    if (cards.length === 0) {
      return new Response(JSON.stringify({ tagged: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const allTags = tagsRes.data ?? [];
    const tagListStr = allTags.slice(0, 40).map((t: any) => t.name).join(", ");

    // Build compact summaries (limit total prompt size)
    const cardSummaries = cards.map((c: any, idx: number) => {
      const front = stripHtml(c.front_content).substring(0, 150);
      const back = stripHtml(c.back_content).substring(0, 150);
      const type = c.card_type || "basic";
      return `[${idx}](${type}) ${front} | ${back}`;
    }).join("\n");

    const apiKey = Deno.env.get("GOOGLE_AI_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gemini-2.0-flash",
          messages: [
            { role: "system", content: "Você extrai palavras-chave específicas de cartões de estudo. Responda APENAS JSON válido, sem markdown." },
            { role: "user", content: `Para CADA cartão abaixo, extraia 1-3 palavras-chave ESPECÍFICAS do conteúdo daquele cartão individual. As tags devem ser termos técnicos, conceitos ou entidades mencionados diretamente no texto do cartão — NÃO categorias genéricas ou nomes de disciplinas.

REGRAS:
- Extraia termos concretos do texto (ex: "mitocôndria", "lei de Ohm", "artéria femoral")
- NÃO use categorias amplas (ex: "Biologia", "Semiologia", "Anatomia")
- Cada tag deve ter 1-3 palavras no máximo
- TODOS os cartões devem receber tags, independente do tipo (basic, cloze, multiple_choice)
- Prefira reutilizar tags existentes quando o conceito for igual: ${tagListStr || "nenhuma"}

CARTÕES:
${cardSummaries}

Responda JSON puro: {"0":["tag1","tag2"],"1":["tag1"]}` },
          ],
          temperature: 0.2,
        }),
      }
    );

    if (!response.ok) {
      console.error("AI error:", response.status);
      await response.text();
      return new Response(JSON.stringify({ tagged: 0, aiError: true }), {
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
    await logTokenUsage(supabase, user.id, "auto_tag_cards", "gemini-2.0-flash", usage, 0);
    const rawContent = aiData.choices?.[0]?.message?.content || "{}";

    let tagsByCard: Record<string, string[]> = {};
    try {
      const match = rawContent.match(/\{[\s\S]*\}/);
      if (match) tagsByCard = JSON.parse(match[0]);
    } catch {
      console.error("Parse error");
      return new Response(JSON.stringify({ tagged: 0, parseError: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Collect all unique tag names needed
    const neededNames = new Set<string>();
    for (const names of Object.values(tagsByCard)) {
      if (!Array.isArray(names)) continue;
      for (const n of names) {
        if (typeof n === "string" && n.trim()) neededNames.add(n.trim());
      }
    }

    if (neededNames.size === 0) {
      return new Response(JSON.stringify({ tagged: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build slug-to-existing-tag map
    const slugMap = new Map(allTags.map((t: any) => [t.slug, t]));
    const nameToId = new Map<string, string>();

    // Resolve all tags: find existing or batch-create new ones
    const toCreate: { name: string; slug: string }[] = [];
    for (const name of neededNames) {
      const slug = generateSlug(name);
      const existing = slugMap.get(slug);
      if (existing) {
        nameToId.set(name, existing.id);
      } else {
        toCreate.push({ name, slug });
      }
    }

    // Batch insert new tags in one query
    if (toCreate.length > 0) {
      const { data: created, error: createErr } = await serviceSupabase
        .from("tags")
        .upsert(
          toCreate.map(t => ({ name: t.name, slug: t.slug, created_by: user.id })),
          { onConflict: "slug", ignoreDuplicates: true }
        )
        .select("id, name, slug");

      if (createErr) {
        console.error("Tag create error:", createErr.message);
      }

      // Map created tags
      for (const t of (created ?? [])) {
        nameToId.set(t.name, t.id);
      }

      // For any that were ignored (already existed), fetch them
      const missingSlugs = toCreate
        .filter(t => !nameToId.has(t.name))
        .map(t => t.slug);

      if (missingSlugs.length > 0) {
        const { data: fetched } = await serviceSupabase
          .from("tags")
          .select("id, name, slug")
          .in("slug", missingSlugs);
        for (const t of (fetched ?? [])) {
          // Find original name by slug match
          const orig = toCreate.find(tc => tc.slug === t.slug);
          if (orig) nameToId.set(orig.name, t.id);
        }
      }
    }

    // Build all card_tags rows in one batch
    const cardTagRows: { card_id: string; tag_id: string; added_by: string }[] = [];
    for (const [idxStr, tagNames] of Object.entries(tagsByCard)) {
      const idx = parseInt(idxStr);
      if (isNaN(idx) || idx >= cards.length || !Array.isArray(tagNames)) continue;
      const card = cards[idx];
      for (const rawName of tagNames) {
        if (typeof rawName !== "string" || !rawName.trim()) continue;
        const tagId = nameToId.get(rawName.trim());
        if (tagId) {
          cardTagRows.push({ card_id: card.id, tag_id: tagId, added_by: user.id });
        }
      }
    }

    // Single batch insert for all card-tag links
    let totalTagged = 0;
    if (cardTagRows.length > 0) {
      const { data: inserted, error: linkErr } = await serviceSupabase
        .from("card_tags")
        .upsert(cardTagRows, { onConflict: "card_id,tag_id", ignoreDuplicates: true })
        .select("id");

      if (linkErr) {
        console.error("Link error:", linkErr.message);
      } else {
        totalTagged = inserted?.length ?? 0;
      }
    }

    return new Response(JSON.stringify({ tagged: totalTagged, cardsProcessed: cards.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("auto-tag-cards error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
