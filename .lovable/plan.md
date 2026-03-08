

# Analise Profunda da Arquitetura & Plano de Refatoração

## Diagnóstico por Camada

### 1. SERVICES (Camada de Infraestrutura) -- Problemas Graves

**A. `turmaService.ts` (740 linhas) -- N+1 Query Catastrophe**
- `fetchTurmaMembersWithStats()` e `fetchTurmaRanking()`: fazem um `for` loop com query individual de `review_logs` por membro. Para uma turma com 50 membros = 50 queries sequenciais.
- `fetchTurmaDecks()`: faz um `while` loop buscando children deck por deck, depois `count_cards_per_deck` -- 3-5 queries sequenciais.
- `fetchDiscoverTurmas()`: faz 4-5 queries encadeadas (turmas → tags → deck_tags → decks → profiles).

**B. `deckService.ts` (710 linhas) -- God Service**
- Mistura responsabilidades: CRUD de decks, importação com retry/batching, hierarquia de sub-decks, marketplace sync. Viola SRP pesadamente.
- `reorderFolders()` faz N updates sequenciais (1 por folder) em vez de batch.
- `bulkDeleteDecks()` faz N RPCs sequenciais em vez de batch.

**C. `studyService.ts` -- Queries Redundantes**
- `fetchStudyQueue()` faz 6-7 queries separadas: allDecks, cards, scopeIds, studyPlans, profile, hierarchyLimits, globalCardIds, globalLimits. Poderia ser consolidado em 2-3 RPCs.

**D. `missionService.ts` -- 5 queries paralelas + profile duplicado**
- Busca `profiles.daily_cards_studied` diretamente, ignorando o cache centralizado do `useProfile`.

**E. `energyService.ts` -- `fetchEnergy()` legado**
- Função `fetchEnergy()` ainda existe e faz query direta ao profiles, duplicando a lógica que `useProfile` + `profileToEnergyData()` já resolve. Código morto que confunde.

### 2. HOOKS (Camada de Aplicação) -- Duplicação e Acoplamento

**A. `useStudyPlan.ts` (638 linhas) -- God Hook**
- Contém 7 queries independentes (plans, deckHierarchy, avg, metrics, perDeckStats, retention, planHealth, forecast) + ~200 linhas de cálculo de métricas inline.
- O `deckHierarchyQuery` busca `decks.id, parent_deck_id` separadamente, mas `useDecks` já traz isso. Duplicação de dados.
- `perDeckStatsQuery` chama `get_all_user_deck_stats` novamente, que já é chamado por `useDecks.fetchDecksWithStats()`. São 2 chamadas da mesma RPC cara.

**B. `useDashboardState.ts` (387 linhas) -- God Hook #2**
- Mistura 20+ estados de dialog com lógica de domínio (aggregate stats, community detection, folder traversal).
- `getAggregateStats()` e `getRawAggregateStats()` são O(n²) recursivos, chamados para cada deck.

**C. `useStudySession.ts` -- Invalidação excessiva**
- `onSettled` invalida `['decks']`, `['deck-stats']`, `['cards-aggregated']` em CADA review. Durante uma sessão de 50 cards = 50 invalidações de cache do dashboard.

### 3. PAGES (Camada de Apresentação) -- Lógica de negócio vazando

**A. `Dashboard.tsx` (709 linhas)**
- Contém lógica de negócio complexa inline: `handleDeleteDeckRequest` faz query ao Supabase diretamente, `handleDeleteSubmit` mistura folder/deck delete com chamadas raw ao Supabase.
- `handleBulkDelete` faz query de `turma_decks` diretamente no componente.
- Import inline de `usePendingDecks.getState()` dentro de callback -- acoplamento com store.

**B. `Study.tsx` (708 linhas)**
- SSE streaming do tutor AI implementado inline (~100 linhas de parsing manual de SSE).
- Lógica de undo/redo com snapshot manual (~50 linhas) deveria ser um hook dedicado.
- `handleRate` tem ~100 linhas com lógica de scheduling, cloze sibling burying, optimistic updates -- tudo inline.

### 4. COMPONENTS -- Mistura de Responsabilidades

**A. `DeckCarousel.tsx` (355 linhas)** -- Já melhorado com `buildAggregateMap`, mas ainda contém lógica de negócio (cálculo de stats, formatação de tempo).

**B. `useDashboardState` retorna 60+ valores** -- Interface gigante que viola ISP. Componentes recebem props que não precisam.

### 5. TYPES -- Incompleto

- Muitos `as any` casts espalhados (contei ~80+), indicando que os tipos do Supabase não estão sincronizados ou que tipos intermediários estão faltando.
- `domain.ts` existe mas não é usado em quase nenhum service/hook.

