
# Corrigir Distribuicao Global de Cards Novos no Dashboard e Graficos

## Problemas Identificados

1. **Dashboard nao reflete o limite global**: O `DeckCarousel.tsx` e o `useDashboardState.ts` usam `deck.daily_new_limit` (limite manual do deck, ex: 15 ou 20) para calcular quantos cards novos mostrar. Quando o usuario define 30 globais no slider do "Meu Plano", o dashboard continua mostrando "0/15 cards" porque usa o limite do deck.

2. **Slider nao atualiza o grafico de previsao**: Quando o usuario muda o slider de "Cards novos por dia" no hero card, o `ForecastSimulator` nao e notificado da mudanca. O slider muda `daily_new_cards_limit` no perfil, mas o simulador usa `newCardsOverride` (estado local separado) que nao esta conectado ao slider do hero.

3. **Tempo estimado incorreto**: O calculo de `newMinutes` no `useStudyPlan.ts` usa `dailyNewCards = Math.min(globalNewBudget, totalNew)` que pode estar correto, mas o `estimatedMinutesToday` nao respeita a capacidade de tempo — pode mostrar mais minutos do que o usuario tem disponivel.

## Mudancas Necessarias

### 1. Dashboard: Usar limite global quando ha plano ativo

**Arquivos:** `src/components/dashboard/DeckCarousel.tsx` e `src/components/dashboard/useDashboardState.ts`

Quando o usuario tem um plano ativo e o deck pertence ao plano, substituir `deck.daily_new_limit` pela alocacao calculada pelo plano. Para isso:

- Passar a alocacao por deck (`deckNewAllocation`) do `useStudyPlan` para o `DeckCarousel`
- No `getDeckTodayStats`, usar `deckNewAllocation[deck.id]` quando disponivel, senao usar `deck.daily_new_limit`
- Mesma logica no `useDashboardState.ts` -> `getAggregateStats`

### 2. Conectar slider do hero ao grafico de previsao

**Arquivo:** `src/pages/StudyPlan.tsx`

O slider "Cards novos por dia" no hero card atualiza `daily_new_cards_limit` no perfil. Mas o `ForecastSimulatorSection` tem seu proprio `newCardsOverride`. Quando o slider do hero muda, o grafico precisa recalcular. A solucao:

- Apos `updateNewCardsLimit.mutateAsync(v[0])`, invalidar tambem a query `daily-new-cards-limit` que o `useForecastSimulator` usa
- Isso fara o simulador re-buscar o valor atualizado e recalcular

### 3. Corrigir calculo de tempo

**Arquivo:** `src/hooks/useStudyPlan.ts`

O `newMinutes` deve respeitar a capacidade restante apos revisoes:
- Atualmente: `newMinutes = (dailyNewCards * avg) / 60` (pode exceder capacidade)
- Corrigir: `newMinutes = Math.min((dailyNewCards * avg) / 60, todayCapacityMinutes - reviewMinutes)`

Alem disso, `estimatedMinutesToday` deve ser `reviewMinutes + newMinutes` capped pela capacidade real.

---

## Detalhes Tecnicos

### DeckCarousel.tsx - Mudanca na funcao `getDeckTodayStats`

Adicionar parametro opcional `planAllocation`:

```text
function getDeckTodayStats(deck, allDecks, planAllocation?) {
  const dailyNewLimit = planAllocation?.[deck.id] ?? deck.daily_new_limit ?? 20;
  // ... resto igual
}
```

Propagar `planAllocation` via props no `DeckCarousel` e `DeckStudyCard`.

### useDashboardState.ts - Mesma logica

Na funcao `getAggregateStats`, aceitar `planAllocation` e usar quando disponivel:

```text
const dailyNewLimit = planAllocation?.[rootDeck.id] ?? rootDeck.daily_new_limit ?? 20;
```

### StudyPlan.tsx - Invalidar query do simulador

No `onValueCommit` do slider:

```text
onValueCommit={(v) => {
  updateNewCardsLimit.mutateAsync(v[0]).then(() => {
    queryClient.invalidateQueries({ queryKey: ['daily-new-cards-limit'] });
  });
}}
```

### useStudyPlan.ts - Corrigir newMinutes

```text
const maxNewMinutes = Math.max(0, todayCapacityMinutes - reviewMinutes);
const dailyNewCards = Math.min(globalNewBudget, totalNew);
const newMinutes = Math.min(Math.round((dailyNewCards * avg) / 60), maxNewMinutes);
const estimatedMinutesToday = reviewMinutes + newMinutes;
```

---

## Resumo de arquivos

| Arquivo | Mudanca |
|---------|---------|
| `DeckCarousel.tsx` | Aceitar e usar `planAllocation` no calculo de cards novos |
| `useDashboardState.ts` | Aceitar e usar `planAllocation` no `getAggregateStats` |
| `StudyPlan.tsx` | Invalidar query do simulador ao mudar slider + passar `deckNewAllocation` ao dashboard |
| `useStudyPlan.ts` | Cap `newMinutes` pela capacidade restante apos revisoes |
| `Dashboard.tsx` | Passar `deckNewAllocation` do `useStudyPlan` para `DeckCarousel` |

## Fluxo esperado apos as mudancas

1. Usuario define 30 cards novos/dia no slider do Meu Plano
2. O slider atualiza o perfil e invalida queries relacionadas
3. O grafico de previsao recalcula com o novo valor
4. No dashboard, cada deck mostra a cota calculada (ex: Deck A: 18 novos, Deck B: 12 novos)
5. O tempo estimado reflete corretamente o total sem exceder a capacidade diaria
