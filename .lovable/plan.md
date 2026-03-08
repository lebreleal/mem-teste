

## Bugs no histórico de uso de IA

### Bug 1 (CRÍTICO): `generate-deck` NUNCA loga tokens quando chamado pelo fluxo de criação de deck

O cliente passa `skipLog: true` (linha 363 de `useAIDeckFlow.ts`) para evitar logs duplicados por batch. O comentário na linha 399 diz "Server already logs token usage per batch" — mas isso é FALSO. O servidor só loga quando `skipLog` é `false`. O código que fazia log agregado no cliente foi removido. Resultado: **zero registros em `ai_token_usage` para geração de decks**.

**Correção**: Remover `skipLog: true` do cliente. Cada batch será logado individualmente pelo servidor (que é o comportamento correto — 1 registro por chamada à API).

**Arquivos**: 
- `src/components/ai-deck/useAIDeckFlow.ts` — remover `skipLog: true` (linha 363)
- `src/services/aiService.ts` — remover parâmetro `skipLog` do tipo e da chamada
- `supabase/functions/generate-deck/index.ts` — remover toda lógica de `skipLog`, sempre logar

### Bug 2: `auto-tag-cards` não loga uso de tokens

A edge function faz chamadas à API de IA mas não chama `logTokenUsage`. Uso de IA para tagging não aparece no histórico.

**Correção**: Importar e chamar `logTokenUsage` após a resposta da API.

**Arquivo**: `supabase/functions/auto-tag-cards/index.ts`

### Bug 3: `suggest-tags` não loga uso de tokens

Mesma situação — faz chamada à API de IA sem registrar uso.

**Correção**: Importar e chamar `logTokenUsage` após a resposta da API.

**Arquivo**: `supabase/functions/suggest-tags/index.ts`

### Bug 4: `ai-tutor` e `ai-chat` usam `streamWithUsageCapture` (OK)

Estes já logam corretamente via `streamWithUsageCapture`. Sem correção necessária.

### Bug 5: `enhance-card`, `enhance-import`, `grade-exam`, `generate-onboarding`, `organize-import` (OK)

Todos chamam `logTokenUsage` diretamente. Sem correção necessária.

---

## Plano de correção

### 1. Remover `skipLog` completamente
- `useAIDeckFlow.ts`: remover `skipLog: true` da chamada
- `aiService.ts`: remover `skipLog` do tipo `GenerateDeckParams` e do body
- `generate-deck/index.ts`: remover `skipLog` do destructuring, remover todos os `if (!skipLog)` — sempre logar

### 2. Adicionar logging em `auto-tag-cards`
- Importar `logTokenUsage` de `../_shared/utils.ts`
- Após cada chamada à API de IA, chamar `logTokenUsage(supabase, userId, "auto_tag_cards", model, usage, 0)`

### 3. Adicionar logging em `suggest-tags`
- Importar `logTokenUsage` de `../_shared/utils.ts`
- Após a chamada à API, chamar `logTokenUsage(supabase, userId, "suggest_tags", model, usage, 0)`

### Arquivos a editar:
- `src/components/ai-deck/useAIDeckFlow.ts` — remover skipLog
- `src/services/aiService.ts` — remover skipLog do tipo
- `supabase/functions/generate-deck/index.ts` — remover skipLog, sempre logar
- `supabase/functions/auto-tag-cards/index.ts` — adicionar logTokenUsage
- `supabase/functions/suggest-tags/index.ts` — adicionar logTokenUsage

