

# Plano: Alinhar cálculo de tempo do Forecast Worker com o da Sala

## Problema

O tempo exibido dentro da Sala (SalaHero) usa `calculateRealStudyTime`, que:
- Multiplica cartões novos por `avgReviewsPerNewCard` (mín. 2) — conta os passos de aprendizagem
- Aplica `avgLapseRate` nos cartões de revisão — conta reaprendizagem por lapsos

O Forecast Worker usa cálculo simplificado:
- `newCards × newSecsPerCard` — trata cada cartão novo como **1 interação** (deveria ser 2-3x)
- Não aplica taxa de lapso nos reviews

Resultado: o simulador **subestima** o tempo real, especialmente para dias com muitos cartões novos.

## Solução

### 1. Atualizar RPC `get_forecast_params` para retornar métricas de comportamento

Adicionar ao JSON retornado:
- `avg_reviews_per_new_card` — mediana de interações por cartão novo no primeiro dia (dos review_logs)
- `avg_lapse_rate` — fração de reviews com rating=1 nos últimos 90 dias

### 2. Atualizar tipo `ForecastTiming` em `src/types/forecast.ts`

Adicionar campos `avg_reviews_per_new_card` e `avg_lapse_rate`.

### 3. Atualizar `forecastWorker.ts` para usar o mesmo modelo de tempo

Substituir o cálculo flat por lógica equivalente a `calculateRealStudyTime`:
- `newMinRaw = newCardsToday × avgReviewsPerNewCard × newSecsPerCard / 60`
- `revMinRaw = (reviewCount × (1 - lapseRate) × reviewSecs + reviewCount × lapseRate × relearnSecs × 2) / 60`

### 4. Migration SQL

```sql
-- Adicionar avg_reviews_per_new_card e avg_lapse_rate ao timing do RPC
```

Calcular `avg_reviews_per_new_card` como: para cada cartão com state=0 revisado, contar quantas review_logs existem no mesmo dia. Calcular `avg_lapse_rate` como: `COUNT(rating=1) / COUNT(*)` para reviews de state=2.

## Impacto

- Forecast passa a mostrar tempos consistentes com a Sala
- Sem mudança de UI — apenas a precisão dos números melhora
- 4 arquivos: 1 migration, `types/forecast.ts`, `forecastWorker.ts`, fallbacks

