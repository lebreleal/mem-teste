
## Plano: Sincronizar projecao de conclusao com taxa efetiva real

### Problema

A data de conclusao estimada (`projectedCompletionDate`) e calculada no hook `useStudyPlan.ts` usando o **limite de novos cards** (52/dia), ignorando o gargalo de tempo. Porem, a UI em `StudyPlan.tsx` recalcula a taxa efetiva como `min(52, 23) = 23 cards/dia` (baseado no tempo disponivel). Resultado: a projecao diz "conclui ate 28/02" (usando 52/dia) mas mostra "23/dia" e "Em risco" (usando a taxa real).

### Solucao

Corrigir o calculo de `projectedCompletionDate` no hook para usar a **taxa efetiva** (menor entre limite de cards e capacidade de tempo), nao apenas o limite de cards.

### Detalhes Tecnicos

**Arquivo: `src/hooks/useStudyPlan.ts` (linhas 398-404)**

Substituir o calculo atual:
```typescript
if (globalNewBudget > 0 && totalNew > 0) {
  const daysForNew = Math.ceil(totalNew / globalNewBudget);
  ...
}
```

Pelo calculo com taxa efetiva:
```typescript
if (globalNewBudget > 0 && totalNew > 0) {
  // Effective rate = min(card limit, cards that fit in available time)
  const availMinForNew = Math.max(0, avgDailyMinutes - reviewMinutes);
  const cardsFitByTime = availMinForNew > 0 ? Math.floor((availMinForNew * 60) / avg) : 0;
  const effectiveRate = Math.min(globalNewBudget, cardsFitByTime);
  const rateToUse = Math.max(1, effectiveRate);
  const daysForNew = Math.ceil(totalNew / rateToUse);
  ...
}
```

Isso garante que a projecao, o status de saude, e a UI da secao "Conclusao estimada" usem todos a **mesma taxa**, eliminando a contradição entre as duas telas.

**Arquivo: `src/pages/StudyPlan.tsx` (linhas 1450-1462)**

A UI ja calcula `effectiveRate` corretamente. Nenhuma mudanca necessaria aqui -- o fix no hook resolve a dessincronizacao automaticamente.