### 6. STORES -- Subutilizado

- Apenas `usePendingDecks.ts` usa Zustand. Estado global como "current folder", "expanded decks", "selection mode" ficam em useState local no Dashboard, impedindo persistência entre navegações.

---

## Plano de Implementação (Priorizado por ROI)

### Fase 1: Eliminar N+1 e Queries Duplicadas (maior economia de banco)

**1.1 Criar RPC `get_turma_members_ranking`** 
- Substitui o loop N+1 em `fetchTurmaMembersWithStats()` e `fetchTurmaRanking()` por uma única query SQL com `LEFT JOIN review_logs` agrupado.
- Impacto: -50 queries por carregamento de turma com 50 membros.

**1.2 Eliminar `get_all_user_deck_stats` duplicado no `useStudyPlan`**
- O `perDeckStatsQuery` chama a mesma RPC que `useDecks` já chama. Reutilizar os dados do cache `['decks']` em vez de fazer query separada.
- Impacto: -1 RPC pesada por load do dashboard.

**1.3 Consolidar `fetchStudyQueue` em 2 RPCs**
- Criar `get_study_queue_data(p_user_id, p_deck_id, p_folder_id)` que retorna cards + limits + config em uma única chamada.
- Impacto: -4 queries por início de sessão de estudo.

### Fase 2: Separação de Responsabilidades (SRP/Clean Architecture)

**2.1 Decompor `deckService.ts`** em:
- `deckCrud.ts` -- CRUD básico (create, delete, rename, move, archive)
- `deckImport.ts` -- Toda lógica de importação com retry/batching
- `deckStats.ts` -- `fetchDecksWithStats`, aggregate stats
- `deckHierarchy.ts` -- Operações de hierarquia (sub-decks, cascade)

**2.2 Decompor `turmaService.ts`** em:
- `turmaCrud.ts` -- CRUD de turmas
- `turmaMembers.ts` -- Membros, ranking, permissões
- `turmaContent.ts` -- Subjects, lessons, decks, files
- `turmaExams.ts` -- Provas da turma

**2.3 Extrair lógica do `Dashboard.tsx`**:
- Criar `useDashboardActions.ts` com todos os handlers (handleDelete, handleRename, handleBulkMove, etc.)
- Mover dialog states para `useDashboardDialogs.ts`
- Dashboard.tsx fica apenas com layout/render (~150 linhas vs 709 atual)

**2.4 Extrair do `Study.tsx`**:
- `useStudyUndo.ts` -- Estado de undo/snapshot
- `useTutorStream.ts` -- SSE streaming do AI tutor
- `useStudyProgress.ts` -- Cálculo de progresso e waiting timer

### Fase 3: Batch Operations (economia de writes)

**3.1 `reorderFolders` batch** -- Substituir N updates sequenciais por uma única RPC `batch_update_sort_order(p_table, p_ids, p_orders)`.

**3.2 `bulkDeleteDecks` batch** -- Criar RPC `delete_decks_cascade(p_deck_ids uuid[])` que processa todos em uma transação.

**3.3 Invalidação debounced em study session** -- Em vez de invalidar cache a cada card review, acumular e invalidar apenas ao sair da sessão (já parcialmente feito com setTimeout de 5s, mas pode ser melhorado com um flush on unmount).

### Fase 4: Eliminar `as any` e fortalecer tipos

**4.1** Criar tipos intermediários para tabelas que não estão no schema gerado (turma_*, study_plans, etc.)
**4.2** Usar os mappers de `domain.ts` nos services que fazem transformação de dados
**4.3** Remover `fetchEnergy()` legado -- já substituído por `profileToEnergyData()`

---

## Resumo de Impacto

```text
Área                        | Antes           | Depois
----------------------------|-----------------|------------------
Queries turma ranking       | N+1 (50 members)| 1 RPC
get_all_user_deck_stats     | Chamada 2x      | Chamada 1x (cache)
fetchStudyQueue             | 6-7 queries     | 2-3 queries
deckService.ts              | 710 linhas      | 4 arquivos ~180 cada
turmaService.ts             | 740 linhas      | 4 arquivos ~180 cada
Dashboard.tsx               | 709 linhas      | ~200 linhas
Study.tsx                   | 708 linhas      | ~300 linhas
useStudyPlan.ts             | 638 linhas, 7q  | ~400 linhas, 5q
reorderFolders              | N updates seq   | 1 RPC batch
bulkDeleteDecks             | N RPCs seq      | 1 RPC batch
as any casts                | ~80+            | <10
```

