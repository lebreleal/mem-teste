
## Problema

O carrossel e a lista inferior estao usando logicas diferentes para calcular os cartoes novos:

- **Carrossel**: Passa `globalNewRemaining` inteiro para cada deck individualmente. Resultado: cada deck mostra `min(raw.new_count, globalNewRemaining)` -- todos recebem o orcamento cheio.
- **Lista inferior**: Usa `distributedNewByDeck` (distribuicao sequencial) -- correto.
- **Banner global**: Soma os stats de cada deck usando o budget cheio, gerando totais inflados.

Isso causa numeros inconsistentes entre o carrossel e a lista, e o banner com somas erradas.

## Solucao

Unificar tudo usando o `distributedNewByDeck` que ja existe no `useDashboardState`, passando-o para o `DeckCarousel` como prop.

## Detalhes Tecnicos

### 1. `src/pages/Dashboard.tsx`

- Passar `distributedNewByDeck` (do `state`) como nova prop para `DeckCarousel`.
- Expor `distributedNewByDeck` no retorno de `useDashboardState` (ja existe no hook, so precisa incluir no return).

### 2. `src/components/dashboard/useDashboardState.ts`

- Adicionar `distributedNewByDeck` ao objeto retornado pelo hook (atualmente nao e exportado).

### 3. `src/components/dashboard/DeckCarousel.tsx`

- Aceitar nova prop `distributedNewByDeck?: Map<string, number>`.
- **`DeckStudyCard`**: Receber `allocatedNew` (numero ja calculado) em vez de `globalNewRemaining`. Usar `allocatedNew` diretamente como `newAvailable` em vez de chamar `getDeckTodayStats` com o budget cheio.
- **`globalPlanStats`**: Ao iterar os root decks, usar o valor de `distributedNewByDeck.get(rootId)` para `totalNew` em vez de chamar `getDeckTodayStats(root, decks, globalNewRemaining)` para cada um.
- **`sortedDecks`**: Usar o mapa distribuido para filtrar decks com cards pendentes (considerando o budget alocado, nao o global).
- **Filtro de visibilidade**: Um deck so aparece se `allocatedNew + reviewAvailable + learningAvailable > 0`.

### Resultado

- Carrossel, banner e lista inferior usarao todos a mesma fonte de verdade (`distributedNewByDeck`).
- Os totais no banner serao a soma exata dos cards individuais.
- "Cartoes para hoje" na lista inferior e numeros no carrossel serao identicos para o mesmo deck.
