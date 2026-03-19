

# Plano: Otimização de Performance + StudySettings no Subdeck + Limpeza

## Problemas Identificados

### 1. StudySettingsSheet não disponível dentro do subdeck (DeckDetail)
Dentro de `DeckDetail.tsx`, não existe botão "Configurar Estudo" (SlidersHorizontal). O `StudySettingsSheet` só aparece na Sala (Dashboard/SalaHero) e no deck-pai (MateriaDetail). Quando o usuário está dentro de um subdeck, não tem como configurar limites.

### 2. `DeckDetailContext.tsx` — 19x `decks.find()` = O(n²) (Lei 1A)
Dentro de `useMemo` e callbacks, usa `decks.find(dk => dk.id === ...)` repetidamente em loops recursivos (rootTotals, globalNewReviewedToday, descendantIds, rootId). Com 50+ decks, cada `.find()` é O(n). O contexto deveria usar um `Map<string, DeckWithStats>` para lookups O(1).

### 3. `DeckDetail.tsx` — `checkIsLinkedDeck` usa `.find()` em loop
`decks.find(d => d.id === parentId)` dentro de while loop — mesmo problema.

### 4. `_SubDeckList` deprecado mas ainda no bundle (270 linhas mortas)
O componente está marcado `@deprecated` mas continua no arquivo, aumentando bundle size e confusão.

### 5. `DeckDetailContext` — `descendantIds` usa `.filter()` recursivo em vez de Map
Linhas 285-295: BFS com `decks.filter(d => d.parent_deck_id === current)` em cada iteração — O(n²).

### 6. `StudySettingsSheet` — usa `(a as any).sort_order` (Lei 3)
Linhas 48 e 74: cast para `any` para acessar `sort_order`.

### 7. `DeckDetailContext` — `createExam` e notification stubs usam `any` (Lei 3)
Linhas 214-216: `as any` para stubs de exame.

---

## Mudanças

### 1. Adicionar botão "Configurar Estudo" no DeckDetail (subdeck)
**Arquivo: `src/pages/DeckDetail.tsx`**
- Adicionar ícone `SlidersHorizontal` no header do subdeck (ao lado do Settings)
- Abrir `StudySettingsSheet` filtrado para os decks do root ancestor (mesma experiência da Sala/MateriaDetail)
- Passar `decks` filtrados pelo folder do root ancestor

### 2. Criar `deckMap` + `childrenIndex` no DeckDetailContext
**Arquivo: `src/components/deck-detail/DeckDetailContext.tsx`**
- Adicionar `deckMap = new Map(decks.map(d => [d.id, d]))` em um `useMemo`
- Adicionar `childrenIndex = Map<parentId, children[]>` 
- Substituir TODOS os `decks.find()` e `decks.filter(d => d.parent_deck_id === ...)` por lookups no Map
- Substituir `rootId` useMemo: usar `deckMap.get()` em vez de `decks.find()`
- Substituir `rootTotals`: usar `childrenIndex.get()` em vez de `decks.filter()`
- Substituir `globalNewReviewedToday`: usar `childrenIndex.get()` em vez de `decks.filter()`
- Substituir `descendantIds`: usar `childrenIndex.get()` em vez de `decks.filter()`

### 3. Substituir `checkIsLinkedDeck` para usar Map
**Arquivo: `src/pages/DeckDetail.tsx`**
- Aceitar `deckMap: Map` como parâmetro em vez de `decks: LinkableDeck[]`
- Usar `deckMap.get(parentId)` em vez de `decks.find()`

### 4. Remover `_SubDeckList` deprecado
**Arquivo: `src/pages/DeckDetail.tsx`**
- Deletar ~270 linhas de código morto (linhas 50-320)

### 5. Corrigir `any` no StudySettingsSheet
**Arquivo: `src/components/dashboard/StudySettingsSheet.tsx`**
- Trocar `(a as any).sort_order` por `(a.sort_order ?? 0)` — `DeckWithStats` já tem `sort_order`

### 6. Limpar stubs `any` no DeckDetailContext
**Arquivo: `src/components/deck-detail/DeckDetailContext.tsx`**
- Tipar `createExam` e notification stubs corretamente sem `any`

## Arquivos afetados

| Arquivo | Mudança |
|---|---|
| `src/pages/DeckDetail.tsx` | Botão StudySettings no subdeck; remover `_SubDeckList`; Map-based `checkIsLinkedDeck` |
| `src/components/deck-detail/DeckDetailContext.tsx` | `deckMap` + `childrenIndex` Maps; eliminar 19x `.find()`; limpar `any` |
| `src/components/dashboard/StudySettingsSheet.tsx` | Remover `as any` |

## Impacto esperado
- **UX**: usuário pode configurar estudo de dentro de qualquer subdeck
- **Performance**: eliminação de O(n²) → O(1) no DeckDetailContext (sentido especialmente ao abrir subdecks)
- **Bundle**: ~270 linhas mortas removidas
- **Lei 3**: zero `any` nos arquivos afetados
- **Sem impacto** em estatísticas, contagens ou funcionalidades existentes — apenas otimização de lookups

