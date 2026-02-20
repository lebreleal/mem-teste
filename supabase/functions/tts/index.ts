import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { handleCors, jsonResponse, logTokenUsage } from "../_shared/utils.ts";

const GOOGLE_KEY = Deno.env.get("GOOGLE_CLOUD_TTS_KEY");

/** Simple heuristic to detect Portuguese text */
function isPortuguese(text: string): boolean {
  // Check for Portuguese-specific characters
  if (/[çãõáàâéèêíóòôúü]/i.test(text)) return true;
  // Check for common Portuguese words (case-insensitive, word boundaries)
  const ptWords = /\b(que|como|para|com|não|uma|são|mais|está|isso|também|porque|quando|muito|então|pode|fazer|sobre|ainda|esse|esta|pela|pelo|seus|suas|você|vocês|nós|dele|dela|aqui|onde|toda|cada|qual|quem|entre|após|desde|até|foram|sido|será|seria|temos|nosso|nossa|nossos|nossas)\b/i;
  return ptWords.test(text);
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };

  try {
    const { text, voice } = await req.json();

    if (!text || typeof text !== "string") {
      return jsonResponse({ error: "text is required" }, 400);
    }

    if (!GOOGLE_KEY) {
      return jsonResponse({ error: "GOOGLE_CLOUD_TTS_KEY not configured" }, 500);
    }

    // Limit text length to avoid excessive costs
    const trimmed = text.slice(0, 4096);

    // Detect language and pick voice
    const isPT = isPortuguese(trimmed);
    const languageCode = isPT ? "pt-BR" : "en-US";
    const voiceName = isPT ? "pt-BR-Neural2-A" : "en-US-Neural2-J";

    // Auth (optional – log if authenticated)
    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization") || "";
    if (authHeader.startsWith("Bearer ")) {
      try {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          { global: { headers: { Authorization: authHeader } } }
        );
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          userId = user.id;
          const charCount = trimmed.length;
          await logTokenUsage(supabase, userId, "tts", "google-tts-neural2", {
            prompt_tokens: charCount,
            completion_tokens: 0,
            total_tokens: charCount,
          }, 0);
        }
      } catch {}
    }

    // Call Google Cloud TTS
    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: { text: trimmed },
          voice: { languageCode, name: voiceName },
          audioConfig: {
            audioEncoding: "MP3",
            speakingRate: 1.0,
          },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("Google TTS error:", response.status, errText);
      return jsonResponse({ error: "TTS generation failed" }, 500);
    }

    const data = await response.json();
    const audioContent = data.audioContent;

    if (!audioContent) {
      console.error("Google TTS: no audioContent in response");
      return jsonResponse({ error: "TTS generation failed" }, 500);
    }

    // Decode base64 to binary
    const binaryString = atob(audioContent);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    return new Response(bytes, {
      headers: {
        ...corsHeaders,
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (e) {
    console.error("TTS error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
