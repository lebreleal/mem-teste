

# Dashboard: Analise Completa e Plano de Correções

## Problemas Encontrados nos Network Requests (ao vivo)

### CRITICO: 2 Crashes Ativos no Dashboard

1. **`useIsAdmin` crashando**: `observer.getOptimisticResult is not a function` -- a conversao para `useQuery` na rodada anterior causou incompatibilidade. O hook precisa voltar a funcionar sem crash.

2. **`useSubscription` crashando**: `Should have a queue. This is likely a bug in React` -- mesma causa, os hooks estao quebrando em cascata.

Esses crashes fazem o `user_roles` ser chamado **3 vezes** (retry + error recovery) e geram POSTs desnecessarios para `app_error_logs`.

### Otimizacao de Missoes NAO Funcionando

Apesar da refatoracao anterior ter passado `cachedDailyCards`, `cachedTotalCards`, e `cachedDeckCount` como parametros, os network logs mostram que **todas as 5 queries redundantes ainda estao sendo feitas**:

- `profiles?select=daily_cards_studied,successful_cards_counter` -- REDUNDANTE
- `decks?select=id` HEAD count -- REDUNDANTE
- `deck_suggestions` (2 HEAD counts) -- necessarias
- `review_logs` HEAD count -- necessaria

**Causa raiz**: `useMissions` dispara antes de `useProfile` e `useDecks` resolverem. Quando a queryFn roda, `profile?.daily_cards_studied` e `decks?.length` sao `undefined`, fazendo o `missionService` cair no fallback de buscar direto.

### `planDeckOrder` Computado 2 Vezes

Linhas 69 e 82 de `Dashboard.tsx` calculam `plans.flatMap(p => p.deck_ids ?? [])` identicamente.

---

## Plano de Implementacao

### 1. Corrigir crashes do `useIsAdmin` e `useSubscription`

O `useIsAdmin` precisa ser revertido para um formato estavel. Provavel que o parametro `staleTime` ou a estrutura do `useQuery` esteja incompativel com a versao do `@tanstack/react-query` instalada. Vou revisar e garantir compatibilidade.

### 2. Corrigir `useMissions` -- dependencia de cache

Adicionar `enabled: !!user && !!profile && !!decks` para que a query de missoes so dispare quando profile e decks ja estiverem no cache. Isso garante que os valores cached sejam passados e elimina as 2 queries redundantes.

### 3. Remover `planDeckOrder` duplicado no Dashboard.tsx

Usar a mesma variavel `planDeckOrderEarly` (linha 69) no lugar de `planDeckOrder` (linha 82).

### 4. Limpeza de codigo no Dashboard.tsx

- Remover import duplicado de `useEffect` (linhas 9 e 11)
- Consolidar imports no topo do arquivo

---

## Impacto Esperado

```text
Fix                              | Antes          | Depois
---------------------------------|----------------|------------------
useIsAdmin crash                 | 3 queries + 2 POSTs error_logs | 1 query (cached 10min)
useSubscription crash            | crash + retry  | 1 Edge Function (cached 5min)
Missoes cache                    | 7 queries      | 5 queries (-2)
planDeckOrder duplicado          | 2 computacoes  | 1 computacao
TOTAL no Dashboard load          | ~18 req + crashes | ~14 req estavel
```

