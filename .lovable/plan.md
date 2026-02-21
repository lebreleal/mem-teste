

## Plano: Corrigir simulador de estudos — capacidade, consistencia e textos

### Bug 1: Tempo de estudo nao afeta o grafico

**Problema**: O worker processa TODOS os cards de revisao e TODOS os novos cards do dia, independente da capacidade (tempo de estudo). Mudar de 90min para 209min so move a linha de referencia — as barras nao mudam. O usuario espera que com mais tempo, o grafico reflita uma carga diferente (menos acumulo, mais folga para novos cards).

**Causa raiz**: O worker nao limita os cards novos pela capacidade disponivel apos revisoes. Revisoes sao obrigatorias (nao podem ser puladas), mas novos cards so deveriam entrar se houver tempo sobrando.

**Solucao**: No worker, apos processar revisoes + aprendendo + reaprendendo, calcular minutos restantes. Limitar `newCardsPerDay` pelo que cabe no tempo disponivel:

```text
capacidadeRestante = capacityMin - (reviewMin + learningMin + relearningMin)
maxNovosPorTempo = floor(capacidadeRestante * 60 / newSecsPerCard)
novosEfetivos = min(newCardsPerDay, maxNovosPorTempo)
```

Isso faz o grafico reagir a mudancas de tempo de estudo.

**Arquivo**: `src/workers/forecastWorker.ts`

---

### Bug 2: Dashboard diz "prazo ok" mas wizard diz "meta apertada"

**Problema**: O dashboard usa `projectedCompletionDate` (baseado na taxa efetiva real) e nao aplica margem. O wizard usa `minDaysNeeded * 1.3` como margem e marca "meta apertada" quando `daysLeft < minDaysNeeded * 1.3`. Resultado: com target_date em 03/03 e projecao em 02/03, o dashboard diz OK mas o wizard diz apertada.

**Solucao**: 
1. Remover a margem de 1.3x do wizard para o check "isTight". Manter a margem apenas na sugestao de data.
2. Na tela do wizard, usar a mesma logica do dashboard: comparar a data projetada vs target_date.
3. Explicar melhor o proposito: "a meta serve para voce dominar todos os cards novos ANTES da data limite".

**Arquivos**: `src/pages/StudyPlan.tsx` (wizard feasibility check)

---

### Bug 3: Textos de "meta apertada/inviavel" confusos

**Problema**: O usuario nao entende o proposito da data limite. Os textos nao explicam que o objetivo e DOMINAR (iniciar o estudo de) todos os cards novos antes da data.

**Solucao**: Reformular todos os textos de meta para deixar claro:
- "Para dominar todos os X cards novos antes de DD/MM/YYYY, voce precisaria iniciar Y cards/dia"
- "No ritmo atual, voce termina os cards novos em DD/MM/YYYY — antes da sua data limite"
- Adicionar texto explicativo no wizard: "A data limite indica ate quando voce quer ter INICIADO o estudo de todos os cards novos dos baralhos selecionados."

**Arquivos**: `src/pages/StudyPlan.tsx`, `src/components/study-plan/PlanComponents.tsx`

---

### Bug 4: Data sugerida incorreta

**Problema**: A data sugerida usa um cap fixo de 50/dia sem considerar a taxa efetiva real (limitada pelo tempo de estudo). Se o usuario tem 90min e cada card novo leva 30s, ele pode estudar no maximo ~X novos apos revisoes. A sugestao deveria considerar isso.

**Solucao**: Calcular `effectiveRate = min(budget, cardsFitByTime)` e usar isso na sugestao de data em vez do cap fixo de 50.

**Arquivos**: `src/pages/StudyPlan.tsx` (dashboard + wizard)

---

### Detalhes Tecnicos

#### 1. `src/workers/forecastWorker.ts` — Capacidade limita novos cards

Mover o calculo de minutos de revisao para ANTES da introducao de novos cards:

```typescript
// Calcular minutos de revisao/learning/relearning primeiro
const revMin = Math.round((reviewCount * reviewSecsPerCard * scaleFactor) / 60);
const learnMin = Math.round((learningCount * learningSecsPerCard * scaleFactor) / 60);
const relearnMin = Math.round((relearningCount * relearningSecsPerCard * scaleFactor) / 60);
const usedMin = revMin + learnMin + relearnMin;
const availableForNewMin = Math.max(0, capacityMin - usedMin);
const maxNewByCapacity = Math.floor((availableForNewMin * 60) / newSecsPerCard);
const effectiveNewLimit = Math.min(newCardsPerDay, Math.max(0, maxNewByCapacity));
// Usar effectiveNewLimit em vez de newCardsPerDay para remainingNew
```

Isso requer reordenar o loop: processar reviews/learning/relearning ANTES de decidir quantos novos introduzir.

#### 2. `src/pages/StudyPlan.tsx` — Wizard feasibility consistente

```typescript
// Remover margem de 1.3x do check isTight
const isTight = !isImpossible && daysLeft < minDaysNeeded * 1.1; // margem minima
// Manter 1.3x apenas na sugestao de data
const safeDays = Math.ceil(minDaysNeeded * 1.3);
```

Textos do wizard step 3:
```text
"A data limite indica ate quando voce quer ter iniciado o estudo de todos 
os cards novos dos baralhos selecionados."
```

#### 3. `src/components/study-plan/PlanComponents.tsx` — Legenda com explicacao

Na legenda, quando ha target date:
```text
"Para dominar todos os X cards novos antes de DD/MM/YYYY, 
voce precisa iniciar ~Y novos/dia."
```

#### 4. Sugestao de data baseada em effective rate

Dashboard e wizard usam a mesma formula:
```typescript
const effectiveRate = Math.min(budget, cardsFitByTime, 50); // cap de 50 p/ burnout
const minDays = Math.ceil(totalNew / effectiveRate);
const safeDays = Math.ceil(minDays * 1.3);
```

---

### Resumo de arquivos a editar

1. `src/workers/forecastWorker.ts` — reordenar loop: reviews primeiro, depois limitar novos pela capacidade
2. `src/pages/StudyPlan.tsx` — consistencia de feasibility, textos claros, sugestao de data correta
3. `src/components/study-plan/PlanComponents.tsx` — legenda e avisos com linguagem clara sobre "dominar cards antes da data"

