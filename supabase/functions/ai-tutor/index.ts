import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { handleCors, jsonResponse, getModelMap, deductEnergy, refundEnergy, fetchPromptConfig, getAIConfig, fetchWithRetry, streamWithUsageCapture } from "../_shared/utils.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };

  let energyDeducted = false;
  let deductedCost = 0;
  let supabase: any;
  let userId = "";

  try {
    const body = await req.json();
    const { frontContent, backContent, action, mcOptions, correctIndex, selectedIndex, aiModel, energyCost, type, question, options, correctIndex: qCorrectIndex, userAnswer, concept, deckId } = body;
    const { apiKey: AI_KEY, url: AI_URL } = getAIConfig();
    if (!AI_KEY) return jsonResponse({ error: "GOOGLE_AI_KEY não configurada" }, 500);

    // Support flashcard tutor, question hint/explain, concept extraction, concept card generation, and concept explanation
    const isQuestionMode = type === 'question-hint' || type === 'question-explain';
    const isConceptMode = type === 'question-concepts';
    const isConceptCardMode = type === 'generate-concept-cards';
    const isConceptExplainMode = type === 'explain-concept';
    if (!isQuestionMode && !isConceptMode && !isConceptCardMode && !isConceptExplainMode && !frontContent) return jsonResponse({ error: "frontContent is required" }, 400);

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return jsonResponse({ error: "Não autenticado" }, 401);

    supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return jsonResponse({ error: "Token inválido" }, 401);
    userId = user.id;

    const cost = energyCost || 0;
    if (cost > 0) {
      const ok = await deductEnergy(supabase, userId, cost);
      if (!ok) return jsonResponse({ error: "Créditos IA insuficientes", requiresCredits: true }, 402);
      energyDeducted = true;
      deductedCost = cost;
    }

    const promptConfig = await fetchPromptConfig(supabase, "ai_tutor");
    const MODEL_MAP = await getModelMap(supabase);
    const selectedModel = MODEL_MAP[aiModel || promptConfig?.default_model || "flash"] || "gemini-2.5-flash";

    // ─── Concept Extraction (non-streaming, returns JSON) ───
    if (isConceptMode) {
      const qText = (question || "").replace(/<[^>]*>/g, "").trim();
      const qOpts = (options || []).map((o: string, i: number) => `${String.fromCharCode(65 + i)}) ${o}`).join("\n");

      const cPrompt = `Analise esta questão de múltipla escolha e extraia os CONCEITOS-CHAVE que o aluno precisa dominar para acertá-la.

QUESTÃO: ${qText}

ALTERNATIVAS:
${qOpts}

Retorne APENAS um JSON array de strings com os conceitos (2-5 conceitos). Cada conceito deve ser curto (2-6 palavras) e representar um tópico específico.
Exemplo: ["Princípio da Legalidade", "Art. 37 CF", "Administração Pública Direta"]

Responda SOMENTE o JSON array, sem markdown, sem explicação.`;

      const cResponse = await fetchWithRetry(AI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${AI_KEY}` },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            { role: "system", content: "Você extrai conceitos de questões. Responda APENAS JSON." },
            { role: "user", content: cPrompt },
          ],
          max_tokens: 300,
          temperature: 0.2,
        }),
      });

      if (!cResponse.ok) return jsonResponse({ concepts: [] });

      const cData = await cResponse.json();
      const rawText = cData.choices?.[0]?.message?.content || "[]";
      try {
        const cleaned = rawText.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
        const concepts = JSON.parse(cleaned);
        return jsonResponse({ concepts: Array.isArray(concepts) ? concepts.slice(0, 5) : [] });
      } catch {
        return jsonResponse({ concepts: [] });
      }
    }

    // ─── Concept Card Generation (non-streaming, returns JSON) ───
    if (isConceptCardMode) {
      const conceptName = concept || "";
      if (!conceptName) return jsonResponse({ error: "concept is required" }, 400);

      const gcPrompt = `Crie 2-3 flashcards para ajudar um aluno a DOMINAR este conceito:

CONCEITO: ${conceptName}

Para cada card, forneça:
- front: pergunta clara e direta (pode usar formato Cloze com {{c1::...}} se apropriado)
- back: resposta completa e didática
- card_type: "basic" ou "cloze"

Retorne APENAS um JSON array, sem markdown:
[{"front": "...", "back": "...", "card_type": "basic"}]

Regras:
- Cards devem ser ESPECÍFICOS sobre o conceito
- Responda na mesma língua do conceito
- Frente do card: min 10 palavras para contexto
- Verso: explicação completa com 20-50 palavras`;

      const gcResponse = await fetchWithRetry(AI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${AI_KEY}` },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            { role: "system", content: "Você cria flashcards educacionais. Responda APENAS JSON." },
            { role: "user", content: gcPrompt },
          ],
          max_tokens: 1000,
          temperature: 0.4,
        }),
      });

      if (!gcResponse.ok) {
        if (energyDeducted) await refundEnergy(supabase, userId, deductedCost);
        return jsonResponse({ error: "Serviço de IA indisponível" }, 502);
      }

      const gcData = await gcResponse.json();
      const gcRaw = gcData.choices?.[0]?.message?.content || "[]";
      try {
        const cleaned = gcRaw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
        const cards = JSON.parse(cleaned);
        return jsonResponse({ cards: Array.isArray(cards) ? cards : [] });
      } catch {
        if (energyDeducted) await refundEnergy(supabase, userId, deductedCost);
        return jsonResponse({ cards: [] });
      }
    }

    // ─── Question Hint / Explain (non-streaming, returns JSON) ───
    if (isQuestionMode) {
      const qText = (question || "").replace(/<[^>]*>/g, "").trim();
      const qOpts = (options || []).map((o: string, i: number) => `${String.fromCharCode(65 + i)}) ${o}`).join("\n");
      const qCIdx = qCorrectIndex ?? 0;

      let qPrompt: string;
      let qMax = 600;
      if (type === 'question-hint') {
        qPrompt = `O aluno está resolvendo uma questão de múltipla escolha e pediu uma DICA.\n\nQUESTÃO: ${qText}\n\nALTERNATIVAS:\n${qOpts}\n\nA resposta correta é a alternativa ${String.fromCharCode(65 + qCIdx)}.\n\nDê uma dica que AJUDE o aluno a raciocinar e chegar na resposta correta, mas SEM revelar diretamente qual é a alternativa correta. Use pistas conceituais, elimine caminhos errados de forma sutil, ou dê uma analogia. Máximo 3 frases. Responda na mesma língua da questão.`;
      } else {
        const userIdx = userAnswer !== undefined ? userAnswer : null;
        qPrompt = `O aluno respondeu uma questão de múltipla escolha e quer entender TODAS as alternativas.\n\nQUESTÃO: ${qText}\n\nALTERNATIVAS:\n${qOpts}\n\nA resposta correta é: ${String.fromCharCode(65 + qCIdx)}\n${userIdx !== null ? `O aluno marcou: ${String.fromCharCode(65 + userIdx)}` : ""}\n\nExplique detalhadamente:\n1. Por que a alternativa correta está certa (2-3 frases)\n2. Para CADA alternativa incorreta, explique por que está errada (1-2 frases cada)\n3. Uma dica prática para lembrar\n\nUse Markdown. Responda na mesma língua da questão. Máximo 400 palavras.`;
        qMax = 2000;
      }

      const antiPreamble = `COMECE IMEDIATAMENTE pelo conteúdo. PROIBIDO saudações, elogios ou preâmbulos. Vá direto ao ponto.`;

      const qResponse = await fetchWithRetry(AI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${AI_KEY}` },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            { role: "system", content: antiPreamble },
            { role: "user", content: qPrompt },
          ],
          max_tokens: qMax,
          temperature: 0.4,
        }),
      });

      if (!qResponse.ok) {
        if (energyDeducted) await refundEnergy(supabase, userId, deductedCost);
        return jsonResponse({ error: "Serviço de IA indisponível" }, 502);
      }

      const qData = await qResponse.json();
      const responseText = qData.choices?.[0]?.message?.content || "";
      return jsonResponse({ response: responseText });
    }

    // ─── Flashcard tutor (streaming) ───
    const cleanFront = frontContent.replace(/<[^>]*>/g, "").trim();
    const cleanBack = backContent ? backContent.replace(/<[^>]*>/g, "").trim() : "";
    const temperature = promptConfig?.temperature ?? 0.5;

    let prompt: string;
    let maxTokens = 800;
    if (action === "explain-mc") {
      const optionsList = (mcOptions || []).map((opt: string, i: number) => `${i === correctIndex ? "✅" : "❌"} ${String.fromCharCode(65 + i)}) ${opt}`).join("\n");
      prompt = `O aluno respondeu uma questão de múltipla escolha.\n\nPERGUNTA: ${cleanFront}\n\nALTERNATIVAS:\n${optionsList}\n\nA resposta correta é a alternativa ${String.fromCharCode(65 + (correctIndex ?? 0))}.\n${selectedIndex !== undefined && selectedIndex !== correctIndex ? `O aluno marcou a alternativa ${String.fromCharCode(65 + selectedIndex)}.` : ""}\n\nUse a seguinte estrutura com títulos Markdown (##) e separadores (---) obrigatórios:\n\n## Resposta Correta\nExplique por que a alternativa correta está certa (2-3 frases detalhadas).\n\n---\n\n## Alternativas Incorretas\nPara CADA alternativa incorreta, crie um sub-tópico:\n\n### Alternativa X)\nExplique por que está errada (1-2 frases).\n\n---\n\n## Dica de Estudo\nUma dica prática para lembrar a resposta correta.\n\nResponda na mesma língua da pergunta. Use parágrafos bem separados. NÃO use emojis nos títulos.\n\nSeja direto. Limite cada explicação de alternativa a 1-2 frases. Total máximo: 350 palavras.`;
      maxTokens = 2500;
    } else if (action === "explain") {
      prompt = `O aluno está estudando com flashcards e precisa entender o conceito por trás deste card.\n\nFRENTE DO CARD: ${cleanFront}\nVERSO DO CARD: ${cleanBack}\n\nUse a seguinte estrutura com títulos Markdown (##) e separadores (---) obrigatórios:\n\n## Referência\nInforme a referência acadêmica consultada (1-2 livros ou fontes clássicas da área).\nFormato: "Baseado em: [Nome do livro/autor]"\n\n---\n\n## Explicação\nExplique o conceito de forma didática e completa, como uma aula particular.\n- Use analogias e exemplos práticos\n- Separe em parágrafos distintos\n- Destaque termos-chave em **negrito**\n- Se relevante, use listas para organizar sub-conceitos\n\n---\n\n## Conexão com o Card\nRelacione a explicação diretamente com a pergunta/resposta do card, mostrando como o conceito se aplica.\n\nResponda na mesma língua do card. Use parágrafos bem separados com espaçamento entre seções. NÃO use emojis nos títulos.\n\nSeja objetivo. Limite a explicação a no máximo 400 palavras no total.`;
      maxTokens = 3000;
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
    const dbPrompt = promptConfig?.system_prompt ? `\n\nInstruções adicionais:\n${promptConfig.system_prompt}` : '';
    const systemPrompt = antiPreamblePrompt + dbPrompt;

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
        stream_options: { include_usage: true },
      }),
    });

    if (!response.ok) {
      const errText = await response.text(); console.error("AI error:", response.status, errText);
      if (energyDeducted) await refundEnergy(supabase, userId, deductedCost);
      if (response.status === 429) return jsonResponse({ error: "Limite de requisições excedido." }, 429);
      if (response.status === 403) return jsonResponse({ error: "API do Google AI não ativada." }, 502);
      if (response.status === 503) return jsonResponse({ error: "Modelo sobrecarregado. Tente Flash." }, 503);
      return jsonResponse({ error: "Serviço de IA indisponível" }, 502);
    }

    // Stream started successfully — credits are consumed legitimately
    return streamWithUsageCapture(response, supabase, userId, "ai_tutor", selectedModel, cost);
  } catch (err) {
    console.error("Error:", err);
    if (energyDeducted) await refundEnergy(supabase, userId, deductedCost);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
