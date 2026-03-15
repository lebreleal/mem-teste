

# Bugs: Limite de Novos por Matéria e Tempo Estimado

## Problema 1: Dashboard soma limites por sub-deck em vez de por matéria

Em `Dashboard.tsx` (`collectStudyStats`), a função recursiva processa **cada deck individualmente**, aplicando `deckDailyNewLimit` por sub-deck. Quando uma matéria tem 3 sub-decks, cada um com `daily_new_limit = 20` (valor default no banco), o Dashboard calcula 20+20+20 = 60 novos cards — quando deveria ser apenas 20 (o limite da matéria-pai).

**Linha 510-511 (bug):**
```js
// Roda para CADA deck, incluindo sub-decks
const deckRemainingNewToday = Math.max(0, deckDailyNewLimit - deckNewReviewedToday);
newCountTodayByDeckLimits += Math.min(deckNewCount, deckRemainingNewToday);
```

**Correção:** Quando o deck tem `parent_deck_id` (é sub-deck), NÃO aplicar limite individual. Apenas acumular o `new_count` bruto. O limite é aplicado uma única vez no nível da matéria-pai (root deck), cobrindo todos os seus descendentes coletivamente.

Lógica corrigida:
- Root deck (matéria ou deck solto): soma `new_count` de si + todos descendentes, aplica `Math.min(somaNewCount, dailyNewLimit - newReviewedToday)` uma vez
- Isso garante que "20 novos na matéria" = 20 novos entre TODOS os sub-decks

## Problema 2: StudySettingsSheet não mostra decks soltos fora de matérias

O `salaDecks` filtra corretamente `folder_id === currentFolderId && !parent_deck_id`. Decks soltos (sem sub-decks) JÁ aparecem. Confirmar se o problema está nos decks que ficaram sem `folder_id` (legado). Se sim, o fix do bootstrap (já planejado) resolve isso.

## Problema 3: Tempo estimado usa contagem inflada

Como `newCountToday` está inflado pelo bug #1, o `calculateRealStudyTime(newCountToday, ...)` gera tempo inflado. Corrigir o bug #1 corrige automaticamente o tempo.

## Plano de Implementação

### Arquivo: `src/pages/Dashboard.tsx` (~linhas 487-515)

Refatorar `collectStudyStats` para acumular new counts por hierarquia e aplicar limite uma vez por root deck:

```js
const collectStudyStats = (deckId: string, isRoot: boolean) => {
  const dk = allDecks.find(d => d.id === deckId);
  if (!dk || dk.is_archived) return;

  // Accumulate learning + review from every deck
  learningCount += dk.learning_count ?? 0;
  reviewCount += dk.review_count ?? 0;
  reviewedToday += dk.reviewed_today ?? 0;
  totalReviewReviewedToday += Math.max(0, (dk.reviewed_today ?? 0) - (dk.new_graduated_today ?? 0));

  if (isRoot) {
    totalDailyReviewLimit += dk.daily_review_limit ?? 100;

    // Collect ALL new_count from this hierarchy
    let hierarchyNewCount = dk.new_count ?? 0;
    let hierarchyNewReviewed = dk.new_reviewed_today ?? 0;
    const collectChildNew = (parentId: string) => {
      const children = allDecks.filter(d => d.parent_deck_id === parentId && !d.is_archived);
      for (const c of children) {
        hierarchyNewCount += c.new_count ?? 0;
        hierarchyNewReviewed += c.new_reviewed_today ?? 0;
        collectChildNew(c.id);
      }
    };
    collectChildNew(deckId);

    // Apply limit ONCE for the whole hierarchy
    const remaining = Math.max(0, (dk.daily_new_limit ?? 20) - hierarchyNewReviewed);
    rawNewCount += hierarchyNewCount;
    newCountTodayByDeckLimits += Math.min(hierarchyNewCount, remaining);
  }

  // Still recurse for learning/review/reviewedToday
  const children = allDecks.filter(d => d.parent_deck_id === deckId && !d.is_archived);
  for (const c of children) collectStudyStats(c.id, false);
};
```

Cuidado: evitar double-counting de learning/review nos filhos (já acumulado no recurse). A refatoração separa a coleta de `new_count` (feita apenas no root) da coleta de learning/review (feita na recursão normal).

### Validação
- Matéria com 3 sub-decks e limit 20 → Dashboard mostra max 20 novos (não 60)
- Deck solto com limit 10 → mostra max 10 novos
- Tempo estimado proporcional aos novos corretos

