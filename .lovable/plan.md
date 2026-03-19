

# Plano: Corrigir Simulador de Cards — Limites, Calibração e Validação Histórica

## Problemas Encontrados

### 1. `daily_review_limit` NÃO é respeitado (BUG CRÍTICO)
O worker busca `daily_review_limit` de cada deck via RPC, mas **nunca aplica esse limite**. Todos os cards de revisão pendentes são processados sem cap. Isso explica projeções infladas como 550 cards/dia — na prática, o sistema real limita revisões por deck.

### 2. Tempo de cards novos sem `calibrationFactor`
Linhas 426-429 do worker calculam `firstSeeMin` e `newLearningMin` SEM multiplicar por `calFactor`, enquanto revisão/learning/relearning aplicam. Inconsistência que subestima tempo de novos.

### 3. Sem validação histórica de contagem de cards
Fizemos validação para tempo (comparar estimado vs real), mas nunca fizemos para **quantidade de cards por dia**. Não há como saber se a projeção de "30 revisões amanhã" é precisa sem comparar com o que realmente aconteceu.

## Mudanças

### 1. Enforcar `daily_review_limit` no worker
**Arquivo: `src/workers/forecastWorker.ts`**

No loop de coleta de cards de revisão (linhas 296-303), agrupar por deck e limitar ao `daily_review_limit` de cada deck. Cards que excedem o limite ficam para o dia seguinte (permanecem com `scheduledDay` inalterado).

### 2. Corrigir calibração nos cards novos
**Arquivo: `src/workers/forecastWorker.ts`**

Multiplicar `calFactor` no cálculo de `firstSeeMin` e `newLearningMin` (linhas 426-429).

### 3. Nova RPC: `validate_forecast_accuracy`
**Migration SQL**

Função que compara previsão vs realidade nos últimos 14 dias do usuário:
- Para cada dia passado, conta quantos cards de cada estado (new, review, learning) o usuário REALMENTE estudou (via `review_logs`)
- Retorna os dados brutos para que possamos comparar com o que o simulador diria

Isso é uma ferramenta de diagnóstico — não altera a UI, mas permite validar se o simulador está acertando.

### 4. Exibir contagem de cards no tooltip e resumo
Verificar que o tooltip do gráfico já mostra cards (revisões, novos, aprendendo) e que o resumo (`summary`) inclui `avgDailyCards` e `totalCards` — já implementado na iteração anterior.

## Arquivos Afetados

| Arquivo | Mudança |
|---|---|
| `src/workers/forecastWorker.ts` | Enforcar `daily_review_limit`, fix `calFactor` em novos |
| Migration SQL | RPC `validate_forecast_accuracy` (diagnóstico) |

## Impacto

- Cards/dia projetados caem para valores realistas (respeitando limites reais)
- Tempo de novos corrigido (~5-15% de ajuste)
- Ferramenta de validação permite confirmar precisão futura

