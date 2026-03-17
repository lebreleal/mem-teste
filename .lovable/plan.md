

## Plano: Matéria sem menu — abre tela própria para editar

### Ideia

Concordo 100%. Remover o 3-dot da Matéria e deixar o tap abrir/fechar o accordion normalmente. A edição da pasta acontece numa **tela dedicada** (full-screen) com:

```text
< Voltar     SEMIOLOGIA     ✏️ (IconEdit)
```

Ao tocar no ✏️, abre um modal simples: campo de nome + seletor de cor (6-8 círculos). Sem troca de ícone.

### Mudanças

#### 1. `DeckRow.tsx` — Matéria header
- **Remover** o `DeckMenu` da matéria (linhas 277-283)
- **Remover** "X pendentes" (linhas 257-260) — manter apenas "{N} decks"
- Manter chevron e accordion behavior como está

#### 2. `DeckRow.tsx` — Click na Matéria quando **não tem children** (matéria vazia)
- Comportamento já correto (fica expandido, mostra "+ Adicionar Deck")

#### 3. Nova tela: Matéria Detail (tela interna da pasta)
- Criar componente `src/pages/MateriaDetail.tsx`
- Rota: `/materia/:id`
- Header: botão voltar + nome da matéria + botão IconEdit
- Conteúdo: lista dos sub-decks (reutiliza DeckRow em modo flat)
- Botão "+ Adicionar Deck" no final
- IconEdit abre modal inline com: campo nome + grid de 8 cores
- Cor salva no campo `image_url` do deck (ex: `color:#00B3FF`) — zero migration

#### 4. `DeckRow.tsx` — Click na Matéria com children
- Mudar: ao invés de só expandir/colapsar, **navegar para `/materia/${deck.id}`**
- O accordion no dashboard pode ser removido (a tela da matéria substitui)

#### 5. `src/components/icons/index.tsx`
- Adicionar `IconDeck` (SVG do livro/cards fornecido)
- Adicionar `IconEdit` (SVG do lápis fornecido)

#### 6. `DeckList.tsx`
- Separador visual entre matérias e decks soltos
- Decks soltos usam `IconDeck` à esquerda

#### 7. Rota em `App.tsx`
- Adicionar `/materia/:id` apontando para `MateriaDetail`

### Decisão: Accordion vs Tela dedicada

Duas opções:

**A) Manter accordion no dashboard + tela dedicada (acessível via long-press ou ícone)**
- Mais rápido para ver sub-decks sem sair da tela
- Porém tem o problema do 3-dot menu que queremos remover

**B) Remover accordion, tap sempre abre tela da matéria**
- Mais limpo, mais macaco
- Cada tela faz uma coisa só
- Edição/config fica natural na tela interna

Recomendo **B** — mais simples, mais macaco. O dashboard fica uma lista limpa de pastas e decks. Tap na pasta = entra. Dentro tem tudo.

### Arquivos impactados

| Arquivo | Mudança |
|---|---|
| `src/components/icons/index.tsx` | +IconDeck, +IconEdit |
| `src/components/dashboard/DeckRow.tsx` | Remover DeckMenu e accordion da matéria, remover pendentes, tap navega para `/materia/:id` |
| `src/components/dashboard/DeckList.tsx` | Separador matérias/soltos, IconDeck nos soltos |
| `src/pages/MateriaDetail.tsx` | **Nova** — tela da pasta com header, lista de decks, modal de edição com cor |
| `src/App.tsx` | Adicionar rota `/materia/:id` |

