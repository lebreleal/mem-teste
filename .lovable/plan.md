

## Relatório: Como Funciona e O Que Está Errado

### Como DEVERIA funcionar

1. **Cada cor diferente = 1 cartão.** Se um cartão tem oclusões azul, vermelha e verde, devem existir 3 cartões irmãos (siblings) vinculados na barra lateral esquerda.

2. **Timestamps próximos.** Os siblings devem ter `created_at` muito próximo do cartão original para ficarem agrupados na lista (ordenada por timestamp).

3. **Preview.** Ao clicar no botão de preview, deve mostrar o cartão como no modo estudo — com a cor selecionada ocultada e as outras cores translúcidas. Se estou no cartão 20 (azul), vejo azul tampado. Se vou pro 21 (vermelho), vejo vermelho tampado.

4. **Preview UI.** Deve manter a barra lateral esquerda com números e vínculo, botões de duplicar/lixeira à direita, sem barra inferior com setas.

---

### O Que Está Errado

#### Bug 1: Timestamp dos siblings novos colide com cartões existentes

**Causa raiz:** Quando crio uma 3ª cor, `createCards` é chamado com `baseCreatedAt = currentCard.created_at`. O `createCards` calcula: `baseTime + idx + 1` (incremento de 1ms).

**Problema:** O cartão original já tem T. O 2º sibling (criado antes) está em T+1. Quando adiciono a 3ª cor, o novo sibling é criado em T+1 também (pois `idx=0` → `baseTime + 0 + 1 = T+1`), colidindo com o sibling existente. Ou pior: já existe um cartão não-sibling entre T+1 e T+2, quebrando o agrupamento.

**Correção:** Em vez de usar `currentCard.created_at` como base, encontrar o último sibling existente do grupo e inserir após ele com incrementos sub-milissegundo (0.001ms). Assim os novos siblings ficam DEPOIS dos existentes mas ANTES do próximo cartão não-sibling.

#### Bug 2: Preview não renderiza oclusões corretamente

**Causa raiz:** O componente `CardContent` em `CardPreviewSheet.tsx` (linhas 116-176) renderiza oclusão de imagem usando `activeRectIds` e ignora completamente o `clozeTarget` do `VirtualCard`. Usa cor azul hardcoded (`rgba(59,130,246,...)`), não a cor real da forma.

O `FlashCard.tsx` já tem a lógica correta (linhas 127-185): usa `clozeTarget` para filtrar quais formas ocultar, e mostra as outras translúcidas com suas cores reais. Mas `CardContent` não reusa essa lógica.

**Correção:** Atualizar `CardContent` para usar `clozeTarget` do `VirtualCard` na renderização de oclusão — replicar a lógica do `FlashCard.tsx`. No modo preview, mostrar cores reais (cada forma com sua cor); no modo estudo, tudo azul.

#### Bug 3: Preview mostra sintaxe crua `{{c1::texto}}`

**Causa raiz:** Para cartões `image_occlusion`, o `frontText` (texto que acompanha a imagem) é renderizado com `dangerouslySetInnerHTML` SEM passar por `renderClozePreview`. Se o `frontText` contém clozes de texto, aparece a sintaxe crua.

**Correção:** Aplicar `renderClozePreview(frontText, revealed, clozeTarget)` antes de renderizar.

#### Bug 4: Preview UI tem barra inferior indesejada

**Causa raiz:** O `ManageDeckPreview` (linhas 775-783) tem uma `<div>` com setas e "Toque para revelar" na parte inferior.

**Correção:** Remover essa barra. Manter a barra lateral vertical com números e vínculo (reusar o padrão do editor principal). Adicionar botões de duplicar e lixeira à direita.

---

### Plano de Implementação

#### 1. Corrigir timestamps de siblings (`ManageDeck.tsx` + `cardMutations.ts`)

Na função `saveCurrentCard`, em vez de `createCards(deckId!, newCards, currentCard.created_at)`:
- Buscar todos os siblings existentes e pegar o `created_at` do último
- Buscar o próximo cartão não-sibling após o grupo
- Calcular timestamps entre esses dois pontos com incrementos de 0.001ms
- Em `cardMutations.ts`, mudar incremento para `(idx + 1) * 0.001` para precisão sub-milissegundo

#### 2. Corrigir renderização de oclusão no Preview (`CardPreviewSheet.tsx`)

Atualizar `CardContent` (linhas 116-176):
- Usar `clozeTarget` do `VirtualCard` para determinar quais formas ocultar
- Formas ativas (cor = clozeTarget): sólidas quando ocultas, translúcidas quando reveladas
- Formas não-ativas: translúcidas com suas cores reais (contexto visual)
- Aplicar `renderClozePreview` ao `frontText` de oclusões de imagem

#### 3. Redesenhar Preview UI (`ManageDeck.tsx`, linhas 714-786)

- Remover barra inferior (setas + "Toque para revelar")
- Adicionar barra lateral esquerda com números e vínculo de siblings (reusar padrão do editor)
- Adicionar botões duplicar/lixeira à direita
- Trocar ícone de lixeira pelo padrão do app

