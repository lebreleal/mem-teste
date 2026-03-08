

## Diagnóstico: 2 Bugs na Sessão de Estudo

### Bug 1: Demora para trocar de card após responder

**Causa raiz:** A atualização da fila local acontece DENTRO do `onSuccess` da mutation (após round-trip ao Supabase ~300-800ms) + um `setTimeout` de 150ms adicional. Total: ~500-1000ms de delay visível.

**Fix:** Atualização otimista — mover a lógica de atualização da fila local para ANTES da mutation (imediatamente ao clicar). O DB update continua assíncrono em background. Se falhar, o `onError` reverte.

Fluxo novo:
1. User clica rating → atualiza `localQueue` + `cardKey` + `displayedCard` IMEDIATAMENTE
2. `submitReview.mutate` roda em background
3. `onSuccess`: apenas invalida stats (já faz isso)
4. `onError`: reverte usando `undoSnapshot` automático

### Bug 2: Cards já respondidos reaparecem em nova sessão

**Causa raiz:** O React Query cache com `staleTime: Infinity` retém os dados antigos. Quando o componente Study remonta, o `useEffect` de inicialização (linha 88-94) roda com dados STALE do cache antes do refetch completar, setando `queueInitialized = true` com cards velhos. O refetch chega depois mas é ignorado.

**Fix duplo:**
1. No `Study.tsx`, adicionar `useEffect` de cleanup que faz `queryClient.removeQueries({ queryKey: ['study-queue', ...] })` no unmount
2. Isso garante que ao reentrar, não há cache stale — o fetch é 100% fresco

### Arquivos a editar

**`src/pages/Study.tsx`:**
- `handleRate`: mover `setLocalQueue`, `setCardKey`, `setIsTransitioning(false)` para FORA do `onSuccess`, executando imediatamente antes do `submitReview.mutate`. Manter `submitReview.mutate` apenas para persistir no DB
- Adicionar `useEffect` de cleanup no unmount que remove o cache do study-queue
- No `onSuccess` da mutation: manter apenas a lógica de sibling burying no DB (que depende do result)

**Detalhe da otimização:**
- Para saber se `shouldKeep` (interval_days === 0) sem esperar o resultado, usamos uma heurística local: rating 1 (Again) em card de estado 0/1/3 → sempre fica na sessão. Rating 3/4 em card de estado 0/1 → sempre sai. Para reviews (state 2) + rating 1 → fica (relearning). Rating 2+ em review → sai. Isso cobre 100% dos casos do FSRS/SM2.
- O resultado real do DB apenas confirma e faz ajustes finos (stability/difficulty exatos) que não afetam a decisão de manter/remover.

