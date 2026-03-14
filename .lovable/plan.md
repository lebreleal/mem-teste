

## Reorganização: Salas → Matérias → Sub-decks (Accordion)

### Resumo

O Dashboard passa a ter 2 níveis de navegação:

```text
Home (lista de Salas)
├── 📚 Turma 11 B Uninove     [tap → entra]
│   ├── Biologia               (deck raiz = "matéria")
│   │   ├── ▸ Citologia         (sub-deck, accordion)
│   │   └── ▸ Genética
│   ├── Matemática
│   └── 📕 Caderno de Erros
├── 📚 Meus Estudos            (sala padrão para decks órfãos)
└── [+ Criar Sala]
```

Apenas um accordion aberto por vez. Ao abrir outro, o anterior fecha.

### Análise de Usabilidade

Sim, fica melhor. Razões concretas:

1. **Redução de carga cognitiva** — Hick's Law: menos itens por tela = decisão mais rápida. Em vez de 15 decks soltos, o usuário vê 2-3 salas.
2. **Agrupamento natural** — Gestalt (proximidade): decks de uma mesma turma/contexto ficam juntos.
3. **Progressive disclosure** — Sub-decks ficam escondidos até o usuário pedir. Menos ruído visual.
4. **Modelo mental claro** — Sala = contexto real (turma, curso, concurso). Matéria = disciplina. Sub-deck = tópico.

### Plano Técnico

#### 1. Dashboard nível raiz: Lista de Salas

**`Dashboard.tsx`** — Quando `currentFolderId === null`, renderizar `SalaList` (novo componente) em vez de `DeckList`.

**Novo `SalaCard.tsx`** — Card para cada folder mostrando:
- Nome da sala
- Contagem de matérias (decks raiz naquela folder)
- Barra de progresso agregada (mastery média)
- Tap → seta `?folder=ID` via `setCurrentFolderId`

**Migração automática de decks órfãos** — No `useDashboardState`, se existirem decks raiz sem `folder_id`, mostrar uma Sala virtual "Meus Estudos" que agrupa esses decks. Ao clicar, cria a folder no banco e move os decks.

#### 2. Dentro da Sala: Matérias com Accordion

**`DeckRow.tsx`** — Adicionar botão de expand/collapse (ChevronDown) quando o deck tem sub-decks. Sub-decks renderizados inline com indent. Estado controlado: só um expandido por vez (ao expandir deck X, colapsar o que estava aberto).

**`DeckList.tsx`** — Receber prop `accordionMode` para ativar o comportamento de "só um aberto".

#### 3. Navegação e Breadcrumb

- Botão de voltar no topo quando dentro de uma Sala (já existe `breadcrumb` no state)
- Header mostra nome da Sala atual

#### 4. Menu "+" Atualizado

**`ProtectedRoute.tsx`** — Sheet do "+" muda conforme contexto:
- Na raiz: "Criar Sala" como opção principal
- Dentro de uma Sala: "Criar Baralho", "Criar com IA", "Importar Cartões" (associados à sala atual)

#### 5. Filtro de decks por folder_id

**`useDashboardState.ts`** — `currentDecks` passa a filtrar por `folder_id === currentFolderId` quando dentro de uma sala. Na raiz, não mostra decks (mostra salas).

### Arquivos Afetados

| Arquivo | Mudança |
|---|---|
| `src/pages/Dashboard.tsx` | Condicional raiz vs dentro-da-sala, breadcrumb, botão voltar |
| `src/components/dashboard/useDashboardState.ts` | Filtrar decks por `folder_id`, lógica de sala virtual "Meus Estudos" |
| `src/components/dashboard/DeckList.tsx` | Accordion mode (só um aberto) |
| `src/components/dashboard/DeckRow.tsx` | Botão expand sub-decks, renderização inline |
| `src/components/ProtectedRoute.tsx` | Menu "+" contextual (Sala vs Deck) |
| **Novo**: `src/components/dashboard/SalaCard.tsx` | Card visual para cada Sala |
| **Novo**: `src/components/dashboard/SalaList.tsx` | Lista de salas na raiz |

### Sem Migração de Banco

A tabela `folders` já existe com `user_id`, `name`, `parent_id`, `sort_order`, `is_archived`. Os decks já têm `folder_id`. Nenhum SQL necessário.

