import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { conceptNames } = await req.json();
    if (!Array.isArray(conceptNames) || conceptNames.length === 0) {
      return new Response(JSON.stringify({ error: "conceptNames required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `You are a medical education expert that maps prerequisite and hierarchical relationships between Knowledge Components (concepts).

Given a list of concepts, return TWO types of relationships:
1. PREREQUISITE pairs: concept A is a prerequisite for concept B (A must be understood before B)
2. SIBLING groups: concepts that share a common parent theme and should be grouped together

Rules for PREREQUISITES:
- A prerequisite is a foundational concept that MUST be understood before the dependent concept.
- Example: "Fisiologia Cardíaca" is prerequisite for "Insuficiência Cardíaca"
- Each concept can have at most ONE prerequisite (the most important one).
- Return ONLY pairs where BOTH concept and prerequisite exist in the provided list.

Rules for SIBLING GROUPS:
- If multiple concepts are clearly subtopics of the same theme, group them as siblings.
- Example: "Apoptose Fisiológica", "Apoptose por Prevenção de Câncer", "Convergência via Apoptose" → siblings under parent "Apoptose"
- The parent concept name MUST be a concept that ALREADY EXISTS in the provided list.
- If no existing concept can serve as parent, suggest a NEW parent name via the "new_parents" field.
- Sibling groups help connect isolated concepts that came from the same study material.
- Only group concepts that are GENUINELY related — don't force unrelated concepts together.`;

    const userPrompt = `Here are the concepts to analyze:\n\n${conceptNames.map((n: string, i: number) => `${i + 1}. ${n}`).join('\n')}\n\nReturn prerequisite relationships.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "map_prerequisites",
            description: "Map prerequisite and sibling relationships between concepts",
            parameters: {
              type: "object",
              properties: {
                pairs: {
                  type: "array",
                  description: "Direct prerequisite relationships (A is prerequisite of B)",
                  items: {
                    type: "object",
                    properties: {
                      concept: { type: "string", description: "The dependent concept (exact name from list)" },
                      prerequisite: { type: "string", description: "The prerequisite concept (exact name from list)" },
                    },
                    required: ["concept", "prerequisite"],
                    additionalProperties: false,
                  },
                },
                sibling_groups: {
                  type: "array",
                  description: "Groups of concepts that share a common parent theme",
                  items: {
                    type: "object",
                    properties: {
                      parent_name: { type: "string", description: "Name of the parent concept (existing from list OR new)" },
                      parent_exists: { type: "boolean", description: "true if parent_name exists in the provided list, false if it's a new suggested parent" },
                      children: {
                        type: "array",
                        items: { type: "string" },
                        description: "Exact names from the list that are children of this parent",
                      },
                    },
                    required: ["parent_name", "parent_exists", "children"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["pairs", "sibling_groups"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "map_prerequisites" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ pairs: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify({ 
      pairs: parsed.pairs ?? [],
      sibling_groups: parsed.sibling_groups ?? [],
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("map-prerequisites error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
