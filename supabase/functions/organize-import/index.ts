import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors, jsonResponse, logTokenUsage } from "../_shared/utils.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

interface DeckNode {
  name: string;
  card_indices: number[];
  children?: DeckNode[];
}

/** Auto-split leaf groups larger than maxSize into chunks of ~chunkSize */
function autoSplitOversized(nodes: DeckNode[], maxSize = 60, chunkSize = 25): DeckNode[] {
  return nodes.map(node => {
    if (node.children && node.children.length > 0) {
      return { ...node, children: autoSplitOversized(node.children, maxSize, chunkSize) };
    }
    if (node.card_indices.length <= maxSize) return node;
    const chunks: DeckNode[] = [];
    for (let i = 0; i < node.card_indices.length; i += chunkSize) {
      const slice = node.card_indices.slice(i, i + chunkSize);
      chunks.push({ name: `${node.name} (${chunks.length + 1})`, card_indices: slice });
    }
    return { name: node.name, card_indices: [], children: chunks };
  });
}

function collectLeafIndices(node: DeckNode): number[] {
  const indices: number[] = [];
  if (node.card_indices && node.card_indices.length > 0) indices.push(...node.card_indices);
  if (node.children) for (const child of node.children) indices.push(...collectLeafIndices(child));
  return indices;
}

function cleanNode(node: DeckNode, totalCards: number, assignedIndices: Set<number>): DeckNode {
  node.card_indices = (node.card_indices || []).filter((idx: number) => idx >= 0 && idx < totalCards);
  if (node.children && Array.isArray(node.children)) {
    node.children = node.children.map(child => cleanNode(child, totalCards, assignedIndices));
    node.children = node.children.filter(c => collectLeafIndices(c).length > 0);
    if (node.children.length === 0) delete node.children;
  }
  if (!node.children || node.children.length === 0) {
    for (const idx of node.card_indices) assignedIndices.add(idx);
  }
  return node;
}

const BATCH_SIZE = 200; // max cards per API call

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

const childSchema: any = {
  type: "object",
  properties: {
    name: { type: "string", description: "Nome do subdeck" },
    card_indices: { type: "array", items: { type: "integer" }, description: "Índices dos cards (vazio se tiver children)" },
    children: {
      type: "array",
      description: "Sub-subdecks opcionais",
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

const toolDef = {
  type: "function" as const,
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
};

/** Call the AI for a batch of cards (with their GLOBAL indices). Returns DeckNode[] and usage stats. */
async function organizeBatch(
  cardLines: string,
  batchCount: number,
  totalCards: number,
): Promise<{ decks: DeckNode[]; usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }> {
  const userPrompt = `Organize estes ${batchCount} flashcards (de um total de ${totalCards}) em uma árvore temática.\nOs índices são GLOBAIS, mantenha-os exatamente como estão:\n\n${cardLines}`;

  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: [toolDef],
      tool_choice: { type: "function", function: { name: "organize_cards" } },
    }),
  });

  if (!response.ok) {
    if (response.status === 429) throw new Error("RATE_LIMIT");
    const t = await response.text();
    console.error("OpenAI error:", response.status, t);
    throw new Error("AI analysis failed");
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) throw new Error("No tool call in response");

  const result = JSON.parse(toolCall.function.arguments);
  const usage = data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  return { decks: result.decks || [], usage };
}

