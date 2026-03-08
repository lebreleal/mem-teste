

# Analise do Dashboard: Requisições e Oportunidades de Otimização

## Mapa de Requisições Atual

Ao carregar o Dashboard, o seguinte conjunto de queries e RPCs é disparado:

```text
Hook/Service                 | Query Key                    | Tipo           | Custo
-----------------------------|------------------------------|----------------|--------
useDecks                     | ['decks', userId]            | SELECT decks   | 1 query
  └─ fetchDecksWithStats     |                              | RPC stats      | 1 RPC
  └─ (marketplace_listings)  |                              | SELECT         | 0-2 queries
useFolders                   | ['folders', userId]          | SELECT folders | 1 query
useProfile                   | ['profile', userId]          | SELECT profile | 1 query
useSubscription              | ['subscription-status']      | Edge Function  | 1 HTTP
useStudyStats                | ['study-stats', userId]      | RPC stats      | 1 RPC
useMissions                  | ['missions', userId]         | 2 queries      | 2 queries
  └─ missionService          |                              | +5 queries     | 5 queries (profile duplicado!)
useIsAdmin                   | (useState/useEffect)         | SELECT roles   | 1 query
useStudyPlan                 |                              |                |
  ├─ ['study-plans']         |                              | SELECT         | 1 query
  ├─ ['deck-hierarchy']      |                              | SELECT decks   | 1 query (DUPLICADO!)
  ├─ ['avg-seconds-per-card']|                              | RPC            | 1 RPC
  ├─ ['plan-metrics']        |                              | RPC            | 1 RPC
  ├─ ['per-deck-new-counts'] |                              | cache/fallback | 0-1 RPC
  ├─ ['plan-retention']      |                              | SELECT decks   | 1 query
  ├─ ['plan-health']         |                              | SELECT logs    | 1 query
  └─ ['plan-forecast']       |                              | SELECT cards   | 1 query
pendingUpdatesQuery          | ['community-deck-updates']   | RPC            | 0-1 RPC
─────────────────────────────────────────────────────────────────────────────────
TOTAL ESTIMADO:              |                              |                | ~20-24 requisições
```

## Problemas Identificados

### 1. `useStudyPlan` dispara 7 queries independentes no Dashboard -- mas o Dashboard usa apenas 4 campos

O Dashboard importa `useStudyPlan()` e consome **apenas**: `plans`, `allDeckIds`, `avgSecondsPerCard`, `metrics`, `globalCapacity`. Mas o hook dispara `planHealthQuery`, `forecastQuery`, `retentionQuery` que **nunca são usados no Dashboard** -- eles servem somente para a page `/plano`.

**Impacto**: 3 queries desperdicadas no Dashboard (plan-health, plan-forecast, plan-retention).

### 2. `['deck-hierarchy']` duplica dados de `['decks']`

`useStudyPlan` faz `SELECT id, parent_deck_id FROM decks` separadamente. Esses mesmos dados já existem no cache `['decks', userId]` populado por `useDecks`. Busca redundante.

**Impacto**: 1 query desnecessaria.

### 3. `missionService.fetchMissions()` faz 5 queries paralelas incluindo profile duplicado

Linha 49-54: busca `profiles.daily_cards_studied` diretamente, ignorando o cache `useProfile`. Tambem busca `decks count`, `review_logs count`, `deck_suggestions count` x2.

**Impacto**: 5 queries, das quais 1 (profile) e 1 (deck count) poderiam vir do cache.

### 4. `useIsAdmin` usa useState+useEffect em vez de useQuery

Não compartilha cache, não tem staleTime, re-executa em cada mount do Dashboard.

**Impacto**: 1 query sem cache.

### 5. `useSubscription` chama Edge Function a cada 60s

`refetchInterval: 60_000` faz polling contínuo. Para a maioria dos usuarios não-premium, isso é desperdício.

**Impacto**: 1 Edge Function call por minuto enquanto o Dashboard está aberto.

### 6. `getRawAggregateStats` em useDashboardState é O(n²)

A versão no `useDashboardState` (linha 179-193) usa recursão sem cache, ao contrário do `DeckCarousel` que tem `buildAggregateMap` com memoização. Cada chamada a `getAggregateStats` re-percorre toda a árvore.

### 7. Supabase Realtime channel para profile

O `useProfile` abre um canal Realtime permanente. Isso é bom para sincronização, mas adiciona 1 WebSocket subscription constante.

---

## Plano de Otimização

### Fase A: Eliminar queries do Dashboard que pertencem a /plano (economia: -3 queries)

Dividir `useStudyPlan` em dois hooks:
- **`useStudyPlanCore`**: retorna apenas `plans`, `allDeckIds`, `avgSecondsPerCard`, `metrics`, `globalCapacity` -- sem `forecastQuery`, `planHealthQuery`, `retentionQuery`.
- **`useStudyPlanFull`**: usado apenas em `/plano`, chama `useStudyPlanCore` + as 3 queries extras.

O Dashboard passa a chamar `useStudyPlanCore`.

### Fase B: Eliminar deck-hierarchy duplicado (economia: -1 query)

No `useStudyPlanCore`, em vez de fazer `SELECT id, parent_deck_id FROM decks`, ler do cache `['decks', userId]` (já populado por `useDecks`):
```typescript
const cachedDecks = qc.getQueryData<DeckWithStats[]>(['decks', userId]);
const hierarchy = cachedDecks?.map(d => ({ id: d.id, parent_deck_id: d.parent_deck_id })) ?? [];
```

### Fase C: Missões com cache (economia: -2 queries)

Refatorar `missionService.fetchMissions` para aceitar `dailyCardsStudied` e `deckCount` como parâmetros opcionais (vindos do cache de `useProfile` e `useDecks`), evitando re-buscar profile e deck count.

### Fase D: useIsAdmin com useQuery (economia: cache compartilhado)

Converter para `useQuery` com `staleTime: 10 * 60_000` para não re-buscar a cada mount.

### Fase E: Subscription polling inteligente (economia: -N edge function calls)

Mudar `refetchInterval` para `5 * 60_000` (5min) em vez de 60s. Manter `refetchOnWindowFocus: true` para garantir atualização quando o usuario volta.

### Fase F: Memoizar getRawAggregateStats no useDashboardState

Reutilizar o padrão `buildAggregateMap` do `DeckCarousel` no `useDashboardState`, criando o map uma vez via `useMemo` e fazendo lookup O(1).

---

## Resumo de Impacto

```text
Otimização                          | Queries Antes | Depois | Economia
------------------------------------|---------------|--------|----------
useStudyPlan split (A)              | 7             | 4      | -3
deck-hierarchy cache (B)            | 1             | 0      | -1
Missões com cache (C)               | 7             | 5      | -2
useIsAdmin com useQuery (D)         | 1 (sem cache) | 1 (cached) | cache
Subscription polling 5min (E)       | 1/min         | 1/5min | -80%
AggregateStats memoizado (F)        | O(n²)         | O(n)   | CPU
─────────────────────────────────────────────────────────────────────
TOTAL Dashboard load                | ~20-24        | ~14-16 | -6 a -8 req
```

