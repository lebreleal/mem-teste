

## Plano: Corrigir legenda, cards criados no grafico e aviso de meta inviavel

### Problema 1: Cards criados/dia sumiram do grafico

O worker (`forecastWorker.ts`) cria cards com `state: 0` e adiciona ao `newByDeck`, fazendo-os entrar no pool de "novos". No grafico, eles aparecem misturados na barra "Novos" (azul) sem distincao. O usuario quer que cards criados tenham sua propria representacao visual.

**Solucao**: Adicionar campo `createdCards` e `createdMin` ao tipo `ForecastPoint` e ao worker, rastreando separadamente quantos dos "novos" do dia vieram do pool de criados. No grafico, nao precisa de barra separada (complicaria demais), mas na legenda e tooltip mostrar a composicao: "X novos (Y criados + Z existentes)".

**Arquivos**:
- `src/types/forecast.ts` -- adicionar `createdCards: number` ao `ForecastPoint`
- `src/workers/forecastWorker.ts` -- rastrear cards criados por dia separadamente no point
- `src/components/study-plan/PlanComponents.tsx` -- tooltip e legenda mostram composicao

---

### Problema 2: Texto "Meta inviavel" confuso

O texto atual diz "para dominar todos os cards ate a data" mas nao diz QUAL data. O usuario quer clareza.

**Solucao**: Incluir a data limite explicitamente em TODOS os avisos de meta inviavel:

**De**: "Para dominar todos os cards ate a data escolhida, seriam necessarios 206 novos cards/dia..."

**Para**: "Para estudar todos os 412 cards novos ate 22/02/2026, voce precisaria de 206 novos cards/dia, o que causa burnout. Recomendamos no maximo 50/dia."

**Arquivos**:
- `src/pages/StudyPlan.tsx` -- 3 locais com aviso de meta (linhas ~856, ~1547, ~849-850)

---

### Problema 3: Botao "Mudar" abre tela de edicao inesperada

No dashboard (linha 1555-1561), o botao "Mudar data limite" chama `startEdit(plan)` + `setStep(3)`, que abre o formulario de edicao completo do objetivo. Isso e confuso porque o usuario esperava apenas alterar a data, nao sair do dashboard.

**Solucao**: Em vez de abrir o editor completo, o botao deve alterar a data diretamente para a data sugerida (igual ao comportamento do editor de objetivo nas linhas 864-866 que faz `setTargetDate(suggestedDate)`). Ou abrir um dialog inline com calendario.

A abordagem mais simples: o botao do dashboard aplica a data sugerida diretamente via mutacao (salvar no banco) em vez de abrir o editor.

**Arquivo**: `src/pages/StudyPlan.tsx` -- alterar onClick dos botoes "Mudar data limite" no dashboard (linhas ~1555 e ~1576) para aplicar a data sugerida diretamente via `updatePlan` mutation.

---

### Detalhes Tecnicos

#### 1. `src/types/forecast.ts`
Adicionar ao `ForecastPoint`:
```typescript
createdCards: number;  // cards que foram criados naquele dia (subset de newCards)
```

#### 2. `src/workers/forecastWorker.ts`
Rastrear `createdCardsToday` separadamente:
```typescript
// Apos "Generate newly created cards for today"
let createdCardsToday = 0;
if (createdCardsPerDay > 0 && day > 0) {
  // ... logica existente ...
  createdCardsToday = totalCreatedThisDay;
}

// No push do point:
points.push({
  ...existente,
  createdCards: Math.round(createdCardsToday * scaleFactor),
});
```

Tambem na agregacao semanal (linha ~400), agregar `createdCards`.

#### 3. `src/components/study-plan/PlanComponents.tsx`

**Tooltip** (linha ~411): Quando `d.createdCards > 0`, mostrar:
```
X novos (Y existentes + Z criados) -- Xmin
```

**Legenda** (linha ~507): Quando `createdInPeriod > 0`, mostrar:
```
🎯 412 cards novos existentes + ~630 a criar (90 criados/dia x 7 dias) ate 22/02/2026
```

**Status**: Manter logica atual de verde/amarelo.

#### 4. `src/pages/StudyPlan.tsx`

**Meta inviavel** -- incluir data e total explicitos:
```
⚠ Para estudar todos os 412 cards novos ate 22/02/2026, voce precisaria de 206 novos/dia, o que causa burnout. Recomendamos no maximo 50/dia.
```

**Botao "Mudar"** no dashboard -- aplicar data diretamente:
```typescript
onClick={() => {
  const editablePlan = plans.find(p => p.target_date);
  if (editablePlan) {
    updatePlan.mutate({ id: editablePlan.id, target_date: suggestedDate.toISOString() });
  }
}}
```

---

### Resumo de arquivos a editar

1. `src/types/forecast.ts` -- adicionar `createdCards` ao ForecastPoint
2. `src/workers/forecastWorker.ts` -- rastrear e emitir `createdCards` por dia/semana
3. `src/components/study-plan/PlanComponents.tsx` -- tooltip e legenda com composicao
4. `src/pages/StudyPlan.tsx` -- textos de meta inviavel com data explicita + botao Mudar aplica direto

