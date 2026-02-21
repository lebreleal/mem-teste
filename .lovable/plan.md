

# Corrigir Bug Critico: Estabilidade Nunca Cresce no Simulador

## O Bug

O `SimCard` rastreia apenas `scheduledDay` (dia em que o card fica "due"), mas nao rastreia quando foi a ultima revisao. Quando o simulador revisa um card no dia agendado:

```
elapsed = currentDay - scheduledDay = 0
R(retrievability) = 1.0
nextStability = s * (1 + ... * (exp(0) - 1)) = s * 1 = s  (nao cresce!)
```

Isso causa:
- Cards que graduam com stability ~2.4 ficam com intervalo de ~2 dias PARA SEMPRE
- 20 cards/dia x 259 dias = 5180 cards, todos voltando a cada ~2 dias = ~2590 reviews/dia
- Crescimento linear que parece exponencial no grafico

No FSRS real, `elapsed` deveria ser o tempo desde a ultima revisao (= o intervalo agendado), NAO `currentDay - scheduledDay`.

## Comparacao com Anki

O simulador do Anki (print 2) mostra revisoes DIMINUINDO ao longo do tempo porque a estabilidade CRESCE a cada revisao bem-sucedida:
- 1a revisao: intervalo ~2d
- 2a revisao: intervalo ~7d
- 3a revisao: intervalo ~21d
- 4a revisao: intervalo ~63d
- 5a revisao: intervalo ~190d

Nosso simulador mostra o contrario (crescimento) porque o intervalo nunca muda.

## Correcao

### 1. Adicionar `lastReviewedDay` ao SimCard

```typescript
interface SimCard {
  deck_id: string;
  state: number;
  stability: number;
  difficulty: number;
  scheduledDay: number;
  lastReviewedDay: number;  // NOVO
}
```

### 2. Corrigir `simulateFSRS` - usar elapsed correto

```typescript
// Review state
const elapsed = Math.max(1, currentDay - card.lastReviewedDay);
const r = fsrsRetrievability(card.stability, elapsed);
// ... rest of logic ...
return { ...card, stability: s, difficulty: d, state: 2,
  scheduledDay: currentDay + interval,
  lastReviewedDay: currentDay  // NOVO: registrar quando revisou
};
```

### 3. Corrigir `simulateSM2` - usar prevInterval correto

```typescript
// Review state
const prevInterval = Math.max(1, currentDay - card.lastReviewedDay);
interval = Math.round(prevInterval * newEF);
// ... rest ...
return { ...card, ..., lastReviewedDay: currentDay };
```

### 4. Inicializar `lastReviewedDay` na conversao de cards

Na funcao `runSimulation`, ao converter cards reais para SimCards:

```typescript
simCards = rawCards.map(c => {
  const scheduledDay = Math.round((schedMs - now) / 86400000);
  // Para cards ja revisados, estimar lastReviewedDay a partir do intervalo atual
  const estimatedInterval = c.stability > 0
    ? fsrsStabilityToInterval(c.stability, 0.9, 36500)
    : 1;
  const lastReviewedDay = scheduledDay - estimatedInterval;
  return { deck_id, state, stability, difficulty, scheduledDay, lastReviewedDay };
});
```

Para cards criados durante a simulacao (novos):
```typescript
simCards.push({ ..., scheduledDay: day, lastReviewedDay: day });
```

### 5. Atualizar `lastReviewedDay` em TODAS as saidas das funcoes de simulacao

Cada `return` em `simulateFSRS` e `simulateSM2` deve incluir `lastReviewedDay: currentDay`.

## Resultado Esperado

Apos a correcao:
- Cards vao ter estabilidade crescente a cada revisao bem-sucedida
- Intervalos vao crescer: 2d, 7d, 21d, 63d, 190d...
- O grafico vai mostrar reviews estabilizando e depois DIMINUINDO (como o Anki)
- A carga diaria vai se estabilizar em um patamar sustentavel
- A curva vai se parecer com o print 2 do Anki

## Arquivos Modificados

Apenas 1 arquivo: `src/workers/forecastWorker.ts`

