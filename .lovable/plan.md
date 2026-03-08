

## Diagnóstico: Gráfico de Carga Limitando Novos Cards pela Capacidade de Tempo

### O Problema

No `forecastWorker.ts` (linha 354-357), o simulador calcula quantos novos cards cabem no dia assim:

```
availableForNewMin = capacityMin - (tempo de revisões + aprendizado + reaprendizado)
maxNewByCapacity = availableForNewMin * 60 / secsPerNewCard
effectiveNewLimit = min(100, maxNewByCapacity)   ← AQUI está o bug
```

Se o usuário define 100 novos/dia, mas a capacidade diária (ex: 60 min) não comporta 100 novos cards + as revisões do dia, o simulador **reduz** os novos cards para caber no tempo. Isso produz os valores de 50, 25, 20 que você está vendo — não é um bug de contagem, é o limite de **tempo** cortando os novos cards.

O comportamento correto para o simulador de **cards** é: o limite de novos cards é o que o usuário definiu (100), ponto. O tempo é apenas informativo (mostra que o dia vai ficar sobrecarregado), mas **não deve reduzir** a quantidade de novos cards introduzidos.

### Fix

**Arquivo:** `src/workers/forecastWorker.ts`

**Mudança:** Remover o cap por capacidade de tempo na introdução de novos cards. O `effectiveNewLimit` deve ser apenas o `dayNewCardsLimit` (o que o usuário configurou), sem o `Math.min` com `maxNewByCapacity`.

Linhas 354-357 — de:
```typescript
const availableForNewMin = Math.max(0, capacityMin - usedMin);
const maxNewByCapacity = Math.floor((availableForNewMin * 60) / (newSecsPerCard * scaleFactor));
const dayNewCardsLimit = getNewCardsLimitForDay(day, startDate, newCardsPerDay, weeklyNewCards);
const effectiveNewLimit = Math.min(dayNewCardsLimit, Math.max(0, maxNewByCapacity));
```

Para:
```typescript
const dayNewCardsLimit = getNewCardsLimitForDay(day, startDate, newCardsPerDay, weeklyNewCards);
const effectiveNewLimit = dayNewCardsLimit;
```

O campo `overloaded` e `capacityMin` já existem no output e continuarão sinalizando visualmente quando o dia ultrapassa a capacidade — mas sem suprimir cards.

### Resultado Esperado

Com 100 novos/dia e 500 cards novos totais:
- Dia 1: 100 novos
- Dia 2: 100 novos
- Dia 3: 100 novos
- Dia 4: 100 novos
- Dia 5: 100 novos
- Dia 6+: 0 novos (acabaram)

Dias com mais carga que a capacidade aparecerão como "sobrecarregados" (vermelho), mas os cards serão introduzidos conforme o limite configurado.

