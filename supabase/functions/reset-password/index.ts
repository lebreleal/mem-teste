import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Simple rate limiting (per identifier, resets on cold start)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(identifier: string, maxRequests: number = 3, windowMs: number = 300000): boolean {
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { email } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: "Email inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Rate limiting by email (3 requests per 5 minutes)
    const normalizedEmail = email.toLowerCase().trim();
    if (!checkRateLimit(normalizedEmail, 3, 300000)) {
      console.warn(`Rate limit exceeded for password reset: ${normalizedEmail}`);
      // Still return success to prevent email enumeration
      return new Response(
        JSON.stringify({ success: true, message: "Se o email existir, você receberá instruções de redefinição." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Also rate limit by IP
    const clientIP = req.headers.get("x-forwarded-for") || "unknown";
    if (!checkRateLimit(`ip:${clientIP}`, 5, 300000)) {
      console.warn(`IP rate limit exceeded for reset-password: ${clientIP}`);
      return new Response(
        JSON.stringify({ success: true, message: "Se o email existir, você receberá instruções de redefinição." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Env vars missing");
      return new Response(
        JSON.stringify({ error: "Configuração do servidor inválida" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Check if user exists (but don't reveal this to the client)
    const { data: users, error: lookupError } = await adminClient.auth.admin.listUsers();

    if (lookupError) {
      console.error("Erro ao listar usuários:", lookupError);
      // Return success to prevent enumeration
      return new Response(
        JSON.stringify({ success: true, message: "Se o email existir, você receberá instruções de redefinição." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userExists = users?.users?.some((user) => user.email?.toLowerCase() === normalizedEmail);

    // Always return success to prevent email enumeration
    // Only actually send reset email if user exists
    if (userExists) {
      const resetResponse = await fetch(`${supabaseUrl}/auth/v1/recover`, {
        method: "POST",
        headers: {
          "apikey": supabaseServiceKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: normalizedEmail,
          redirect_to: `${new URL(req.url).origin}/reset-password`,
        }),
      });

      if (!resetResponse.ok) {
        const errorData = await resetResponse.text();
        console.error("Erro ao enviar reset:", errorData);
        // Still return success to prevent enumeration
      }
    }

    // Always return the same response regardless of whether user exists
    return new Response(
      JSON.stringify({ success: true, message: "Se o email existir, você receberá instruções de redefinição." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Erro na função:", error);
    return new Response(
      JSON.stringify({ error: "Erro ao processar solicitação" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
