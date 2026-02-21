

# Simulador de Previsao de Carga -- Arquitetura Final

## Resumo

Implementar um simulador realista de carga de estudo que usa os algoritmos FSRS/SM2 reais, aprende com o historico do usuario, roda em Web Worker para evitar travamentos, e protege a logica via ofuscacao natural do build.

---

## 1. Previsao de Recall Adaptativa (Aprendizado com o Usuario)

### Problema
A abordagem de "recall >= 0.9 = Good" e arbitraria. Cada usuario tem um padrao diferente de respostas.

### Solucao: Rating Distribution Personalizada

A RPC `get_forecast_params` retorna a **distribuicao real de ratings do usuario** dos ultimos 90 dias, segmentada por faixa de recall:

```sql
-- Dentro da RPC get_forecast_params:
'rating_distribution', (
  SELECT jsonb_object_agg(bucket, dist) FROM (
    SELECT bucket, jsonb_build_object(
      'again', COUNT(*) FILTER (WHERE rating = 1),
      'hard',  COUNT(*) FILTER (WHERE rating = 2),
      'good',  COUNT(*) FILTER (WHERE rating = 3),
      'easy',  COUNT(*) FILTER (WHERE rating = 4)
    ) AS dist
    FROM (
      SELECT rating,
        CASE
          WHEN recall >= 0.9 THEN 'high'
          WHEN recall >= 0.7 THEN 'mid'
          ELSE 'low'
        END AS bucket
      FROM (
        SELECT rl.rating,
          POWER(1 + (19.0/81) * EXTRACT(EPOCH FROM (rl.reviewed_at - c.last_reviewed_at)) / 86400.0 / NULLIF(c.stability, 0), -0.5) AS recall
        FROM review_logs rl
        JOIN cards c ON c.id = rl.card_id
        WHERE rl.user_id = p_user_id
          AND rl.reviewed_at > now() - interval '90 days'
          AND c.stability > 0
          AND c.last_reviewed_at IS NOT NULL
      ) sub
    ) bucketed
    GROUP BY bucket
  ) agg
)
```

**Como funciona no simulador:**
1. Fase inicial (conta nova, < 50 reviews): usa defaults conservadores (high: 85% Good, mid: 50% Good, low: 30% Again)
2. Fase adaptativa (50+ reviews): usa a distribuicao real do usuario
3. O simulador sorteia o rating para cada card usando essas probabilidades, criando uma projecao Monte Carlo simplificada

**Exemplo:** Se o usuario historicamente responde "Again" em 25% dos cards com recall baixo (vs 15% da media), o simulador preve mais lapsos e mais revisoes futuras -- projecao personalizada.

---

## 2. Seguranca: Frontend vs Backend

### Analise

Os algoritmos FSRS e SM2 sao **abertos e publicados academicamente**:
- FSRS-4.5 e open-source (MIT license, GitHub publico)
- SM-2 e descrito publicamente por Piotr Wozniak desde 1987

**Nao ha propriedade intelectual a proteger** nas formulas em si. O valor esta na implementacao, UX, e nos dados do usuario.

### Decisao: Simulador roda no Frontend via Web Worker

**Razoes:**
- **Performance**: Evita latencia de rede. Simulacoes de 365 dias com 5000+ cards precisam de iteracoes rapidas
- **Custo**: Nao consome recursos do servidor/edge functions
- **Offline**: Funciona sem conexao apos o carregamento inicial dos dados
- **Seguranca natural**: O build de producao do Vite ja faz minificacao e tree-shaking, tornando o codigo dificil de ler. Adicionar ofuscacao extra nao vale o custo vs beneficio

### Protecao adicional (sem custo):
- Os **parametros personalizados** (rating distribution, timings) vem da RPC via Supabase com RLS -- so o proprio usuario acessa seus dados
- Os **pesos FSRS** ja sao publicos por natureza
- A logica de negocio real (energia, limites, premium) permanece no backend

---

## 3. Arquitetura Anti-Travamento: Web Worker

### Problema
Simular 365 dias x 5000 cards = ~1.8M iteracoes. No thread principal, isso trava a UI por 2-5 segundos.

### Solucao: Dedicated Web Worker

```text
src/
  workers/
    forecastWorker.ts    -- Web Worker com a logica de simulacao
  hooks/
    useForecastSimulator.ts  -- Hook que comunica com o Worker
```

**Fluxo:**

```text
UI (React)                          Web Worker
    |                                   |
    |-- postMessage(params) ----------->|
    |                                   | Itera dia a dia
    |                                   | Aplica FSRS/SM2
    |                                   | Sorteia ratings
    |<-- postMessage(progress: 30%) ----|  (feedback a cada 10%)
    |<-- postMessage(progress: 60%) ----|
    |<-- postMessage(result) -----------|
    |                                   |
```

**Otimizacoes:**
- **Amostragem**: Para horizontes > 90 dias com > 3000 cards, amostrar 2000 cards representativos (proporcional por estado/deck) em vez de simular todos
- **Agrupamento semanal**: Para horizontes > 30 dias, agrupar resultados por semana (media diaria)
- **Cancelamento**: Se o usuario muda o filtro enquanto uma simulacao roda, enviar mensagem de cancelamento ao Worker e iniciar nova
- **Debounce**: Mudancas no slider de "novos cards/dia" tem debounce de 300ms antes de disparar nova simulacao

