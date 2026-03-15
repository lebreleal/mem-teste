

## Auditoria Profunda: Sistema Explorar + Salas Seguidas

---

### ESTADO ATUAL DO MODELO

O sistema agora usa o **Modelo B (Cópia Local)** implementado na última iteração:
- `bootstrap_follower_decks` RPC (SECURITY DEFINER) cria decks locais + copia cards com `state=0`
- Dashboard faz auto-bootstrap via `useEffect` quando detecta pasta com `source_turma_id`
- `syncFollowerDecks` faz sync incremental de novos cards
- `cleanupFollowerDecks` limpa ao sair

---

### VULNERABILIDADES E BUGS ENCONTRADOS

#### VULNERABILIDADE CRÍTICA 1: RPC `bootstrap_follower_decks` aceita qualquer `p_user_id`

A função é `SECURITY DEFINER` e recebe `p_user_id` como parâmetro. Qualquer usuário autenticado pode chamar:
```sql
SELECT bootstrap_follower_decks('ID_DE_OUTRO_USUARIO', turma_id, folder_id);
```
Isso criaria decks **no nome de outro usuário**. A RPC não valida que `p_user_id = auth.uid()`.

**Correção**: Adicionar `IF p_user_id != auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;` no início da função.

#### VULNERABILIDADE 2: `syncFollowerDecks` lê cards do dono sem restrição

No `followerBootstrap.ts`, a query:
```ts
supabase.from('cards').select('id, front_content, back_content, card_type').eq('deck_id', sourceDeckId);
```
Funciona graças ao RLS `'Users can view cards from public decks'` (que verifica `is_public = true`). Se o dono despublicar um deck (`is_public = false`), esta query falhará silenciosamente e o sync parará. Isso é **correto do ponto de vista de segurança** mas o seguidor não recebe nenhum feedback.

#### VULNERABILIDADE 3: `cleanupFollowerDecks` não valida `user_id`

A função deleta cards e decks filtrando apenas por `folder_id`. Se um atacante passar o `folderId` de outro usuário, o RLS do Supabase protege porque:
- DELETE em `cards`: verifica `decks.user_id = auth.uid()`
- DELETE em `decks`: verifica `user_id = auth.uid()`

Então o RLS protege, mas depende 100% do RLS estar correto.

#### BUG CRÍTICO 4: `DeckDetailContext` ainda tem auto-sync duplicado

Linhas 339-410 de `DeckDetailContext.tsx`: existe um `useEffect` que detecta "community decks" vazios e copia cards do dono para dentro deles. Esse código é do modelo antigo e **conflita** com o novo bootstrap:

1. O bootstrap já copia todos os cards com `origin_deck_id`
2. O auto-sync do DeckDetail NÃO usa `origin_deck_id` — insere cards duplicados sem rastreamento
3. Se o bootstrap roda e depois o usuário abre o deck, o auto-sync vê cards e não roda. OK.
4. Mas se o bootstrap falha ou demora, o auto-sync pode rodar e criar cards **sem `origin_deck_id`**, impossibilitando o sync incremental futuro.

**Correção**: Remover o bloco de auto-sync do `DeckDetailContext` (linhas 339-410).

#### BUG 5: `DeckDetailContext` mostra stats zeradas para decks com `source_turma_deck_id`

Linhas 277-312: `isCommunityDeck` é calculado como `deck.user_id !== user.id`. Como os decks bootstrapped pertencem ao seguidor (`user_id = auth.uid()`), `isCommunityDeck = false`. Isso está **correto** agora. As stats reais do seguidor são usadas. Sem bug aqui.

#### BUG 6: TurmaDetail "ESTUDAR" navega para o deck do DONO, não do seguidor

Linhas 312-317 de `TurmaDetail.tsx`:
```ts
navigate(`/decks/${firstWithCards.id}`, { state: { from: 'community', turmaId } });
```
`firstWithCards` vem de `salaDecks` que são os decks **originais do dono** (via `useSalaDecks`). Se o seguidor já tem cópias locais, deveria navegar para a cópia local, não para o original. Ao navegar para o deck do dono:
- `DeckDetailContext` detecta `isCommunityDeck = true` (user_id != auth.uid())
- Stats são zeradas artificialmente
- O seguidor não consegue estudar

**Porém**: na prática, após seguir, o seguidor volta ao Dashboard onde os decks locais existem. Esse bug só afeta quem clica "ESTUDAR" diretamente no Explorar após seguir. O seguidor deveria ser redirecionado ao Dashboard da sala.

#### BUG 7: `salaDifficultyStats` no Dashboard faz query de cards sem filtrar por `user_id`

Linhas 425-458 de `Dashboard.tsx`:
```ts
supabase.from('cards').select('state, difficulty').in('deck_id', batch)
```
Após o bootstrap, `salaDeckIds` contém IDs dos decks locais do seguidor. O RLS `'Users can view own cards'` filtra por `decks.user_id = auth.uid()`, então **retorna apenas os cards do seguidor**. Sem bug de segurança aqui.

#### BUG 8: Limite de 1000 rows do Supabase no sync incremental

