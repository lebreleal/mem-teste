

# Ajustes de Prioridade, Carrossel e UX

## Resumo

Cinco mudancas para alinhar o ordenamento dos objetivos e decks entre a tela de plano e o Dashboard (Inicio), remover elementos visuais desnecessarios e melhorar a responsividade mobile do carrossel.

---

## 1. Remover o dot de saude (verde/laranja) antes do titulo do objetivo

**Arquivo:** `src/pages/StudyPlan.tsx` (linhas 866-872)

Remover o `div` com as classes `h-2.5 w-2.5 rounded-full` que renderiza o dot colorido baseado em `objHealth`. O health ja e indicado no Hero Card global -- o dot por objetivo e redundante e confunde.

---

## 2. Ordenar os decks no carrossel do Dashboard pela prioridade dos objetivos

**Arquivo:** `src/components/dashboard/DeckCarousel.tsx`

**Problema atual:** `activeDecks` e filtrado de `roots` sem nenhuma ordenacao por prioridade de objetivo. O usuario reordena seus objetivos no /plano mas o carrossel do Dashboard nao reflete essa ordem.

**Solucao:**
- A prop `plansByDeckId` ja mapeia `rootDeckId -> objectiveName`, mas nao carrega informacao de ordem.
- Mudar a prop para `planDeckOrder: string[]` -- uma lista ordenada de root deck IDs ja na ordem correta (prioridade do objetivo, depois ordem do deck dentro do objetivo).
- No `Dashboard.tsx`, construir essa lista iterando `plans` (ja ordenados por priority) e para cada plan iterar `deck_ids` na ordem em que estao salvos, resolvendo para root IDs e deduplicando.
- No `DeckCarousel.tsx`, ordenar `activeDecks` pela posicao no array `planDeckOrder`. Decks que nao estao no plano ficam no final.
- Manter `plansByDeckId` separadamente para as badges de objetivo.

---

## 3. Remover abas "Pendentes" / "Feitos" -- lista unica com pendentes primeiro

**Arquivo:** `src/components/dashboard/DeckCarousel.tsx`

**Problema:** As abas `Tabs` (`Pendentes` / `Feitos`) fragmentam a visao. O usuario quer ver tudo junto, com pendentes no topo e concluidos embaixo (opacidade reduzida).

**Mudanca:**
- Remover o componente `Tabs`, `TabsList`, `TabsTrigger` e o estado `activeTab`.
- Renderizar uma lista unica: `[...pendingDecks, ...doneDecks]` (ja ordenados por prioridade dentro de cada grupo).
- Decks concluidos (`pendingToday === 0`) recebem `opacity-60` no card e a badge "Concluido" ja existente.
- Remover imports de `Tabs`, `TabsList`, `TabsTrigger`.

---

## 4. Melhorar responsividade mobile do carrossel

**Arquivo:** `src/components/dashboard/DeckCarousel.tsx`

**Problemas:** Cards desalinhados em mobile, largura minima fixa de 240px pode causar overflow.

**Mudancas:**
- Ajustar o container do scroll horizontal: usar `gap-2.5` em vez de `gap-3`, padding `px-4` consistente.
- Nos cards (`DeckStudyCard`): usar `min-w-[200px] max-w-[260px] w-[72vw] sm:w-[240px]` para que em telas pequenas o card ocupe ~72% da viewport (mostrando um pedaco do proximo), e em telas maiores volte ao tamanho fixo.
- Garantir `snap-x snap-mandatory` no container e `snap-center` (em vez de `snap-start`) nos cards para melhor centralizacao mobile.

---

## 5. Drag-and-drop de decks dentro de cada objetivo (reordena `deck_ids`)

**Arquivo:** `src/pages/StudyPlan.tsx` (secao expanded do objetivo, linhas 898-931)

**Problema:** Ao expandir um objetivo, os decks aparecem sem possibilidade de reordenacao. O usuario quer definir a prioridade dos decks dentro de cada objetivo (qual aparece primeiro no carrossel).

**Mudanca:**
- Quando o objetivo esta expandido, renderizar os decks usando `useDragReorder` (mesmo hook ja usado para objetivos).
- Como `useDragReorder` e um hook e nao pode ser chamado condicionalmente, criar um sub-componente `ObjectiveDecksExpanded` que recebe `plan`, `activeDecks`, `avgSecondsPerCard`, e internamente usa `useDragReorder`.
- O `onReorder` do drag chama `updatePlan.mutateAsync({ id: plan.id, deck_ids: reorderedIds })` para persistir a nova ordem de `deck_ids` no banco.
- Os `CompactDeckRow` passam a receber `showGrip={true}` dentro dessa area.

**Componente novo (inline em StudyPlan.tsx):**

```text
function ObjectiveDecksExpanded({ plan, activeDecks, avgSecondsPerCard, updatePlan }) {
  const deckItems = plan.deck_ids
    .map(id => activeDecks.find(d => d.id === id))
    .filter(Boolean);

  const { getHandlers, displayItems } = useDragReorder({
    items: deckItems,
    getId: (d) => d.id,
    onReorder: (reordered) => {
      updatePlan.mutateAsync({ id: plan.id, deck_ids: reordered.map(d => d.id) });
    },
  });

  return displayItems.map(deck => {
    const handlers = getHandlers(deck);
    return <CompactDeckRow key={deck.id} deck={deck} avgSecondsPerCard={avg} handlers={handlers} showGrip={true} />;
  });
}
```

**Reflexo no Dashboard:** Como `planDeckOrder` e construido iterando `plan.deck_ids` na ordem salva, a reordenacao dos decks no /plano automaticamente reflete no carrossel do Dashboard.

---

## Secao Tecnica -- Resumo de Mudancas por Arquivo

### `src/components/dashboard/DeckCarousel.tsx`
- Remover `Tabs`, `TabsList`, `TabsTrigger` e estado `activeTab`
- Aceitar nova prop `planDeckOrder: string[]` (lista ordenada de root IDs)
- Ordenar `activeDecks` por posicao em `planDeckOrder`
- Renderizar lista unica: pendentes primeiro, concluidos depois (com opacity)
- Ajustar responsividade: `w-[72vw] sm:w-[240px]`, `snap-center`

### `src/pages/Dashboard.tsx`
- Construir `planDeckOrder: string[]` a partir de `plans` (ordenados por priority) iterando `deck_ids` de cada plan e resolvendo para root IDs
- Passar `planDeckOrder` como prop para `DeckCarousel`

### `src/pages/StudyPlan.tsx`
- Remover o dot de saude (div com `h-2.5 w-2.5 rounded-full`) das linhas 866-872
- Criar componente `ObjectiveDecksExpanded` com `useDragReorder` interno
- Substituir o render direto de decks expandidos pelo novo componente
- `CompactDeckRow` com `showGrip={true}` e `handlers` do drag