### Configuracao Vite para Web Worker:

```typescript
// No hook:
const worker = new Worker(
  new URL('../workers/forecastWorker.ts', import.meta.url),
  { type: 'module' }
);
```

Vite suporta nativamente Web Workers com `import.meta.url` -- nenhuma configuracao extra necessaria.

---

## 4. RPC: `get_forecast_params`

Uma unica chamada que retorna tudo que o simulador precisa:

```sql
CREATE OR REPLACE FUNCTION get_forecast_params(p_user_id uuid, p_deck_ids uuid[])
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
SELECT jsonb_build_object(
  'decks', (
    SELECT jsonb_agg(jsonb_build_object(
      'id', d.id,
      'algorithm_mode', d.algorithm_mode,
      'requested_retention', d.requested_retention,
      'max_interval', d.max_interval,
      'learning_steps', d.learning_steps,
      'daily_new_limit', d.daily_new_limit,
      'daily_review_limit', d.daily_review_limit
    ))
    FROM decks d WHERE d.id = ANY(p_deck_ids) AND d.user_id = p_user_id
  ),
  'cards', (
    SELECT jsonb_agg(jsonb_build_object(
      'deck_id', c.deck_id, 'state', c.state,
      'stability', c.stability, 'difficulty', c.difficulty,
      'scheduled_date', c.scheduled_date
    ))
    FROM cards c WHERE c.deck_id = ANY(p_deck_ids)
  ),
  'avg_new_cards_per_day', (
    SELECT COALESCE(
      ROUND(COUNT(*)::numeric / GREATEST(1,
        EXTRACT(days FROM (now() - MIN(c.created_at)))
      )), 40
    )
    FROM cards c JOIN decks d ON d.id = c.deck_id
    WHERE d.user_id = p_user_id AND c.deck_id = ANY(p_deck_ids)
      AND d.is_archived = false AND c.created_at > now() - interval '365 days'
  ),
  'timing', (
    SELECT jsonb_build_object(
      'avg_new_seconds', COALESCE(AVG(dur) FILTER (WHERE is_first), 30),
      'avg_review_seconds', COALESCE(AVG(dur) FILTER (WHERE NOT is_first AND st = 2), 8),
      'avg_learning_seconds', COALESCE(AVG(dur) FILTER (WHERE NOT is_first AND st = 1), 15)
    )
    FROM (
      SELECT
        LEAST(300, GREATEST(1, EXTRACT(EPOCH FROM (rl.reviewed_at -
          LAG(rl.reviewed_at) OVER (PARTITION BY rl.user_id ORDER BY rl.reviewed_at)
        )))) AS dur,
        NOT EXISTS (
          SELECT 1 FROM review_logs rl2
          WHERE rl2.card_id = rl.card_id AND rl2.reviewed_at < rl.reviewed_at
        ) AS is_first,
        c.state AS st
      FROM review_logs rl JOIN cards c ON c.id = rl.card_id
      WHERE rl.user_id = p_user_id AND rl.reviewed_at > now() - interval '30 days'
    ) sub WHERE dur IS NOT NULL
  ),
  'rating_distribution', (
    SELECT COALESCE(jsonb_object_agg(bucket, dist), '{}'::jsonb) FROM (
      SELECT bucket, jsonb_build_object(
        'again', COUNT(*) FILTER (WHERE rating = 1),
        'hard',  COUNT(*) FILTER (WHERE rating = 2),
        'good',  COUNT(*) FILTER (WHERE rating = 3),
        'easy',  COUNT(*) FILTER (WHERE rating = 4),
        'total', COUNT(*)
      ) AS dist
      FROM (
        SELECT rl.rating,
          CASE
            WHEN recall >= 0.9 THEN 'high'
            WHEN recall >= 0.7 THEN 'mid'
            ELSE 'low'
          END AS bucket
        FROM (
          SELECT rl2.rating,
            POWER(1 + (19.0/81) * GREATEST(0,
              EXTRACT(EPOCH FROM (rl2.reviewed_at - c2.last_reviewed_at)) / 86400.0
            ) / GREATEST(0.1, c2.stability), -0.5) AS recall
          FROM review_logs rl2
          JOIN cards c2 ON c2.id = rl2.card_id
          WHERE rl2.user_id = p_user_id
            AND rl2.reviewed_at > now() - interval '90 days'
            AND c2.stability > 0 AND c2.last_reviewed_at IS NOT NULL
        ) rl
      ) bucketed
      GROUP BY bucket
    ) agg
  ),
  'total_reviews_90d', (
    SELECT COUNT(*) FROM review_logs
    WHERE user_id = p_user_id AND reviewed_at > now() - interval '90 days'
  )
);
$$;
```

---

## 5. Web Worker: `forecastWorker.ts`

O Worker recebe os dados da RPC + parametros do usuario e executa:

```text
ENTRADA:
  - cards[]: { deck_id, state, stability, difficulty, scheduled_date }
  - decks[]: { id, algorithm_mode, retention, limits, learning_steps }
  - horizonDays: number
  - newCardsPerDay: number (override ou media)
  - ratingDistribution: { high: {again,hard,good,easy}, mid: {...}, low: {...} }
  - timing: { avg_new_seconds, avg_review_seconds, avg_learning_seconds }
  - capacity: { dailyMinutes, weeklyMinutes }

ALGORITMO (por dia D = 1..horizonDays):
  1. Coletar cards com scheduled_date <= dia D
  2. Para cada card de revisao:
     a. Calcular recall usando formula FSRS (stability + elapsed days)
     b. Determinar faixa (high/mid/low)
     c. Sortear rating baseado na distribuicao do usuario para essa faixa
     d. Aplicar fsrsSchedule() ou sm2Schedule() conforme deck
     e. Atualizar scheduled_date do card simulado
  3. Introduzir N novos cards (limitado por daily_new_limit de cada deck)
     - Rating para novos: usar distribuicao 'low' (recall indefinido)
  4. Calcular minutos:
     - novos * avg_new_seconds / 60
     - revisoes * avg_review_seconds / 60
     - learning * avg_learning_seconds / 60
  5. Comparar com capacidade do dia (considerando weeklyMinutes)
  6. Enviar progresso a cada 10% do horizonte

SAIDA:
  - forecastPoints[]: { date, reviewCards, newCards, reviewMin, newMin, totalMin, capacityMin, overloaded }
  - summary: { avgDailyMin, peakMin, peakDate, overloadedDays }
```

**Otimizacao de amostragem para grandes conjuntos:**
- Se cards.length > 3000 e horizonDays > 90: amostrar 2000 cards proporcionalmente por deck/estado, multiplicar resultados pelo fator de escala

---

## 6. Hook: `useForecastSimulator`

```text
interface UseForecastSimulatorOptions {
  deckIds: string[];
  horizonDays: number;
  newCardsPerDayOverride?: number;
  dailyMinutes: number;
  weeklyMinutes: WeeklyMinutes | null;
}

Retorna:
  - data: ForecastPoint[]
  - summary: { avgDailyMin, peakMin, peakDate, overloadedDays }
  - isSimulating: boolean
  - progress: number (0-100)
  - defaultNewCardsPerDay: number (media calculada)
```

O hook:
1. Chama a RPC `get_forecast_params` via react-query (cache 5min)
2. Quando os dados chegam, envia ao Worker
3. Escuta mensagens de progresso e resultado
4. Cancela Worker anterior se parametros mudarem (debounce 300ms no newCardsPerDay)

---

## 7. Preferencia Persistida

**Migracao:** Adicionar `forecast_view text DEFAULT '7d'` ao `profiles`.

Valores: `'7d'`, `'30d'`, `'90d'`, `'365d'`, `'target'`

Salvar quando usuario muda o filtro. Carregar na inicializacao.

---

## 8. UI: `ForecastSimulator`

Substituir o `ForecastChart` atual no `StudyPlan.tsx`:

**Layout:**
```text
+--------------------------------------------------+
| Previsao de Carga                                |
| [7d] [30d] [90d] [1 ano] [Ate a prova]          |
|                                                  |
| ~12 novos cards/dia  [editar]                    |
|                                                  |
| [=== GRAFICO DE BARRAS EMPILHADAS ============] |
| [=== com linha de capacidade ==================] |
|                                                  |
| Media: 45min/dia | Pico: 72min (15/mar)         |
| Dias com sobrecarga: 3                           |
+--------------------------------------------------+
```

- Horizonte > 30d: agrupar por semana (media diaria da semana)
- Barra de progresso durante simulacao
- Indicador visual quando usando defaults (conta nova) vs dados reais

---

## Secao Tecnica -- Arquivos

### Nova migracao SQL
- Criar RPC `get_forecast_params`
- Adicionar `forecast_view text DEFAULT '7d'` ao `profiles`

### `src/workers/forecastWorker.ts` (novo)
- Logica de simulacao dia a dia
- Importa funcoes puras de `fsrs.ts` e `sm2.ts`
- Comunicacao via postMessage

### `src/hooks/useForecastSimulator.ts` (novo)
- Gerencia Worker lifecycle
- React Query para dados da RPC
- Debounce e cancelamento

### `src/types/forecast.ts` (novo)
- `ForecastPoint`, `SimulatorParams`, `SimulatorResult`, `RatingDistribution`

### `src/components/study-plan/PlanComponents.tsx`
- Substituir `ForecastChart` por `ForecastSimulator`
- Chips de filtro, campo editavel, metricas resumidas

### `src/pages/StudyPlan.tsx`
- Trocar `<ForecastChart>` por `<ForecastSimulator>`
- Passar props: `allDeckIds`, `globalCapacity`, `forecastView`

### `src/hooks/useStudyPlan.ts`
- Adicionar `forecastView` ao `capacityQuery`
- Remover `forecastQuery` antigo (substituido pelo simulador)