`syncFollowerDecks` faz:
```ts
supabase.from('cards').select('origin_deck_id').eq('deck_id', localDeck.id).not('origin_deck_id', 'is', null);
```
Se o deck local tem mais de 1000 cards, a query retorna apenas 1000. Os IDs faltantes seriam interpretados como "cards novos" e duplicados na próxima sync.

**Correção**: Paginar esta query ou usar `.limit(99999)`.

Mesma coisa para:
```ts
supabase.from('cards').select('id, front_content, back_content, card_type').eq('deck_id', sourceDeckId);
```
Decks do dono com mais de 1000 cards teriam sync incompleto.

#### BUG 9: Bootstrap não copia sub-decks de sub-decks (apenas 1 nível)

O RPC `bootstrap_follower_decks` faz:
```sql
FOR v_child IN SELECT ... FROM decks WHERE parent_deck_id = v_td.deck_id
```
Isso copia apenas sub-decks de primeiro nível. Se o dono tiver matéria → sub-matéria → deck, o terceiro nível não é copiado. Na prática, a hierarquia atual parece ter no máximo 2 níveis, mas é um risco futuro.

#### BUG 10: Ao sair e re-entrar, bootstrap cria duplicatas

Cenário:
1. Seguidor entra → bootstrap cria decks com `source_turma_deck_id`
2. Seguidor sai → `cleanupFollowerDecks` deleta decks e cards
3. Seguidor re-entra → bootstrap roda novamente → cria novos decks com `source_turma_deck_id`

Isso funciona corretamente porque o bootstrap verifica:
```sql
IF EXISTS (SELECT 1 FROM decks WHERE user_id = p_user_id AND source_turma_deck_id = v_td.turma_deck_id) THEN CONTINUE;
```
Como o cleanup deletou os decks, não haverá duplicatas. **OK.**

#### BUG 11: `review_logs` ficam órfãos mas os card_ids apontam para cards deletados

Quando o seguidor sai, os cards são deletados. Os `review_logs` ficam com `card_id` apontando para registros inexistentes. Isso não causa crash (são apenas logs históricos), mas:
- Se o seguidor re-entra, os novos cards terão IDs diferentes
- Os review_logs antigos nunca serão associados aos novos cards
- A promessa de "stats salvas por 30 dias" é **parcialmente falsa** — os logs existem mas não são reutilizados

**Correção**: Ou aceitar que "stats salvas por 30 dias" significa apenas o histórico no gráfico de atividade (que usa `user_id`, não `card_id`), ou manter os cards mas marcá-los como arquivados.

#### BUG 12: `StudySettingsSheet` pode não encontrar decks da sala seguida

O `StudySettingsSheet` recebe `decks={state.decks}` e `currentFolderId`. Ele filtra decks pela `folder_id`. Após o bootstrap, os decks locais têm `folder_id = state.currentFolderId`, então **devem aparecer**. Precisa verificar se `state.decks` inclui os decks recém-criados pelo bootstrap (depende do `invalidateQueries` ter completado).

#### INCONSISTÊNCIA 13: `allDecks` do `useDecks` pode estar desatualizado durante o bootstrap

O `useEffect` do bootstrap roda, cria decks, e faz `invalidateQueries(['decks'])`. Mas o `salaStudyStats` usa `allDecks` que pode estar no cache antigo. O React Query invalidará e refetchará, mas há um breve momento onde as stats mostram zero.

---

### SEGURANÇA: PODE O SEGUIDOR ALTERAR DADOS DO DONO?

**NÃO, graças ao RLS.** Verificação completa:

| Operação | Proteção RLS |
|----------|-------------|
| UPDATE cards | `decks.user_id = auth.uid()` — seguidor só atualiza seus próprios cards |
| DELETE cards | `decks.user_id = auth.uid()` — idem |
| UPDATE decks | `user_id = auth.uid()` — seguidor só atualiza seus decks |
| DELETE decks | `user_id = auth.uid()` — idem |
| INSERT review_logs | `auth.uid() = user_id` — logs sempre vinculados ao próprio user |

O seguidor **não consegue** modificar cards ou decks do dono via client-side. A única brecha seria o RPC `bootstrap_follower_decks` que é `SECURITY DEFINER` e aceita `p_user_id` arbitrário.

---

### RESUMO: O QUE PRECISA SER CORRIGIDO

1. **RPC `bootstrap_follower_decks`**: Validar `p_user_id = auth.uid()` para impedir criação de decks em nome de outro usuário
2. **Remover auto-sync duplicado**: Eliminar linhas 339-410 do `DeckDetailContext.tsx` (conflito com bootstrap)
3. **Paginar queries no sync**: `syncFollowerDecks` precisa paginar queries que podem retornar >1000 rows
4. **TurmaDetail "ESTUDAR"**: Após seguir, redirecionar para o Dashboard da sala (não para o deck do dono)
5. **Mensagem "stats salvas 30 dias"**: Esclarecer que se refere ao histórico de atividade, não à retenção de progresso por card (os card_ids mudam ao re-entrar)

