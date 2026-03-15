

# Otimização do Carregamento do Menu Início

## Diagnóstico: Gargalos Identificados

### 1. `fetchDecksWithStats` busca TODOS os cards do usuário (CRÍTICO)
Em `src/services/deck/deckStats.ts` (linhas 51-95), após buscar decks e stats via RPC, o código faz queries paginadas para **cada card** do usuário (`SELECT id, deck_id, state, difficulty FROM cards`) apenas para calcular `total_cards`, `mastered_cards` e classificações de dificuldade. Para um usuário com 10k cards, isso são 10+ requests sequenciais.

### 2. `SalaList` faz queries redundantes ao banco
Em `src/components/dashboard/SalaList.tsx`, cada renderização dispara:
- Query para contar `deck_questions` por deck
- Query para buscar metadados de turmas comunitárias (owner name, cover, card counts)
- Query para buscar **todos os cards** das turmas seguidas para contar (`SELECT deck_id FROM cards`)

### 3. `salaDifficultyStats` repete a busca de cards
Em `Dashboard.tsx` (linhas 428-462), ao entrar numa sala, busca novamente `state, difficulty` de todos os cards da sala — dados que já existem em `fetchDecksWithStats`.

### 4. Cascata de queries sequenciais no `fetchDecksWithStats`
O fluxo atual é: buscar decks → buscar stats RPC → buscar cards (paginado) → buscar marketplace listings → buscar turma_decks → buscar profiles. São 6+ rounds sequenciais.

---

## Plano de Correção

### A. Mover contagem de cards para o servidor (RPC) — Maior impacto
Criar uma nova RPC `get_all_user_card_counts` que retorna `deck_id, total, mastered, novo, facil, bom, dificil, errei` em uma única query SQL, eliminando as 10+ requests paginadas do client.

```sql
CREATE OR REPLACE FUNCTION get_all_user_card_counts(p_user_id uuid)
RETURNS TABLE(deck_id uuid, total bigint, mastered bigint, 
              novo bigint, facil bigint, bom bigint, dificil bigint, errei bigint)
```

Atualizar `fetchDecksWithStats` para chamar esta RPC em paralelo com `get_all_user_deck_stats` e `fetchAllDecks` (3 queries paralelas em vez de 6+ sequenciais).

### B. Usar dados já carregados no `useDashboardState`
Os campos `total_cards`, `mastered_cards`, `class_novo/facil/bom/dificil/errei` já estão no `DeckWithStats`. Eliminar a query `salaDifficultyStats` do Dashboard e usar os dados do `aggregateMap` + dados de classificação já presentes nos decks.

### C. Eliminar query de cards no SalaList
A query `SELECT deck_id FROM cards` (linha 126) que conta cards por turma será removida — os dados de `total_cards` já vêm dos decks locais.

### D. Adicionar `staleTime` ao `useFolders`
O hook `useFolders` não tem `staleTime`, causando refetch em cada focus/render. Adicionar `staleTime: 2 * 60_000` como já feito no `useDecks`.

---

## Arquivos Alterados

1. **Nova migration SQL** — RPC `get_all_user_card_counts`
2. **`src/services/deck/deckStats.ts`** — Substituir loop de cards por chamada RPC paralela
3. **`src/pages/Dashboard.tsx`** — Remover query `salaDifficultyStats`, usar dados dos decks
4. **`src/components/dashboard/SalaList.tsx`** — Remover query de cards redundante
5. **`src/hooks/useFolders.ts`** — Adicionar `staleTime`

## Resultado Esperado
- Carregamento inicial: de ~6-10 requests sequenciais para 3 requests paralelos
- Eliminação de queries paginadas de cards no client
- Dashboard abre em <1s para usuários com muitos cards

