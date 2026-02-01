import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Simple rate limiting (per user, resets on cold start)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(identifier: string, maxRequests: number = 20, windowMs: number = 60000): boolean {
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

  // Require admin authentication
  const auth = await validateAdminAuth(req);
  if (!auth.valid) {
    console.error("Unauthorized embed-knowledge request - admin auth required");
    return new Response(
      JSON.stringify({ error: "Unauthorized - admin authentication required" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Rate limiting by user
  if (!checkRateLimit(auth.userId!, 20, 60000)) {
    console.warn(`Rate limit exceeded for embed-knowledge: ${auth.userId}`);
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded. Please wait before making more requests." }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const { titulo, conteudo, categoria } = await req.json();
    
    if (!titulo || !conteudo || !categoria) {
      return new Response(
        JSON.stringify({ error: "titulo, conteudo and categoria are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Input validation
    if (titulo.length > 500 || conteudo.length > 50000 || categoria.length > 100) {
      return new Response(
        JSON.stringify({ error: "Input exceeds maximum allowed length" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Generate embedding using Lovable AI
    const embeddingResponse = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: `${titulo}\n\n${conteudo}`,
      }),
    });

    if (!embeddingResponse.ok) {
      const errorText = await embeddingResponse.text();
      console.error("Embedding error:", errorText);
      throw new Error(`Failed to generate embedding: ${embeddingResponse.status}`);
    }

    const embeddingData = await embeddingResponse.json();
    const embedding = embeddingData.data[0].embedding;

    // Save to Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase
      .from("conhecimento_base")
      .insert({
        titulo,
        conteudo,
        categoria,
        embedding,
      })
      .select()
      .single();

    if (error) {
      console.error("Supabase insert error:", error);
      throw error;
    }

    console.log("Knowledge embedded successfully:", data.id);

    return new Response(
      JSON.stringify({ success: true, id: data.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in embed-knowledge:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
