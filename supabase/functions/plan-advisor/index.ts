import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { handleCors, jsonResponse, getAIConfig, fetchWithRetry } from "../_shared/utils.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { totalNew, budget, effectiveRate, targetDate, projectedDate, daysLeft, reviewMinutes, dailyMinutes, planNames } = await req.json();
    const { apiKey: AI_KEY, url: AI_URL } = getAIConfig();
    if (!AI_KEY) return jsonResponse({ error: "GOOGLE_AI_KEY não configurada" }, 500);

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return jsonResponse({ error: "Não autenticado" }, 401);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return jsonResponse({ error: "Token inválido" }, 401);

    const willMiss = targetDate && projectedDate && projectedDate > targetDate;

    const systemPrompt = `Você é um conselheiro de estudos especializado em repetição espaçada. 
Responda SEMPRE em português brasileiro, de forma direta, empática e concisa (máximo 4 frases curtas).
NÃO use markdown, headers, bullet points ou formatação especial. Apenas texto corrido simples.
Foque em 1-2 ações concretas que o aluno pode tomar agora.
Se ele está dentro do prazo, parabenize brevemente e sugira manter o ritmo.
Se está apertado ou inviável, diga exatamente o que mudar (limite de cards OU tempo de estudo) e por quê.`;

    const userPrompt = `Situação do aluno:
- ${totalNew} cards novos para dominar
- Limite: ${budget} novos cards/dia  
- Ritmo efetivo: ${effectiveRate} cards/dia (considerando tempo disponível)
- Tempo de estudo: ${dailyMinutes}min/dia (${reviewMinutes}min gastos em revisões)
${targetDate ? `- Data limite: ${targetDate}` : '- Sem data limite definida'}
${targetDate ? `- Projeção de conclusão: ${projectedDate}` : ''}
${daysLeft ? `- Dias restantes: ${daysLeft}` : ''}
${willMiss ? '- SITUAÇÃO: Vai perder o prazo no ritmo atual!' : targetDate ? '- SITUAÇÃO: Está dentro do prazo.' : ''}
- Objetivos: ${planNames || 'Não nomeados'}

Dê uma recomendação curta e direta.`;

    const response = await fetchWithRetry(AI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AI_KEY}`,
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.4,
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI error:", errText);
      return jsonResponse({ error: "Erro ao gerar recomendação" }, 500);
    }

    const result = await response.json();
    const advice = result.choices?.[0]?.message?.content?.trim() || "Não foi possível gerar uma recomendação.";

    return jsonResponse({ advice });
  } catch (e) {
    console.error("plan-advisor error:", e);
    return jsonResponse({ error: "Erro interno" }, 500);
  }
});
