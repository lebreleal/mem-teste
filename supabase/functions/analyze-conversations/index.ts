import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Simple rate limiting (per user, resets on cold start)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(identifier: string, maxRequests: number = 5, windowMs: number = 300000): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(identifier);
  
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(identifier, { count: 1, resetAt: now + windowMs });
    return true;
  }
  
  if (entry.count >= maxRequests) {
    return false;
  }
  
  entry.count++;
  return true;
}

// Validate JWT token and check admin status
async function validateAdminAuth(req: Request): Promise<{ valid: boolean; userId?: string }> {
  const authHeader = req.headers.get("Authorization");
  
  if (!authHeader?.startsWith("Bearer ")) {
    return { valid: false };
  }
  
  const token = authHeader.replace("Bearer ", "");
  
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseKey) {
      return { valid: false };
    }
    
    // Verify token
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "apikey": supabaseKey,
      },
    });
    
    if (!response.ok) {
      return { valid: false };
    }
    
    const user = await response.json();
    
    // Check if user is admin
    const profileResponse = await fetch(
      `${supabaseUrl}/rest/v1/profiles?user_id=eq.${user.id}&select=is_admin`,
      {
        headers: {
          "apikey": supabaseKey,
          "Authorization": `Bearer ${supabaseKey}`,
        },
      }
    );
    
    if (!profileResponse.ok) {
      return { valid: false };
    }
    
    const profiles = await profileResponse.json();
    if (!profiles?.[0]?.is_admin) {
      return { valid: false };
    }
    
    return { valid: true, userId: user.id };
  } catch {
    return { valid: false };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Require admin authentication (this is an expensive operation)
  const auth = await validateAdminAuth(req);
  if (!auth.valid) {
    console.error("Unauthorized analyze-conversations request - admin auth required");
    return new Response(
      JSON.stringify({ error: "Unauthorized - admin authentication required" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Strict rate limiting (5 analyses per 5 minutes - expensive AI operation)
  if (!checkRateLimit(auth.userId!, 5, 300000)) {
    console.warn(`Rate limit exceeded for analyze-conversations: ${auth.userId}`);
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded. This is an expensive operation. Please wait before analyzing again." }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get last 50 conversations
    const { data: conversas, error: conversasError } = await supabase
      .from("conversas")
      .select(`
        id,
        texto,
        remetente,
        agente_usado,
        confianca_resposta,
        created_at,
        cliente:clientes(nome, lead_score, stage)
      `)
      .order("created_at", { ascending: false })
      .limit(50);

    if (conversasError) {
      console.error("Error fetching conversations:", conversasError);
      throw conversasError;
    }

    if (!conversas || conversas.length === 0) {
      return new Response(
        JSON.stringify({ message: "No conversations to analyze" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Prepare conversation summary for AI analysis
    const conversationSummary = conversas.map(c => {
      const clienteData = c.cliente as unknown as { nome: string; lead_score: number; stage: string } | null;
      return {
        texto: c.texto,
        remetente: c.remetente,
        agente: c.agente_usado,
        confianca: c.confianca_resposta,
        cliente_stage: clienteData?.stage,
        lead_score: clienteData?.lead_score,
      };
    });

    // Analyze with AI
    const analysisResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Você é um analista de conversas de vendas de painéis LED. Analise as conversas e identifique:
1. Gaps de conhecimento: perguntas que o bot não soube responder bem (confiança baixa)
2. Objeções frequentes: reclamações ou hesitações comuns dos clientes
3. Padrões de sucesso: frases ou abordagens que levaram a conversões
4. Novas respostas: sugestões de respostas melhores para perguntas comuns

Retorne um JSON com a estrutura:
{
  "sugestoes": [
    {
      "tipo": "gap_conhecimento" | "objecao_frequente" | "padrao_sucesso" | "nova_resposta",
      "descricao": "descrição curta do problema/oportunidade",
      "sugestao_texto": "sugestão detalhada de como resolver/aproveitar"
    }
  ]
}`
          },
          {
            role: "user",
            content: `Analise estas ${conversas.length} conversas recentes:\n\n${JSON.stringify(conversationSummary, null, 2)}`
          }
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!analysisResponse.ok) {
      const errorText = await analysisResponse.text();
      console.error("AI analysis error:", errorText);
      throw new Error(`Failed to analyze: ${analysisResponse.status}`);
    }

    const analysisData = await analysisResponse.json();
    const content = analysisData.choices[0].message.content;
    
    let analysis;
    try {
      analysis = JSON.parse(content);
    } catch {
      console.error("Failed to parse AI response:", content);
      throw new Error("Invalid AI response format");
    }

    // Save suggestions to database
    const sugestoes = analysis.sugestoes || [];
    let insertedCount = 0;

    for (const sugestao of sugestoes) {
      const { error: insertError } = await supabase
        .from("sugestoes_melhoria")
        .insert({
          tipo: sugestao.tipo,
          descricao: sugestao.descricao,
          sugestao_texto: sugestao.sugestao_texto,
          fonte_conversa_id: conversas[0]?.id || null,
          status: "pendente",
        });

      if (!insertError) {
        insertedCount++;
      } else {
        console.error("Error inserting suggestion:", insertError);
      }
    }

    console.log(`Analysis complete: ${insertedCount} suggestions created`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        analyzed: conversas.length,
        suggestions_created: insertedCount 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in analyze-conversations:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
