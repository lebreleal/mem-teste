import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, handleCors, jsonResponse } from "../_shared/utils.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { sample } = await req.json();
    if (!sample || typeof sample !== "string") {
      return jsonResponse({ error: "No sample text provided" }, 400);
    }
    if (!LOVABLE_API_KEY) {
      return jsonResponse({ error: "LOVABLE_API_KEY not configured" }, 500);
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: `You are a data format analyzer. You analyze text samples to detect the delimiter pattern used for flashcard data.
The text contains flashcard pairs (front and back of cards). Determine:
1. fieldSep: the separator between front and back fields ("tab", "comma", "semicolon", or the actual custom character)
2. cardSep: the separator between cards ("newline", "double_newline", "semicolon", or the actual custom pattern)
3. confidence: "high", "medium", or "low"

Common patterns:
- CSV: comma separates fields, newline separates cards
- TSV: tab separates fields, newline separates cards
- Custom: various separators like |, ;, ::, etc.`,
          },
          {
            role: "user",
            content: `Analyze this sample and detect the delimiters:\n\n${sample.slice(0, 2000)}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "detect_format",
              description: "Return the detected delimiter format",
              parameters: {
                type: "object",
                properties: {
                  fieldSep: {
                    type: "string",
                    description: "Separator between front and back: 'tab', 'comma', or the actual character",
                  },
                  cardSep: {
                    type: "string",
                    description: "Separator between cards: 'newline', 'double_newline', 'semicolon', or actual pattern",
                  },
                  confidence: {
                    type: "string",
                    enum: ["high", "medium", "low"],
                  },
                  hasHeader: {
                    type: "boolean",
                    description: "Whether the first row looks like a header row",
                  },
                },
                required: ["fieldSep", "cardSep", "confidence"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "detect_format" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return jsonResponse({ error: "Rate limit exceeded" }, 429);
      if (response.status === 402) return jsonResponse({ error: "Credits required" }, 402);
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return jsonResponse({ error: "AI analysis failed" }, 500);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) return jsonResponse({ error: "No result from AI" }, 500);

    const result = JSON.parse(toolCall.function.arguments);
    return jsonResponse(result);
  } catch (e) {
    console.error("detect-import-format error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
