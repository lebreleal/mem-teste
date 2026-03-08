

## Deep Dashboard Analysis: Bugs, Performance & Architecture

### BUG CRITICO ENCONTRADO: `get_study_stats_summary` RPC quebrada

**Erro real nos network logs:**
```
Status: 404
"operator does not exist: date = text"
```

**Causa raiz:** Na linha 43 da migration, o código compara `v_profile.last_study_reset_date` (tipo `text` no banco) com `v_today::text`, mas o PostgreSQL interpreta `v_today` como `date` e `last_study_reset_date` como `text`, causando um conflito de tipo na comparação. Isso faz com que **TODA a RPC falhe**, retornando 404.

**Consequência direta:**
- O `useStudyStats` falha silenciosamente → streak mostra **0** no Dashboard (o "foginho" que o usuário reportou)
- A `ActivityView` usa um RPC diferente (`get_activity_daily_breakdown`) que **funciona** → mostra valores corretos
- Isso explica exatamente o bug: "foginho conta como 0 mas o relatório de atividade mostra outro valor"

**Correção:** Substituir `v_profile.last_study_reset_date = v_today::text` por cast explícito: `v_profile.last_study_reset_date = v_today::text` não deveria falhar, mas o problema real é que o `last_study_reset_date` pode ser armazenado como tipo `date` no schema e comparado com `text`. A fix é usar cast: `v_profile.last_study_reset_date::text = v_today::text`.

---

### Análise de Performance do Dashboard

#### Requisições na carga do Dashboard (atualmente ~8-12)

```text
1. GET profiles (useProfile)
2. GET decks + RPC get_all_user_deck_stats (useDecks - paralelo)
3. GET marketplace_listings + profiles (author lookup no fetchDecksWithStats)
4. RPC get_study_stats_summary (useStudyStats - FALHANDO)
5. GET study_plans (useStudyPlan)
6. RPC get_avg_seconds_per_card (useStudyPlan)
7. RPC get_plan_metrics (useStudyPlan)
8. RPC get_forecast_params (useStudyPlan)
9. GET folders (useFolders)
10. GET turma_decks (pendingUpdatesQuery em useDashboardState)
11. GET decks + cards (pendingUpdatesQuery - 2nd round)
12. Realtime subscription (profile channel)
```

#### Problemas identificados:

**A. useDecks chama `fetchDecksWithStats` sem staleTime**
- Linha 13-17 de `useDecks.ts`: sem `staleTime` → refetch em cada re-render/focus
- `fetchDecksWithStats` faz 3 queries sequenciais (decks paginado + RPC stats + marketplace lookup)
- Cada mutation (create, delete, move, archive) invalida `['decks']` causando refetch completo

**B. `useStudyPlan` faz 3 RPCs separadas**
- `get_avg_seconds_per_card`, `get_plan_metrics`, `get_forecast_params` — poderiam ser 1 RPC consolidada
- `get_forecast_params` é a mais pesada (~50 subqueries internas)

**C. `useDashboardState` tem query redundante de community updates**
- `pendingUpdatesQuery` faz 3 queries sequenciais (turma_decks → decks → cards)
- Deveria ser uma única RPC

**D. Dashboard.tsx chama `useDecks()` DUAS vezes**
- Linha 14: `const { decks: allDecks } = useDecks()` no Dashboard
- Linha 72: `useDashboardState()` internamente chama `useDecks()` novamente
- Embora React Query dedup, os hooks rodam lógica desnecessária

**E. `DeckCarousel` recalcula `getRootId` em 3 useMemos separados**
- Linhas 167-178, 206-215: mesma lógica de `getRootId` duplicada

**F. `getAggregateRaw` é O(n²) recursivo**
- Chamado para CADA deck no carousel e na DeckList
- Para 100 decks com sub-decks, executa milhares de `.filter()` por render

---

### Plano de Implementação

#### 1. Fix crítico: Corrigir RPC `get_study_stats_summary`
- Nova migration com cast explícito: `v_profile.last_study_reset_date::text = v_today::text`
- Isso resolve imediatamente o streak=0 no Dashboard

#### 2. Consolidar RPCs do Study Plan
- Criar `get_study_plan_data(p_user_id)` que retorna avg_seconds, metrics e forecast em um único JSON
- Reduz 3 RPCs → 1

#### 3. Consolidar query de community updates
- Criar `get_community_deck_updates(p_user_id, p_source_turma_deck_ids uuid[])` que retorna os IDs com updates pendentes
- Reduz 3 queries sequenciais → 1 RPC

#### 4. Otimizar useDecks
- Adicionar `staleTime: 2 * 60_000` (2 min)
- Usar optimistic updates para create/move/archive em vez de invalidação completa

#### 5. Pre-computar aggregate stats
- Calcular `aggregateStats` uma vez no `useDashboardState` em um Map
- Eliminar recálculos O(n²) no DeckCarousel e DeckList

#### 6. Eliminar duplicação de useDecks no Dashboard
- Passar `allDecks` do `useDashboardState` em vez de chamar `useDecks()` separadamente no Dashboard.tsx

#### 7. Batch community deck detection
- Mover lógica de `pendingUpdatesQuery` para uma RPC server-side

---

### Resumo de impacto esperado

| Métrica | Antes | Depois |
|---------|-------|--------|
| Requisições no load | ~12 | ~6 |
| Streak display | BUG (sempre 0) | Correto |
| Re-renders DeckCarousel | O(n²) por deck | O(1) lookup |
| staleTime useDecks | 0 (default) | 2min |
| RPCs Study Plan | 3 | 1 |
| Community update queries | 3 sequenciais | 1 RPC |

