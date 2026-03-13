

## Plano: Caderno de Erros Completo com Deck de Erros Automático

### Conceito Central
Quando o usuário **erra um card** (rating=1, state vira 3/reaprendendo), o card é **movido** para um deck especial "Caderno de Erros" auto-criado. O card mantém todo seu FSRS. Quando o card **amadurece** (state=2, dominado), ele **volta automaticamente** para o deck de origem. O usuário é notificado visualmente quando isso acontece.

### 1. Migração de Banco de Dados

Adicionar coluna `origin_deck_id` na tabela `cards`:
```sql
ALTER TABLE cards ADD COLUMN origin_deck_id uuid DEFAULT NULL;
```
Essa coluna guarda de onde o card veio. Se `origin_deck_id IS NOT NULL`, o card está temporariamente no deck de erros.

### 2. Lógica de Movimentação (studyService.ts)

**No `submitCardReview`**, após calcular o resultado FSRS:

- **Se rating=1 (Errei) e card não está já no deck de erros:**
  - Busca/cria o deck "📕 Caderno de Erros" do usuário (flag especial ou nome fixo)
  - Salva `origin_deck_id = card.deck_id`
  - Move card para o deck de erros (`deck_id = errorDeckId`)

- **Se state resultado = 2 (Dominado) e `origin_deck_id` existe:**
  - Move card de volta: `deck_id = origin_deck_id`, `origin_deck_id = null`
  - Toast: "Card dominado! Voltou para o deck original."

### 3. Serviço do Deck de Erros (errorDeckService.ts)

Novo serviço com funções:
- `getOrCreateErrorDeck(userId)` — busca ou cria o deck especial
- `getErrorDeckCards(userId)` — cards no deck de erros com info do deck de origem
- `getErrorDeckStats(userId)` — contadores por status (aprendendo, reaprendendo, dominados hoje)

### 4. Página ErrorNotebook Aprimorada

**Header com tabs/filtros:**
- "Todos" | "Para Revisar" (due) | "Aprendendo" | "Dominados Hoje"

**Multi-select + bulk delete:**
- Botão "Selecionar" no header → ativa modo de seleção com checkboxes
- Barra flutuante inferior com contagem + botão "Excluir" (deleta os cards selecionados do deck de erros e limpa `origin_deck_id`)

**Card Row melhorado:**
- Mostra nome do deck de origem (badge com nome do deck)
- Progress bar de acertos
- Status FSRS (aprendendo/reaprendendo)
- Clicável → abre detail sheet

### 5. Detail Sheet (ConceptErrorDetailSheet)

Bottom sheet ao clicar em um card/conceito:
- **Header:** nome do conceito, badge de saúde
- **Deck de origem:** link para navegar ao deck
- **Questões vinculadas:** lista scrollável das questions ligadas
- **Botão "Estudar agora":** navega para `/study/{errorDeckId}` (estuda o deck de erros)
- **Ações:** "Devolver ao deck" (força retorno), "Excluir"

### 6. Feedback Visual no Estudo

Quando o card é movido para o caderno de erros durante a sessão:
- Toast: "Card movido para o Caderno de Erros. Domine-o para devolvê-lo ao deck original."

Quando o card é dominado e volta:
- Toast: "Card dominado! Devolvido ao deck [nome]."

### 7. Dashboard Integration

O atalho "Caderno de Erros" já existe. O badge mostrará a contagem de cards no deck de erros (não mais baseado em concepts, mas em cards reais).

### Arquivos Afetados
- **Migração SQL:** adicionar `origin_deck_id` em `cards`
- **Novo:** `src/services/errorDeckService.ts`
- **Editar:** `src/services/studyService.ts` (lógica de mover on error/mastery)
- **Reescrever:** `src/pages/ErrorNotebook.tsx` (tabs, multi-select, detail sheet)
- **Novo:** `src/components/error-notebook/ErrorDetailSheet.tsx`
- **Editar:** `src/pages/Dashboard.tsx` (badge conta cards no error deck)

