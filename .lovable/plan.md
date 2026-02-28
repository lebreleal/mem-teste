

## Plano: Corrigir intervalos identicos (1d/1d/1d) para Dificil/Bom/Facil

### Problema

Dois bugs combinados fazem com que Dificil, Bom e Facil mostrem "1d" identicos:

**Bug 1 - `last_reviewed_at` ausente no preview de multipla escolha (FlashCard.tsx, linha 251):**
O card de multipla escolha constroi o `FSRSCard` sem `last_reviewed_at`, fazendo o algoritmo usar `scheduled_date` (que esta no futuro) como referencia. Isso gera `elapsedDays` negativo/zero, ativando erroneamente o caminho de "same-day review".

**Bug 2 - Sem diferenciacao no caminho same-day (fsrs.ts, linhas 231-241):**
Quando `elapsedDays < 1`, o codigo aplica `sameDayStability` e retorna `Math.max(interval, 1)` para todos os ratings (Hard/Good/Easy). Com estabilidade baixa, todos produzem intervalo = 1 dia. Diferente do caminho normal (linhas 258-265) que garante: Hard >= currentInterval, Good >= currentInterval+1, Easy >= currentInterval+2.

### Solucao

**Arquivo 1: `src/components/FlashCard.tsx`**
- Linha 251: Adicionar `last_reviewed_at: lastReviewedAt` ao FSRSCard da preview de multipla escolha (igual a linha 628)

**Arquivo 2: `src/lib/fsrs.ts`**
- Caminho same-day review (linhas 231-241): Adicionar diferenciacao de piso para os ratings:
  - Hard: `Math.max(interval, 1)` (mantido)
  - Good: `Math.max(interval, 2)` (minimo 2 dias)
  - Easy: `Math.max(interval, 3)` (minimo 3 dias)

**Arquivo 3: `src/test/fsrs-long-sequence.test.ts`**
- Adicionar teste especifico: card com baixa estabilidade em same-day review deve mostrar intervalos diferenciados (Hard < Good < Easy)
- Adicionar teste: preview sem `last_reviewed_at` nao deve estagnar em 1d

### Detalhes tecnicos

**fsrs.ts - same-day review fix:**
```typescript
// Same-day review (elapsed < 1 day)
if (elapsedDays < 1) {
  const s = sameDayStability(w, card.stability, rating);
  if (rating === 1) {
    // ... existing Again logic
  }
  const interval = stabilityToInterval(w, s, requestedRetention, maximumInterval);
  // Floor differentiation matching normal review behavior
  let minInterval = 1;
  if (rating === 3) minInterval = 2;
  if (rating === 4) minInterval = 3;
  const finalInterval = Math.max(interval, minInterval);
  const scheduledDate = getLocalMidnight(finalInterval);
  return { stability: s, difficulty: d, state: 2, scheduled_date: scheduledDate.toISOString(), interval_days: finalInterval, learning_step: 0 };
}
```

**FlashCard.tsx - linha 251 fix:**
```typescript
const fsrsCard: FSRSCard = { stability, difficulty, state, scheduled_date: scheduledDate, learning_step: learningStep ?? 0, last_reviewed_at: lastReviewedAt };
```

