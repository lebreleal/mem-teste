import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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

interface RequestBody {
  whatsapp: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { whatsapp }: RequestBody = await req.json();

    console.log('Send code request for WhatsApp:', whatsapp);

    if (!whatsapp) {
      return new Response(
        JSON.stringify({ error: 'WhatsApp e obrigatorio' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Validate WhatsApp format (basic validation)
    const cleanWhatsapp = whatsapp.replace(/\D/g, '');
    if (cleanWhatsapp.length < 10 || cleanWhatsapp.length > 15) {
      return new Response(
        JSON.stringify({ error: 'Formato de WhatsApp invalido' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Rate limiting by phone number (3 codes per 5 minutes)
    if (!checkRateLimit(cleanWhatsapp, 3, 300000)) {
      console.warn(`Rate limit exceeded for WhatsApp: ${cleanWhatsapp}`);
      return new Response(
        JSON.stringify({ error: 'Muitas tentativas. Aguarde alguns minutos antes de solicitar outro codigo.' }),
        {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Also rate limit by IP
    const clientIP = req.headers.get("x-forwarded-for") || "unknown";
    if (!checkRateLimit(`ip:${clientIP}`, 10, 300000)) {
      console.warn(`IP rate limit exceeded: ${clientIP}`);
      return new Response(
        JSON.stringify({ error: 'Muitas tentativas. Aguarde alguns minutos.' }),
        {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    console.log('Generated code for:', cleanWhatsapp);

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    const dbResponse = await fetch(`${supabaseUrl}/rest/v1/verification_codes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey!,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        identifier: cleanWhatsapp,
        code,
        expires_at: expiresAt.toISOString(),
        used: false,
      }),
    });

    if (!dbResponse.ok) {
      const errorText = await dbResponse.text();
      console.error('Database error:', errorText);
      throw new Error('Failed to save verification code');
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Codigo enviado com sucesso' }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: 'Erro ao enviar codigo' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
