
# Corrigir Valor Padrao de "Novos Cards/Dia" no Simulador

## Problema

O simulador usa `avg_new_cards_per_day` do RPC `get_forecast_params` como valor padrao para "novos cards/dia". Esse valor (~88) representa a **media de cards criados** (via IA, importacao manual, etc.), nao a quantidade que o usuario **quer estudar por dia**.

Resultado: o grafico simula 88 cards novos entrando na sessao de estudo diariamente, gerando uma carga absurda e irreal. O correto seria usar a soma dos `daily_new_limit` dos decks ativos.

## Solucao

### 1. Calcular o limite real a partir dos decks

Em vez de usar `avg_new_cards_per_day` do RPC, calcular o valor padrao somando o `daily_new_limit` de cada deck ativo nos objetivos. Esse campo ja existe nos dados do `ForecastDeckConfig`.

**Arquivo**: `src/hooks/useForecastSimulator.ts`

Mudanca na linha 44:
```typescript
// ANTES (errado - media de criacao)
const defaultNewCardsPerDay = paramsQuery.data?.avg_new_cards_per_day ?? 40;

// DEPOIS (correto - soma dos limites diarios dos decks)
const defaultNewCardsPerDay = useMemo(() => {
  const decks = paramsQuery.data?.decks;
  if (!decks || decks.length === 0) return 20;
  return decks.reduce((sum, d) => sum + (d.daily_new_limit ?? 20), 0);
}, [paramsQuery.data?.decks]);
```

### 2. Renomear o label no grafico para clareza

**Arquivo**: `src/components/study-plan/PlanComponents.tsx`

Alterar o label do campo editavel de "novos cards/dia" para deixar claro que se refere a cards novos **para estudar**, nao criados:
- De: `novos cards/dia`
- Para: `novos para estudar/dia`

### 3. Opcional -- Manter o RPC valor como referencia

O campo `avg_new_cards_per_day` do RPC pode continuar existindo para fins de analise, mas nao sera mais usado como padrao do simulador. Se no futuro quisermos mostrar "voce cria em media X cards/dia", ele estara disponivel.

## Resumo do Impacto

- O grafico vai mostrar uma carga realista (ex: 20-40 novos/dia em vez de 88)
- O usuario pode continuar editando o valor manualmente via o campo editavel
- O simulador ja respeita o `daily_new_limit` por deck internamente (linha 258 do worker), entao a mudanca e apenas no valor padrao exibido e enviado ao worker
