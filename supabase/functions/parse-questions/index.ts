import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  jsonResponse,
  handleCors,
  getAIConfig,
  getModelMap,
  deductEnergy,
  refundEnergy,
  logTokenUsage,
  fetchWithRetry,
} from "../_shared/utils.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Não autorizado" }, 401);

    const {
      data: { user },
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) return jsonResponse({ error: "Não autorizado" }, 401);

    const { text } = await req.json();
    if (!text || typeof text !== "string" || text.trim().length < 20) {
      return jsonResponse({ error: "Texto muito curto para conter questões" }, 400);
    }

    // Truncate to avoid huge prompts
    const trimmedText = text.slice(0, 15000);

    const { apiKey, url } = getAIConfig();
    if (!apiKey) return jsonResponse({ error: "AI key not configured" }, 500);

    const modelMap = await getModelMap(supabase);
    const selectedModel = modelMap.flash;

    // Deduct 1 energy
    const cost = 1;
    const ok = await deductEnergy(supabase, user.id, cost);
    if (!ok) return jsonResponse({ error: "Créditos insuficientes" }, 402);

    const systemPrompt = `Você é um parser de questões acadêmicas. Sua tarefa é extrair questões de múltipla escolha de um texto colado pelo usuário.

REGRAS:
1. Identifique TODAS as questões de múltipla escolha no texto
2. Para cada questão, extraia:
   - question_text: o enunciado completo da questão
   - options: array com as alternativas (apenas o texto, sem a letra)
   - correct_index: índice (0-based) da alternativa correta. Se o gabarito estiver no texto, use-o. Se não houver gabarito, use -1
   - explanation: se houver explicação/justificativa no texto, extraia-a. Senão, gere uma explicação breve e precisa
   - concepts: 1-3 Knowledge Components centrais (nomes curtos, 2-6 palavras, nível Compreender/Aplicar de Bloom)

3. Mantenha o texto ORIGINAL da questão e alternativas — não reescreva nem modifique
4. Se houver gabarito no final (ex: "Gabarito: 1-A, 2-C, 3-B"), use-o para determinar correct_index
5. Reconheça formatos comuns:
   - "a) / b) / c) / d)" ou "A) / B) / C) / D)"
   - "(A) / (B) / (C) / (D)"
   - "1. / 2. / 3. / 4." como alternativas
   - Questões numeradas: "1. / 2. / 3." ou "Questão 1 / Questão 2"
6. Se o texto contiver questões dissertativas (sem alternativas), IGNORE-as

Responda SOMENTE com um JSON array. Sem markdown, sem explicações.

Formato:
[
  {
    "question_text": "...",
    "options": ["...", "...", "...", "..."],
    "correct_index": 0,
    "explanation": "...",
    "concepts": ["Conceito A", "Conceito B"]
  }
]`;

    const response = await fetchWithRetry(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Extraia as questões do seguinte texto:\n\n${trimmedText}` },
        ],
        temperature: 0.1,
        max_tokens: 8000,
      }),
    });

    if (!response.ok) {
      await refundEnergy(supabase, user.id, cost);
      const errText = await response.text();
      console.error("AI error:", errText);
      return jsonResponse({ error: "Erro na IA" }, 500);
    }

    const result = await response.json();
    const usage = result.usage;
    const content = result.choices?.[0]?.message?.content || "";

    // Parse JSON from response
    let questions: any[] = [];
    try {
      // Try to find JSON array in the response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        questions = JSON.parse(jsonMatch[0]);
      }
    } catch {
      try {
        // Try cleaning markdown fences
        const cleaned = content.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
        questions = JSON.parse(cleaned);
      } catch {
        await refundEnergy(supabase, user.id, cost);
        return jsonResponse({ error: "Não foi possível extrair questões do texto" }, 422);
      }
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      await refundEnergy(supabase, user.id, cost);
      return jsonResponse({ error: "Nenhuma questão encontrada no texto" }, 422);
    }

    // Validate and clean
    const validQuestions = questions
      .filter((q: any) => q.question_text && Array.isArray(q.options) && q.options.length >= 2)
      .map((q: any) => ({
        question_text: String(q.question_text).trim(),
        options: q.options.map((o: any) => String(o).trim()).filter((o: string) => o.length > 0),
        correct_index: typeof q.correct_index === "number" ? q.correct_index : -1,
        explanation: String(q.explanation || "").trim(),
        concepts: Array.isArray(q.concepts) ? q.concepts.slice(0, 3).map((c: any) => String(c).trim()) : [],
      }));

    await logTokenUsage(supabase, user.id, "parse_questions", selectedModel, usage, cost);

    return jsonResponse({ questions: validQuestions, count: validQuestions.length });
  } catch (err) {
    console.error("Error:", err);
    return jsonResponse({ error: "Erro interno" }, 500);
  }
});
