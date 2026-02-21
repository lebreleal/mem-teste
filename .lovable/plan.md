
## Plano: Corrigir contagem de cards novos, restaurar background da legenda e alinhar icones

### Problemas

1. **Total de cards novos errado (177 em vez de 412)**: O `totalNewCards` vem de `paramsQuery.data?.cards?.filter(c => c.state === 0)` que so conta cards no estado "novo" (`state === 0`). Porem os cards dos objetivos incluem cards em outros estados (learning, relearning) que tambem precisam ser estudados. O valor correto e usar o `totalNew` do `useStudyPlan` (que vem do RPC `get_plan_metrics`), que ja conta todos os cards novos restantes nos decks dos objetivos.

2. **"Cards criados/dia" nao afeta legenda**: O `createdInPeriod` e somado ao total, mas o texto nao explica isso separadamente.

3. **Background removido da legenda**: O usuario quer o background de volta.

4. **Icones desalinhados**: Os icones na legenda e no informativo precisam estar centralizados verticalmente.

5. **Explicacao do dashboard confusa**: O bloco de "Conclusao estimada" mostra texto confuso quando a meta esta em risco.

### Solucao

#### 1. Usar `totalNew` real dos objetivos em vez de `totalNewCards` do simulador

O `totalNewCards` do simulador filtra `state === 0` dos `ForecastParams.cards` -- isso pode nao incluir todos os cards. O valor correto ja existe no `useStudyPlan` como `metrics.totalNew` (412). Passar esse valor como prop ao `ForecastSimulator`.

**`src/pages/StudyPlan.tsx`**:
- Trocar `totalNewCards={totalNewCards}` por `totalNewCards={metrics?.totalNew ?? totalNewCards}` para usar o valor real dos objetivos.

#### 2. Restaurar background da legenda

**`src/components/study-plan/PlanComponents.tsx` (linha ~500)**:
- Trocar `<div className="px-1 pt-2 space-y-1.5">` de volta para `<div className="rounded-lg bg-muted/50 border px-3 py-2.5 space-y-1.5">`

#### 3. Centralizar icones na legenda e no informativo

**`src/components/study-plan/PlanComponents.tsx`** (linhas ~504-533):
- Trocar `flex items-start` por `flex items-center` nos paragrafos com icones
- Remover `mt-0.5` dos icones (ja que items-center centraliza)

**Info banner (linhas ~359-365)**:
- Trocar `flex items-start` por `flex items-center`

#### 4. Melhorar explicacao quando "createdCardsPerDay > 0"

No texto da legenda, quando ha cards criados/dia, separar: "Voce tem X cards novos nos seus objetivos + Y sendo criados/dia"

#### 5. Simplificar explicacao do dashboard

No bloco de conclusao estimada (`StudyPlan.tsx` linhas ~1508-1521), simplificar o texto:
- Gargalo de tempo: "Seu tempo de estudo ({X}min/dia) permite ~{Y} novos cards/dia apos as revisoes."
- Gargalo de limite: "Seu limite atual e {X} novos cards/dia. Para cumprir a meta, precisaria de {Y}/dia."

### Detalhes Tecnicos

**`src/pages/StudyPlan.tsx` (linha ~594)**:
```typescript
// De:
totalNewCards={totalNewCards}
// Para:
totalNewCards={metrics?.totalNew ?? totalNewCards}
```

**`src/components/study-plan/PlanComponents.tsx` (linha ~500)**:
```typescript
// De:
<div className="px-1 pt-2 space-y-1.5">
// Para:
<div className="rounded-lg bg-muted/50 border px-3 py-2.5 space-y-1.5">
```

**`src/components/study-plan/PlanComponents.tsx` (linhas ~504, 508, 513, 531)**:
Todas as linhas com `flex items-start gap-1.5` -> `flex items-center gap-1.5` e remover `mt-0.5` dos icones.

**`src/components/study-plan/PlanComponents.tsx` (linhas ~359-360)**:
```typescript
// De:
<div className="flex items-start gap-2 text-[10px] text-primary px-2 py-1">
// Para:
<div className="flex items-center gap-2 text-[10px] text-primary px-2 py-1">
```

**`src/pages/StudyPlan.tsx` (linhas ~1509-1521)**:
Simplificar texto do gargalo removendo explicacoes redundantes e usando frases diretas.
