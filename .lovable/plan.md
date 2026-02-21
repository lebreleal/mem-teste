

# Distribuicao Inteligente de Cards Novos por Dia

## Conceito

O usuario define um orcamento global de "cards novos por dia" (ex: 30) no Meu Plano. O algoritmo distribui esses 30 cards entre todos os decks dos objetivos ativos, proporcionalmente ao numero de cards novos restantes e urgencia (prazo).

Exemplo: Deck A tem 900 cards novos (prazo em 30 dias), Deck B tem 100 cards novos (prazo em 30 dias). Com 30 novos/dia:
- Deck A recebe 27/dia (90%)
- Deck B recebe 3/dia (10%)

Isso so afeta cards novos (state 0). Revisoes (state 2) e aprendizado (state 1/3) continuam sendo governados inteiramente pelo algoritmo SRS.

## Mudancas Necessarias

### 1. Novo campo no perfil: `daily_new_cards_limit`

Adicionar coluna na tabela `profiles` (default 30). Esse e o orcamento global do usuario.

### 2. Algoritmo de alocacao proporcional

**Arquivo:** `src/hooks/useStudyPlan.ts` (ja tem `newCardsAllocation` parcial)

Refatorar a logica de alocacao (linhas 259-272) para considerar:

```text
Para cada objetivo (ordenado por prioridade):
  peso = cards_novos_restantes_no_deck / dias_restantes_ate_prazo
  Se nao tem prazo: peso = cards_novos_restantes / 90 (default)

Normalizar pesos e distribuir o orcamento global proporcionalmente.
Garantir minimo de 1 card/dia por deck ativo (se houver cards novos).
```

### 3. Aplicar alocacao na fila de estudo

**Arquivo:** `src/services/studyService.ts`

Na funcao `fetchStudyQueue`, ao calcular `effectiveNewLimit`:
- Buscar o `daily_new_cards_limit` do perfil
- Buscar a alocacao calculada para aquele deck especifico
- Usar `Math.min(deckConfig.daily_new_limit, allocatedForThisDeck)` — o menor entre o limite manual do deck e a alocacao do plano

Isso garante que:
- Se o usuario ajustou manualmente um deck para 5/dia, isso e respeitado
- Se nao ajustou, o plano governa

### 4. UI no Meu Plano

**Arquivo:** `src/pages/StudyPlan.tsx`

Adicionar um controle de "Cards novos por dia" (slider ou input) no hero card, ao lado do tempo de estudo. Exibir a distribuicao resultante por objetivo (ex: "Anatomia: 18/dia, Fisiologia: 12/dia").

### 5. Reflexo no simulador

**Arquivo:** `src/hooks/useForecastSimulator.ts`

O simulador ja recebe `newCardsPerDay` como parametro. Conectar ao novo campo `daily_new_cards_limit` do perfil como default, em vez do hardcoded 30.

## Fluxo do usuario

1. Usuario cria objetivos com decks e prazos
2. Define "30 cards novos/dia" no Meu Plano (ou aceita o default)
3. O sistema calcula automaticamente: Deck A = 18/dia, Deck B = 12/dia
4. Na sessao de estudo, cada deck recebe sua cota calculada
5. Se o usuario quiser ajustar manualmente um deck especifico, pode fazer nas configuracoes do deck (override)

## O que NAO muda

- Revisoes e reaprendizado continuam 100% governados pelo SRS
- Limites de revisao por deck (`daily_review_limit`) nao sao afetados
- Decks fora de objetivos continuam usando seu `daily_new_limit` local
- Compatibilidade total com o comportamento atual para quem nao usa o planejador

## Sequencia de implementacao

1. Migration: adicionar `daily_new_cards_limit` em `profiles`
2. Refatorar `newCardsAllocation` em `useStudyPlan.ts`
3. Integrar alocacao em `fetchStudyQueue`
4. Adicionar controle na UI do Meu Plano
5. Conectar ao simulador

## Detalhes tecnicos

### Migration SQL

```text
ALTER TABLE profiles
ADD COLUMN daily_new_cards_limit integer NOT NULL DEFAULT 30;
```

### Algoritmo de alocacao (pseudocodigo)

```text
function allocateNewCards(plans, totalBudget):
  weights = {}
  for plan in plans (sorted by priority):
    for deckId in plan.deck_ids:
      newRemaining = countNewCards(deckId)
      if newRemaining == 0: continue
      daysLeft = plan.target_date 
        ? daysBetween(today, plan.target_date) 
        : 90
      daysLeft = max(1, daysLeft)
      weights[deckId] = newRemaining / daysLeft

  totalWeight = sum(weights.values())
  if totalWeight == 0: return {}

  allocation = {}
  remaining = totalBudget
  for deckId in weights (sorted by weight desc):
    share = round(totalBudget * weights[deckId] / totalWeight)
    share = max(1, min(share, remaining))
    allocation[deckId] = share
    remaining -= share

  return allocation
```

### Integracao em fetchStudyQueue

Na funcao existente, antes de `const newCards = cards.filter(...)`:

```text
// Se usuario tem plano ativo, usar alocacao do plano
// Senao, usar daily_new_limit do deck (comportamento atual)
const effectiveNewLimit = userHasPlan 
  ? Math.min(deckConfig.daily_new_limit, planAllocation[deckId] ?? deckConfig.daily_new_limit)
  : Math.max(0, newLimit - newReviewedToday);
```

