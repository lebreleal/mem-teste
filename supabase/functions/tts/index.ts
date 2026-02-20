import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { handleCors, jsonResponse, logTokenUsage } from "../_shared/utils.ts";

const GOOGLE_CLOUD_TTS_KEY = Deno.env.get("GOOGLE_CLOUD_TTS_KEY");

/** Simple language detection: returns 'pt-BR' if text looks Portuguese, else 'en-US' */
function detectLanguage(text: string): "pt-BR" | "en-US" {
  const ptPatterns = /[áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ]|(\b(que|não|como|para|com|uma|seu|sua|está|são|isso|este|esta|pelo|pela|nos|nas|dos|das|também|então|porque|porém|além|aqui|onde|quando|muito|mais|menos|sobre|entre|cada|todo|toda)\b)/gi;
  const matches = text.match(ptPatterns);
  const ratio = (matches?.length || 0) / Math.max(text.split(/\s+/).length, 1);
  return ratio > 0.08 ? "pt-BR" : "en-US";
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

    if (!GOOGLE_CLOUD_TTS_KEY) {
      return jsonResponse({ error: "GOOGLE_CLOUD_TTS_KEY not configured" }, 500);
    }

    // Limit text length to avoid excessive costs
    const trimmed = text.slice(0, 4096);

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

    // Detect language and pick voice
    const lang = detectLanguage(trimmed);
    const voiceName = voice || (lang === "pt-BR" ? "pt-BR-Neural2-A" : "en-US-Neural2-J");

    // Call Google Cloud Text-to-Speech API
    const googleTtsUrl = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_CLOUD_TTS_KEY}`;

    const response = await fetch(googleTtsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text: trimmed },
        voice: {
          languageCode: lang,
          name: voiceName,
        },
        audioConfig: {
          audioEncoding: "MP3",
          speakingRate: 1.0,
          pitch: 0,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Google TTS error:", response.status, errText);
      return jsonResponse({ error: "TTS generation failed", detail: errText }, 500);
    }

    const result = await response.json();
    const audioContent = result.audioContent; // base64 encoded

    if (!audioContent) {
      console.error("Google TTS: no audioContent in response");
      return jsonResponse({ error: "TTS returned no audio" }, 500);
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
