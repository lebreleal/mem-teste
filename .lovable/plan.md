

# Análise: O Cálculo Atual NÃO Considera Repetições Reais

## O Problema

A função `calculateRealStudyTime` atual faz:

```text
tempo = (newCards × avgNewSeconds) + (learningCards × avgLearningSeconds) + (reviewCards × avgReviewSeconds)
```

Isso trata **cada card como 1 interação**. Mas na realidade:

- Um card **Novo** passa por 2-4 interações na mesma sessão (visualização inicial + learning steps + possíveis falhas)
- Um card de **Revisão** pode falhar e virar **Reaprendizado**, gerando 1-3 interações extras
- Um card de **Aprendizado** pode ser respondido errado e voltar, gerando mais interações

A RPC `get_user_real_study_metrics` retorna a **mediana de tempo por interação individual** (cada `review_log` é 1 clique). Não é o tempo total que um card novo consome na sessão inteira.

**Resultado**: O tempo estimado está SUBESTIMADO. Se o usuário tem 20 cards novos e cada um gera ~3 interações, o cálculo mostra 1/3 do tempo real.

O forecast worker (simulador) está correto porque simula cada card passando pelo FSRS com ratings reais — cards que falham são re-agendados e revisados novamente. Mas o cálculo do dashboard e plano de estudos não faz isso.

## Solução: Adicionar Métricas de Repetições Reais por Sessão

### 1. Atualizar a RPC `get_user_real_study_metrics`

Adicionar 2 novos campos baseados no histórico real:

- **`avg_reviews_per_new_card`**: Quantas vezes em média um card novo é revisado na sua primeira sessão (agrupando review_logs do mesmo card_id no mesmo dia quando o card era state=0)
- **`avg_lapse_rate`**: Taxa real de lapso — % de cards de revisão que recebem rating=1 (vão para reaprendizado)

```sql
-- Repetições reais por card novo na primeira sessão
WITH first_day_reviews AS (
  SELECT card_id, COUNT(*) as review_count
  FROM review_logs
  WHERE user_id = p_user_id
    AND reviewed_at > now() - interval '30 days'
    AND card_id IN (
      SELECT card_id FROM review_logs 
      WHERE user_id = p_user_id AND state = 0
        AND reviewed_at > now() - interval '30 days'
    )
  GROUP BY card_id, date(reviewed_at)
)
SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY review_count)
INTO v_avg_reviews_per_new;

-- Taxa de lapso real
SELECT COUNT(*) FILTER (WHERE rating = 1)::numeric / NULLIF(COUNT(*), 0)
INTO v_lapse_rate
FROM review_logs
WHERE user_id = p_user_id AND state = 2
  AND reviewed_at > now() - interval '30 days';
```

### 2. Atualizar `calculateRealStudyTime`

```typescript
export function calculateRealStudyTime(
  newCards: number,
  learningCards: number,
  reviewCards: number,
  metrics: RealStudyMetrics,
): number {
  // Cards novos: cada um gera múltiplas interações reais
  const newInteractions = newCards * metrics.avgReviewsPerNewCard;
  // Cards de revisão que vão lapsar → viram reaprendizado
  const expectedLapses = reviewCards * metrics.avgLapseRate;
  const successfulReviews = reviewCards - expectedLapses;
  
  return Math.round(
    (newInteractions * metrics.avgNewSeconds) +
    (learningCards * metrics.avgLearningSeconds) +
    (successfulReviews * metrics.avgReviewSeconds) +
    (expectedLapses * metrics.avgRelearningSeconds * 2) // lapso + re-estudo
  );
}
```

### 3. Atualizar interface `RealStudyMetrics`

Adicionar:
- `avgReviewsPerNewCard: number` (fallback: 3)
- `avgLapseRate: number` (fallback: 0.1)

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| Nova migration SQL | Atualizar RPC com `avg_reviews_per_new_card` e `avg_lapse_rate` |
| `src/lib/studyUtils.ts` | Atualizar interface e `calculateRealStudyTime` |
| `src/hooks/useStudyPlan.ts` | Mapear novos campos da RPC |
| `src/hooks/useForecastSimulator.ts` | Passar novos campos para o worker |

O forecast worker (simulador) já está correto e não precisa de mudança — ele simula cada interação individualmente.

