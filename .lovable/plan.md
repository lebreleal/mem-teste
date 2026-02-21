
# Corrigir Duplicacao de Alocacao por Root ID

## Causa Raiz

Tres pontos no codigo somam a alocacao do root **uma vez para cada deck filho**, multiplicando o valor. Exemplo: se um plano tem 5 filhos sob o mesmo root com alocacao 23, o sistema mostra 23 x 5 = 115 em vez de 23.

## Bug 1: `useStudyPlan.ts` - Per-plan allocation multiplica por numero de filhos

**Linha 376-381**: O loop `(p.deck_ids ?? []).reduce(...)` soma `deckNewAllocation[rootId]` para cada child ID do plano. Se 3 filhos mapeiam ao mesmo root, soma 3x.

**Correcao**: Deduplificar por root antes de somar:

```text
for (const p of sortedPlans) {
  const planRoots = new Set<string>();
  let sum = 0;
  for (const id of (p.deck_ids ?? [])) {
    const rootId = findRoot(id);
    if (!planRoots.has(rootId)) {
      planRoots.add(rootId);
      sum += deckNewAllocation[rootId] ?? 0;
    }
  }
  newCardsAllocation[p.id] = sum;
}
```

## Bug 2: `studyService.ts` - Session limit multiplica por numero de deckIds

**Linha 194-197**: `deckIds` contem root + todos descendentes. O reduce soma `rootAllocation[rootId]` para cada um, multiplicando.

**Correcao**: Deduplificar por root:

```text
const seenSessionRoots = new Set<string>();
const totalForSession = deckIds.reduce((s, id) => {
  const rootId = findRootAncestorId(allDecks ?? [], id);
  if (seenSessionRoots.has(rootId)) return s;
  seenSessionRoots.add(rootId);
  return s + (rootAllocation[rootId] ?? 0);
}, 0);
```

## Bug 3: `studyService.ts` - Contagem e pesos por child em vez de root

**Linhas 136-158**: `newPerDeck` conta cards por child deck ID, mas `allPlanDeckIds` so contem os filhos selecionados no plano (nao todos os descendentes do root). Resultado: contagem incompleta e pesos inconsistentes com useStudyPlan.

**Correcao**: Agregar `newPerDeck` e `weights` por root ID, e expandir `allPlanDeckIds` para incluir descendentes:

```text
// Expandir para incluir descendentes
const expandedPlanDeckIds = new Set<string>();
for (const id of allPlanDeckIds) {
  expandedPlanDeckIds.add(id);
  const descs = collectDescendantIds(allDecks ?? [], id);
  for (const d of descs) expandedPlanDeckIds.add(d);
}

// Buscar cards nos decks expandidos
const { data: newCounts } = await supabase
  .from('cards')
  .select('deck_id')
  .in('deck_id', Array.from(expandedPlanDeckIds))
  .eq('state', 0);

// Agregar por root
const newPerRoot: Record<string, number> = {};
for (const c of (newCounts ?? [])) {
  const rootId = findRootAncestorId(allDecks ?? [], c.deck_id);
  newPerRoot[rootId] = (newPerRoot[rootId] ?? 0) + 1;
}

// Weights por root (nao por child)
const weights: Record<string, number> = {};
const seenRoots = new Set<string>();
for (const p of plansData) {
  const daysLeft = ...;
  for (const did of (p.deck_ids ?? [])) {
    const rootId = findRootAncestorId(allDecks ?? [], did);
    if (seenRoots.has(rootId)) continue;
    seenRoots.add(rootId);
    const remaining = newPerRoot[rootId] ?? 0;
    if (remaining === 0) continue;
    weights[rootId] = remaining / daysLeft;
  }
}
```

## Resumo de Arquivos

| Arquivo | Linha | Bug |
|---------|-------|-----|
| `useStudyPlan.ts` | 376-381 | Per-plan sum multiplica por filhos do mesmo root |
| `studyService.ts` | 194-197 | Session limit multiplica por deckIds do mesmo root |
| `studyService.ts` | 136-158 | Contagem/pesos por child em vez de root; faltam descendentes |

## Resultado Esperado

1. Usuario define 40 cards/dia, 2 objetivos (fisiopato + histo)
2. Alocacao por root: fisiopato ~23, histo ~17 (soma = 40)
3. Per-plan display: fisiopato = 23, histo = 17 (nao mais 69/32)
4. Dashboard carousel: fisiopato mostra 23 novos, histo mostra 17 novos
5. Fila de estudo respeita exatamente o limite alocado por root
