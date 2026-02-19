import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { handleCors, jsonResponse, getModelMap, deductEnergy, logTokenUsage, fetchPromptConfig } from "../_shared/utils.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { frontContent, backContent, action, mcOptions, correctIndex, selectedIndex, aiModel, energyCost } = await req.json();
    if (!OPENAI_API_KEY) return jsonResponse({ error: "OPENAI_API_KEY não configurada" }, 500);
    if (!frontContent) return jsonResponse({ error: "frontContent is required" }, 400);

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return jsonResponse({ error: "Não autenticado" }, 401);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return jsonResponse({ error: "Token inválido" }, 401);
    const userId = user.id;

    const cost = energyCost || 0;
    if (cost > 0) {
      const ok = await deductEnergy(supabase, userId, cost);
      if (!ok) return jsonResponse({ error: "Créditos IA insuficientes", requiresCredits: true }, 402);
    }

    const promptConfig = await fetchPromptConfig(supabase, "ai_tutor");
    const MODEL_MAP = await getModelMap(supabase);
    const selectedModel = MODEL_MAP[aiModel || promptConfig?.default_model || "flash"] || "gpt-4o-mini";
    const temperature = promptConfig?.temperature ?? 0.5;
    const cleanFront = frontContent.replace(/<[^>]*>/g, "").trim();
    const cleanBack = backContent ? backContent.replace(/<[^>]*>/g, "").trim() : "";

    let prompt: string;
    let maxTokens = 200;
    if (action === "explain-mc") {
      const optionsList = (mcOptions || []).map((opt: string, i: number) => `${i === correctIndex ? "✅" : "❌"} ${String.fromCharCode(65 + i)}) ${opt}`).join("\n");
      prompt = `Você é um tutor educacional. O aluno respondeu uma questão de múltipla escolha.\n\nPERGUNTA: ${cleanFront}\n\nALTERNATIVAS:\n${optionsList}\n\nA resposta correta é a alternativa ${String.fromCharCode(65 + (correctIndex ?? 0))}.\n${selectedIndex !== undefined && selectedIndex !== correctIndex ? `O aluno marcou a alternativa ${String.fromCharCode(65 + selectedIndex)}.` : ""}\n\nExplique:\n1. Por que a resposta correta está certa (1-2 frases)\n2. Por que CADA alternativa incorreta está errada (1 frase cada)\n\nResponda na mesma língua da pergunta. Seja conciso.`;
      maxTokens = 500;
    } else if (action === "explain") {
      prompt = `Você é um professor universitário experiente. O aluno está estudando com flashcards e precisa entender o conceito por trás deste card.\n\nFRENTE DO CARD: ${cleanFront}\nVERSO DO CARD: ${cleanBack}\n\nResponda nesta estrutura:\n1. **Referência utilizada**: Informe a referência acadêmica que você usou para elaborar esta explicação (1-2 livros ou fontes clássicas da área). Escreva no formato: "Baseado em: [Nome do livro/autor]". Não sugira leitura — afirme que foi a fonte consultada.\n2. **Explicação**: Explique o conceito de forma didática e completa, como se estivesse dando aula particular. Use analogias e exemplos práticos.\n3. **Conexão com o card**: Relacione sua explicação diretamente com a pergunta/resposta do card.\n\nResponda na mesma língua do card. Seja completo, didático e claro, tudo pra conseguir entender o conteúdo do baralho, pois às vezes precisamos saber um conteúdo chave antes de conseguir entender o conteúdo.`;
      maxTokens = 800;
    } else {
      if (promptConfig?.user_prompt_template) {
        prompt = promptConfig.user_prompt_template.replace("{{front}}", cleanFront).replace("{{backHint}}", cleanBack ? `(The answer is: ${cleanBack} - but DO NOT reveal this. Give a hint instead.)` : "");
      } else {
        prompt = `You are a study tutor helping a student learn with flashcards. Give a brief, helpful hint for the following flashcard question WITHOUT revealing the full answer.\n\nQuestion: ${cleanFront}\n${cleanBack ? `(The answer is: ${cleanBack} - but DO NOT reveal this. Give a hint instead.)` : ""}\n\nReply in the same language as the question. Keep it under 3 sentences.`;
      }
    }

    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({ model: selectedModel, messages: [...(promptConfig?.system_prompt ? [{ role: "system", content: promptConfig.system_prompt }] : []), { role: "user", content: prompt }], max_tokens: maxTokens, temperature }),
    });

    if (!response.ok) {
      const errText = await response.text(); console.error("OpenAI error:", response.status, errText);
      if (response.status === 429) return jsonResponse({ error: "Limite de requisições excedido." }, 429);
      return jsonResponse({ error: "AI service unavailable" }, 502);
    }

    const aiData = await response.json();
    await logTokenUsage(supabase, userId, "ai_tutor", selectedModel, aiData.usage, cost);

    const hint = aiData.choices?.[0]?.message?.content ?? "Não foi possível gerar uma explicação.";
    return jsonResponse({ hint });
  } catch (err) {
    console.error("Error:", err);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
