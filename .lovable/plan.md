

# Prazo Inteligente: Aviso de Viabilidade e Distribuicao Equilibrada

## Como o prazo funciona

O peso de cada deck na distribuicao e calculado como `cards_novos / dias_ate_prazo`. Decks com prazo mais proximo recebem mais cards novos por dia. Isso e intencional — urgencia importa.

**Problema**: quando o prazo e impossivel (ex: 300 cards, prova amanha), o sistema nao avisa e a distribuicao fica absurda (38 vs 2).

## Mudancas

### 1. Aviso de viabilidade no wizard (ao definir prazo)

**Arquivo:** `src/pages/StudyPlan.tsx`

Quando o usuario seleciona uma data limite no Step 1:
- Calcular `total_new_cards / dias_restantes` usando o budget global
- Se `cards_necessarios > budget_global`, mostrar um banner de aviso:

```text
[Aviso amarelo/vermelho]
"Com 40 novos cards/dia e 300 cards restantes, voce precisaria de pelo menos 8 dias.
 A data selecionada (amanha) e insuficiente."

Sugestao: "Data minima viavel: DD/MM/YYYY"
```

- O aviso NAO bloqueia a criacao — o usuario pode criar mesmo assim
- Cores: amarelo se `dias_necessarios > dias_disponiveis * 0.7`, vermelho se totalmente inviavel

### 2. Aviso de viabilidade no card do objetivo (dashboard)

**Arquivo:** `src/pages/StudyPlan.tsx` (secao de objetivos no dashboard)

No card de cada objetivo com prazo, quando `coveragePercent < 50`:
- Mostrar badge "Meta inviavel" com icone de alerta
- Texto explicativo: "Voce precisaria de X cards/dia, mas seu limite e Y"
- Botao "Ajustar prazo" que abre o editor do objetivo

### 3. Manter formula com urgencia, mas com piso minimo

**Arquivos:** `src/hooks/useStudyPlan.ts` e `src/services/studyService.ts`

A formula `remaining / daysLeft` esta correta, mas quando um deck tem prazo muito curto, ele "rouba" quase todo o budget. Solucao: garantir um **piso minimo** para cada deck (ex: pelo menos 1 card/dia ou 5% do budget, o que for maior).

```text
// Em useStudyPlan.ts e studyService.ts
const minShare = Math.max(1, Math.ceil(globalNewBudget * 0.05));

// Apos calcular shares proporcionais:
for (const entry of allocations) {
  entry.share = Math.max(minShare, entry.share);
}
// Recalcular para nao exceder budget total
```

Isso garante que mesmo com Prova Histo tendo prazo amanha, Fisiopato ainda recebe pelo menos 2 cards/dia (5% de 40 = 2).

### 4. Corrigir reset de atrasados (scheduled_date)

**Arquivo:** `src/pages/StudyPlan.tsx`

Na funcao `handleResetOverdue`, adicionar `scheduled_date`:

```text
.update({ state: 0, stability: 0, difficulty: 0, scheduled_date: new Date().toISOString() })
```

E invalidar queries apos o reset:

```text
queryClient.invalidateQueries({ queryKey: ['plan-metrics'] });
queryClient.invalidateQueries({ queryKey: ['per-deck-new-counts'] });
queryClient.invalidateQueries({ queryKey: ['study-queue'] });
```

## Detalhes tecnicos

### Calculo de viabilidade no wizard (Step 1)

```text
// Apos selecionar data e decks:
const selectedNewCards = selectedDeckIds.reduce((sum, id) => {
  const deck = activeDecks.find(d => d.id === id);
  return sum + (deck?.new_count ?? 0);
}, 0);
const daysLeft = Math.max(1, Math.ceil((targetDate - today) / 86400000));
const minDaysNeeded = Math.ceil(selectedNewCards / globalCapacity.dailyNewCardsLimit);
const isViable = daysLeft >= minDaysNeeded;
```

### Piso minimo na distribuicao

```text
// useStudyPlan.ts - apos calcular shares proporcionais
const minPerDeck = Math.max(1, Math.ceil(globalNewBudget * 0.05));
let totalAllocated = 0;
for (const entry of sorted) {
  const rawShare = Math.round(globalNewBudget * (entry.weight / totalWeight));
  entry.share = Math.max(minPerDeck, rawShare);
  totalAllocated += entry.share;
}
// Se excedeu o budget, reduzir do maior
if (totalAllocated > globalNewBudget) {
  const excess = totalAllocated - globalNewBudget;
  sorted[0].share -= excess;
}
```

### Mesma logica em studyService.ts

Aplicar o mesmo piso minimo na funcao `fetchStudyQueue` para consistencia.

## Resumo de arquivos

| Arquivo | Mudanca |
|---------|---------|
| `StudyPlan.tsx` | Aviso de viabilidade no wizard + no dashboard + fix reset |
| `useStudyPlan.ts` | Piso minimo na distribuicao proporcional |
| `studyService.ts` | Mesma logica de piso minimo para consistencia |

## Resultado esperado

1. Usuario cria objetivo com 300 cards e prazo amanha
2. Wizard mostra: "Meta inviavel. Data minima viavel: 28/02/2026 (8 dias)"
3. Usuario pode criar mesmo assim, mas fica ciente
4. No dashboard, objetivo mostra badge "Meta inviavel"
5. Distribuicao: Histo recebe maioria mas Fisiopato mantém pelo menos 2 cards/dia
6. Reset de atrasados funciona corretamente

