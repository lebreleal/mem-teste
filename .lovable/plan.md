

# Corrigir Alocacao Duplicada por Roots Compartilhados Entre Planos

## Causa Raiz

Dois planos compartilham os mesmos decks (ex: 9 deck IDs identicos nos dois objetivos). Quando o sistema calcula a alocacao por plano para exibicao, ambos os planos somam a alocacao do root compartilhado. Resultado: plano A mostra 33, plano B mostra 45, soma = 78, mas o orcamento e apenas 25.

## Bug 1: Per-plan display conta roots compartilhados em ambos os planos

**Arquivo**: `src/hooks/useStudyPlan.ts`, linhas 375-387

O loop de per-plan display soma `deckNewAllocation[rootId]` para cada plano que contem aquele root. Se root X aparece nos dois planos, ambos incluem `allocation[X]` na sua soma.

**Correcao**: Manter um `Set` global de roots ja atribuidos. Cada root so e contado no primeiro plano (maior prioridade) que o reivindica:

```text
const globalClaimedRoots = new Set<string>();
for (const p of sortedPlans) {
  const planRoots = new Set<string>();
  let sum = 0;
  for (const id of (p.deck_ids ?? [])) {
    const rootId = findRoot(id);
    if (planRoots.has(rootId)) continue;
    planRoots.add(rootId);
    if (!globalClaimedRoots.has(rootId)) {
      globalClaimedRoots.add(rootId);
      sum += deckNewAllocation[rootId] ?? 0;
    }
  }
  newCardsAllocation[p.id] = sum;
}
```

## Bug 2: studyService nao detecta deck como parte do plano

**Arquivo**: `src/services/studyService.ts`, linha 134

O check `deckIds.some(id => allPlanDeckIds.has(id))` compara os `deckIds` expandidos (root + descendentes) contra `allPlanDeckIds` que contem apenas os IDs selecionados no plano (filhos). Se o usuario estuda pelo root e o plano selecionou filhos, o root nao esta em `allPlanDeckIds`, e o check falha -- caindo no limite manual do deck.

**Correcao**: Expandir `allPlanDeckIds` para incluir descendentes ANTES do check, e tambem incluir os roots dos IDs do plano:

```text
// Expandir allPlanDeckIds para incluir descendentes e roots
const expandedPlanCheck = new Set<string>();
for (const id of Array.from(allPlanDeckIds)) {
  expandedPlanCheck.add(id);
  // Adicionar root ancestor
  const rootId = findRootAncestorId(allDecks ?? [], id);
  expandedPlanCheck.add(rootId);
  // Adicionar descendentes
  const descs = collectDescendantIds(allDecks ?? [], id);
  for (const d of descs) expandedPlanCheck.add(d);
}

if (deckIds.some(id => expandedPlanCheck.has(id))) {
  // ... continuar com a logica de alocacao
}
```

## Bug 3: studyService tambem duplica roots compartilhados na alocacao

**Arquivo**: `src/services/studyService.ts`, mesma logica dos pesos

O `seenRoots` no studyService e global entre planos (correto para pesos), mas a alocacao final nao precisa de correcao adicional porque o `totalForSession` ja esta deduplicado. Porem, precisa garantir que o check do Bug 2 funciona.

## Resumo de Arquivos

| Arquivo | Linha | Mudanca |
|---------|-------|---------|
| `useStudyPlan.ts` | 375-387 | Usar `globalClaimedRoots` para atribuir cada root ao primeiro plano apenas |
| `studyService.ts` | 129-134 | Expandir `allPlanDeckIds` com roots e descendentes antes do check de pertencimento |

## Resultado Esperado

1. Usuario define 25 cards/dia, 2 objetivos com decks compartilhados
2. Roots compartilhados sao atribuidos ao objetivo de maior prioridade
3. Per-plan display: ENARE = 15, Meu Objetivo = 10 (soma = 25, nao 78)
4. Dashboard: cada deck raiz mostra exatamente sua cota alocada
5. Fila de estudo reconhece corretamente que o deck pertence a um plano ativo
