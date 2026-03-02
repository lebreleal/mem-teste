/**
 * auto-tag-cards edge function
 * Takes an array of cards and generates keyword tags for each using AI.
 * Tags are automatically created and linked to cards.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    const { deckId } = await req.json();
    if (!deckId) {
      return new Response(JSON.stringify({ error: "deckId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch cards for this deck
    const { data: cards, error: cardsErr } = await supabase
      .from("cards")
      .select("id, front_content, back_content, card_type")
      .eq("deck_id", deckId)
      .limit(200);

    if (cardsErr) throw cardsErr;
    if (!cards || cards.length === 0) {
      return new Response(JSON.stringify({ tagged: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch existing tags for context
    const { data: leaderTags } = await supabase
      .from("tags")
      .select("id, name, slug, usage_count, parent_id")
      .is("merged_into_id", null)
      .order("usage_count", { ascending: false })
      .limit(100);

    const allTags = leaderTags ?? [];
    const tagNameMap = new Map(allTags.map((t: any) => [t.name.toLowerCase(), t]));

    const tagListStr = allTags.slice(0, 50).map((t: any) => t.name).join(", ");

    // Strip HTML from card content for cleaner AI input
    const stripHtml = (html: string) => html.replace(/<[^>]*>/g, "").replace(/\{\{c\d+::/g, "").replace(/\}\}/g, "").trim();

    // Build card summaries for AI (batch all cards in one call)
    const cardSummaries = cards.map((c: any, idx: number) => {
      const front = stripHtml(c.front_content).substring(0, 200);
      const back = stripHtml(c.back_content).substring(0, 200);
      return `[${idx}] Frente: ${front} | Verso: ${back}`;
    }).join("\n");

    const apiKey = Deno.env.get("GOOGLE_AI_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `Analise os seguintes cartões de estudo e gere 1-3 palavras-chave (tags) para CADA cartão individualmente.

REGRAS:
1. Cada tag deve identificar o conceito-chave específico daquele cartão
2. Prefira tags curtas (1-2 palavras), termos técnicos padronizados
3. Use tags da lista existente quando possível
4. Tags devem ser em português
5. Retorne um JSON object onde a chave é o índice do cartão e o valor é um array de strings

TAGS EXISTENTES (prefira estas): ${tagListStr || "nenhuma"}

CARTÕES:
${cardSummaries}

Responda APENAS com JSON. Exemplo: {"0": ["Hipertensão", "Pressão Arterial"], "1": ["Diabetes", "Insulina"]}`;

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
            { role: "system", content: "Você é um classificador de conteúdo educacional. Responda apenas com JSON válido." },
            { role: "user", content: prompt },
          ],
          temperature: 0.2,
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
    const rawContent = aiData.choices?.[0]?.message?.content || "{}";

    let tagsByCard: Record<string, string[]> = {};
    try {
      const match = rawContent.match(/\{[\s\S]*\}/);
      if (match) tagsByCard = JSON.parse(match[0]);
    } catch {
      console.error("Failed to parse AI response:", rawContent);
      return new Response(JSON.stringify({ tagged: 0, parseError: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Helper: slug generation matching tagService
    const generateSlug = (name: string): string =>
      name.trim().toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-");

    // Process tags: find or create, then link to cards
    let totalTagged = 0;

    // Use service role for creating tags and card_tags
    const serviceSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    for (const [idxStr, tagNames] of Object.entries(tagsByCard)) {
      const idx = parseInt(idxStr);
      if (isNaN(idx) || idx >= cards.length) continue;
      const card = cards[idx];

      for (const rawName of tagNames) {
        if (typeof rawName !== "string" || !rawName.trim()) continue;
        const name = rawName.trim();

        // Find or create tag
        let tag = tagNameMap.get(name.toLowerCase());
        if (!tag) {
          const slug = generateSlug(name);
          // Check by slug first
          const { data: existingBySlug } = await serviceSupabase
            .from("tags")
            .select("*")
            .eq("slug", slug)
            .maybeSingle();

          if (existingBySlug) {
            tag = existingBySlug;
            tagNameMap.set(name.toLowerCase(), tag);
          } else {
            const { data: newTag, error: tagErr } = await serviceSupabase
              .from("tags")
              .insert({ name, slug, created_by: user.id })
              .select()
              .single();
            if (tagErr) {
              console.error("Failed to create tag:", tagErr.message);
              continue;
            }
            tag = newTag;
            tagNameMap.set(name.toLowerCase(), tag);
          }
        }

        // Link tag to card (ignore duplicates)
        const { error: linkErr } = await serviceSupabase
          .from("card_tags")
          .insert({ card_id: card.id, tag_id: tag.id, added_by: user.id });
        if (linkErr && !linkErr.message.includes("duplicate")) {
          console.error("Failed to link tag:", linkErr.message);
        } else {
          totalTagged++;
        }
      }
    }

    return new Response(JSON.stringify({ tagged: totalTagged, cardsProcessed: cards.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("auto-tag-cards error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
