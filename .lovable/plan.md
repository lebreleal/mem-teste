

# Progresso Suave Universal (1 a N lotes)

## Problema

O plano anterior so resolvia lote unico (total === 1). Mas com 2, 3, 4, 5 lotes o progresso ainda pula em blocos grandes (50%, 33%, 25%...). Precisamos de progresso suave para TODOS os casos.

## Solucao: Progresso simulado que interpola entre lotes reais

A barra nunca pula. Ela avanca suavemente e usa os lotes completados como "checkpoints" reais.

```text
Exemplo com 2 lotes:
  0s  -> 0%   (simulando...)
  5s  -> 12%  (simulando...)
  15s -> 35%  (simulando, trava em 45%)
  20s -> Lote 1 completa! Target sobe pra 50%, barra alcanca
  21s -> 52%  (simulando de novo...)
  35s -> 78%  (simulando, trava em 90%)
  40s -> Lote 2 completa! -> 100%
```

## Como funciona

O componente mantem um `displayPercent` local que:

1. Calcula o **target real** baseado nos lotes completados: `(current / total) * 100`
2. Define um **teto simulado**: o ponto medio entre o target atual e o proximo checkpoint, para nunca "ultrapassar" a realidade. Formula: `target + ((nextTarget - target) * 0.9)` — ou seja, avanca ate 90% do proximo trecho
3. A cada segundo, incrementa `displayPercent` com desaceleracao (avanca rapido longe do teto, devagar perto)
4. Quando um lote completa, o target sobe e a barra continua avancando suavemente

## Regras de exibicao

- **Barra**: usa `displayPercent` (suave) em vez do progresso real (discreto)
- **Fases**: baseadas no `displayPercent` (Processando/Gerando/Finalizando)
- **ETA**: mantido para multi-lote (avgBatchMs), para lote unico mostra apenas tempo decorrido
- **Texto inferior**: apenas tempo decorrido, sem "Lote X de Y"

## Secao Tecnica

**Arquivo modificado:** `src/components/ai-deck/GenerationProgress.tsx`

**Logica do displayPercent:**

```text
// A cada tick (1s):
const realPercent = (current / total) * 100;
const nextCheckpoint = ((current + 1) / total) * 100;
const ceiling = realPercent + (nextCheckpoint - realPercent) * 0.9;

// Se completou tudo:
if (current >= total) displayPercent = 100;
// Senao, incrementa com desaceleracao:
else {
  const distToCeiling = ceiling - displayPercent;
  const increment = Math.max(0.3, distToCeiling * 0.08);
  displayPercent = Math.min(ceiling, displayPercent + increment);
}
```

**Comportamento por quantidade de lotes:**

| Lotes | Sem mudanca | Com mudanca |
|-------|-------------|-------------|
| 1 | 0% -> 100% (pulo) | 0% -> 5% -> 20% -> 55% -> 90% (trava) -> 100% |
| 2 | 0% -> 50% -> 100% | 0% -> 15% -> 40% (lote 1) -> 55% -> 80% (lote 2) -> 100% |
| 3 | 0% -> 33% -> 66% -> 100% | Progresso suave com 3 checkpoints |
| 5+ | Pulos de 20% | Progresso quase continuo |

**Nenhuma mudanca no useAIDeckFlow.ts** — a logica de geracao permanece identica.

