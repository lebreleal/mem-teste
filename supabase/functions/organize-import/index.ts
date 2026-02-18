import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, handleCors, jsonResponse } from "../_shared/utils.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

interface DeckNode {
  name: string;
  card_indices: number[];
  children?: DeckNode[];
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { cards } = await req.json();
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
    if (!cards || !Array.isArray(cards) || cards.length === 0) {
      return jsonResponse({ error: "No cards provided" }, 400);
    }

    const maxCards = Math.min(cards.length, 500);
    const cardSummary = cards
      .slice(0, maxCards)
      .map((c: { front: string; back: string }, i: number) =>
        `[${i}] ${(c.front || "").slice(0, 120)}`
      )
      .join("\n");

    const systemPrompt = `Você é um assistente especializado em organizar conteúdo educacional em categorias temáticas, seguindo as melhores práticas do Anki.

Sua tarefa: receber uma lista de flashcards numerados e organizá-los em uma estrutura hierárquica de decks.

Regras CRÍTICAS:
1. Cada grupo FOLHA (sem filhos) deve ter idealmente entre 10 e 50 cartões
2. Se um tema tiver MAIS de 60 cartões, você DEVE criar subgrupos (children) dentro dele
3. Se houver poucos temas (menos de 3 distintos), retorne um único deck com subdecks
4. Se houver muitos temas distintos, crie múltiplos decks no nível superior
5. TODOS os cartões devem ser atribuídos a exatamente um grupo folha
6. Use os índices [0], [1], etc. para referenciar os cards
7. Nomes curtos e descritivos (max 40 chars)
8. Máximo de 2 níveis de profundidade (deck → subdeck)
9. Um deck pode ter card_indices diretos OU children, preferencialmente não ambos
10. Se um deck tem children, card_indices deve ser vazio []

Exemplo de estrutura para 400 cards de medicina:
- Se "Obstetrícia" tem 200 cards → criar deck "Obstetrícia" com children: "Pré-natal", "Parto", "Puerpério", etc.
- Se "Leiomioma" tem 15 cards → manter como grupo simples com card_indices`;

    const userPrompt = `Analise e organize estes ${cards.length} flashcards em uma estrutura hierárquica. Aqui estão os cards (frente apenas):\n\n${cardSummary}${cards.length > maxCards ? `\n\n... e mais ${cards.length - maxCards} cards similares` : ""}`;

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
              description: "Organize cards into a hierarchical deck structure with up to 2 levels",
              parameters: {
                type: "object",
                properties: {
                  decks: {
                    type: "array",
                    description: "Top-level decks. Each can have card_indices directly or children subdecks.",
                    items: {
                      type: "object",
                      properties: {
                        name: {
                          type: "string",
                          description: "Name of the deck (short, descriptive, max 40 chars)",
                        },
                        card_indices: {
                          type: "array",
                          items: { type: "integer" },
                          description: "Card indices directly in this deck (empty if has children)",
                        },
                        children: {
                          type: "array",
                          description: "Optional sub-decks for large themes (10-50 cards each)",
                          items: {
                            type: "object",
                            properties: {
                              name: {
                                type: "string",
                                description: "Name of the subdeck",
                              },
                              card_indices: {
                                type: "array",
                                items: { type: "integer" },
                                description: "Card indices in this subdeck",
                              },
                            },
                            required: ["name", "card_indices"],
                            additionalProperties: false,
                          },
                        },
                      },
                      required: ["name", "card_indices"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["decks"],
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
    const totalCards = cards.length;
    const assignedIndices = new Set<number>();

    // Helper: get all leaf indices from a deck node
    function collectLeafIndices(node: DeckNode): number[] {
      const indices: number[] = [];
      if (node.card_indices) {
        for (const idx of node.card_indices) {
          if (idx >= 0 && idx < totalCards) indices.push(idx);
        }
      }
      if (node.children) {
        for (const child of node.children) {
          indices.push(...collectLeafIndices(child));
        }
      }
      return indices;
    }

    // Validate and clean the structure
    for (const deck of result.decks) {
      // Filter valid indices
      deck.card_indices = (deck.card_indices || []).filter(
        (idx: number) => idx >= 0 && idx < totalCards
      );

      if (deck.children && Array.isArray(deck.children)) {
        for (const child of deck.children) {
          child.card_indices = (child.card_indices || []).filter(
            (idx: number) => idx >= 0 && idx < totalCards
          );
          for (const idx of child.card_indices) assignedIndices.add(idx);
        }
        // Remove empty children
        deck.children = deck.children.filter(
          (c: DeckNode) => c.card_indices.length > 0
        );
        if (deck.children.length === 0) delete deck.children;
      }

      // Add direct card_indices
      for (const idx of deck.card_indices) assignedIndices.add(idx);
    }

    // Assign unassigned cards
    const unassigned: number[] = [];
    for (let i = 0; i < totalCards; i++) {
      if (!assignedIndices.has(i)) unassigned.push(i);
    }
    if (unassigned.length > 0) {
      const lastDeck = result.decks[result.decks.length - 1];
      if (lastDeck) {
        if (lastDeck.children && lastDeck.children.length > 0) {
          lastDeck.children[lastDeck.children.length - 1].card_indices.push(...unassigned);
        } else {
          lastDeck.card_indices.push(...unassigned);
        }
      } else {
        result.decks.push({ name: "Outros", card_indices: unassigned });
      }
    }

    // Remove empty decks
    result.decks = result.decks.filter((d: DeckNode) => {
      const allIndices = collectLeafIndices(d);
      return allIndices.length > 0;
    });

    // Log warnings for oversized leaf groups
    for (const deck of result.decks) {
      if (!deck.children && deck.card_indices.length > 80) {
        console.warn(`Warning: deck "${deck.name}" has ${deck.card_indices.length} cards (>80) without children`);
      }
      if (deck.children) {
        for (const child of deck.children) {
          if (child.card_indices.length > 80) {
            console.warn(`Warning: subdeck "${deck.name} > ${child.name}" has ${child.card_indices.length} cards (>80)`);
          }
        }
      }
    }

    // Convert to backward-compatible format:
    // If there's only 1 top-level deck with no children, return flat subdecks format
    // Otherwise return the hierarchical format
    const hasHierarchy = result.decks.some((d: DeckNode) => d.children && d.children.length > 0);
    const multipleTopLevel = result.decks.length > 1;

    if (!hasHierarchy && !multipleTopLevel && result.decks.length === 1) {
      // Single deck with direct cards — shouldn't happen but handle gracefully
      return jsonResponse({
        subdecks: [{ name: result.decks[0].name, card_indices: result.decks[0].card_indices }],
        total_cards: totalCards,
      });
    }

    // Return hierarchical structure
    return jsonResponse({
      subdecks: result.decks,
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
