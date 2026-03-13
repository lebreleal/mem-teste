/**
 * auto-tag-cards edge function
 * Takes a deckId, fetches cards, generates concept-tags via AI, and links them.
 * Tags = Concepts: each tag also ensures a corresponding global_concept exists for the user.
 * Optimized for minimal DB round-trips.
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

    // Fetch cards, existing tags, and user's global_concepts in parallel
    const [cardsRes, tagsRes, conceptsRes] = await Promise.all([
      serviceSupabase.from("cards")
        .select("id, front_content, back_content, card_type")
        .eq("deck_id", deckId)
        .limit(100),
      serviceSupabase.from("tags")
        .select("id, name, slug")
        .is("merged_into_id", null)
        .order("usage_count", { ascending: false })
        .limit(80),
      serviceSupabase.from("global_concepts")
        .select("id, name, slug, concept_tag_id")
        .eq("user_id", user.id)
        .limit(500),
    ]);

    if (cardsRes.error) throw cardsRes.error;
    const cards = cardsRes.data ?? [];
    if (cards.length === 0) {
      return new Response(JSON.stringify({ tagged: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const allTags = tagsRes.data ?? [];
    const userConcepts = conceptsRes.data ?? [];

    // Prioritize user's existing concepts as the preferred tag vocabulary
    const conceptNames = userConcepts.map((c: any) => c.name);
    const tagNames = allTags.slice(0, 40).map((t: any) => t.name);
    // Merge: concepts first, then platform tags (deduplicated)
    const conceptSet = new Set(conceptNames.map((n: string) => n.toLowerCase()));
    const mergedVocabulary = [
      ...conceptNames,
      ...tagNames.filter((n: string) => !conceptSet.has(n.toLowerCase())),
    ].slice(0, 60);
    const vocabStr = mergedVocabulary.join(", ");

    // Build compact summaries
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
            { role: "system", content: "Você extrai conceitos/temas específicos de cartões de estudo. Responda APENAS JSON válido, sem markdown." },
            { role: "user", content: `Para CADA cartão abaixo, extraia 1-3 CONCEITOS específicos do conteúdo. Conceitos são temas de conhecimento que o cartão ensina.

REGRAS:
- Extraia termos concretos do texto (ex: "mitocôndria", "lei de Ohm", "artéria femoral")
- NÃO use categorias amplas (ex: "Biologia", "Semiologia", "Anatomia")
- Cada conceito deve ter 1-3 palavras no máximo
- TODOS os cartões devem receber conceitos, independente do tipo (basic, cloze, multiple_choice)
- PRIORIZE reutilizar conceitos desta lista quando o tema for equivalente: ${vocabStr || "nenhum"}
- Se o conceito não existe na lista, crie um novo termo específico

CARTÕES:
${cardSummaries}

Responda JSON puro: {"0":["conceito1","conceito2"],"1":["conceito1"]}` },
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

    // Collect all unique concept names
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

    // ── Step 1: Resolve tags (create if needed) ──
    const slugMap = new Map(allTags.map((t: any) => [t.slug, t]));
    const nameToTagId = new Map<string, string>();

    const toCreateTags: { name: string; slug: string }[] = [];
    for (const name of neededNames) {
      const slug = generateSlug(name);
      const existing = slugMap.get(slug);
      if (existing) {
        nameToTagId.set(name, existing.id);
      } else {
        toCreateTags.push({ name, slug });
      }
    }

    if (toCreateTags.length > 0) {
      const { data: created, error: createErr } = await serviceSupabase
        .from("tags")
        .upsert(
          toCreateTags.map(t => ({ name: t.name, slug: t.slug, created_by: user.id })),
          { onConflict: "slug", ignoreDuplicates: true }
        )
        .select("id, name, slug");

      if (createErr) console.error("Tag create error:", createErr.message);

      for (const t of (created ?? [])) {
        nameToTagId.set(t.name, t.id);
      }

      const missingSlugs = toCreateTags
        .filter(t => !nameToTagId.has(t.name))
        .map(t => t.slug);

      if (missingSlugs.length > 0) {
        const { data: fetched } = await serviceSupabase
          .from("tags")
          .select("id, name, slug")
          .in("slug", missingSlugs);
        for (const t of (fetched ?? [])) {
          const orig = toCreateTags.find(tc => tc.slug === t.slug);
          if (orig) nameToTagId.set(orig.name, t.id);
        }
      }
    }

    // ── Step 2: Ensure global_concepts exist for each concept ──
    const conceptSlugMap = new Map(userConcepts.map((c: any) => [c.slug, c]));
    const toCreateConcepts: { name: string; slug: string; user_id: string; concept_tag_id: string | null }[] = [];

    for (const name of neededNames) {
      const slug = generateSlug(name);
      if (!conceptSlugMap.has(slug)) {
        const tagId = nameToTagId.get(name) ?? null;
        toCreateConcepts.push({ name, slug, user_id: user.id, concept_tag_id: tagId });
      }
    }

    if (toCreateConcepts.length > 0) {
      const { error: conceptErr } = await serviceSupabase
        .from("global_concepts")
        .upsert(toCreateConcepts, { onConflict: "user_id,slug", ignoreDuplicates: true });

      if (conceptErr) console.error("Concept create error:", conceptErr.message);
    }

    // ── Step 3: Build card_tags rows ──
    const cardTagRows: { card_id: string; tag_id: string; added_by: string }[] = [];
    for (const [idxStr, tagNames] of Object.entries(tagsByCard)) {
      const idx = parseInt(idxStr);
      if (isNaN(idx) || idx >= cards.length || !Array.isArray(tagNames)) continue;
      const card = cards[idx];
      for (const rawName of tagNames) {
        if (typeof rawName !== "string" || !rawName.trim()) continue;
        const tagId = nameToTagId.get(rawName.trim());
        if (tagId) {
          cardTagRows.push({ card_id: card.id, tag_id: tagId, added_by: user.id });
        }
      }
    }

    let totalTagged = 0;
    if (cardTagRows.length > 0) {
      const { data: inserted, error: linkErr } = await serviceSupabase
        .from("card_tags")
        .upsert(cardTagRows, { onConflict: "card_id,tag_id", ignoreDuplicates: true })
        .select("id");

      if (linkErr) console.error("Link error:", linkErr.message);
      else totalTagged = inserted?.length ?? 0;
    }

    return new Response(JSON.stringify({ tagged: totalTagged, cardsProcessed: cards.length, conceptsCreated: toCreateConcepts.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("auto-tag-cards error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
