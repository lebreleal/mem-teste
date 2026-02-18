import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, handleCors, jsonResponse } from "../_shared/utils.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

interface DeckNode {
  name: string;
  card_indices: number[];
  children?: DeckNode[];
}

/** Auto-split leaf groups larger than maxSize into chunks of ~chunkSize */
function autoSplitOversized(nodes: DeckNode[], totalCards: number, maxSize = 60, chunkSize = 25): DeckNode[] {
  return nodes.map(node => {
    if (node.children && node.children.length > 0) {
      return { ...node, children: autoSplitOversized(node.children, totalCards, maxSize, chunkSize) };
    }
    if (node.card_indices.length <= maxSize) return node;
    // Split into chunks
    const chunks: DeckNode[] = [];
    for (let i = 0; i < node.card_indices.length; i += chunkSize) {
      const slice = node.card_indices.slice(i, i + chunkSize);
      chunks.push({ name: `${node.name} (${chunks.length + 1})`, card_indices: slice });
    }
    return { name: node.name, card_indices: [], children: chunks };
  });
}

/** Collect all leaf card indices from a node tree */
function collectLeafIndices(node: DeckNode): number[] {
  const indices: number[] = [];
  if (node.card_indices && node.card_indices.length > 0) {
    indices.push(...node.card_indices);
  }
  if (node.children) {
    for (const child of node.children) {
      indices.push(...collectLeafIndices(child));
    }
  }
  return indices;
}

/** Recursively validate and clean indices */
function cleanNode(node: DeckNode, totalCards: number, assignedIndices: Set<number>): DeckNode {
  node.card_indices = (node.card_indices || []).filter(
    (idx: number) => idx >= 0 && idx < totalCards
  );

  if (node.children && Array.isArray(node.children)) {
    node.children = node.children.map(child => cleanNode(child, totalCards, assignedIndices));
    node.children = node.children.filter(c => collectLeafIndices(c).length > 0);
    if (node.children.length === 0) delete node.children;
  }

  // Track assigned indices from leaf nodes
  if (!node.children || node.children.length === 0) {
    for (const idx of node.card_indices) assignedIndices.add(idx);
  }

  return node;
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

    const totalCards = cards.length;
    const maxCards = Math.min(totalCards, 500);
    const cardSummary = cards
      .slice(0, maxCards)
      .map((c: { front: string; back: string }, i: number) =>
        `[${i}] ${(c.front || "").slice(0, 80)}`
      )
      .join("\n");

    const systemPrompt = `Você é um especialista em organização de conteúdo educacional.

Sua tarefa: receber uma lista de flashcards numerados e organizá-los em uma árvore temática hierárquica.

Diretrizes:
- Agrupe por tema/assunto real do conteúdo dos cards
- Se um grupo ficar grande demais, subdivida-o em subgrupos menores
- A hierarquia pode ter até 3 níveis de profundidade (deck → subdeck → sub-subdeck)
- Cada grupo final (folha) deve conter cards que façam sentido estudar juntos
- Um nó pode ter card_indices diretos OU children, não ambos
- Se um nó tem children, seu card_indices deve ser []
- Nomes curtos e descritivos em português
- TODOS os cards devem ser atribuídos a exatamente um grupo folha`;

    const userPrompt = `Organize estes ${totalCards} flashcards em uma árvore temática:\n\n${cardSummary}${totalCards > maxCards ? `\n\n... e mais ${totalCards - maxCards} cards similares aos acima` : ""}`;

    // Recursive schema for children (up to 3 levels)
    const childSchema: any = {
      type: "object",
      properties: {
        name: { type: "string", description: "Nome do subdeck" },
        card_indices: { type: "array", items: { type: "integer" }, description: "Índices dos cards (vazio se tiver children)" },
        children: {
          type: "array",
          description: "Sub-subdecks opcionais para temas amplos",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              card_indices: { type: "array", items: { type: "integer" } },
            },
            required: ["name", "card_indices"],
            additionalProperties: false,
          },
        },
      },
      required: ["name", "card_indices"],
      additionalProperties: false,
    };

    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "organize_cards",
              description: "Organize cards into a hierarchical deck structure with up to 3 levels",
              parameters: {
                type: "object",
                properties: {
                  decks: {
                    type: "array",
                    description: "Top-level decks. Each can have card_indices or children.",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string", description: "Nome do deck" },
                        card_indices: { type: "array", items: { type: "integer" }, description: "Índices dos cards (vazio se tiver children)" },
                        children: { type: "array", items: childSchema, description: "Subdecks opcionais" },
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
        tool_choice: { type: "function", function: { name: "organize_cards" } },
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
    const assignedIndices = new Set<number>();

    // Validate and clean the structure recursively
    for (let i = 0; i < result.decks.length; i++) {
      result.decks[i] = cleanNode(result.decks[i], totalCards, assignedIndices);
    }

    // Assign unassigned cards
    const unassigned: number[] = [];
    for (let i = 0; i < totalCards; i++) {
      if (!assignedIndices.has(i)) unassigned.push(i);
    }
    if (unassigned.length > 0) {
      const lastDeck = result.decks[result.decks.length - 1];
      if (lastDeck) {
        // Find deepest last leaf to append
        const appendToLeaf = (node: DeckNode, indices: number[]) => {
          if (node.children && node.children.length > 0) {
            appendToLeaf(node.children[node.children.length - 1], indices);
          } else {
            node.card_indices.push(...indices);
          }
        };
        appendToLeaf(lastDeck, unassigned);
      } else {
        result.decks.push({ name: "Outros", card_indices: unassigned });
      }
    }

    // Remove empty decks
    result.decks = result.decks.filter((d: DeckNode) => collectLeafIndices(d).length > 0);

    // Auto-split oversized leaf groups (safety fallback)
    result.decks = autoSplitOversized(result.decks, totalCards);

    // Log structure summary
    for (const deck of result.decks) {
      const total = collectLeafIndices(deck).length;
      console.log(`Deck "${deck.name}": ${total} cards, ${deck.children ? deck.children.length + ' children' : 'leaf'}`);
    }

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
