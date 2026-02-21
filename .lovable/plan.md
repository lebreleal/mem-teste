

# Corrigir Fallback de Timing para Contas Novas

## O Problema

O simulador usa o timing REAL do usuario (7.7s por card novo) mesmo com pouquissimas reviews. Resultado: 20 cards novos x 7.7s = 154s = ~3min. Deveria ser 20 x 30s = 10min.

O fallback de rating distribution ja ativa quando `total_reviews_90d < 50`, mas o fallback de timing NAO segue a mesma regra. O timing vem do RPC e e usado sempre que for diferente de zero, mesmo com 3 reviews no historico.

## A Correcao

No `forecastWorker.ts`, na funcao `runSimulation`, aplicar os mesmos fallbacks de timing quando o usuario tem poucas reviews (mesma regra do rating: < 50 reviews em 90 dias).

### Antes (linhas 228-231):
```typescript
const newSecsPerCard = timing?.avg_new_seconds || 30;
const reviewSecsPerCard = timing?.avg_review_seconds || 8;
const learningSecsPerCard = timing?.avg_learning_seconds || 15;
const relearningSecsPerCard = (timing as any)?.avg_relearning_seconds || 12;
```

### Depois:
```typescript
const useAdaptiveTiming = useAdaptive; // total_reviews_90d >= 50
const newSecsPerCard = (useAdaptiveTiming && timing?.avg_new_seconds) ? timing.avg_new_seconds : 30;
const reviewSecsPerCard = (useAdaptiveTiming && timing?.avg_review_seconds) ? timing.avg_review_seconds : 8;
const learningSecsPerCard = (useAdaptiveTiming && timing?.avg_learning_seconds) ? timing.avg_learning_seconds : 15;
const relearningSecsPerCard = (useAdaptiveTiming && (timing as any)?.avg_relearning_seconds) ? (timing as any).avg_relearning_seconds : 12;
```

## Resultado

- Contas com menos de 50 reviews: usam fallbacks baseados em benchmarks reais do Anki (30s novo, 8s review, 15s learning, 12s relearning)
- Contas com 50+ reviews: usam os dados reais do usuario
- 20 cards novos passam a mostrar ~10min em vez de ~3min para contas novas

## Arquivo Modificado

Apenas `src/workers/forecastWorker.ts` (4 linhas alteradas)

## Validacao

Sim, a classificacao esta 100% alinhada com o Anki:
- "Aprendendo" = cards que estao nos learning steps naquele dia (state 1 + state 3)
- "Dominados" = cards que graduaram e estao na repeticao espacada (state 2), incluindo os que voce acertou (Bom/Facil) pela primeira vez

