import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { handleCors, jsonResponse, getModelMap, deductEnergy, refundEnergy, logTokenUsage, fetchPromptConfig, getAIConfig } from "../_shared/utils.ts";

const DEFAULT_SYSTEM_PROMPT = `Você é um especialista em educação e criação de flashcards, aplicando rigorosamente as 20 Regras de Formulação do Conhecimento do Dr. Piotr Wozniak (SuperMemo).

Sua tarefa: MELHORAR o flashcard fornecido, aplicando os mesmos princípios usados para criar flashcards de alta qualidade. O card melhorado deve ser significativamente superior ao original em clareza, precisão e eficácia para memorização.

REGRA CRÍTICA DE LINGUAGEM:
Os cartões NUNCA devem referenciar a origem do conhecimento. PROIBIDO usar "de acordo com o material", "segundo o texto", "conforme mencionado", "o conteúdo aborda" ou QUALQUER variação. Cada cartão deve soar como conhecimento factual independente.

PRINCÍPIOS DE MELHORIA (aplique todos):

1. MÍNIMO DE INFORMAÇÃO: Cada cartão testa UMA ÚNICA memória atômica. Se a resposta tem mais de 1 frase para basic, SIMPLIFIQUE.
2. INTERROGAÇÃO ELABORATIVA: Transforme perguntas "O que é X?" em "Por quê?" e "Como?" — o estudante deve RACIOCINAR, não recitar.
3. CONEXÕES E CONTRASTE: Se possível, reformule para conectar conceitos ("Como X se relaciona com Y?") ou forçar diferenciação.
4. APLICAÇÃO PRÁTICA: Sempre que possível, substitua definições abstratas por cenários práticos/clínicos.
5. SEM DECOREBA: NÃO permita perguntas que podem ser respondidas citando uma definição de memória. Formule para que o estudante raciocine sobre mecanismo, causa ou consequência.
6. CONTEXTO MÍNIMO SUFICIENTE: A pergunta deve conter contexto suficiente para ter UMA ÚNICA resposta possível, sem ambiguidade.
7. CONCISÃO: Remova palavras desnecessárias. Respostas devem ser curtas e diretas.
8. HTML LIMPO: Use HTML simples se necessário (<b>, <i>) mas remova formatação excessiva ou desnecessária.

ANTI-PADRÕES (corrija se encontrar):
❌ Perguntas "O que é X?" com respostas de dicionário → Reformule para testar compreensão
❌ Respostas que são listas ("A, B, C e D") → Simplifique para testar UM conceito
❌ Cards que agrupam múltiplos conceitos → Foque no mais importante
❌ Cloze com lacunas em palavras triviais (artigos, preposições) → Mova a lacuna para o conceito-chave
❌ Cards que copiam frases inteiras sem reformulação → Reescreva com suas palavras
❌ Frases vagas ou ambíguas → Torne específico e respondível

REGRAS GERAIS:
- Mantenha o MESMO tema e conteúdo factual original
- NÃO mude o tipo do card (basic→basic, cloze→cloze, etc.)
- Se o card já aplica todos os princípios acima e está excelente, retorne o mesmo conteúdo e marque "unchanged" como true
- NÃO invente informações que não estão no card original`;

const CLOZE_ADDON = `

REGRAS ESPECÍFICAS PARA CLOZE:
- O campo "front" contém o texto com lacunas usando sintaxe {{c1::resposta}}
- PRESERVE a sintaxe {{c1::resposta}} — NUNCA remova ou quebre as chaves duplas
- Cloze DEVE ser uma AFIRMAÇÃO DECLARATIVA COMPLETA, nunca uma pergunta
- A lacuna deve conter um CONCEITO-CHAVE (nome, mecanismo, número), nunca uma palavra trivial
- Use múltiplos índices (c1, c2, c3) para testar conceitos diferentes na mesma frase quando relevante
- A frase deve fazer sentido quando lida com a lacuna preenchida E deve ser respondível quando oculta
- O campo "back" para cloze geralmente é vazio ou contém notas extras

EXEMPLOS DE MELHORIA CLOZE:
  Ruim: "O {{c1::diafragma}} é um músculo." → Vago, sem contexto
  Bom: "O principal músculo responsável pela inspiração em repouso é o {{c1::diafragma}}."
  
  Ruim: "{{c1::A hematose}} acontece nos pulmões." → Lacuna muito ampla
  Bom: "A {{c1::hematose}} é o processo de troca gasosa que ocorre nos {{c2::alvéolos pulmonares}}."`;

const MC_ADDON = `

REGRAS ESPECÍFICAS PARA MÚLTIPLA ESCOLHA:
- O campo "front" contém a pergunta
- O campo "back" contém um JSON: {"options": ["A","B","C","D"], "correctIndex": 0}
- Melhore a pergunta tornando-a mais clara e que exija RACIOCÍNIO (não simples recall)
- Melhore as alternativas tornando-as PLAUSÍVEIS e distintas — distratores devem parecer verossímeis
- A resposta correta DEVE permanecer no MESMO índice (correctIndex)
- Retorne o back como JSON válido com a mesma estrutura {"options": [...], "correctIndex": N}
- NÃO adicione texto fora do JSON no campo back`;

