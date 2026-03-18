

## Agrupamento de Cards Irmãos (Siblings) no ManageDeck

### Problema
Cards de oclusão (texto e imagem) geram múltiplos cards do mesmo conteúdo (ex: `{{c1::...}}` e `{{c2::...}}`). No editor ManageDeck, esses "irmãos" aparecem como cards separados (ex: 7 e 8). Se o usuário inserir um card abaixo do 7, ele fica entre o 7 e o 8, quebrando o agrupamento.

### Solução

**1. Identificar siblings**: Cards são irmãos se compartilham o mesmo `front_content` e são do tipo `cloze` ou `image_occlusion`. Criar um helper `getSiblingGroups(sortedCards)` que retorna um Map de `front_content → [indices]`.

**2. Visual no sidebar**: Siblings recebem uma barra vertical conectora à esquerda dos números, indicando que pertencem ao mesmo grupo. Ao clicar em qualquer um do grupo, todos ficam com highlight suave (fundo accent), mas só o clicado fica com o círculo primário.

**3. Inserção inteligente (`handleAddCard`)**: Quando o card selecionado faz parte de um grupo de siblings, o novo card é inserido abaixo do **último** sibling do grupo, não abaixo do selecionado individualmente. O `created_at` é calculado entre o último sibling e o card seguinte.

**4. Navegação**: Prev/Next continua card a card (cada sibling tem seu próprio FSRS). Não pula o grupo inteiro.

### Mudanças por arquivo

| Arquivo | Mudança |
|---|---|
| `ManageDeck.tsx` | Adicionar `getSiblingGroups` helper. Modificar `handleAddCard` para detectar grupo e inserir após o último sibling. Modificar sidebar para mostrar barra conectora e highlight de grupo. |

### Detalhes técnicos

```typescript
// Identificar siblings: mesmo front_content + tipo cloze/image_occlusion
function getSiblingGroups(cards: Card[]): Map<number, number[]> {
  // Returns Map<groupStartIndex, [idx1, idx2, ...]>
  // Agrupa cards consecutivos com mesmo front_content
}
```

No `handleAddCard`:
```typescript
// Se selectedIndex pertence a um grupo, usar lastSiblingIndex em vez de selectedIndex
const group = siblingGroupOf(selectedIndex);
const insertAfterIndex = group ? group[group.length - 1] : selectedIndex;
// Calcular created_at entre sortedCards[insertAfterIndex] e sortedCards[insertAfterIndex + 1]
```

No sidebar, cada sibling do grupo mostra uma barra vertical fina (`border-l-2 border-primary/30`) conectando-os visualmente, e ao selecionar qualquer um, todos recebem `bg-accent/50`.

Nenhuma migration. Nenhuma mudança no FSRS ou study queue.

