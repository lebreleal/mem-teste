
# Otimizacoes de Performance

## Impacto Real vs. Esforco

### 1. Lazy Loading de Rotas (Alto impacto, baixo esforco)
Atualmente todas as 20+ paginas sao importadas de forma sincrona no `App.tsx`, o que significa que o bundle inicial carrega TODO o codigo da aplicacao mesmo que o usuario so visite o Dashboard.

**Mudanca**: Usar `React.lazy()` + `Suspense` para carregar paginas sob demanda. Isso pode reduzir o bundle inicial em 40-60%.

### 2. QueryClient com defaults otimizados (Medio impacto, baixo esforco)
O `QueryClient` esta criado sem nenhuma configuracao de cache. Cada navegacao entre paginas refaz todas as queries.

**Mudanca**: Configurar `staleTime` e `gcTime` globais para evitar re-fetches desnecessarios:
- `staleTime: 30_000` (30s) para dados gerais
- `gcTime: 5 * 60_000` (5min) para manter cache em memoria

### 3. fetchStudyQueue - Reducao de queries (Alto impacto, medio esforco)
A funcao `fetchStudyQueue` faz **5 queries sequenciais** ao Supabase:
1. Busca todos os decks do usuario
2. (Se folder) Busca todas as folders
3. Busca cards filtrados
4. Busca IDs de cards no escopo de limite
5. Busca logs de hoje
6. Busca logs anteriores

**Mudanca**: Combinar as queries 4-6 em uma unica RPC no banco que retorna os contadores ja calculados, similar ao `get_all_user_deck_stats` que ja existe.

### 4. reorderDecks - Batch update (Medio impacto, baixo esforco)
A funcao `reorderDecks` faz N queries individuais (uma por deck) em um loop `for`. Para 20 decks = 20 round-trips ao Supabase.

**Mudanca**: Criar uma RPC `batch_reorder_decks` que recebe o array de IDs ordenados e faz tudo em uma unica transacao no banco.

### 5. Dashboard - memoizacao de callbacks (Baixo-medio impacto, baixo esforco)
O componente `Dashboard.tsx` cria muitos handlers inline que causam re-renders desnecessarios nos componentes filhos (`DeckList`, `DashboardActions`).

**Mudanca**: Envolver handlers criticos com `useCallback` para evitar re-renders em cascata.

### 6. fetchDecksWithStats - Paralelizar queries (Medio impacto, baixo esforco)
Atualmente as 3 queries (decks, stats RPC, author lookup) sao feitas sequencialmente. A query de stats e a de decks podem rodar em paralelo.

**Mudanca**: Usar `Promise.all` para rodar as queries de decks e stats simultaneamente.

---

## Detalhes Tecnicos

### Arquivo: `src/App.tsx`
- Substituir imports diretos por `React.lazy()`
- Adicionar `Suspense` com fallback de loading
- Paginas raramente acessadas (Admin, ExamCreate, Feedback) se beneficiam mais

### Arquivo: `src/services/deckService.ts`
- `fetchDecksWithStats`: Paralelizar com `Promise.all([deckQuery, statsRPC])`
- `reorderDecks`: Nova RPC `batch_reorder_decks(p_deck_ids uuid[])`

### Arquivo: `src/services/studyService.ts`
- Nova RPC `get_study_queue_limits(p_user_id, p_deck_ids)` que retorna `new_reviewed_today` e `review_reviewed_today` em uma unica query
- Reduz de 3 queries para 1 na montagem do study queue

### Arquivo: `src/App.tsx` (QueryClient)
```text
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
    },
  },
});
```

### Migracao SQL
- `batch_reorder_decks(p_deck_ids uuid[])` - atualiza sort_order em batch
- `get_study_queue_limits(p_user_id uuid, p_card_ids uuid[])` - retorna contadores de limites diarios

---

## Ordem de Implementacao
1. QueryClient defaults (mais rapido de implementar, impacto imediato)
2. Lazy loading de rotas (reducao do bundle inicial)
3. Paralelizar `fetchDecksWithStats` com `Promise.all`
4. RPC `batch_reorder_decks` (eliminar N round-trips)
5. RPC `get_study_queue_limits` (otimizar study queue)
6. Memoizacao de callbacks no Dashboard
