import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { handleCors, jsonResponse, getModelMap, logTokenUsage, fetchPromptConfig } from "../_shared/utils.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { course, semester, aiModel } = await req.json();
    if (!OPENAI_API_KEY) return jsonResponse({ error: "OPENAI_API_KEY não configurada" }, 500);
    if (!course || !semester) return jsonResponse({ error: "Curso e semestre são obrigatórios" }, 400);

    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });

    let userId = "";
    if (authHeader.startsWith("Bearer ")) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) userId = user.id;
    }

    const promptConfig = await fetchPromptConfig(supabase, "generate_onboarding");
    const MODEL_MAP = await getModelMap(supabase);
    const selectedModel = MODEL_MAP[aiModel || promptConfig?.default_model || "flash"] || "gpt-4o-mini";
    const temperature = promptConfig?.temperature ?? 0.3;

    let userPrompt: string;
    if (promptConfig?.user_prompt_template) {
      userPrompt = promptConfig.user_prompt_template.replace("{{course}}", course).replace("{{semester}}", semester);
    } else {
      userPrompt = `Você é um especialista em grade curricular universitária brasileira.\n\nO aluno digitou:\n- Curso: "${course}"\n- Semestre: "${semester}"\n\nSuas tarefas:\n1. Corrija erros de digitação no nome do curso e semestre. Retorne os nomes corrigidos.\n2. Gere a lista de 4-8 matérias típicas desse semestre nesse curso em universidades brasileiras.\n3. Para cada matéria, gere APENAS 1 aula com nome genérico "Aula 1".\nUse nomes curtos e diretos para as matérias.`;
    }

    const systemPrompt = promptConfig?.system_prompt || "Responda apenas com o tool call solicitado.";

    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: selectedModel,
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
        tools: [{ type: "function", function: { name: "suggest_subjects", description: "Return suggested subjects with lessons and corrected course/semester names", parameters: { type: "object", properties: { corrected_course: { type: "string" }, corrected_semester: { type: "string" }, subjects: { type: "array", items: { type: "object", properties: { name: { type: "string" }, lessons: { type: "array", items: { type: "string" } } }, required: ["name", "lessons"], additionalProperties: false } } }, required: ["corrected_course", "corrected_semester", "subjects"], additionalProperties: false } } }],
        tool_choice: { type: "function", function: { name: "suggest_subjects" } },
        temperature,
      }),
    });

    if (!response.ok) {
      const errText = await response.text(); console.error("OpenAI error:", response.status, errText);
      if (response.status === 429) return jsonResponse({ error: "Limite de requisições excedido." }, 429);
      return jsonResponse({ error: "Serviço de IA indisponível" }, 502);
    }

    const aiData = await response.json();
    if (userId) await logTokenUsage(supabase, userId, "generate_onboarding", selectedModel, aiData.usage);

    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) { console.error("No tool call:", JSON.stringify(aiData)); return jsonResponse({ error: "Formato inesperado da IA" }, 502); }

    const result = JSON.parse(toolCall.function.arguments);
    return jsonResponse(result);
  } catch (err) {
    console.error("Error:", err);
    return jsonResponse({ error: "Erro interno" }, 500);
  }
});
