import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, handleCors, jsonResponse } from "../_shared/utils.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { cards } = await req.json();
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
    if (!cards || !Array.isArray(cards) || cards.length === 0) {
      return jsonResponse({ error: "No cards provided" }, 400);
    }

    // Build a summary of card fronts for the AI to analyze (limit to avoid token overflow)
    const maxCards = Math.min(cards.length, 500);
    const cardSummary = cards
      .slice(0, maxCards)
      .map((c: { front: string; back: string }, i: number) =>
        `[${i}] ${(c.front || "").slice(0, 120)}`
      )
      .join("\n");

    const systemPrompt = `Você é um assistente especializado em organizar conteúdo educacional em categorias temáticas.

Sua tarefa: receber uma lista de flashcards numerados e agrupá-los por tema/assunto em subdecks.

Regras:
1. Analise o conteúdo de cada card e agrupe por tema/assunto
2. Crie entre 2 e 15 subdecks dependendo da quantidade e variedade de temas
3. Cada subdeck deve ter um nome curto e descritivo (max 40 chars)
4. TODOS os cards devem ser atribuídos a exatamente um subdeck
5. Use os índices [0], [1], etc. para referenciar os cards
6. Agrupe cards consecutivos sobre o mesmo assunto juntos
7. Se não conseguir identificar temas distintos, retorne um único grupo com todos os cards`;

    const userPrompt = `Analise e organize estes ${cards.length} flashcards em subdecks temáticos. Aqui estão os cards (frente apenas):\n\n${cardSummary}${cards.length > maxCards ? `\n\n... e mais ${cards.length - maxCards} cards similares` : ""}`;

    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "organize_cards",
              description: "Organize cards into thematic subdecks",
              parameters: {
                type: "object",
                properties: {
                  subdecks: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: {
                          type: "string",
                          description: "Name of the subdeck (short, descriptive)",
                        },
                        card_indices: {
                          type: "array",
                          items: { type: "integer" },
                          description: "Array of card indices [0, 1, 2, ...] belonging to this subdeck",
                        },
                      },
                      required: ["name", "card_indices"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["subdecks"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: {
          type: "function",
          function: { name: "organize_cards" },
        },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return jsonResponse({ error: "Rate limit exceeded" }, 429);
      const t = await response.text();
      console.error("OpenAI error:", response.status, t);
      throw new Error("AI analysis failed");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in response");

    const result = JSON.parse(toolCall.function.arguments);

    // Validate: ensure all indices are within range and no duplicates
    const totalCards = cards.length;
    const assignedIndices = new Set<number>();
    for (const subdeck of result.subdecks) {
      subdeck.card_indices = subdeck.card_indices.filter(
        (idx: number) => idx >= 0 && idx < totalCards
      );
      for (const idx of subdeck.card_indices) {
        assignedIndices.add(idx);
      }
    }

    // Assign any unassigned cards to the last subdeck (or create "Outros")
    const unassigned: number[] = [];
    for (let i = 0; i < totalCards; i++) {
      if (!assignedIndices.has(i)) unassigned.push(i);
    }
    if (unassigned.length > 0) {
      const lastSd = result.subdecks[result.subdecks.length - 1];
      if (lastSd) {
        lastSd.card_indices.push(...unassigned);
      } else {
        result.subdecks.push({ name: "Outros", card_indices: unassigned });
      }
    }

    // Remove empty subdecks
    result.subdecks = result.subdecks.filter(
      (sd: { card_indices: number[] }) => sd.card_indices.length > 0
    );

    return jsonResponse({
      subdecks: result.subdecks,
      total_cards: totalCards,
    });
  } catch (e) {
    console.error("organize-import error:", e);
    return jsonResponse(
      { error: e instanceof Error ? e.message : "Unknown error" },
      500
    );
  }
});
