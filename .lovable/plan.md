

## Plano: Corrigir contagem de cards novos, melhorar legenda e interpretacao do simulador

### Problemas Identificados

1. **Total de cards novos muda com a view (7d=210, 30d=270, 90d=60)**: O calculo `totalNewRemaining = currentNewCards * intenseDays` esta completamente errado -- ele multiplica os cards/dia pelo numero de dias com novos na simulacao, que varia conforme o horizonte. O valor correto deveria vir dos dados reais (cards com state=0 nos params do simulador).

2. **"Cards criados/dia" nao afeta a legenda**: Quando o usuario aumenta `createdCardsPerDay`, o worker adiciona cards novos a cada dia da simulacao, mas o resumo nao reflete isso.

3. **Legenda com background**: O bloco de resumo tem `bg-muted/50 border` que o usuario quer remover.

4. **Info "i" pouco responsivo**: O icone e pequeno demais para toque mobile.

5. **Alinhamento da legenda/interpretacao**: Precisa melhorar a visualizacao geral.

---

### Solucao

#### 1. Expor `totalNewCards` real do `useForecastSimulator`

No hook `useForecastSimulator.ts`, contar os cards com `state === 0` do `paramsQuery.data.cards` e expor como `totalNewCards`:
```typescript
const totalNewCards = paramsQuery.data?.cards?.filter(c => c.state === 0).length ?? 0;
// retornar no objeto de retorno
```

#### 2. Passar `totalNewCards` como prop para `ForecastSimulator`

Em `ForecastSimulatorSection` (StudyPlan.tsx), passar o novo valor. Em `ForecastSimulator` (PlanComponents.tsx), receber como prop.

#### 3. Corrigir calculo de `totalNewRemaining` no resumo

Substituir `currentNewCards * intenseDays` pelo valor real:
```typescript
// Com createdCards: total = newCards existentes + (createdCardsPerDay * horizonDays)
const totalNewRemaining = totalNewCards + (createdCardsPerDay * horizonDays);
```

Isso garante que:
- O numero nao muda com a view (sempre reflete os cards reais)
- `createdCardsPerDay` e somado ao total (cards que serao criados no periodo)

#### 4. Remover background da legenda

Trocar `bg-muted/50 border` por layout limpo sem fundo:
```typescript
// De:
<div className="rounded-lg bg-muted/50 border px-3 py-2.5 space-y-1.5">
// Para:
<div className="px-1 pt-2 space-y-1.5">
```

#### 5. Melhorar responsividade do Info "i"

Aumentar a area de toque do icone Info:
```typescript
// De:
<Info className="h-3 w-3 shrink-0 mt-0.5" />
// Para:
<div className="shrink-0 p-1 -m-1">
  <Info className="h-3.5 w-3.5" />
</div>
```

#### 6. Ajustar texto da legenda para ser consistente

- Quando ha `createdCardsPerDay > 0`, informar: "Voce tem X cards novos + Y criados/dia (Z no periodo)"
- A contagem de cards novos sera sempre a mesma independente da view escolhida
- O numero de dias intensos ainda pode variar com a view, mas o total de cards e fixo

---

### Detalhes Tecnicos

**`src/hooks/useForecastSimulator.ts` (linha ~124-133):**
- Adicionar: `const totalNewCards = paramsQuery.data?.cards?.filter(c => c.state === 0).length ?? 0;`
- Incluir `totalNewCards` no retorno do hook

**`src/pages/StudyPlan.tsx` (ForecastSimulatorSection, linhas ~556-607):**
- Desestruturar `totalNewCards` do `useForecastSimulator`
- Passar como prop `totalNewCards={totalNewCards}` ao `ForecastSimulator`
- Passar tambem `createdCardsPerDay` efetivo

**`src/components/study-plan/PlanComponents.tsx` (linhas ~101-136):**
- Adicionar `totalNewCards: number` na interface de props do `ForecastSimulator`

**`src/components/study-plan/PlanComponents.tsx` (linhas ~489-493):**
- Substituir `const totalNewRemaining = currentNewCards * intenseDays;` por:
  ```typescript
  const createdInPeriod = (createdCardsOverride ?? defaultCreatedCardsPerDay) * data.length;
  const totalNewRemaining = totalNewCards + createdInPeriod;
  ```

**`src/components/study-plan/PlanComponents.tsx` (linha ~496):**
- Remover `bg-muted/50 border` do div wrapper do resumo

**`src/components/study-plan/PlanComponents.tsx` (linhas ~358-362):**
- Aumentar area de toque do `<Info>` icon com padding wrapper

