/**
 * detect-occlusion — Uses cheap Gemini model to detect text regions in an image.
 * Returns normalized bounding boxes (0-1) for each text region.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors, jsonResponse, getAIConfig } from "../_shared/utils.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const authHeader = req.headers.get("Authorization");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader! } } }
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return jsonResponse({ error: "Não autorizado" }, 401);

    const { imageUrl } = await req.json();
    if (!imageUrl) return jsonResponse({ error: "imageUrl é obrigatório" }, 400);

    const { apiKey, url } = getAIConfig();
    if (!apiKey) return jsonResponse({ error: "AI não configurada" }, 500);

    // Use cheapest Gemini model without thinking
    const model = "gemini-2.0-flash-lite";

    const systemPrompt = `You are an OCR bounding box detector. Given an image, identify ALL text regions (lines, paragraphs, titles, labels).
Return a JSON array of objects, each with normalized coordinates (0 to 1 relative to image dimensions):
{"regions": [{"x": 0.1, "y": 0.05, "w": 0.8, "h": 0.04, "text": "detected text"}]}
- x,y = top-left corner as fraction of image width/height
- w,h = width/height as fraction
- Group nearby text into logical blocks (e.g. a paragraph = one region, a title = one region)
- Return ONLY the JSON, no markdown, no explanation.
- If no text found, return {"regions": []}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: "Detect all text regions in this image and return their bounding boxes." },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
        temperature: 0,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI API error:", errText);
      return jsonResponse({ error: "Erro na API de IA" }, 500);
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    // Parse JSON from response (may have markdown code fences)
    let regions: any[] = [];
    try {
      const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const parsed = JSON.parse(cleaned);
      regions = parsed.regions || parsed || [];
    } catch (e) {
      console.error("Failed to parse AI response:", content);
      return jsonResponse({ regions: [] });
    }

    // Validate and clamp values
    regions = regions.filter((r: any) =>
      typeof r.x === "number" && typeof r.y === "number" &&
      typeof r.w === "number" && typeof r.h === "number" &&
      r.w > 0.01 && r.h > 0.005
    ).map((r: any) => ({
      x: Math.max(0, Math.min(1, r.x)),
      y: Math.max(0, Math.min(1, r.y)),
      w: Math.max(0.01, Math.min(1 - r.x, r.w)),
      h: Math.max(0.005, Math.min(1 - r.y, r.h)),
      text: r.text || "",
    }));

    return jsonResponse({ regions });
  } catch (e: any) {
    console.error("detect-occlusion error:", e);
    return jsonResponse({ error: e.message }, 500);
  }
});
