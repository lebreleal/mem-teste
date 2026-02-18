import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { handleCors, jsonResponse, getModelMap, deductEnergy, logTokenUsage, fetchPromptConfig } from "../_shared/utils.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

const DEFAULT_SYSTEM_PROMPT = `Você é um especialista em criação de flashcards eficazes para estudo com repetição espaçada.

Sua tarefa: melhorar o flashcard fornecido pelo usuário, tornando-o mais claro, preciso e eficaz para memorização.

Regras gerais:
- Mantenha o MESMO tema e conteúdo original
- Melhore a clareza, precisão e objetividade
- Use linguagem concisa mas completa
- Mantenha HTML simples se necessário (negrito, itálico)
- NÃO mude o tipo do card
- Se o card já está excelente, retorne o mesmo conteúdo sem alterações e marque "unchanged" como true

Regras para Cloze:
- O campo "front" contém o texto com lacunas usando sintaxe {{c1::resposta}}
- Melhore APENAS o texto ao redor, mantendo EXATAMENTE a sintaxe {{c1::resposta}} intacta
- Você pode melhorar o conteúdo dentro do {{c1::...}} mas NUNCA remova ou quebre a sintaxe de chaves duplas
- O campo "back" para cloze geralmente é vazio ou contém notas extras
- Retorne o front melhorado COM a sintaxe cloze preservada

Regras para Múltipla Escolha:
- O campo "front" contém a pergunta
- O campo "back" contém um JSON: {"options": ["A","B","C","D"], "correctIndex": 0}
- Melhore a pergunta no front tornando-a mais clara
- Melhore as alternativas no back tornando-as mais distintas e precisas
- A resposta correta DEVE permanecer no MESMO índice (correctIndex)
- Retorne o back como JSON válido com a mesma estrutura {"options": [...], "correctIndex": N}
- NÃO adicione texto fora do JSON no campo back`;


Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { front, back, cardType, aiModel, energyCost } = await req.json();
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
    if (!front || !front.trim()) return jsonResponse({ error: "Escreva algo no card antes de melhorar." }, 400);

    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });

    let userId = "";
    if (authHeader.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const { data } = await supabase.auth.getClaims(token);
      if (data?.claims?.sub) userId = data.claims.sub as string;
    }

    const cost = energyCost || 0;
    if (userId && cost > 0) {
      const ok = await deductEnergy(supabase, userId, cost);
      if (!ok) return jsonResponse({ error: "Créditos IA insuficientes", requiresCredits: true }, 402);
    }

    const promptConfig = await fetchPromptConfig(supabase, "enhance_card");
    const MODEL_MAP = await getModelMap(supabase);
    const selectedModel = MODEL_MAP[aiModel || promptConfig?.default_model || "flash"] || "gpt-4o-mini";
    let systemPrompt = promptConfig?.system_prompt || DEFAULT_SYSTEM_PROMPT;

    if (cardType === "multiple_choice") systemPrompt += `\n\nATENÇÃO: Este é um card de Múltipla Escolha. O campo "back" é JSON puro. Retorne o "back" melhorado TAMBÉM como JSON válido {"options": [...], "correctIndex": N}. Mantenha o correctIndex apontando para a mesma resposta correta.`;
    else if (cardType === "cloze") systemPrompt += `\n\nATENÇÃO: Este é um card Cloze. Preserve EXATAMENTE a sintaxe {{c1::resposta}} no campo "front". Nunca remova as chaves duplas.`;

    let userContent = "";
    if (cardType === "multiple_choice") userContent = `Tipo: Múltipla Escolha\nPergunta (front): ${front}\nDados do verso (back - JSON): ${back}\n\nIMPORTANTE: Retorne o campo "back" como JSON válido com a mesma estrutura.`;
    else if (cardType === "cloze") userContent = `Tipo: Cloze\nTexto com lacunas (front): ${front}\nNotas extras (back): ${back || '(vazio)'}\n\nIMPORTANTE: Preserve a sintaxe {{c1::resposta}} no front.`;
    else userContent = `Tipo: Básico\nFrente (Pergunta): ${front}\nVerso (Resposta): ${back}`;

    const tools = [{ type: "function", function: { name: "return_improved_card", description: "Return the improved flashcard", parameters: { type: "object", properties: { front: { type: "string", description: "Improved front content" }, back: { type: "string", description: "Improved back content" }, unchanged: { type: "boolean", description: "True if no changes were made" } }, required: ["front", "back", "unchanged"], additionalProperties: false } } }];

    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: selectedModel, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userContent }], tools, tool_choice: { type: "function", function: { name: "return_improved_card" } } }),
    });

    if (!response.ok) {
      if (response.status === 429) return jsonResponse({ error: "Rate limit excedido." }, 429);
      const t = await response.text(); console.error("OpenAI error:", response.status, t); throw new Error("OpenAI error");
    }

    const data = await response.json();
    if (userId) await logTokenUsage(supabase, userId, "enhance_card", selectedModel, data.usage, cost);

    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in response");
    const result = JSON.parse(toolCall.function.arguments);
    return jsonResponse(result);
  } catch (e) {
    console.error("enhance-card error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
