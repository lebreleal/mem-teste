

## Diagnóstico de Performance: Dashboard dentro de uma Sala

### Problemas identificados

**1. Dupla instanciação do `useDecks` — query pesada rodando 2x**
- `Dashboard.tsx` linha 74: `const { decks: allDecks } = useDecks();`
- `useDashboardState.ts` linha 19: também chama `useDecks()` internamente
- Ambos usam a mesma `queryKey` então o React Query compartilha o cache, mas o hook inteiro (com todas as mutations) é instanciado 2 vezes desnecessariamente, criando objetos duplicados a cada render.

**2. Queries paralelas desnecessárias ao entrar na sala**
Quando o usuário navega para uma sala, disparam simultaneamente:
- `fetchDecksWithStats` (3 RPCs: decks + stats + card_counts + author resolution = ~5-8 requests)
- `communityTurmaInfo` query (turma + turma_decks + profiles + deck dates = 4 requests)
- `syncFollowerDecks` (N+1 pattern: para cada deck local faz turma_deck lookup + cards query)
- `deck-question-counts` do SalaList (roda no root mas a query key não filtra por folder)
- `community-deck-updates` RPC
- `study-plans` query
- `real-study-metrics` RPC
- `error-notebook-count`
- `user-turma` query
- `folders` query

**Total: ~15-20+ requests no Supabase ao abrir uma sala**, muitas desnecessárias.

**3. `syncFollowerDecks` — N+1 sequencial e custoso**
- Para cada `localDeck`, faz uma query individual ao `turma_decks` (N queries)
- Para cada deck, pagina `cards` existentes + `cards` da fonte (2N queries adicionais)
- Tudo isso roda no `useEffect` do Dashboard, bloqueando visualmente

**4. `useMemo` pesados recalculando em cada render**
- `salaStudyStats` (linha 462-571): iteração recursiva sobre TODOS os decks
- `salaDeckIds`: mesma iteração recursiva
- `salaDifficultyStats`: loop sobre todos deck IDs
- `aggregateMap` em `useDashboardState`: O(n²) com `.find()` dentro de loop

**5. `SalaList` roda no root MAS também é montada quando `isInsideSala` é true momentaneamente**
- Queries de `deck-question-counts` e `sala-list-community-meta` rodam mesmo quando estamos DENTRO da sala

---

### Plano de otimização (Arquitetura Limpa)

#### A. Eliminar dupla instanciação do useDecks
- Remover `const { decks: allDecks } = useDecks()` do `Dashboard.tsx`
- Usar `state.decks` (já vindo do `useDashboardState`) em todos os lugares
- Reduz objetos duplicados e simplifica dependências de memo

#### B. Lazy-load do syncFollowerDecks com debounce
- Mover o sync para rodar apenas após 2s de inatividade (não no mount imediato)
- Agrupar as queries de `turma_decks` em batch: buscar todos os `source_turma_deck_ids` de uma vez com `.in()` em vez de N queries individuais
- Resultado: de ~N*3 queries para 3 queries fixas

#### C. Desabilitar queries desnecessárias dentro da sala
- `deck-question-counts`: adicionar `enabled: !isInsideSala` (ou filtrar por folder)
- `community-deck-updates`: já tem `enabled` mas roda no nível do state, não depende de estar na sala
- `communityTurmaInfo`: já tem `enabled: !!sourceTurmaId` ✓

#### D. Otimizar aggregateMap — eliminar O(n²)
- Trocar `decks.find(d => d.id === deckId)` por um `Map<string, DeckWithStats>` pré-construído
- Trocar `decks.filter(d => d.parent_deck_id === deckId)` por um `Map<string, DeckWithStats[]>` (children index)
- Complexidade cai de O(n²) para O(n)

#### E. Memoizar `salaStudyStats` com menos dependências
- Atualmente depende de `allDecks` (array gigante), recalcula a cada mudança de qualquer deck
- Criar um `salaDeckMap` derivado apenas dos decks no folder atual

#### F. Batch sync no followerBootstrap
- Refatorar `syncFollowerDecks` para:
  1. Buscar TODOS os `turma_decks` relevantes em 1 query (`.in('id', allSourceTurmaDeckIds)`)
  2. Buscar TODOS os cards existentes dos decks locais em 1 query paginada
  3. Buscar TODOS os cards fonte em 1 query paginada
  4. Calcular diff no client e inserir em batch

### Arquivos a editar

| Arquivo | Mudança |
|---------|---------|
| `src/pages/Dashboard.tsx` | Remover `useDecks()` duplicado, usar `state.decks`. Debounce do sync. |
| `src/components/dashboard/useDashboardState.ts` | Criar `deckMap` e `childrenIndex` para O(1) lookups no `aggregateMap`. |
| `src/services/followerBootstrap.ts` | Refatorar `syncFollowerDecks` para batch queries. |
| `src/components/dashboard/SalaList.tsx` | Condicionar `deck-question-counts` query. |

### Impacto estimado
- De ~15-20 requests para ~6-8 ao entrar na sala
- Eliminação do N+1 no sync (de N*3 para 3 queries fixas)
- Render do Dashboard ~2-3x mais rápido com Map lookups

