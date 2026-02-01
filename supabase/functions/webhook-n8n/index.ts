import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

// Webhook secret validation
function validateWebhookSecret(req: Request): boolean {
  const expectedSecret = Deno.env.get("N8N_WEBHOOK_SECRET");
  
  // If no secret is configured, reject all requests for safety
  if (!expectedSecret) {
    console.warn("N8N_WEBHOOK_SECRET not configured - rejecting webhook request");
    return false;
  }
  
  const providedSecret = req.headers.get("x-webhook-secret");
  return providedSecret === expectedSecret;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Validate webhook secret
  if (!validateWebhookSecret(req)) {
    console.error("Unauthorized webhook request - invalid or missing secret");
    return new Response(
      JSON.stringify({ error: "Unauthorized - invalid webhook secret" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const payload = await req.json();
    console.log("Received webhook payload:", JSON.stringify(payload));

    const {
      telefone,
      nome,
      email,
      mensagem,
      resposta,
      agente_usado,
      confianca,
      client_state,
      lead_score,
      stage,
    } = payload;

    if (!telefone) {
      return new Response(
        JSON.stringify({ error: "telefone is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Upsert client
    const { data: cliente, error: clienteError } = await supabase
      .from("clientes")
      .upsert(
        {
          telefone,
          nome: nome || null,
          email: email || null,
          client_state: client_state || {},
          lead_score: lead_score || 10,
          stage: stage || "greeting",
        },
        { onConflict: "telefone" }
      )
      .select()
      .single();

    if (clienteError) {
      console.error("Error upserting client:", clienteError);
      throw clienteError;
    }

    console.log("Client upserted:", cliente.id);

    // Save user message if provided
    if (mensagem) {
      const { error: msgError } = await supabase
        .from("conversas")
        .insert({
          cliente_id: cliente.id,
          remetente: "user",
          texto: mensagem,
        });

      if (msgError) {
        console.error("Error saving user message:", msgError);
      }
    }

    // Save bot response if provided
    if (resposta) {
      const { error: respError } = await supabase
        .from("conversas")
        .insert({
          cliente_id: cliente.id,
          remetente: "bot",
          texto: resposta,
          agente_usado: agente_usado || null,
          confianca_resposta: confianca || null,
        });

      if (respError) {
        console.error("Error saving bot response:", respError);
      }
    }

    // Update daily metrics
    const today = new Date().toISOString().split("T")[0];
    const { data: existingMetric } = await supabase
      .from("metricas")
      .select()
      .eq("data", today)
      .single();

    if (existingMetric) {
      await supabase
        .from("metricas")
        .update({
          total_conversas: existingMetric.total_conversas + 1,
        })
        .eq("data", today);
    } else {
      await supabase
        .from("metricas")
        .insert({
          data: today,
          total_conversas: 1,
        });
    }

    return new Response(
      JSON.stringify({ success: true, cliente_id: cliente.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in webhook-n8n:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
