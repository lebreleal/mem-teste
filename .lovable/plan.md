
# Validacao Completa do Simulador de Carga

## Resultado da Pesquisa: Fallbacks

Baseado em dados reais da comunidade Anki (benchmark FSRS com 20,000 usuarios e 700M+ reviews, e relatos de estudantes de medicina):

| Estado | Fallback Atual | Benchmark Real Anki | Status |
|--------|---------------|-------------------|--------|
| Novos (state 0) | 30s | 15-30s | Correto |
| Aprendendo (state 1) | 15s | 10-15s | Correto |
| Dominados (state 2) | 8s | 6-9s (media ~8.4s) | Correto |
| Reaprendendo (state 3) | 12s | 10-15s | Correto |

Estudantes de medicina relatam ~8.37s/card em revisoes maduras. Usuarios avancados fazem 400-500 cards/hora (~7-9s). Os fallbacks estao alinhados com dados reais.

## O Simulador ja usa Repeticao Espacada Real

Confirmado no codigo do Worker (`forecastWorker.ts`):

1. **Recall Probability**: Para cada card state 2, calcula `R = (1 + FACTOR * elapsed/S)^DECAY` usando a estabilidade real do card
2. **Rating adaptativo**: Mapeia o recall para buckets (high >90%, mid 70-90%, low <70%) e sorteia rating baseado na distribuicao REAL do usuario (se tiver 50+ reviews nos ultimos 90 dias)
3. **Algoritmo correto por deck**: Usa FSRS ou SM2 conforme configurado no baralho
4. **Intervalos crescentes**: Um card "Facil" no FSRS vai de ~2d para ~8d para ~30d para ~90d+ conforme a estabilidade cresce
5. **Lapsos**: Se o recall esta baixo e o rating sorteado e "Again", o card volta para state 3 (Reaprendendo) e o intervalo cai -- exatamente como voce descreveu

## O que falta corrigir: learning_count no cardService

O unico bug pendente e que `fetchAggregatedStats` em `cardService.ts` nao conta state 3 (Reaprendendo) como "Aprendendo", fazendo cards reaprendendo aparecerem como "Dominados" na barra de progresso da colecao.

### Mudanca em cardService.ts

Na funcao `fetchAggregatedStats`, alterar a contagem para incluir state 3:

```
// Antes:
else if (c.state === 1) totals.learning_count++;

// Depois:
else if (c.state === 1 || c.state === 3) totals.learning_count++;
```

## Resumo

- Fallbacks: valores corretos, alinhados com benchmarks reais
- Simulador: ja usa repeticao espacada real com recall probability
- Estatisticas do usuario: usadas automaticamente apos 50+ reviews
- Unica correcao: contar state 3 como "Aprendendo" no cardService
