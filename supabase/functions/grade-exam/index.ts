import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { handleCors, jsonResponse, getModelMap, logTokenUsage, fetchPromptConfig, getAIConfig } from "../_shared/utils.ts";

const FREE_DAILY_GRADINGS = 10;
const GRADING_COST = 2;

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "Não autenticado" }, 401);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return jsonResponse({ error: "Token inválido" }, 401);
    const userId = user.id;

    const { questionId, userAnswer, correctAnswer, questionText, aiModel, energyCost } = await req.json();
    const { apiKey: AI_KEY, url: AI_URL } = getAIConfig();
    if (!AI_KEY) return jsonResponse({ error: "GOOGLE_AI_KEY não configurada" }, 500);
    if (!questionId || !userAnswer || !correctAnswer) return jsonResponse({ error: "Campos obrigatórios faltando" }, 400);

    const promptConfig = await fetchPromptConfig(supabase, "grade_exam");
    const MODEL_MAP = await getModelMap(supabase);
    const selectedModel = MODEL_MAP[aiModel || promptConfig?.default_model || "flash"] || "gemini-2.5-flash-lite";
    const temperature = promptConfig?.temperature ?? 0.2;

    const { data: profile } = await supabase.from("profiles").select("daily_free_gradings, last_grading_reset_date, energy").eq("id", userId).single();
    if (!profile) return jsonResponse({ error: "Perfil não encontrado" }, 404);

    const today = new Date().toISOString().slice(0, 10);
    let freeGradings = profile.daily_free_gradings ?? 0;
    const lastReset = profile.last_grading_reset_date;
    if (lastReset !== today) freeGradings = 0;

    let usedFreeGrading = false;
    let actualCost = 0;
    if (freeGradings < FREE_DAILY_GRADINGS) {
      usedFreeGrading = true;
      await supabase.from("profiles").update({ daily_free_gradings: freeGradings + 1, last_grading_reset_date: today }).eq("id", userId);
    } else {
      actualCost = GRADING_COST;
      if ((profile.energy ?? 0) < actualCost) return jsonResponse({ error: "Créditos IA insuficientes", requiresCredits: true }, 402);
      // Use atomic deduction for paid gradings
      const { data: remaining, error: deductErr } = await supabase.rpc("deduct_energy", { p_user_id: userId, p_cost: actualCost });
      if (deductErr || remaining < 0) return jsonResponse({ error: "Créditos IA insuficientes", requiresCredits: true }, 402);
    }

    const cleanQuestion = (questionText || "").replace(/<[^>]*>/g, "").trim();
    const cleanCorrect = correctAnswer.replace(/<[^>]*>/g, "").trim();
    const cleanUser = userAnswer.replace(/<[^>]*>/g, "").trim();

    let prompt: string;
    if (promptConfig?.user_prompt_template) {
      prompt = promptConfig.user_prompt_template.replace("{{questionText}}", cleanQuestion).replace("{{correctAnswer}}", cleanCorrect).replace("{{userAnswer}}", cleanUser);
    } else {
      prompt = `Você é um avaliador de provas educacionais. Avalie a resposta do aluno comparando com a resposta esperada.\n\nPERGUNTA: ${cleanQuestion}\nRESPOSTA ESPERADA: ${cleanCorrect}\nRESPOSTA DO ALUNO: ${cleanUser}\n\nAvalie de 0 a 100. Considere conceitos-chave, precisão e completude.\n\nResponda APENAS com JSON válido:\n{"score": <0-100>, "feedback": "Feedback educativo em 2-3 frases"}`;
    }

    const aiResponse = await fetch(AI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${AI_KEY}` },
      body: JSON.stringify({ model: selectedModel, messages: [...(promptConfig?.system_prompt ? [{ role: "system", content: promptConfig.system_prompt }] : []), { role: "user", content: prompt }], temperature }),
    });

    if (!aiResponse.ok) {
      console.error("OpenAI error:", aiResponse.status, await aiResponse.text());
      return jsonResponse({ error: "Serviço de IA indisponível" }, 502);
    }

    const aiData = await aiResponse.json();
    await logTokenUsage(supabase, userId, "grade_exam", selectedModel, aiData.usage, actualCost);

    const rawContent = aiData.choices?.[0]?.message?.content ?? "";
    let result;
    try { const m = rawContent.match(/\{[\s\S]*\}/); result = JSON.parse(m ? m[0] : rawContent); } catch { result = { score: 0, feedback: "Não foi possível avaliar." }; }

    const scorePercent = Math.max(0, Math.min(100, result.score ?? 0));
    return jsonResponse({
      score: scorePercent, feedback: result.feedback || "",
      usedFreeGrading, freeGradingsRemaining: usedFreeGrading ? FREE_DAILY_GRADINGS - (freeGradings + 1) : FREE_DAILY_GRADINGS - freeGradings,
    });
  } catch (err) {
    console.error("Error:", err);
    return jsonResponse({ error: "Erro interno" }, 500);
  }
});
