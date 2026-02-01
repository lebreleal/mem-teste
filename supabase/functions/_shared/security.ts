// Shared security utilities for Edge Functions

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, x-webhook-secret",
};

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

// Simple in-memory rate limiting (resets on function cold start)
// For production, use Redis or database-based rate limiting
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  identifier: string,
  maxRequests: number = 10,
  windowMs: number = 60000 // 1 minute
): RateLimitResult {
  const now = Date.now();
  const key = identifier;
  
  const entry = rateLimitStore.get(key);
  
  if (!entry || now > entry.resetAt) {
    // New window
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetAt: new Date(now + windowMs) };
  }
  
  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: new Date(entry.resetAt) };
  }
  
  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count, resetAt: new Date(entry.resetAt) };
}

export function getClientIdentifier(req: Request): string {
  return req.headers.get("x-forwarded-for") || 
         req.headers.get("x-real-ip") || 
         "unknown";
}

export function validateWebhookSecret(req: Request, secretEnvVar: string = "N8N_WEBHOOK_SECRET"): boolean {
  const expectedSecret = Deno.env.get(secretEnvVar);
  
  // If no secret is configured, reject all requests for safety
  if (!expectedSecret) {
    console.warn(`Warning: ${secretEnvVar} not configured - rejecting request`);
    return false;
  }
  
  const providedSecret = req.headers.get("x-webhook-secret");
  return providedSecret === expectedSecret;
}

export function unauthorizedResponse(message: string = "Unauthorized"): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

export function rateLimitedResponse(resetAt: Date): Response {
  return new Response(
    JSON.stringify({ error: "Rate limit exceeded", retry_after: resetAt.toISOString() }),
    { 
      status: 429, 
      headers: { 
        ...corsHeaders, 
        "Content-Type": "application/json",
        "Retry-After": Math.ceil((resetAt.getTime() - Date.now()) / 1000).toString()
      } 
    }
  );
}

// Validate JWT token from Authorization header
export async function validateAuthToken(req: Request): Promise<{ valid: boolean; userId?: string }> {
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
    
    // Verify token with Supabase
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
    return { valid: true, userId: user.id };
  } catch (error) {
    console.error("Token validation error:", error);
    return { valid: false };
  }
}

// Check if user is admin
export async function isUserAdmin(userId: string): Promise<boolean> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseKey) {
      return false;
    }
    
    const response = await fetch(
      `${supabaseUrl}/rest/v1/profiles?user_id=eq.${userId}&select=is_admin`,
      {
        headers: {
          "apikey": supabaseKey,
          "Authorization": `Bearer ${supabaseKey}`,
        },
      }
    );
    
    if (!response.ok) {
      return false;
    }
    
    const profiles = await response.json();
    return profiles?.[0]?.is_admin === true;
  } catch (error) {
    console.error("Admin check error:", error);
    return false;
  }
}