const BASIC_ADDON = `

REGRAS ESPECÍFICAS PARA BÁSICO (FRENTE E VERSO):
- A FRENTE deve conter uma pergunta clara que exija RACIOCÍNIO, não simples recall
- Transforme "O que é X?" em perguntas como "Por que X é importante para Y?", "Como X difere de Y?", "Qual o mecanismo de X?"
- A RESPOSTA (verso) deve ser CURTA e DIRETA — idealmente 1 frase ou menos
- Se a resposta original é longa, extraia apenas o conceito essencial
- Inclua contexto suficiente na pergunta para que haja UMA ÚNICA resposta possível`;


Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  let energyDeducted = false;
  let deductedCost = 0;
  let supabase: any;
  let userId = "";

  try {
    const { front, back, cardType, aiModel, energyCost, customPrompt } = await req.json();
    const { apiKey: AI_KEY, url: AI_URL } = getAIConfig();
    if (!AI_KEY) throw new Error("GOOGLE_AI_KEY is not configured");
    if (!front || !front.trim()) return jsonResponse({ error: "Escreva algo no card antes de melhorar." }, 400);

    const authHeader = req.headers.get("Authorization") || "";
    supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });

    if (authHeader.startsWith("Bearer ")) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) userId = user.id;
    }

    const cost = energyCost || 0;
    if (userId && cost > 0) {
      const ok = await deductEnergy(supabase, userId, cost);
      if (!ok) return jsonResponse({ error: "Créditos IA insuficientes", requiresCredits: true }, 402);
      energyDeducted = true;
      deductedCost = cost;
    }

    const promptConfig = await fetchPromptConfig(supabase, "enhance_card");
    const MODEL_MAP = await getModelMap(supabase);
    const selectedModel = MODEL_MAP[aiModel || promptConfig?.default_model || "flash"] || "gemini-2.5-flash";
    let systemPrompt = promptConfig?.system_prompt || DEFAULT_SYSTEM_PROMPT;

    if (cardType === "multiple_choice") systemPrompt += MC_ADDON;
    else if (cardType === "cloze") systemPrompt += CLOZE_ADDON;
    else systemPrompt += BASIC_ADDON;

    let userContent = "";
    if (cardType === "multiple_choice") {
      userContent = `Tipo: Múltipla Escolha\nPergunta (front): ${front}\nDados do verso (back - JSON): ${back}\n\nMelhore este card aplicando os princípios pedagógicos. Retorne o campo "back" como JSON válido com a mesma estrutura {"options": [...], "correctIndex": N}.`;
    } else if (cardType === "cloze") {
      userContent = `Tipo: Cloze\nTexto com lacunas (front): ${front}\nNotas extras (back): ${back || '(vazio)'}\n\nMelhore este card: a lacuna deve testar um conceito-chave, a frase deve ser uma afirmação declarativa completa e autocontida. Preserve a sintaxe {{c1::resposta}}.`;
    } else {
      userContent = `Tipo: Básico (Frente e Verso)\nFrente (Pergunta): ${front}\nVerso (Resposta): ${back}\n\nMelhore este card: a pergunta deve exigir raciocínio (não simples "O que é?"), a resposta deve ser curta e direta. Aplique interrogação elaborativa, conexões e aplicação prática.`;
    }

    const tools = [{ type: "function", function: { name: "return_improved_card", description: "Return the improved flashcard", parameters: { type: "object", properties: { front: { type: "string", description: "Improved front content" }, back: { type: "string", description: "Improved back content" }, unchanged: { type: "boolean", description: "True if no changes were made" } }, required: ["front", "back", "unchanged"], additionalProperties: false } } }];

    const response = await fetch(AI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${AI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: selectedModel, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userContent }], tools, tool_choice: { type: "function", function: { name: "return_improved_card" } } }),
    });

    if (!response.ok) {
      if (energyDeducted) await refundEnergy(supabase, userId, deductedCost);
      if (response.status === 429) return jsonResponse({ error: "Rate limit excedido." }, 429);
      const t = await response.text(); console.error("AI error:", response.status, t); throw new Error("AI error");
    }

    const data = await response.json();
    if (userId) await logTokenUsage(supabase, userId, "enhance_card", selectedModel, data.usage, cost);

    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      if (energyDeducted) await refundEnergy(supabase, userId, deductedCost);
      throw new Error("No tool call in response");
    }
    const result = JSON.parse(toolCall.function.arguments);
    return jsonResponse(result);
  } catch (e) {
    console.error("enhance-card error:", e);
    if (energyDeducted) await refundEnergy(supabase, userId, deductedCost);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
