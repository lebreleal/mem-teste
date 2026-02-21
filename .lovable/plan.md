
# Corrigir Propagacao de Alocacao: Deck Filho para Deck Pai (Root)

## Problema Raiz

Quando o usuario seleciona um **deck filho** no objetivo, o sistema armazena a alocacao com a chave do deck filho (ex: `deckNewAllocation["child-123"] = 25`). Porem, o Dashboard e o Carousel buscam pela chave do **deck raiz** (`planAllocation["parent-456"]`), que nao existe no mapa. Resultado: cai no fallback `deck.daily_new_limit` (20).

## Solucao

Resolver os IDs dos decks filhos para seus ancestrais raiz (root) e agregar as alocacoes no nivel do root. Isso deve acontecer em dois lugares:

1. **Dashboard.tsx** - ja possui `allDecks` com hierarquia e `getRootId()` helper
2. **studyService.ts** - mesma logica na fila de estudo

### Mudanca 1: `src/pages/Dashboard.tsx`

Criar um `rootAllocation` que agrega `deckNewAllocation` no nivel do root ancestor antes de passar para `useDashboardState` e `DeckCarousel`.

```text
// Apos obter metrics?.deckNewAllocation:
const rootAllocation = useMemo(() => {
  const raw = metrics?.deckNewAllocation;
  if (!raw || !allDecks) return raw;
  const result: Record<string, number> = {};
  for (const [deckId, count] of Object.entries(raw)) {
    const rootId = getRootId(deckId) ?? deckId;
    result[rootId] = (result[rootId] ?? 0) + count;
  }
  return result;
}, [metrics?.deckNewAllocation, allDecks, getRootId]);

// Passar rootAllocation em vez de metrics?.deckNewAllocation:
const state = useDashboardState(rootAllocation);
// ...
<DeckCarousel planAllocation={rootAllocation} ... />
```

### Mudanca 2: `src/services/studyService.ts`

Na funcao `fetchStudyQueue`, apos calcular `allocation` (keyed por deck IDs do plano), resolver para root IDs antes de somar `totalForSession`:

```text
// Resolver allocation para root IDs
const rootAllocation: Record<string, number> = {};
for (const [did, count] of Object.entries(allocation)) {
  const rootId = findRootAncestorId(allDecks ?? [], did);
  rootAllocation[rootId] = (rootAllocation[rootId] ?? 0) + count;
}

// Usar rootAllocation para determinar o limite da sessao
const totalForSession = deckIds.reduce((s, id) => {
  const rootId = findRootAncestorId(allDecks ?? [], id);
  return s + (rootAllocation[rootId] ?? 0);
}, 0);
```

Nota: `findRootAncestorId` ja existe em `studyUtils.ts` e e importado no `studyService.ts`.

### Mudanca 3: `src/hooks/useStudyPlan.ts`

Tambem precisa buscar a hierarquia de decks para resolver child para root no proprio hook, para que o `deckNewAllocation` retornado ja contenha entradas de root. Isso garante consistencia em todos os consumidores.

Adicionar uma query leve para buscar `id, parent_deck_id` de todos os decks do usuario:

```text
const deckHierarchyQuery = useQuery({
  queryKey: ['deck-hierarchy', userId],
  queryFn: async () => {
    const { data } = await supabase
      .from('decks')
      .select('id, parent_deck_id')
      .eq('user_id', userId!);
    return data ?? [];
  },
  enabled: !!userId,
  staleTime: 5 * 60_000,
});
```

Usar essa hierarquia para:
1. Ao buscar `perDeckNewCounts`, incluir tambem os decks descendentes dos selecionados (pois `get_all_user_deck_stats` retorna por deck, nao por arvore)
2. Ao montar `deckNewAllocation`, agregar as alocacoes sob o root ID

```text
// Helper para encontrar root
const findRoot = (id: string): string => {
  const deck = deckHierarchy.find(d => d.id === id);
  if (!deck || !deck.parent_deck_id) return id;
  return findRoot(deck.parent_deck_id);
};

// Apos calcular deckNewAllocation por deck IDs do plano,
// agregar para root:
const rootedAllocation: Record<string, number> = {};
for (const [did, count] of Object.entries(deckNewAllocation)) {
  const rootId = findRoot(did);
  rootedAllocation[rootId] = (rootedAllocation[rootId] ?? 0) + count;
}
// Substituir deckNewAllocation por rootedAllocation
```

## Resumo de Arquivos

| Arquivo | Mudanca |
|---------|---------|
| `useStudyPlan.ts` | Buscar hierarquia de decks; agregar alocacao no nivel root; incluir descendentes ao contar new cards |
| `Dashboard.tsx` | Resolver deckNewAllocation para root IDs antes de passar para carousel e state |
| `studyService.ts` | Resolver allocation para root IDs ao calcular totalForSession |

## Resultado Esperado

1. Usuario seleciona deck filho "Histologia" no objetivo
2. Sistema calcula alocacao: "Histologia" = 25 cards/dia
3. Resolve para root: "Deck Pai" = 25 cards/dia
4. Dashboard mostra "Deck Pai" com 25 novos/dia (nao mais 20)
5. Fila de estudo respeita o limite de 25 para toda a hierarquia do Deck Pai
6. Configuracao manual do deck (20) e ignorada quando plano esta ativo
