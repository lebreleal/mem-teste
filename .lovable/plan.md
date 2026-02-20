

# Migrar OpenAI para Google Gemini (API propria)

## Resumo

Substituir todas as chamadas OpenAI por Google Gemini usando sua propria API key do Google AI Studio. A API do Gemini oferece um endpoint compativel com o formato OpenAI, o que torna a migracao simples -- basta trocar URL, API key e nomes dos modelos.

## Pre-requisito: API Key

Voce precisa de uma API key do Google AI Studio (https://aistudio.google.com/apikeys). Pode ser a mesma conta Google que ja usa. Vamos salvar como secret `GOOGLE_AI_KEY` no Supabase.

## Modelos

```text
Uso atual (OpenAI)          ->  Novo (Gemini)
--------------------------      ---------------------------
gpt-4o-mini (Flash)         ->  gemini-2.5-flash-lite
gpt-4o (Pro)                ->  gemini-2.5-pro
```

## Endpoint compativel OpenAI

O Google oferece um endpoint que aceita o mesmo formato de request/response do OpenAI:

```text
URL:  https://generativelanguage.googleapis.com/v1beta/openai/chat/completions
Auth: Authorization: Bearer <GOOGLE_AI_KEY>
```

Isso significa que streaming, tool calling e o formato de usage/tokens funcionam identicamente -- a migracao e basicamente trocar 3 coisas: URL, API key e nomes de modelo.

## Arquivos a alterar

### 1. Secret nova
- Adicionar `GOOGLE_AI_KEY` com sua key do Google AI Studio

### 2. `supabase/functions/_shared/utils.ts`
- Atualizar `getModelMap()` com modelos Gemini padrao:
  - flash: `gemini-2.5-flash-lite`
  - pro: `gemini-2.5-pro`
- Adicionar helper `getAIConfig()` que retorna URL e API key centralizados

### 3. Edge Functions (8 arquivos) -- mesma mudanca em todos:

Cada function recebe a mesma alteracao mecanica:

```text
// ANTES
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
// ...
headers: { Authorization: `Bearer ${OPENAI_API_KEY}` }

// DEPOIS
const GOOGLE_AI_KEY = Deno.env.get("GOOGLE_AI_KEY");
const AI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
// ...
headers: { Authorization: `Bearer ${GOOGLE_AI_KEY}` }
```

Functions afetadas:
- `ai-chat/index.ts` (streaming)
- `ai-tutor/index.ts` (streaming)
- `generate-deck/index.ts` (JSON response)
- `enhance-card/index.ts` (tool calling)
- `enhance-import/index.ts` (tool calling)
- `grade-exam/index.ts` (JSON response)
- `generate-onboarding/index.ts` (tool calling)
- `organize-import/index.ts` (tool calling)

### 4. `src/hooks/useAIModel.ts`
- Atualizar `backendModel` de `gpt-4o-mini`/`gpt-4o` para `gemini-2.5-flash-lite`/`gemini-2.5-pro`

### 5. `src/components/AIModelSelector.tsx`
- Atualizar descricoes dos modelos (opcional, pode manter)

### 6. TTS (`supabase/functions/tts/index.ts`)
- Nao muda -- ja foi migrado para Google Cloud TTS separadamente

## Nota sobre o organize-import

O `organize-import` usa `gpt-4o` hardcoded (nao usa getModelMap). Sera atualizado para `gemini-2.5-pro`.

## Nota sobre o ai-chat (auth com getClaims)

O `organize-import` usa `getClaims` que esta obsoleto. Sera corrigido para `getUser()` durante a migracao.

## Compatibilidade confirmada

A API OpenAI-compatible do Gemini suporta:
- Streaming SSE (mesmo formato `data: {...}` + `data: [DONE]`)
- Tool calling (mesmo schema `tools` + `tool_choice`)
- Usage tokens no response (`usage.prompt_tokens`, etc.)
- Mensagens system/user/assistant

## Passos de implementacao

1. Pedir sua API key do Google AI Studio e salvar como `GOOGLE_AI_KEY`
2. Atualizar `_shared/utils.ts` com novos modelos padrao
3. Atualizar as 8 edge functions (trocar URL, key, nomes de modelo)
4. Atualizar `useAIModel.ts` no frontend
5. Deploy e teste de todas as functions

