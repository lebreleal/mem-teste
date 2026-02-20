import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { handleCors, jsonResponse, getModelMap, deductEnergy, logTokenUsage, fetchPromptConfig, getAIConfig, fetchWithRetry } from "../_shared/utils.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };

  try {
    const { frontContent, backContent, action, mcOptions, correctIndex, selectedIndex, aiModel, energyCost } = await req.json();
    const { apiKey: AI_KEY, url: AI_URL } = getAIConfig();
    if (!AI_KEY) return jsonResponse({ error: "GOOGLE_AI_KEY não configurada" }, 500);
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
    const selectedModel = MODEL_MAP[aiModel || promptConfig?.default_model || "flash"] || "gemini-2.5-flash";
    const temperature = promptConfig?.temperature ?? 0.5;
    const cleanFront = frontContent.replace(/<[^>]*>/g, "").trim();
    const cleanBack = backContent ? backContent.replace(/<[^>]*>/g, "").trim() : "";

    let prompt: string;
    let maxTokens = 400;
    if (action === "explain-mc") {
      const optionsList = (mcOptions || []).map((opt: string, i: number) => `${i === correctIndex ? "✅" : "❌"} ${String.fromCharCode(65 + i)}) ${opt}`).join("\n");
      prompt = `O aluno respondeu uma questão de múltipla escolha.\n\nPERGUNTA: ${cleanFront}\n\nALTERNATIVAS:\n${optionsList}\n\nA resposta correta é a alternativa ${String.fromCharCode(65 + (correctIndex ?? 0))}.\n${selectedIndex !== undefined && selectedIndex !== correctIndex ? `O aluno marcou a alternativa ${String.fromCharCode(65 + selectedIndex)}.` : ""}\n\nExplique:\n1. Por que a resposta correta está certa (1-2 frases)\n2. Por que CADA alternativa incorreta está errada (1 frase cada)\n\nResponda na mesma língua da pergunta. Seja conciso.`;
      maxTokens = 1000;
    } else if (action === "explain") {
      prompt = `O aluno está estudando com flashcards e precisa entender o conceito por trás deste card.\n\nFRENTE DO CARD: ${cleanFront}\nVERSO DO CARD: ${cleanBack}\n\nResponda nesta estrutura:\n1. **Referência utilizada**: Informe a referência acadêmica que você usou para elaborar esta explicação (1-2 livros ou fontes clássicas da área). Escreva no formato: "Baseado em: [Nome do livro/autor]". Não sugira leitura — afirme que foi a fonte consultada.\n2. **Explicação**: Explique o conceito de forma didática e completa, como se estivesse dando aula particular. Use analogias e exemplos práticos.\n3. **Conexão com o card**: Relacione sua explicação diretamente com a pergunta/resposta do card.\n\nResponda na mesma língua do card. Seja completo, didático e claro, tudo pra conseguir entender o conteúdo do baralho, pois às vezes precisamos saber um conteúdo chave antes de conseguir entender o conteúdo.`;
      maxTokens = 2000;
    } else {
      if (promptConfig?.user_prompt_template) {
        prompt = promptConfig.user_prompt_template.replace("{{front}}", cleanFront).replace("{{backHint}}", cleanBack ? `(The answer is: ${cleanBack} - but DO NOT reveal this. Give a hint instead.)` : "");
      } else {
        prompt = `You are a study tutor helping a student learn with flashcards. Give a brief, helpful hint for the following flashcard question WITHOUT revealing the full answer.\n\nQuestion: ${cleanFront}\n${cleanBack ? `(The answer is: ${cleanBack} - but DO NOT reveal this. Give a hint instead.)` : ""}\n\nReply in the same language as the question. Keep it under 3 sentences.`;
      }
    }

    const antiPreamblePrompt = `REGRAS OBRIGATÓRIAS (violação = falha):
1. COMECE IMEDIATAMENTE pelo conteúdo. A PRIMEIRA palavra da resposta DEVE ser sobre o assunto.
2. PROIBIDO TERMINANTEMENTE: "Olá", "Oi", "Que bom", "Ótima pergunta", "Excelente", "Legal que você", "Parabéns", "Fico feliz", qualquer saudação, elogio ou comentário sobre o aluno.
3. PROIBIDO qualquer frase motivacional ou encorajamento como "continue assim", "você está no caminho certo", "boa sorte".
4. NÃO faça preâmbulos. NÃO cumprimente. NÃO elogie. NÃO comente sobre a pergunta. VÁ DIRETO ao conteúdo.
5. Use Markdown para formatação. Seja didático e completo.
6. Você é um tutor educacional. Responda SOMENTE o conteúdo acadêmico solicitado.`;
    const systemPrompt = promptConfig?.system_prompt || antiPreamblePrompt;

    // Estimate token usage from input text (1 token ≈ 4 chars for Gemini)
    const estimatedPromptTokens = Math.ceil((systemPrompt.length + prompt.length) / 4);
    const estimatedCompletionTokens = Math.ceil(maxTokens * 0.7);
    const estimatedTotal = estimatedPromptTokens + estimatedCompletionTokens;

    const response = await fetchWithRetry(AI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${AI_KEY}` },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        max_tokens: maxTokens,
        temperature,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errText = await response.text(); console.error("AI error:", response.status, errText);
      if (response.status === 429) return jsonResponse({ error: "Limite de requisições excedido." }, 429);
      if (response.status === 403) return jsonResponse({ error: "API do Google AI não ativada." }, 502);
      if (response.status === 503) return jsonResponse({ error: "Modelo sobrecarregado. Tente Flash." }, 503);
      return jsonResponse({ error: "Serviço de IA indisponível" }, 502);
    }

    // Log estimated token usage (streaming prevents exact count)
    await logTokenUsage(supabase, userId, "ai_tutor", selectedModel, {
      prompt_tokens: estimatedPromptTokens,
      completion_tokens: estimatedCompletionTokens,
      total_tokens: estimatedTotal,
    }, cost);

    // Stream the OpenAI SSE response directly to the client
    return new Response(response.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (err) {
    console.error("Error:", err);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
