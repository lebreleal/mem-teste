# Refatoração de Performance — Sessão de Estudo

## Diagnóstico (confirmado no código + no banco)

Ao apertar **Estudar**, a função `fetchStudyQueue` (`src/services/studyService.ts`) faz **3 rodadas sequenciais** de chamadas ao Supabase antes do primeiro card aparecer:

1. Busca **todos** os decks + folders do usuário.
2. Busca cards devidos **+ `get_all_card_ids_for_user`** (que traz o ID de *todos* os cards do usuário, sem limite — 10k+ linhas viajam pela rede só para filtrar no JS) + plans + profile + `get_all_user_deck_stats` (varre todos os cards).
3. Duas chamadas `get_study_queue_limits` passando arrays enormes de IDs.

No modo "seguidor" (turma/comunidade) ainda há +3 chamadas sequenciais (bootstrap). Resultado: **3 a 6 idas-e-voltas de rede** antes de renderizar. Confirmado pelo relatório de queries lentas: milhares de `SELECT ... LIMIT/OFFSET` em `cards` e um `select('*')` chegando a 2,5s.

Além disso:
- Cada avaliação invalida `cards-aggregated` (50 refetches numa sessão de 50 cards).
- Ao sair, `invalidateStudyQueries` roda **duas vezes** (7 famílias de queries × 2 = 14 invalidações).
- A contagem "errada" vem de a fila ser montada/limitada no **JS** com uma lógica diferente da usada no dashboard (`get_all_user_deck_stats`), gerando divergências.

## Objetivo

Montar a fila + limites + config **inteiramente no servidor, em 1 RPC**, e parar os enxames de invalidação. Sem mudanças visuais. Sem mudar regras de FSRS/limites (apenas mover o mesmo cálculo para um lugar só, eliminando a duplicação JS↔SQL que causa números divergentes).

## Mudanças

### 1. Novo RPC `build_study_queue` (banco)
Cria uma função `build_study_queue(p_user_id, p_scope, p_deck_id, p_folder_id, p_tz_offset_minutes)` que faz tudo server-side e retorna um único JSON:
- Resolve o escopo (deck único + descendentes / folder / "tudo") via CTE recursiva sobre `decks`.
- Aplica os limites por deck-pai (novos/revisão) reaproveitando exatamente a lógica de `get_all_user_deck_stats` e `get_study_queue_limits` (mesma fonte de verdade → conserta a contagem).
- Aplica "bury siblings" de cloze pelo `front_content`.
- Retorna `{ cards: [...só os campos de StudyCard...], deckConfig, isLiveDeck }` já ordenado (learning → novos/revisão).

Isso **elimina** `get_all_card_ids_for_user`, o transporte de todos os IDs, e as rodadas 2 e 3. Uma única ida à rede.

### 2. `studyService.ts` — `fetchStudyQueue`
Reescrever para uma única chamada `supabase.rpc('build_study_queue', …)` e mapear o retorno para `StudyQueueResult`. Manter o caminho `quick_review` e o bootstrap de seguidor (chamado só quando o RPC retornar vazio para um folder de turma, e então repetir o RPC uma vez). A assinatura pública da função e os tipos em `src/types/study.ts` permanecem iguais — `useStudySession` não muda.

### 3. `useStudySession.ts` — invalidação por review
Remover `invalidateQueries(['cards-aggregated'])` do `onSettled` (roda a cada avaliação). A atualização otimista de `study-stats.todayCards` já existe e basta durante a sessão; os contadores do dashboard são recalculados na saída.

### 4. `Study.tsx` — invalidação na saída
Eliminar a invalidação dupla: manter **apenas** a do cleanup de unmount (`removeQueries` + um único `invalidateStudyQueries`) e remover a chamada redundante dentro de `goBack`.

### 5. Limpeza
Remover o código morto de `movedToError`/`returnedFromError` no `onSuccess` (sempre `false`) e a função `get_all_card_ids_for_user` do uso (mantida no banco por segurança, mas sem chamadas no front).

## Detalhes técnicos

```text
ANTES (apertar Estudar):
  Round 1 ─► decks + folders
  Round 2 ─► due cards + TODOS os card ids + plans + profile + deck stats
  Round 3 ─► limits(hierarquia) + limits(global)
  = 3–6 RTT, ~10k linhas transferidas

DEPOIS:
  Round 1 ─► build_study_queue(scope) ──► fila pronta + config
  = 1 RTT, só os cards devidos
```

- O RPC será `STABLE SECURITY DEFINER SET search_path = public`, escopado por `d.user_id = p_user_id`.
- Índices de apoio (criados se faltarem): `cards(deck_id, state, scheduled_date)` e `review_logs(user_id, card_id, reviewed_at)` para os filtros de "revisado hoje".
- Validação: comparar a fila/contagens do RPC com a saída atual do JS para um deck, um folder e "tudo" antes de remover o caminho antigo; rodar os testes de `src/test/studyQueue.test.ts`.

## Fora de escopo (próxima rodada, se quiser)
Os loops paginados de cards do dashboard/deck-detail (`cardQueries.ts`, `deckStats.ts`) também aparecem como lentos — dá para trocá-los por RPCs de agregação que já existem (`get_all_user_card_counts`, `count_descendant_cards_by_state`). Posso fazer isso em seguida; este plano foca na sessão de estudo, que foi o pedido principal.
