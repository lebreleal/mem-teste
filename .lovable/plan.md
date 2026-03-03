

## Plano: Migrar de Gemini para GPT (OpenAI) e Remover TTS

### 1. Migrar backend de Gemini para OpenAI

**Arquivo central: `supabase/functions/_shared/utils.ts`**
- Alterar `getAIConfig()` para usar `OPENAI_API_KEY` e endpoint `https://api.openai.com/v1/chat/completions`
- Alterar `getModelMap()` defaults: `flash` → `gpt-4o-mini`, `pro` → `gpt-4o`

**Edge functions que usam `getAIConfig()` (nenhuma alteração necessária pois já usam a util centralizada):**
- `ai-chat`, `ai-tutor`, `enhance-card`, `enhance-import`, `generate-deck`, `generate-onboarding`, `grade-exam`, `organize-import`

**Edge functions com chamada direta ao Gemini (precisam de alteração):**
- `suggest-tags/index.ts` — hardcoded URL e `GOOGLE_AI_KEY`, model `gemini-2.5-flash`
- `auto-tag-cards/index.ts` — hardcoded URL e `GOOGLE_AI_KEY`, model `gemini-2.5-flash`

Ambas serão atualizadas para usar `OPENAI_API_KEY` e `https://api.openai.com/v1/chat/completions` com modelo `gpt-4o-mini`.

### 2. Atualizar frontend

**`src/hooks/useAIModel.ts`**
- `flash.backendModel` → `gpt-4o-mini`
- `pro.backendModel` → `gpt-4o`

### 3. Remover TTS

**Deletar:**
- `supabase/functions/tts/index.ts` (edge function)
- `src/components/TtsButton.tsx`

**Editar:**
- `src/components/FlashCard.tsx` — remover imports e 3 usos do `<TtsButton>`
- `supabase/config.toml` — remover seção `[functions.tts]`
- `src/pages/AdminIA.tsx` — remover configuração de vozes TTS
- `src/pages/AdminUsers.tsx` — remover pricing entries de TTS dos modelos

### 4. Admin pricing

**`src/pages/AdminUsers.tsx`** — atualizar `MODEL_PRICING` removendo modelos Gemini e adicionando GPT:
- `gpt-4o-mini`, `gpt-4o`, etc.

### Resumo de impacto
- 11 arquivos editados
- 2 arquivos deletados
- 1 edge function removida do deploy
- Todas as chamadas de IA passam a usar OpenAI via `OPENAI_API_KEY` (já existe como secret)

