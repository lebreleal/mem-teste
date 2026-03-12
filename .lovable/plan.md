

# Fase 1 + Fase 2: Reorganizar Conceitos + Caderno de Erros Inteligente

## Resumo

**Fase 1** remove `/conceitos` como destino de navegacao no menu, transforma conceitos em info contextual dentro dos decks, e torna o Caderno de Erros inteligente (mostra cards relacionados ao conceito errado).

**Fase 2** cria a pagina `/banco-questoes` com abas Oficiais + Comunidade, filtros por prova/area, e acao "Importar para meus decks" que auto-cria hierarquia de decks + conceitos + cards.

---

## Fase 1: Reorganizar o que ja existe

### 1.1 Remover `/conceitos` do BottomNav
- **`src/components/BottomNav.tsx`**: Remover o item `BrainCircuit` → `/conceitos`. BottomNav fica com 2 itens: Home + Desempenho.
- A rota `/conceitos` continua existindo (acessivel via links diretos ou Dashboard), mas nao e mais um destino primario de navegacao.

### 1.2 Conceitos como info contextual dentro do DeckDetail
- **`src/pages/DeckDetail.tsx`**: Nos componentes `PersonalDeckTabs` e `LinkedDeckTabs`, adicionar uma secao "Conceitos deste baralho" abaixo das tags.
- Query: buscar `question_concepts` + `global_concepts` para todas as questoes do deck.
- Mostrar chips com nome do conceito + badge de dominio (Novo/Aprendendo/Dominado).
- Clicar no chip navega para `/conceitos` com filtro pre-aplicado daquele conceito.

### 1.3 Caderno de Erros inteligente
- **`src/pages/ErrorNotebook.tsx`**: Refatorar para mostrar, em cada questao errada:
  - A questao com suas alternativas e resposta correta
  - Os conceitos vinculados a essa questao (via `question_concepts`)
  - Cards relacionados: buscar cards dos decks que contem questoes vinculadas aos mesmos conceitos
  - Botao "Revisar este conceito" que inicia uma mini-sessao de estudo focada (cards FSRS due daquele conceito)
- Novo service method em `globalConceptService.ts`: `getConceptCards(conceptId)` — busca cards vinculados ao deck das questoes daquele conceito.
- Adicionar query para buscar conceitos das questoes erradas via `question_concepts` join.

### 1.4 Dashboard: mover link de Conceitos para Quick Nav (opcional)
- **`src/pages/Dashboard.tsx`**: Adicionar um atalho discreto para `/conceitos` no grid de quick nav (substituir ou adicionar ao lado de "Meu Plano"), mantendo acessibilidade sem poluir o BottomNav.

---

## Fase 2: Banco de Questoes

### 2.1 Nova pagina `/banco-questoes`
- **`src/pages/QuestionBank.tsx`** (novo arquivo)
- Layout: Header com titulo "Banco de Questoes" + busca
- Duas abas: "Oficiais" e "Comunidade"
  - **Oficiais**: questoes de decks marcados como `is_public = true` em comunidades oficiais (turmas com flag oficial, ou turma_decks publicados)
  - **Comunidade**: questoes de turma_decks publicados de comunidades publicas
- Cada questao mostra: enunciado (truncado), categoria, conceitos, origem (nome do deck/comunidade)

### 2.2 Filtros
- Filtro por Grande Area (5 categorias medicas)
- Filtro por subcategoria
- Filtro por prova (tag do deck: ENADE, Revalida, USP, etc.)
- Busca textual no enunciado

### 2.3 Acao "Importar para meus decks"
- Selecao multipla de questoes (checkbox)
- Botao "Importar X questoes"
- Fluxo automatico:
  1. Agrupar questoes por categoria/subcategoria
  2. Criar deck hierarquico: `[Fonte] > [Grande Area] > [Subcategoria]` (usando `parent_deck_id`)
  3. Copiar questoes para os decks criados (`deck_questions` insert)
  4. Auto-criar conceitos globais via `linkQuestionsToConcepts`
  5. Gerar cards basicos de revisao para cada conceito (frente: conceito, verso: explicacao da questao)
- Service: `questionBankService.ts` com `importQuestionsToDecks(userId, questionIds[])`

### 2.4 Routing e navegacao
- **`src/App.tsx`**: Adicionar rota `/banco-questoes` protegida
- **`src/pages/Dashboard.tsx`**: Adicionar atalho no Quick Nav grid (icone `Library` ou `Search`)
- Lazy load do componente

### 2.5 Dados necessarios
- Nenhuma migracao de banco necessaria — todas as tabelas ja existem (`deck_questions`, `turma_decks`, `turmas`, `question_concepts`, `global_concepts`)
- As questoes publicas ja sao acessiveis via RLS existente (policies de `deck_questions` para turma members e public community)

---

## Arquivos a criar/editar

| Arquivo | Acao |
|---|---|
| `src/components/BottomNav.tsx` | Remover item Conceitos |
| `src/pages/DeckDetail.tsx` | Adicionar secao de conceitos contextuais |
| `src/pages/ErrorNotebook.tsx` | Adicionar conceitos + cards relacionados |
| `src/services/globalConceptService.ts` | Adicionar `getConceptCards()` |
| `src/pages/QuestionBank.tsx` | Criar pagina do banco de questoes |
| `src/services/questionBankService.ts` | Criar service de importacao |
| `src/App.tsx` | Adicionar rota `/banco-questoes` |
| `src/pages/Dashboard.tsx` | Adicionar atalho no Quick Nav |

