

# Ajustes no Simulador de Previsao: Defaults, Capacidade por Dia da Semana, e Dias com 0min

## 1. Defaults fixos para novos cards e cards criados

**Arquivo:** `src/hooks/useForecastSimulator.ts`

Substituir a logica complexa de calculo de defaults por valores fixos recomendados:

- `defaultNewCardsPerDay` = **30** (fixo, independente do numero de decks ou reviews)
- `defaultCreatedCardsPerDay` = **0** (fixo, o usuario ajusta manualmente)

Isso elimina os problemas de 88, 880, 214 que apareciam antes.

## 2. Capacidade: sempre abrir no modo "por dia da semana"

**Arquivo:** `src/components/study-plan/PlanComponents.tsx`

- Quando abrir o modal de editar tempo de estudo, `weeklyMode` inicia como **true** (sempre por dia da semana)
- Remover o toggle "Igual todo dia" / "Por dia da semana" -- o padrao sempre sera por dia da semana
- Renomear o label do botao de `"Xmin/dia de estudo"` para `"Tempo de estudo diario"`
- No modal: titulo muda para **"Tempo de Estudo Diario"**
- Exibir o valor medio calculado (ex: "Media: 26min/dia") abaixo dos sliders

## 3. Comportamento com 0min em um dia (como o Anki faz)

**Arquivo:** `src/workers/forecastWorker.ts`

O Anki nao tem conceito de "capacidade diaria" -- ele simplesmente mostra os cards devidos. No nosso caso, se o usuario definir 0min para um dia:

- O simulador continua contabilizando os cards devidos naquele dia (para previsao realista)
- Mas o `capacityMin` sera 0, ou seja, o dia ficara "sobrecarregado" visualmente
- Na pratica, os cards que nao foram revisados naquele dia acumulam para o proximo dia (ja e o comportamento atual -- cards com `scheduledDay <= day` sao coletados)

Nao e necessario mudar a logica do worker. O comportamento ja esta correto: cards devidos se acumulam. Precisamos apenas garantir que o grafico exiba isso corretamente.

## 4. Remover ReferenceLine unica e usar capacidade por ponto

**Arquivo:** `src/components/study-plan/PlanComponents.tsx`

O problema: a `ReferenceLine` atual usa `maxCapacity` (o maior valor entre todos os dias), mas com tempos diferentes por dia ela fica enganosa. O Anki nao usa linha de referencia.

Solucao: **Remover a ReferenceLine fixa** e, em vez disso, manter apenas o indicador de sobrecarga (icone "!") que ja funciona. O tooltip ja mostra "Total: Xmin / Ymin capacidade".

Se todos os dias tiverem o mesmo tempo, adicionar de volta uma ReferenceLine sutil. Se forem diferentes, nao exibir linha.

## 5. Corrigir icone de sobrecarga (escala/posicionamento)

**Arquivo:** `src/components/study-plan/PlanComponents.tsx`

O icone "!" pode ficar cortado quando a barra e muito alta ou o chart tem escala automatica. Corrigir:

- Garantir que o `YAxis` tenha `domain` com margem superior para acomodar o icone: `domain={[0, (max: number) => Math.ceil(max * 1.15)]}`
- Ajustar posicao do icone para `y - 10` em vez de `y - 8`

## 6. Resumo das mudancas por arquivo

| Arquivo | Mudanca |
|---------|---------|
| `src/hooks/useForecastSimulator.ts` | Defaults fixos: 30 novos, 0 criados |
| `src/components/study-plan/PlanComponents.tsx` | Modal sempre "por dia da semana", remover toggle, renomear labels, remover ReferenceLine com weekly variavel, corrigir escala do icone |

## Detalhes tecnicos

### useForecastSimulator.ts

```typescript
// Substituir linhas 45-56 por:
const defaultNewCardsPerDay = 30;
const defaultCreatedCardsPerDay = 0;
```

### PlanComponents.tsx -- Modal de capacidade

- `setWeeklyMode(true)` ao abrir (sempre)
- Remover os botoes de toggle "Igual todo dia" / "Por dia da semana"
- Titulo: "Tempo de Estudo Diario"
- Slider min de 0 (para permitir 0min no domingo)
- Exibir media calculada: `Media: ${avg}min/dia`

### PlanComponents.tsx -- Grafico

- Condicionar ReferenceLine: so exibir se todos os `capacityMin` nos dados forem iguais
- Adicionar `domain` no YAxis com margem de 15%
- Atualizar label da legenda: manter "Tempo de estudo por dia" quando a ReferenceLine existir

### PlanComponents.tsx -- Label do botao de capacidade

De:
```
<span className="font-medium">{currentDailyMin}min/dia</span>
<span className="text-muted-foreground">de estudo</span>
```

Para: exibir o resumo do weekly (ex: "Seg 30min, Ter 30min, ... Dom 0min") ou a media se nao houver weekly.