/** Merge batch results: try to group decks with same name */
function mergeBatchResults(allBatches: DeckNode[][]): DeckNode[] {
  const mergedMap = new Map<string, DeckNode>();

  for (const batch of allBatches) {
    for (const deck of batch) {
      const normalizedName = deck.name.trim().toLowerCase();
      const existing = mergedMap.get(normalizedName);

      if (existing) {
        // Merge indices and children
        if (deck.children && deck.children.length > 0) {
          if (!existing.children) existing.children = [];
          // Try to merge matching children too
          for (const child of deck.children) {
            const childNorm = child.name.trim().toLowerCase();
            const existingChild = existing.children.find(c => c.name.trim().toLowerCase() === childNorm);
            if (existingChild) {
              existingChild.card_indices.push(...child.card_indices);
              if (child.children) {
                if (!existingChild.children) existingChild.children = [];
                existingChild.children.push(...child.children);
              }
            } else {
              existing.children.push(child);
            }
          }
        } else {
          existing.card_indices.push(...deck.card_indices);
        }
      } else {
        mergedMap.set(normalizedName, { ...deck });
      }
    }
  }

  return Array.from(mergedMap.values());
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const { cards } = await req.json();
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
    if (!cards || !Array.isArray(cards) || cards.length === 0) {
      return jsonResponse({ error: "No cards provided" }, 400);
    }

    // Create supabase client for logging
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user id from auth token
    let userId: string | null = null;
    if (authHeader.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      try {
        const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") || supabaseKey);
        const { data: { user } } = await anonClient.auth.getUser(token);
        userId = user?.id || null;
      } catch { /* ignore */ }
    }

    const totalCards = cards.length;

    // Build card summaries with GLOBAL indices
    const cardSummaries = cards.map((c: { front: string; back: string }, i: number) =>
      `[${i}] ${(c.front || "").slice(0, 80)}`
    );

    // Split into batches
    const batches: { lines: string; count: number; startIdx: number }[] = [];
    for (let i = 0; i < totalCards; i += BATCH_SIZE) {
      const end = Math.min(i + BATCH_SIZE, totalCards);
      const batchLines = cardSummaries.slice(i, end).join("\n");
      batches.push({ lines: batchLines, count: end - i, startIdx: i });
    }

    console.log(`Organizing ${totalCards} cards in ${batches.length} batch(es)`);

    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalTokens = 0;

    const allBatchDecks: DeckNode[][] = [];

    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b];
      console.log(`Processing batch ${b + 1}/${batches.length}: ${batch.count} cards starting at index ${batch.startIdx}`);

      const { decks, usage } = await organizeBatch(batch.lines, batch.count, totalCards);
      allBatchDecks.push(decks);

      totalPromptTokens += usage.prompt_tokens;
      totalCompletionTokens += usage.completion_tokens;
      totalTokens += usage.total_tokens;
    }

    // Merge results from all batches
    let mergedDecks: DeckNode[];
    if (batches.length === 1) {
      mergedDecks = allBatchDecks[0];
    } else {
      mergedDecks = mergeBatchResults(allBatchDecks);
    }

    // Clean and validate
    const assignedIndices = new Set<number>();
    for (let i = 0; i < mergedDecks.length; i++) {
      mergedDecks[i] = cleanNode(mergedDecks[i], totalCards, assignedIndices);
    }

    // Assign unassigned cards
    const unassigned: number[] = [];
    for (let i = 0; i < totalCards; i++) {
      if (!assignedIndices.has(i)) unassigned.push(i);
    }
    if (unassigned.length > 0) {
      console.log(`${unassigned.length} unassigned cards being distributed`);
      const lastDeck = mergedDecks[mergedDecks.length - 1];
      if (lastDeck) {
        const appendToLeaf = (node: DeckNode, indices: number[]) => {
          if (node.children && node.children.length > 0) {
            appendToLeaf(node.children[node.children.length - 1], indices);
          } else {
            node.card_indices.push(...indices);
          }
        };
        appendToLeaf(lastDeck, unassigned);
      } else {
        mergedDecks.push({ name: "Outros", card_indices: unassigned });
      }
    }

    // Remove empty decks
    mergedDecks = mergedDecks.filter((d: DeckNode) => collectLeafIndices(d).length > 0);

    // Auto-split oversized leaf groups
    mergedDecks = autoSplitOversized(mergedDecks);

    // Log structure summary
    for (const deck of mergedDecks) {
      const total = collectLeafIndices(deck).length;
      console.log(`Deck "${deck.name}": ${total} cards, ${deck.children ? deck.children.length + ' children' : 'leaf'}`);
    }

    // Log token usage (energy_cost = 0 since it's free)
    if (userId) {
      await logTokenUsage(
        supabase,
        userId,
        "organize_import",
        "gpt-4o",
        { prompt_tokens: totalPromptTokens, completion_tokens: totalCompletionTokens, total_tokens: totalTokens },
        0,
      );
    }

    return jsonResponse({
      subdecks: mergedDecks,
      total_cards: totalCards,
    });
  } catch (e) {
    console.error("organize-import error:", e);
    if (e instanceof Error && e.message === "RATE_LIMIT") {
      return jsonResponse({ error: "Rate limit exceeded" }, 429);
    }
    return jsonResponse(
      { error: e instanceof Error ? e.message : "Unknown error" },
      500,
    );
  }
});
