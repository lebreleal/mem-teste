import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Simple rate limiting (per identifier, resets on cold start)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(identifier: string, maxRequests: number = 10, windowMs: number = 300000): boolean {
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
  code: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { whatsapp, code }: RequestBody = await req.json();

    console.log('Verify code request:', { whatsapp, codeLength: code?.length });

    if (!whatsapp || !code) {
      return new Response(
        JSON.stringify({ error: 'WhatsApp e codigo sao obrigatorios' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Validate code format (6 digits)
    if (!/^\d{6}$/.test(code)) {
      return new Response(
        JSON.stringify({ error: 'Codigo deve ter 6 digitos' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Rate limiting by phone number (10 attempts per 5 minutes to prevent brute force)
    const cleanWhatsapp = whatsapp.replace(/\D/g, '');
    if (!checkRateLimit(cleanWhatsapp, 10, 300000)) {
      console.warn(`Rate limit exceeded for code verification: ${cleanWhatsapp}`);
      return new Response(
        JSON.stringify({ error: 'Muitas tentativas. Aguarde alguns minutos.' }),
        {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Also rate limit by IP
    const clientIP = req.headers.get("x-forwarded-for") || "unknown";
    if (!checkRateLimit(`ip:${clientIP}`, 20, 300000)) {
      console.warn(`IP rate limit exceeded for verify-code: ${clientIP}`);
      return new Response(
        JSON.stringify({ error: 'Muitas tentativas. Aguarde alguns minutos.' }),
        {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    const verificationResponse = await fetch(
      `${supabaseUrl}/rest/v1/verification_codes?identifier=eq.${encodeURIComponent(cleanWhatsapp)}&code=eq.${code}&used=eq.false&expires_at=gte.${new Date().toISOString()}&order=created_at.desc&limit=1`,
      {
        headers: {
          'apikey': supabaseKey!,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );

    const verificationData = await verificationResponse.json();

    if (!verificationData || verificationData.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Codigo invalido ou expirado' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const verificationId = verificationData[0].id;

    await fetch(`${supabaseUrl}/rest/v1/verification_codes?id=eq.${verificationId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey!,
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ used: true }),
    });

    const profileResponse = await fetch(
      `${supabaseUrl}/rest/v1/user_profiles?whatsapp=eq.${encodeURIComponent(cleanWhatsapp)}&limit=1`,
      {
        headers: {
          'apikey': supabaseKey!,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );

    const profileData = await profileResponse.json();

    if (profileData && profileData.length > 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          user_id: profileData[0].id,
          profile: profileData[0],
          is_new_user: false
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const newProfileResponse = await fetch(
      `${supabaseUrl}/rest/v1/user_profiles`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey!,
          'Authorization': `Bearer ${supabaseKey}`,
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({
          whatsapp: cleanWhatsapp,
          name: null,
          document: null,
          city: null,
          state: null,
          email: null,
          cpf_cnpj: null,
          is_admin: false,
        }),
      }
    );

    const newProfile = await newProfileResponse.json();

    if (!newProfileResponse.ok) {
      console.error('Error creating profile:', newProfile);
      return new Response(
        JSON.stringify({ error: 'Erro ao criar perfil' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        user_id: newProfile[0].id,
        profile: newProfile[0],
        is_new_user: true
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: 'Erro ao verificar codigo' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
