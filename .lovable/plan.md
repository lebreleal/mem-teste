
## Problema

O carrossel distribui o orçamento global sequencialmente entre os decks (ex: Anatomia consome 7, sobram 33 para Histologia). Porém, a lista de decks na parte inferior usa `getAggregateStats()` que dá a cada deck o `globalNewRemaining` inteiro (40), sem descontar o que outros decks já consumiram. Resultado: Histologia mostra 45 (min de 45 novos vs 40 global) em vez de 33.

## Solução

Pré-calcular a distribuição do orçamento global entre os decks do plano dentro do `useDashboardState`, na mesma ordem do carrossel, e usar esses valores distribuídos no `getAggregateStats` em vez do `globalNewRemaining` bruto.

## Detalhes Técnicos

### `src/components/dashboard/useDashboardState.ts`

1. **Novo `useMemo` - `distributedNewByDeck`**: Depois de calcular `globalNewRemaining`, iterar pelos root decks do plano (na ordem de prioridade, se disponível) e distribuir o budget sequencialmente:
   - Para cada root deck, calcular `raw.new_count` via `getRawAggregateStats`
   - Alocar `min(raw.new_count, remainingBudget)` para esse deck
   - Decrementar `remainingBudget`
   - Armazenar o valor alocado num `Map<string, number>`

2. **Aceitar `planDeckOrder` como parâmetro** do hook (já vem do Dashboard) para garantir a mesma ordem de distribuição do carrossel.

3. **Modificar `getAggregateStats`**: Quando há plano ativo, em vez de usar `globalNewRemaining` diretamente, consultar o `distributedNewByDeck` map para obter o valor já distribuído para aquele deck específico. Para decks fora do plano, manter o comportamento atual.

### `src/pages/Dashboard.tsx`

- Passar `planDeckOrder` para `useDashboardState` para que a distribuição siga a mesma ordem de prioridade do carrossel.

### Resultado

- Carrossel mostra: Anatomia 7 novos, Histologia 33 novos
- Lista inferior mostra: Anatomia "Cartoes para hoje: 7+learning+review", Histologia "Cartoes para hoje: 33+learning+review"
- Ambos sincronizados com a mesma lógica de distribuição sequencial
