

## Plano de Correções: Cálculo de Cards, Simulação e Conclusão Estimada

### Problema 1: Contagem errada de cards na verificação de viabilidade (177 vs 300+)

O cálculo `selectedNewCards` na verificação de viabilidade (linha 800-803) soma apenas `deck.new_count` dos decks **diretamente selecionados**. Quando o usuario seleciona um deck pai (ex: Fisiopatologia com 236 cards), ele conta apenas os cards novos do deck pai em si, **sem incluir os sub-baralhos**. 

**Correção:** Ao calcular `selectedNewCards`, para cada deck selecionado que tenha filhos, somar recursivamente o `new_count` de **todos os descendentes** tambem, usando `getDescendantCards` ou logica similar -- mas focando apenas nos **cards novos** (nao todos os cards).

Atualmente `getOwnCards` soma `new_count + learning_count + review_count + reviewed_today`, mas para viabilidade precisamos apenas de `new_count` proprio + `new_count` dos descendentes.

### Problema 2: Simulação de Estudos - "Até a prova" deve ser "Escolher data"

Atualmente a opção se chama "Até a prova" e so aparece se existe um objetivo com `target_date`. 

**Correção:**
- Renomear para "Escolher data"
- Fazer essa opção **sempre visivel** (nao apenas quando ha target_date)
- Ao clicar, abrir um modal/dialog com duas opçoes:
  1. **Datas dos objetivos** - listar cada objetivo criado com sua data (ex: "ENARE 2026 - 25/02/2026"), permitindo clicar para selecionar
  2. **Data personalizada** - abrir um calendario para escolher qualquer data
- Se nao houver objetivos com data, mostrar apenas a opção de data personalizada

### Problema 3: "Conclusão estimada" incorreta e sem contexto

O calculo atual (`totalPending / cardsPerDay`) usa `cardsPerDay` baseado na **capacidade de tempo** (minutos/dia), mas o usuario esta limitado pelo **limite de novos cards/dia**. Se o limite e 35 novos/dia e a capacidade de tempo comportaria 100 cards/dia, a conclusao deveria usar 35 como gargalo.

**Correções:**
- Usar `Math.min(cardsPerDay, dailyNewCards + estimatedReviewsToday)` como taxa efetiva real
- Na verdade, o gargalo real para concluir novos cards e `dailyNewCards` (o limite global), entao a projeçao deveria ser `totalNew / dailyNewCards` dias para concluir todos os novos
- Exibir contexto: "Conclusão estimada: DD/MM/YYYY (limitado por X novos cards/dia)"
- Quando o gargalo for o limite de novos cards (e nao o tempo), sugerir: "Aumente o limite de novos cards para acelerar"

---

### Detalhes Tecnicos

**Arquivo `src/pages/StudyPlan.tsx`:**

1. **Feasibility check (linhas ~799-816):** Refatorar `selectedNewCards` para incluir descendentes. Criar helper `getNewCardsRecursive(deckId)` que soma `new_count` do deck + todos os filhos recursivamente. Contar apenas para decks que estao selecionados E cujos pais nao estejam selecionados (para evitar contagem dupla).

2. **Forecast view option:** Na `PlanComponents.tsx`, renomear "Até a prova" para "Escolher data", remover condicional `hasTargetDate`, e adicionar estado + dialog para seleção de data com lista de objetivos.

**Arquivo `src/hooks/useStudyPlan.ts`:**

3. **projectedCompletionDate (linhas ~398-403):** Ajustar calculo:
   - Taxa efetiva = `min(cardsPerDay, dailyNewCards + avgReviewsPerDay)`
   - Mas o verdadeiro gargalo para "conclusao" sao os novos cards: `totalNew / dailyNewCards`
   - Adicionar campo `projectedBottleneck: 'time' | 'new_cards_limit'` ao `PlanMetrics`

**Arquivo `src/components/study-plan/PlanComponents.tsx`:**

4. **Novo DatePickerDialog:** Modal com duas seções - lista de objetivos (se existirem) e calendário personalizado. Ao selecionar, definir `forecastView` como `'target'` e passar a data selecionada como horizonte.

**Arquivo `src/pages/StudyPlan.tsx` (exibição da conclusão):**

5. **Linha ~1407-1411:** Adicionar contexto ao label, ex: "Conclusão estimada: DD/MM - limitado por 35 novos cards/dia" e botao para ajustar o limite.
