
# Ajuste Fino v4.0 - Checklist Final

## Resumo

Quatro ajustes para fechar a refatoracao Multi-Objetivo: (1) confirmar deduplicacao (ja feita), (2) alocacao de novos cards por prioridade, (3) badge de objetivo no carrossel, (4) limpeza de codigo morto.

---

## 1. Deduplicacao -- JA IMPLEMENTADA

O `useStudyPlan.ts` (linha 136-142) ja usa `new Set<string>()` para deduplicar `allDeckIds`. Nenhuma mudanca necessaria.

## 2. Alocacao de Novos Cards por Prioridade de Objetivo

**Problema atual:** Em `useStudyPlan.ts`, `dailyNewCards` (linha 252) e calculado como `Math.min(remainingCapacity, totalNew)` -- um numero global que nao respeita a ordem de prioridade dos objetivos. Quando sobra tempo apos revisoes, o sistema deveria preencher novos cards do Objetivo 1 primeiro, depois do 2, etc.

**Arquivo:** `src/hooks/useStudyPlan.ts`

**Mudanca:** Apos calcular `remainingCapacity`, iterar sobre `plans` (ja ordenados por `priority ASC`) e alocar novos cards de cada objetivo ate esgotar a capacidade restante. Isso requer buscar `total_new` por objetivo (nao apenas o global). Como a RPC `get_plan_metrics` retorna dados agregados, a alternativa pratica e:

- Adicionar um campo `newCardsAllocation: Record<string, number>` no retorno de `PlanMetrics`, mapeando `planId -> quantidade de novos cards alocados para hoje`.
- Na logica do `computed`, iterar pelos planos em ordem de prioridade. Para cada plano, calcular quantos novos cards seus decks tem (usando os dados ja disponiveis ou estimando proporcionalmente). Alocar ate o limite de `remainingCapacity`, decrementar, e passar ao proximo.
- Essa informacao sera puramente informativa no dashboard (mostrar "X novos cards" por objetivo). A sessao de estudo real ja carrega todos os decks e respeita os limites `daily_new_limit` de cada deck.

**Logica simplificada:**

```text
remaining = capacityCardsToday - estimatedReviewsToday
for each plan in plans (sorted by priority):
  planNewCards = count of new cards in plan's deck_ids
  allocated = min(remaining, planNewCards)
  newCardsAllocation[plan.id] = allocated
  remaining -= allocated
  if remaining <= 0: break
```

Nota: como nao temos `total_new` por objetivo separado na RPC atual, usaremos uma estimativa proporcional baseada na quantidade de decks de cada objetivo vs o total. Em uma versao futura, uma RPC que retorne metricas por deck permitiria precisao total.

## 3. Badge de Objetivo no Carrossel (DeckCarousel)

**Arquivo:** `src/components/dashboard/DeckCarousel.tsx`

**Mudanca:**
- Aceitar nova prop `plansByDeckId: Record<string, string>` no `DeckCarousel` -- mapeia cada `deck_id` ao nome do objetivo de maior prioridade que o contem.
- No `DeckStudyCard`, renderizar uma pequena `Badge` no canto superior com o nome do objetivo (ex: "ENARE"). Se o deck pertence a multiplos objetivos, mostrar o de menor `priority` (maior prioridade).
- A Badge tera estilo `text-[9px]` com fundo sutil para nao poluir visualmente.

**Arquivo:** `src/pages/Dashboard.tsx`

**Mudanca:** Construir o mapa `plansByDeckId` a partir de `plans` e passa-lo como prop para `DeckCarousel`.

```text
const plansByDeckId: Record<string, string> = {};
for (const plan of plans) {  // plans ja vem ordenados por priority
  for (const deckId of plan.deck_ids) {
    const rootId = getRootId(deckId);  // resolver para root
    if (rootId && !plansByDeckId[rootId]) {
      plansByDeckId[rootId] = plan.name;
    }
  }
}
```

## 4. Limpeza de Codigo Morto

**`selected_plan_id`:** Verificacao feita -- aparece apenas em `src/integrations/supabase/types.ts` (gerado automaticamente). Nenhum componente usa esse campo para filtragem ou logica. Nenhuma acao necessaria.

**`selectPlan` mutation:** Ja foi removida do `useStudyPlan.ts`. Confirmado.

**`handleSelectPrincipal`:** Ja foi removido do `StudyPlan.tsx`. Confirmado.

---

## Arquivos Modificados

1. **`src/hooks/useStudyPlan.ts`** -- Adicionar `newCardsAllocation` no `PlanMetrics`, logica de alocacao por prioridade no `computed`.
2. **`src/components/dashboard/DeckCarousel.tsx`** -- Aceitar prop `plansByDeckId`, renderizar Badge com nome do objetivo em cada `DeckStudyCard`.
3. **`src/pages/Dashboard.tsx`** -- Construir `plansByDeckId` e passar como prop.
