import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, handleCors, jsonResponse } from "../_shared/utils.ts";

function detectFormat(sample: string): { fieldSep: string; cardSep: string; confidence: string; hasHeader?: boolean } {
  const lines = sample.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return { fieldSep: "tab", cardSep: "newline", confidence: "low" };

  // Check for double-newline separated cards
  const hasDoubleNewline = /\r?\n\s*\r?\n/.test(sample);

  // Count occurrences of potential delimiters per line
  const delimiters = [
    { name: "tab", char: "\t" },
    { name: "semicolon", char: ";" },
    { name: "comma", char: "," },
    { name: "::", char: "::" },
    { name: "|", char: "|" },
  ];

  // Score each delimiter by consistency across lines
  let bestDelim = { name: "tab", score: 0 };

  for (const d of delimiters) {
    const counts = lines.slice(0, 20).map(l => l.split(d.char).length - 1);
    const nonZero = counts.filter(c => c > 0);
    if (nonZero.length === 0) continue;

    // A good delimiter appears consistently (same count per line) and at least once
    const mode = nonZero.sort((a, b) => a - b)[Math.floor(nonZero.length / 2)];
    const consistent = nonZero.filter(c => c === mode).length;
    const score = (consistent / lines.slice(0, 20).length) * nonZero.length;

    if (score > bestDelim.score) {
      bestDelim = { name: d.name, score };
    }
  }

  // Detect if first line looks like a header
  const firstLine = lines[0];
  const secondLine = lines[1] || "";
  const splitFirst = firstLine.split(bestDelim.name === "tab" ? "\t" : bestDelim.name === "comma" ? "," : bestDelim.name === "semicolon" ? ";" : bestDelim.name === "::" ? "::" : "|");
  const hasHeader = splitFirst.length >= 2 && /^[a-zA-Z\s]+$/.test(splitFirst[0].trim()) && /^[a-zA-Z\s]+$/.test(splitFirst[1].trim());

  const confidence = bestDelim.score > 5 ? "high" : bestDelim.score > 2 ? "medium" : "low";
  const cardSep = hasDoubleNewline ? "double_newline" : "newline";

  return {
    fieldSep: bestDelim.name,
    cardSep,
    confidence,
    hasHeader,
  };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { sample } = await req.json();
    if (!sample || typeof sample !== "string") {
      return jsonResponse({ error: "No sample text provided" }, 400);
    }

    const result = detectFormat(sample.slice(0, 5000));
    return jsonResponse(result);
  } catch (e) {
    console.error("detect-import-format error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
