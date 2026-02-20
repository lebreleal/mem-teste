
# Grafico Semanal de Cards + Correcao do Calculo de Capacidade

## Resumo

Duas mudancas principais:
1. Substituir o HealthRing (anel de 100%) por um grafico de barras vertical mostrando cards por dia da semana
2. Corrigir o calculo de capacidade para considerar reviews + novos cards corretamente

---

## 1. Grafico de Barras Semanal (substitui o HealthRing no Hero Card)

Remover o componente `HealthRing` do Hero Card e substituir por um grafico de barras usando Recharts (ja instalado no projeto).

**Eixo X:** Dias da semana (Seg, Ter, Qua, Qui, Sex, Sab, Dom) - baseado na capacidade definida pelo usuario

**Eixo Y:** Quantidade de cards

**Cada barra mostra duas cores empilhadas:**
- Azul/Primary: cards de revisao estimados para aquele dia
- Verde claro: cards novos que cabem no tempo restante

**Calculo por dia:**
- Para cada dia da semana, pegar os minutos definidos (de `weekly_minutes` ou `daily_minutes`)
- Converter minutos em capacidade total de cards: `Math.floor((minutesDia * 60) / avgSecondsPerCard)`
- Dividir entre reviews e novos: como usuario novo nao tem historico, usar proporcao global dos cards pendentes (`totalReview / totalPending` para reviews, `totalNew / totalPending` para novos)
- Se houver historico (totalReview > 0), reviews tem prioridade - primeiro aloca reviews ate o limite, depois preenche com novos

**O label de status** (No Caminho / Atencao / Em Risco) continua visivel acima do grafico, como um badge colorido compacto em vez do anel grande.

**Componente:** `WeeklyCardChart` usando `BarChart` do Recharts com `ResponsiveContainer`, altura de ~160px.

---

## 2. Correcao do Calculo de Capacidade

### Problema atual
O calculo em `useStudyPlan.ts` (linhas 170-174) calcula `estimatedMinutesToday` como:
- `reviewMinutes = totalReview * avgSec / 60` (todos os reviews pendentes, nao apenas os de hoje)
- `newMinutes = min(capacityCardsToday - totalReview, totalNew) * avgSec / 60`

Isso esta errado porque `totalReview` eh o total de reviews pendentes (pode ser centenas), nao os reviews do dia.

### Correcao
Mudar a logica para:
1. **Reviews do dia** = `totalReview` (cards com scheduled_date <= now, que precisam ser feitos hoje)
2. **Capacidade restante para novos** = `max(0, capacityCardsToday - totalReview)` - isso ja esta correto
3. **Cards novos do dia** = `min(capacidadeRestante, totalNew)`
4. **Total estimado** = `reviewMinutes + newMinutes` (correto)

O problema real eh que `totalReview` da RPC `get_plan_metrics` retorna todos os reviews vencidos acumulados, nao apenas os de hoje. Para um usuario novo sem historico, `totalReview` seria 0 e `totalNew` seria todos os cards.

**Proporcao para usuario novo (sem historico):**
- Usar uma proporcao padrao: ~70% da capacidade para novos cards, ~30% reservado para reviews que surgirao ao longo do dia (cards em aprendizado que vencem)
- Conforme o usuario ganha historico, a proporcao real substitui a padrao

**Nova logica em `useStudyPlan.ts`:**

```
// Se nao ha reviews pendentes (usuario novo), estimar baseado em proporcao
const estimatedReviewsToday = totalReview > 0 
  ? Math.min(totalReview, capacityCardsToday) 
  : Math.min(totalLearning, Math.ceil(capacityCardsToday * 0.3));

const reviewMinutes = Math.round((estimatedReviewsToday * avgSec) / 60);
const remainingCapacity = Math.max(0, capacityCardsToday - estimatedReviewsToday);
const dailyNewCards = Math.min(remainingCapacity, totalNew);
const newMinutes = Math.round((dailyNewCards * avgSec) / 60);
const estimatedMinutesToday = reviewMinutes + newMinutes;
```

---

## 3. Dados do Grafico Semanal

Nova propriedade em `PlanMetrics`:

```typescript
weeklyCardData: Array<{
  day: string;       // "Seg", "Ter", etc.
  review: number;    // cards de revisao estimados
  newCards: number;   // cards novos estimados
  total: number;      // review + newCards
  minutes: number;    // minutos definidos pelo usuario
}>
```

Calculado no `useMemo` do hook, iterando por cada dia da semana:

```
DAY_KEYS.map(dayKey => {
  const dayMinutes = getMinutesForDay(plan, dayKey);
  const dayCapacity = Math.floor((dayMinutes * 60) / avgSec);
  const dayReviews = Math.min(totalReview > 0 ? totalReview : totalLearning, 
                              Math.ceil(dayCapacity * reviewRatio));
  const dayNew = Math.min(dayCapacity - dayReviews, totalNew);
  return { day: DAY_LABELS[dayKey], review: dayReviews, newCards: dayNew, ... };
})
```

---

## Secao Tecnica

### Arquivos modificados

| Arquivo | Mudanca |
|---------|---------|
| `src/hooks/useStudyPlan.ts` | Adicionar `weeklyCardData` ao PlanMetrics, corrigir calculo de reviewMinutes/newMinutes |
| `src/pages/StudyPlan.tsx` | Substituir HealthRing por WeeklyCardChart no Hero Card, manter badge de status |

### Imports novos em StudyPlan.tsx

```typescript
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
```

### Componente WeeklyCardChart

- Altura: 160px
- Barras empilhadas (stacked): review (cor primary) + novos (cor emerald)
- Labels do eixo X: dias da semana abreviados
- Eixo Y: numeros inteiros
- Tooltip mostrando detalhamento ao tocar/hover
- Acima do grafico: badge compacto com cor de status + label ("No Caminho", etc.)

### Remocoes

- Componente `HealthRing` removido do Hero Card (pode manter a funcao para uso futuro mas nao renderiza mais)
- A constante `HEALTH_CONFIG` permanece para cores do badge de status
