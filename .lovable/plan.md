

# Alinhar Estados dos Cards com o Padrao Anki

## Situacao Atual vs Anki

```text
+-------------------+------------------+------------------+
| Conceito          | Anki oficial     | Seu app hoje     |
+-------------------+------------------+------------------+
| Nunca visto       | type 0 (New)     | state 0 (New)    |
| Aprendendo 1a vez | type 1 (Learning)| state 1          |
| Esqueceu/errando  | type 3 (Relearn) | state 1 (mesma!) |
| Revisao programada| type 2 (Review)  | state 2          |
| Jovem (ivl < 21d) | derivado         | nao existe       |
| Maduro (ivl >=21d)| derivado         | nao existe       |
| Suspenso          | queue -1         | scheduled > 50y  |
| Enterrado         | queue -2/-3      | nao existe       |
+-------------------+------------------+------------------+
```

O principal bug: quando um card dominado (state 2) recebe "Errei", ele volta para `state: 1`. No Anki, isso seria `type: 3` (Relearning). Misturar os dois no mesmo state distorce completamente os tempos medios.

## Plano de Mudancas

### 1. Adicionar state 3 (Reaprendendo)

Mudar o codigo FSRS e SM2 para que quando um card de revisao (state 2) recebe rating 1 ("Again"), ele va para **state 3** em vez de state 1.

**Arquivo: `src/lib/fsrs.ts`**
- Linha 157: mudar `state: 1` para `state: 3` no bloco "Again para relearning"
- Atualizar a interface `FSRSOutput` para documentar state 3

**Arquivo: `src/lib/sm2.ts`**
- Mesma mudanca: quando card de revisao erra, vai para state 3

### 2. Tratar state 3 como "em aprendizado" no agendamento

O state 3 se comporta igual ao state 1 para fins de agendamento (usa relearning steps), mas e categorizado separadamente para estatisticas.

**Arquivo: `src/lib/fsrs.ts`**
- Adicionar bloco `if (card.state === 3)` que reutiliza a logica do state 1 mas com relearningSteps prioritariamente

**Arquivo: `src/hooks/useStudySession.ts`** (e qualquer lugar que filtra state === 1)
- Onde filtra "cards em aprendizado", incluir state 1 **ou** state 3

### 3. Atualizar a query de fila de estudo

Todos os lugares que fazem `state = 1` precisam incluir `state IN (1, 3)`:
- RPCs do banco (`get_all_user_deck_stats`, `get_deck_stats`, `get_plan_metrics`)
- Queries no frontend que filtram por state

**Nova migration SQL:**
- Atualizar as RPCs para tratar state 3 como "em aprendizado" nas contagens
- Cards existentes com state 1 que na verdade sao relearning continuam funcionando (retrocompativel pois state 1 e 3 sao tratados igual no agendamento)

### 4. Atualizar nomenclatura e categorias no app

Em vez dos nomes atuais, usar:

```text
+-------------------+------------------+-------------------------+
| State             | Nome no app      | Tempo medio (simulador) |
+-------------------+------------------+-------------------------+
| 0 (New)           | Novos            | ~30s (1a vez vendo)     |
| 1 (Learning)      | Aprendendo       | ~15s (passos iniciais)  |
| 3 (Relearning)    | Reaprendendo     | ~12s (erraram, voltando)|
| 2 (Review)        | Em revisao       | ~8s (agendados)         |
| 2 + ivl >= 21d    | Maduros          | derivado, nao precisa   |
| frozen            | Congelados       | ja existe               |
+-------------------+------------------+-------------------------+
```

**Arquivo: `src/components/study-plan/PlanComponents.tsx`**
- Grafico mostra 4 categorias: Novos, Aprendendo, Reaprendendo, Em revisao
- Cores distintas para cada uma

**Arquivo: `src/components/deck-detail/CardList.tsx`** e `DeckDetailContext.tsx`
- Filtros de estado incluem: Novos, Aprendendo, Reaprendendo, Em revisao, Congelados

### 5. Corrigir calculo de tempo no simulador

**Nova migration SQL (update da RPC `get_forecast_params`):**

```sql
'timing', (
  SELECT jsonb_build_object(
    'avg_new_seconds',        COALESCE(AVG(dur) FILTER (WHERE pre_state = 0), 30),
    'avg_learning_seconds',   COALESCE(AVG(dur) FILTER (WHERE pre_state = 1), 15),
    'avg_relearning_seconds', COALESCE(AVG(dur) FILTER (WHERE pre_state = 3), 12),
    'avg_review_seconds',     COALESCE(AVG(dur) FILTER (WHERE pre_state = 2), 8)
  )
  FROM (...)
)
```

Porem como os `review_logs` atuais NAO salvam o state do card no momento da revisao, precisamos:

**Arquivo: migration SQL** -- adicionar coluna `state` na tabela `review_logs`:
```sql
ALTER TABLE review_logs ADD COLUMN state integer DEFAULT NULL;
```

A partir de agora, cada review salva o state do card antes da revisao. Para dados historicos, usamos a heuristica do numero de revisoes anteriores como fallback.

### 6. Atualizar o worker do simulador

**Arquivo: `src/workers/forecastWorker.ts`**
- Adicionar state 3 no `SimCard`
- Quando um card de revisao (state 2) recebe rating 1, vai para state 3
- Categorias de tempo separadas: novo, aprendendo, reaprendendo, em revisao
- O `ForecastPoint` ganha campo `relearningCards` e `relearningMin`

**Arquivo: `src/types/forecast.ts`**
- Adicionar `relearningCards`, `relearningMin` ao `ForecastPoint`
- Adicionar `avg_relearning_seconds` ao `ForecastTiming`

### 7. Sobre "Suspenso" e "Enterrado"

- **Suspenso/Congelado**: ja existe no app (scheduled_date > 50 anos). Funciona bem, nao precisa mudar.
- **Enterrado (Buried)**: conceito do Anki para esconder temporariamente irmaos (siblings) de um card no mesmo dia. Isso e mais relevante para decks com muitos clozes. Pode ser implementado no futuro mas nao e prioridade agora.

## Resumo de impacto

- **Retrocompativel**: cards existentes com state 1 continuam funcionando (o agendamento trata 1 e 3 igual)
- **Dados historicos**: a RPC usa heuristica para dados antigos sem o campo `state` nos logs
- **Simulador mais preciso**: 4 categorias de tempo em vez de 3
- **Nomenclatura clara**: alinhada com o padrao Anki que os usuarios ja conhecem

## Arquivos modificados

- `src/lib/fsrs.ts` -- state 3 no bloco "Again"
- `src/lib/sm2.ts` -- state 3 no bloco "Again"
- `src/hooks/useStudySession.ts` -- incluir state 3 nas queries
- `src/hooks/useCards.ts` -- incluir state 3
- `src/components/study-plan/PlanComponents.tsx` -- 4 categorias
- `src/components/deck-detail/CardList.tsx` -- filtro Reaprendendo
- `src/components/deck-detail/DeckDetailContext.tsx` -- filtro state 3
- `src/workers/forecastWorker.ts` -- state 3 + 4 tempos
- `src/types/forecast.ts` -- novos campos
- Nova migration SQL -- coluna `state` em review_logs + update RPCs
