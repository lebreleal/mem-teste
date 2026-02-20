import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors, jsonResponse, logTokenUsage, getAIConfig, getModelMap } from "../_shared/utils.ts";

interface DeckNode {
  name: string;
  card_indices: number[];
  children?: DeckNode[];
  standalone?: boolean;
}

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

const BATCH_SIZE = 200;

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
    description: "Organize cards into subdecks within a parent deck. Mark standalone=true ONLY for cards that clearly do NOT belong to the parent deck theme.",
    parameters: {
      type: "object",
      properties: {
        decks: {
          type: "array",
          description: "Subdecks to create. Most should be children of the parent deck. Use standalone=true ONLY for cards unrelated to the parent theme.",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Nome do subdeck" },
              card_indices: { type: "array", items: { type: "integer" }, description: "Índices dos cards (vazio se tiver children)" },
              children: { type: "array", items: childSchema, description: "Subdecks opcionais" },
              standalone: { type: "boolean", description: "true SOMENTE se este grupo NÃO tem relação com o tema do deck pai" },
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

function buildSystemPrompt(deckName: string | null): string {
  const parentContext = deckName
    ? `O baralho pai se chama "${deckName}". Os cards estão sendo importados PARA DENTRO deste baralho.

REGRA FUNDAMENTAL: Os subdecks que você criar serão FILHOS deste baralho pai.
- A maioria dos subdecks deve ser subtemas de "${deckName}"
- Nomes dos subdecks devem ser SUBTEMAS, não repetir o nome do pai
  Exemplo: se o pai é "Farmacologia", subdecks bons são "Antibióticos", "Anti-inflamatórios", etc.
- Marque standalone=true APENAS para cards que claramente NÃO têm relação com "${deckName}"
  (Ex: cards sobre culinária dentro de um deck de medicina)
- Na dúvida, NÃO marque como standalone`
    : `Os cards serão organizados em subdecks dentro de um baralho pai.`;

  return `Você é um especialista em organização de conteúdo educacional.

${parentContext}

Diretrizes:
- Agrupe por tema/assunto real do conteúdo dos cards
- Se um grupo ficar grande demais, subdivida-o em subgrupos menores
- A hierarquia pode ter até 3 níveis de profundidade
- Cada grupo final (folha) deve conter cards que façam sentido estudar juntos
- Um nó pode ter card_indices diretos OU children, não ambos
- Se um nó tem children, seu card_indices deve ser []
- Nomes curtos e descritivos em português
- TODOS os cards devem ser atribuídos a exatamente um grupo folha`;
}

async function organizeBatch(
  cardLines: string,
  batchCount: number,
  totalCards: number,
  deckName: string | null,
): Promise<{ decks: DeckNode[]; usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }> {
  const userPrompt = deckName
    ? `Organize estes ${batchCount} flashcards (de um total de ${totalCards}) como subdecks de "${deckName}".\nOs índices são GLOBAIS, mantenha-os exatamente como estão:\n\n${cardLines}`
    : `Organize estes ${batchCount} flashcards (de um total de ${totalCards}) em uma árvore temática.\nOs índices são GLOBAIS, mantenha-os exatamente como estão:\n\n${cardLines}`;

  const { apiKey: AI_KEY, url: AI_URL } = getAIConfig();
  const response = await fetch(AI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${AI_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gemini-2.5-pro",
      messages: [
        { role: "system", content: buildSystemPrompt(deckName) },
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

function mergeBatchResults(allBatches: DeckNode[][]): DeckNode[] {
  const mergedMap = new Map<string, DeckNode>();

  for (const batch of allBatches) {
    for (const deck of batch) {
      const normalizedName = deck.name.trim().toLowerCase();
      const existing = mergedMap.get(normalizedName);

      if (existing) {
        // Preserve standalone flag
        if (deck.standalone) existing.standalone = true;
        if (deck.children && deck.children.length > 0) {
          if (!existing.children) existing.children = [];
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
    if (!authHeader.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const anonClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });

    const { data: { user }, error: userError } = await anonClient.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    const userId: string = user.id;

    const { cards, deckName } = await req.json();
    const { apiKey: AI_KEY } = getAIConfig();
    if (!AI_KEY) throw new Error("GOOGLE_AI_KEY is not configured");
    if (!cards || !Array.isArray(cards) || cards.length === 0) {
      return jsonResponse({ error: "No cards provided" }, 400);
    }

    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const totalCards = cards.length;
    const parentDeckName = deckName || null;

    console.log(`Organizing ${totalCards} cards for deck "${parentDeckName || '(unnamed)'}"`);

    const cardSummaries = cards.map((c: { front: string; back: string }, i: number) =>
      `[${i}] ${(c.front || "").slice(0, 80)}`
    );

    const batches: { lines: string; count: number; startIdx: number }[] = [];
    for (let i = 0; i < totalCards; i += BATCH_SIZE) {
      const end = Math.min(i + BATCH_SIZE, totalCards);
      const batchLines = cardSummaries.slice(i, end).join("\n");
      batches.push({ lines: batchLines, count: end - i, startIdx: i });
    }

    console.log(`Processing in ${batches.length} batch(es)`);

    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalTokens = 0;
    const allBatchDecks: DeckNode[][] = [];

    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b];
      console.log(`Batch ${b + 1}/${batches.length}: ${batch.count} cards`);

      const { decks, usage } = await organizeBatch(batch.lines, batch.count, totalCards, parentDeckName);
      allBatchDecks.push(decks);

      totalPromptTokens += usage.prompt_tokens;
      totalCompletionTokens += usage.completion_tokens;
      totalTokens += usage.total_tokens;
    }

    let mergedDecks = batches.length === 1 ? allBatchDecks[0] : mergeBatchResults(allBatchDecks);

    const assignedIndices = new Set<number>();
    for (let i = 0; i < mergedDecks.length; i++) {
      mergedDecks[i] = cleanNode(mergedDecks[i], totalCards, assignedIndices);
    }

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

    mergedDecks = mergedDecks.filter((d: DeckNode) => collectLeafIndices(d).length > 0);
    mergedDecks = autoSplitOversized(mergedDecks);

    for (const deck of mergedDecks) {
      const total = collectLeafIndices(deck).length;
      console.log(`Deck "${deck.name}": ${total} cards, ${deck.standalone ? 'STANDALONE' : 'child'}, ${deck.children ? deck.children.length + ' children' : 'leaf'}`);
    }

    if (userId) {
      await logTokenUsage(supabase, userId, "organize_import", "gemini-2.5-pro",
        { prompt_tokens: totalPromptTokens, completion_tokens: totalCompletionTokens, total_tokens: totalTokens }, 0);
    }

    return jsonResponse({ subdecks: mergedDecks, total_cards: totalCards });
  } catch (e) {
    console.error("organize-import error:", e);
    if (e instanceof Error && e.message === "RATE_LIMIT") {
      return jsonResponse({ error: "Rate limit exceeded" }, 429);
    }
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
