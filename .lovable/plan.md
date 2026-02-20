

# Fix AI Tutor, TTS, and Chat Issues

## Problems Identified

### 1. AI Tutor still says "Ola! Que otima pergunta..."
**Root cause found:** The `ai_prompts` database table has a custom `system_prompt` for `ai_tutor` that says *"Seja encorajador e positivo"*. The code on line 66 does `const systemPrompt = promptConfig?.system_prompt || antiPreamblePrompt` -- since the DB has a value, the anti-preamble rules are **completely ignored**. The DB prompt literally tells the AI to be encouraging, which causes the greetings.

**Fix:** Merge the anti-preamble rules INTO the prompt, prepending them before whatever is in the DB. The anti-preamble rules should always be enforced regardless of DB configuration.

### 2. AI Tutor response cuts off mid-sentence  
**Root cause:** The `max_tokens` for the default "hint" action is only **400**. Combined with the DB's `temperature: 0.8` (verbose), the model runs out of tokens. Also, the "explain" action uses 2000 tokens which may not be enough for very detailed explanations.

**Fix:** Increase `max_tokens` -- hint to 600, explain to 4000, explain-mc to 2000.

### 3. TTS uses OpenAI API, not Google
**Root cause confirmed:** The `tts/index.ts` function explicitly uses `OPENAI_API_KEY` and calls `https://api.openai.com/v1/audio/speech`. There is a `GOOGLE_CLOUD_TTS_KEY` secret configured but unused by this function.

**Fix:** Rewrite the TTS edge function to use Google Cloud Text-to-Speech API with the existing `GOOGLE_CLOUD_TTS_KEY`, adding automatic language detection (PT-BR vs EN-US) for voice selection.

### 4. Chat IA freezing
**Root cause:** The streaming loop in `StudyChatModal` has a subtle bug -- when `[DONE]` is received inside the inner `while` loop, it only `break`s out of the inner loop, but the outer `while(true)` keeps reading. The stream may hang waiting for more data that never comes. Also missing buffer flush after the loop.

**Fix:** Add a `streamDone` flag (same pattern used in Study.tsx) and flush the buffer after the loop ends.

---

## Technical Plan

### Step 1: Fix AI Tutor system prompt (ai-tutor/index.ts)
- Always prepend anti-preamble rules to whatever system prompt comes from DB
- Change line 66 from `promptConfig?.system_prompt || antiPreamblePrompt` to always include anti-preamble + DB prompt combined
- Increase max_tokens: hint 400 -> 600, explain 2000 -> 4000

### Step 2: Fix Chat streaming (StudyChatModal.tsx)
- Add `streamDone` flag to break outer loop when `[DONE]` is received
- Add buffer flush after the main loop (same pattern as Study.tsx)

### Step 3: Rewrite TTS to use Google Cloud (tts/index.ts)
- Replace OpenAI TTS with Google Cloud Text-to-Speech API
- Use `GOOGLE_CLOUD_TTS_KEY` (already configured)
- Add language detection: if text is primarily Portuguese, use `pt-BR-Neural2-A`; otherwise use `en-US-Neural2-J`
- Return audio/mpeg response

### Step 4: Deploy edge functions
- Deploy `ai-tutor` and `tts`

