## Auditoria de Bugs: Fluxo Completo do Explorar

Após análise profunda de todo o fluxo (Explorar → Entrar → Dashboard → Estudar → Deck Detail → ManageDeck → Sair), identifiquei os seguintes problemas:

---

### BUG 1: TurmaDetail mostra estatísticas do DONO para todos os visitantes

**Arquivo**: `TurmaDetail.tsx` linhas 67-92

O `useSalaDecks` query busca os cards do dono via `turma_decks → cards` e usa `c.state` e `c.difficulty` diretamente. Isso significa que qualquer visitante (seguidor ou não) vê as barras de progresso e classificação (fácil/bom/difícil/errei) **do dono**, não suas próprias.

**Comportamento correto**: Na página do Explorar (TurmaDetail), todos os cards devem aparecer como "novos" (state=0) para quem não é o dono, já que é uma visualização pública da coleção. As barras de classificação devem ser omitidas ou mostrar 100% novo.

**Correção**: Forçar `state = 0` e `difficulty = 0` para todos os cards no `useSalaDecks` quando o usuário não é o dono da turma. Ou simplesmente não exibir barras de classificação na visualização pública.

---

### BUG 2: Clique no deck no TurmaDetail navega para o deck do DONO

**Arquivo**: `TurmaDetail.tsx` linha 455

O `DeckRow` no TurmaDetail renderiza os decks originais do dono com `readOnly` e `readOnlyNavState`. Ao clicar, navega para `/decks/${owner_deck_id}`. Isso leva o seguidor ao `DeckDetailContext` que detecta `isCommunityDeck = true` (user_id !== auth.uid()) e zera todas as stats artificialmente.

**Problema real**: Depois do bootstrap, o seguidor tem cópias locais. Mas ao voltar ao Explorar e clicar num deck, ele vê o deck do dono (não sua cópia local). Isso causa confusão: o deck no Dashboard mostra seu progresso, o mesmo deck no Explorar mostra tudo zerado.

**Correção**: Não é urgente porque o fluxo principal é pelo Dashboard. Mas idealmente, se o seguidor já tem uma cópia local, o DeckRow no TurmaDetail deveria linkar para a cópia local ou pelo menos mostrar um aviso "Acesse pelo seu Dashboard para ver seu progresso".

---

### BUG 3: ManageDeck permite edição em decks locais de salas seguidas

**Arquivo**: `useManageDeck.ts` linha 50

O `isCommunityDeck` é calculado como `!!(deckMeta?.source_turma_deck_id || deckMeta?.source_listing_id)`. Isso está **correto** -- decks com `source_turma_deck_id` são marcados como community e ficam readOnly no ManageDeck. Sem bug aqui.

---

### BUG 4: Bootstrap pode falhar silenciosamente sem feedback ao usuário

**Arquivo**: `Dashboard.tsx` linhas 152-179

O `useEffect` do bootstrap captura erros com `.catch(console.error)` mas não notifica o usuário. Se o RPC falhar (ex: rede instável), o seguidor entra na sala e vê uma lista vazia de decks sem saber por quê.

**Correção**: Adicionar um toast de erro quando o bootstrap falha, com opção de retry.

---

### BUG 5: `handleFollow` no TurmaDetail e `handleStudy` duplicam lógica de bootstrap

**Arquivo**: `TurmaDetail.tsx` linhas 229-263 (handleFollow) e 280-313 (handleStudy)

Ambos fazem: inserir turma_member → criar folder → chamar bootstrapFollowerDecks. Se o usuário clica "Entrar" e depois "ESTUDAR", o bootstrap roda duas vezes. O RPC é idempotente (verifica duplicatas), mas gera queries desnecessárias.

**Correção**: No `handleStudy`, verificar se já é follower antes de repetir o flow. Atualmente `handleStudy` verifica `if (!isFollower)` para auto-follow, então só executa uma vez. Mas há um race condition: se o `handleFollow` acabou de rodar e o React Query ainda não invalidou, `isFollower` pode ainda ser `false` e o `handleStudy` tenta novamente.

---

### BUG 6: Após seguir via TurmaDetail, `navigate('/dashboard')` não abre a sala automaticamente

**Arquivo**: `TurmaDetail.tsx` linha 313

Após o auto-follow no `handleStudy`, navega para `/dashboard` sem passar o `folderId` como query param. O usuário cai na tela raiz do Dashboard e precisa manualmente encontrar e clicar na sala.

**Correção**: Navegar para `/dashboard?folder={folderId}` para abrir diretamente a sala seguida.

---

### BUG 7: `expandedDecks` no TurmaDetail nunca atualiza (matérias não expandem)

**Arquivo**: `TurmaDetail.tsx` linha 225

`const [expandedDecks] = useState(new Set<string>())` -- usa `useState` sem setter. O `toggleExpand` passado ao DeckRow é `noopStr` (linha 222). Matérias (decks com sub-decks) nunca expandem na visualização do Explorar.

**Correção**: Implementar o toggle de expansão como no Dashboard, ou usar a lógica de accordion que já existe (`expandedAccordionId`/`onAccordionToggle`). O accordion funciona (linha 471), mas o `expandedDecks` Set está desconectado.

---

### RESUMO DAS CORREÇÕES NECESSÁRIAS


| #   | Bug                               | Severidade | Correção                         |
| --- | --------------------------------- | ---------- | -------------------------------- |
| 1   | TurmaDetail mostra stats do dono  | Média      | Forçar state=0 nos cards         |
| 4   | Bootstrap falha sem feedback      | Média      | Adicionar toast de erro          |
| 6   | Navigate pós-follow não abre sala | Alta       | Passar `?folder=id` na navegação |
| 7   | Matérias não expandem no Explorar | Alta       | Implementar toggle de expansão   |


Os bugs 2, 3 e 5 são de baixa prioridade ou não-bugs confirmados.