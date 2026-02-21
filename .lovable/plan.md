

# Corrigir Calculo de Tempo por Card (Outliers Inflando a Media)

## Problema Encontrado

A RPC `get_forecast_params` usa `AVG(dur)` para calcular o tempo medio por card. Porem, o `dur` e calculado como a diferenca entre dois `reviewed_at` consecutivos, com cap de 300 segundos (5 minutos).

Seus dados reais mostram o problema:

```text
+----------+----------+-----------+--------+
| Estado   | Media    | Mediana   | Maximo |
+----------+----------+-----------+--------+
| Novos    | 47.6s    | 16.1s     | 300s   |
| Aprend.  | 55.8s    | 15.2s     | 300s   |
| Revisao  | 108.5s   | 15.0s     | 300s   |
+----------+----------+-----------+--------+
```

A media e distorcida por momentos em que voce pausou, saiu do app, ou demorou entre cards. A **mediana** (16s) reflete melhor o tempo real de resposta.

## Solucao

Duas mudancas na RPC `get_forecast_params`:

### 1. Reduzir o cap de 300s para 90s

Nenhuma resposta real de flashcard leva 5 minutos. Um cap de 90 segundos ja e generoso.

### 2. Usar percentil 50 (mediana) em vez de media

Trocar `AVG(dur)` por `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dur)` para ignorar outliers naturalmente.

### Resultado esperado com os dados atuais

Com essas mudancas, os tempos vao cair de ~50-100s para ~12-16s por card, que e o tempo real de resposta.

```text
+----------+-----------+-----------+
| Estado   | Antes     | Depois    |
+----------+-----------+-----------+
| Novos    | 47.6s     | ~16s      |
| Aprend.  | 55.8s     | ~15s      |
| Reapr.   | (n/a)     | ~12s      |
| Revisao  | 108.5s    | ~15s      |
+----------+-----------+-----------+
```

## Mudanca tecnica

**Arquivo: Nova migration SQL** (update da RPC `get_forecast_params`)

Bloco `timing` atualizado:

```sql
'timing', (
  SELECT jsonb_build_object(
    'avg_new_seconds',
      COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dur) FILTER (WHERE pre_state = 0), 30),
    'avg_review_seconds',
      COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dur) FILTER (WHERE pre_state = 2), 8),
    'avg_learning_seconds',
      COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dur) FILTER (WHERE pre_state = 1), 15),
    'avg_relearning_seconds',
      COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dur) FILTER (WHERE pre_state = 3), 12)
  )
  FROM (
    SELECT
      LEAST(90, GREATEST(1, EXTRACT(EPOCH FROM (rl.reviewed_at -
        LAG(rl.reviewed_at) OVER (PARTITION BY rl.user_id ORDER BY rl.reviewed_at)
      )))) AS dur,
      COALESCE(
        rl.state,
        CASE
          WHEN NOT EXISTS (
            SELECT 1 FROM review_logs rl2
            WHERE rl2.card_id = rl.card_id AND rl2.reviewed_at < rl.reviewed_at
          ) THEN 0
          WHEN (SELECT COUNT(*) FROM review_logs rl3
                WHERE rl3.card_id = rl.card_id AND rl3.reviewed_at < rl.reviewed_at) < 3 THEN 1
          ELSE 2
        END
      ) AS pre_state
    FROM review_logs rl
    WHERE rl.user_id = p_user_id AND rl.reviewed_at > now() - interval '30 days'
  ) sub WHERE dur IS NOT NULL
)
```

Mudancas vs versao atual:
- `LEAST(300, ...)` vira `LEAST(90, ...)` -- cap mais realista
- `AVG(dur)` vira `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dur)` -- mediana em vez de media

## Impacto

- Apenas 1 arquivo: nova migration SQL atualizando a RPC
- Nenhuma mudanca no frontend (os campos retornados sao os mesmos)
- Os tempos no simulador vao refletir imediatamente o tempo real de resposta do usuario

