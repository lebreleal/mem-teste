

# Análise Completa: Bugs e Inconsistências nas Salas do Explorar

## Bugs Identificados

### 1. Botão "+" (Adicionar) ativo dentro de salas de terceiros
**Arquivo:** `src/components/ProtectedRoute.tsx` (linhas 117-149)

O Sheet "Adicionar" que abre ao clicar no "+" do BottomNav **não verifica se a sala atual é uma sala seguida (community)**. Ele apenas checa `isInsideSala` (se tem `folder=` na URL), mas nunca verifica `source_turma_id` da pasta. Resultado: o usuário vê "Criar matéria", "Criar deck", "Criar com IA" e "Importar" dentro de salas que não são dele.

**Correção:** Ler o `folder` param, buscar a pasta no cache/query, verificar se tem `source_turma_id`. Se tiver, esconder todos os botões de criação ou mostrar apenas opções de leitura.

---

### 2. `isDeckEnabled` bloqueia TODA a fila quando `daily_new_limit = 0`
**Arquivo:** `src/services/studyService.ts` (linhas 44-52)

A função `isDeckEnabled` retorna `false` quando `daily_new_limit <= 0`. Isso **remove o deck inteiro da fila**, incluindo cards de revisão e aprendizado (que não deveriam ser afetados pelo limite de novos). Quando o usuário desabilita um deck no "Configurar Estudo" (seta limit pra 0), esse deck some completamente — inclusive cards que já estão em repetição espaçada.

**Correção:** `isDeckEnabled` deve significar "participar da fila de estudo" — o limite de novos deve ser aplicado apenas na filtragem de cards novos (`state = 0`), não na remoção total do deck. Renomear para algo como `isDeckExcluded` e usar uma flag separada ou apenas filtrar os cards novos pelo limite.

---

### 3. Tempo estimado ainda inflado / inconsistente
**Arquivo:** `src/pages/Dashboard.tsx` (linhas 465-556)

O cálculo em `salaStudyStats` soma `reviewCount` de TODOS os decks sem filtrar por `scheduled_date <= now()`. O campo `review_count` do `DeckWithStats` (vindo do RPC `get_all_user_deck_stats`) já filtra por `scheduled_date <= now()`, mas o `totalDailyReviewLimit` subtrai `totalReviewReviewedToday` que é calculado como `reviewed_today - newGraduatedToday` — porém `reviewed_today` é computado **apenas para cards com `state = 2 AND scheduled_date > now()`** (ou seja, cards que já foram revisados e reagendados). Se esses valores estiverem inconsistentes entre o que o RPC retorna e o que o JS calcula, o cap pode não funcionar corretamente, resultando em estimativas de 4-6h.

**Correção:** Garantir que o `reviewReviewedToday` esteja sendo calculado corretamente a partir dos dados do RPC, e que o cap `Math.min(reviewCount, dailyReviewLimit - reviewReviewedToday)` funcione para a soma de todos os root decks.

---

### 4. Estudo pela sala seguida não funciona (cards não aparecem / progresso não conta)
**Arquivo:** `src/services/studyService.ts`

Vários problemas encadeados:
- **Bootstrap pode falhar silenciosamente**: Se a RPC `bootstrap_follower_decks` falha ou os decks criados não têm o `folder_id` correto, `collectFolderDeckIds` retorna lista vazia → fila vazia.
- **`isDeckEnabled` mata decks legítimos**: Se algum deck de matéria do criador tem limit padrão de 20 mas o seguidor setou 0 num ancestral, toda a cadeia é excluída.
- **Config vem do primeiro root deck**: `deckConfig = enabledRootDecks[0] ?? {}` — se nenhum root deck é "enabled", `deckConfig` fica vazio → `algorithmMode` default para `fsrs`, `daily_new_limit` default para 20 mas pode não corresponder à realidade.

---

### 5. DeckRow não esconde sub-deck actions para salas seguidas
**Arquivo:** `src/components/dashboard/DeckRow.tsx` (linhas 346-361)

Os sub-decks expandidos mostram `DeckMenu` (Renomear, Mover, Arquivar, Excluir) mesmo para decks de comunidade. A verificação `effectiveDisableManagement` funciona apenas para o deck pai mas o `DeckMenu` dos sub-decks usa o mesmo `effectiveDisableManagement` do pai — porém ele está correto pois `isLinkedDeck` checa `source_turma_deck_id` no deck filho. Isso deve funcionar, mas o `onCreateSubDeck` callback (passado como no-op `() => {}` para community folders no Dashboard) não é usado nos sub-decks.

---

## Plano de Correção

### Tarefa 1: Desabilitar botão "+" para salas de terceiros
**`src/components/ProtectedRoute.tsx`**
- Adicionar um listener para um evento customizado `set-community-folder` que o Dashboard emite quando entra numa sala comunitária
- OU (mais simples): dispatch um `CustomEvent` com `detail: { isCommunity: true }` junto com `open-add-menu`, e no ProtectedRoute verificar antes de renderizar as opções
- **Abordagem recomendada**: O ProtectedRoute já lê `searchParams.get('folder')`. Fazer uma query leve (ou usar cache do React Query) para checar se aquele folder tem `source_turma_id`. Se sim, mostrar apenas "Sair da sala" ou não mostrar nada.

### Tarefa 2: Corrigir `isDeckEnabled` para não bloquear revisões
**`src/services/studyService.ts`**
- Remover a função `isDeckEnabled` da filtragem de `deckIds`
- Manter todos os decks na fila
- Aplicar o filtro de `daily_new_limit` apenas sobre os cards com `state = 0` (novos), no momento da filtragem `allNew = allNew.slice(0, effectiveNewLimit)`
- Para decks com limit 0: excluir apenas seus cards novos, não os de revisão/aprendizado

### Tarefa 3: Validar tempo estimado
**`src/pages/Dashboard.tsx`**
- Revisar o cálculo de `totalReviewReviewedToday` para garantir que soma corretamente por root deck
- Adicionar logs de debug temporários para validar os números
- Garantir que o cap `cappedReviewCount` está realmente limitando

### Tarefa 4: Garantir que estudo de sala seguida funciona end-to-end
**`src/services/studyService.ts` + `src/pages/Dashboard.tsx`**
- Adicionar fallback mais robusto no bootstrap
- Garantir que `collectFolderDeckIds` encontra os decks corretamente (checar que `folder_id` dos decks criados pelo bootstrap match o `folderId` da URL)
- Testar o fluxo completo: Explorar → Seguir → Dashboard → Entrar na sala → Estudar

