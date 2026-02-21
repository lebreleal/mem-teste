
# Corrigir Valores Padrão do Simulador para Contas Novas

## Problemas Identificados

### 1. "880 cards novos para estudar/dia" -- absurdo
O valor padrão é calculado como a **soma** do `daily_new_limit` de TODOS os decks (44 decks x 20 = 880). Nenhum ser humano estuda 880 cards novos por dia.

**Solução:** Limitar o valor padrão a um máximo razoável. A recomendação da comunidade Anki é **20-30 cards novos/dia** para a maioria dos estudantes. O cálculo deve ser `Math.min(soma_dos_limites, 30)` para contas novas, e usar o valor real para contas com histórico.

### 2. "30 cards criados/dia" -- inflado
O RPC calcula `total_cards / dias_desde_primeiro_card`. Se o usuário criou 30 cards ontem, retorna 30/dia. Se criou 100 cards há 2 dias, retorna 50/dia. Para contas novas isso não faz sentido.

**Solução:** Para contas em fallback (`total_reviews_90d < 50`), usar 0 como padrão para "cards criados/dia" (o usuário pode ajustar manualmente).

## Mudanças

### Arquivo: `src/hooks/useForecastSimulator.ts`

**defaultNewCardsPerDay** (linhas 45-49):
```typescript
// Antes:
const defaultNewCardsPerDay = useMemo(() => {
  const decks = paramsQuery.data?.decks;
  if (!decks || decks.length === 0) return 20;
  return decks.reduce((sum, d) => sum + (d.daily_new_limit ?? 20), 0);
}, [paramsQuery.data?.decks]);

// Depois:
const defaultNewCardsPerDay = useMemo(() => {
  const decks = paramsQuery.data?.decks;
  if (!decks || decks.length === 0) return 20;
  const totalLimit = decks.reduce((sum, d) => sum + (d.daily_new_limit ?? 20), 0);
  // Para contas novas, limitar a um valor recomendado realista
  // Anki community recommendation: 20-30 cards novos/dia
  const isNewAccount = (paramsQuery.data?.total_reviews_90d ?? 0) < 50;
  return isNewAccount ? Math.min(totalLimit, 30) : totalLimit;
}, [paramsQuery.data?.decks, paramsQuery.data?.total_reviews_90d]);
```

**defaultCreatedCardsPerDay** (linha 52):
```typescript
// Antes:
const defaultCreatedCardsPerDay = paramsQuery.data?.avg_new_cards_per_day ?? 0;

// Depois:
const isNewAccount = (paramsQuery.data?.total_reviews_90d ?? 0) < 50;
const defaultCreatedCardsPerDay = isNewAccount ? 0 : (paramsQuery.data?.avg_new_cards_per_day ?? 0);
```

### Resultado Esperado

| Métrica | Antes (conta nova) | Depois (conta nova) |
|---------|-------------------|---------------------|
| Cards novos/dia | 880 | 20-30 (max 30) |
| Cards criados/dia | 30 (inflado) | 0 (ajustável) |
| Tempo estimado | Irreal | Realista |

Para contas com 50+ reviews nos últimos 90 dias, tudo continua igual (usa dados reais).
