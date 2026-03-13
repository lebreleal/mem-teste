# Sistema ALEKS — Grafo de Pré-requisitos entre Conceitos

## Implementado

### 1. Coluna `parent_concept_id` em `global_concepts`
- `ALTER TABLE global_concepts ADD parent_concept_id uuid REFERENCES global_concepts(id) ON DELETE SET NULL`
- Índice criado para queries eficientes

### 2. `conceptHierarchyService.ts` reescrito para grafo de conceitos
- `buildHierarchyDiagnostic` navega `parent_concept_id` (ancestors/descendants/siblings) em vez de `parent_deck_id`
- ConceptNode agora inclui `depth` (profundidade no grafo) e `parent_concept_id`
- Removidas dependências de deck hierarchy (getAncestorDeckIds, getSiblingDeckIds, etc.)

### 3. Cascade automático no erro (`useGlobalConcepts.ts`)
- Quando rating = 1 (Again) e conceito tem parent_concept_id, chama `cascadeOnError`
- `cascadeOnError` caminha ancestrais e reagenda os que estão em state 0/3 ou stability < 5

### 4. Fronteira de aprendizagem "Prontos para aprender" (`Concepts.tsx`)
- `fetchReadyToLearnConcepts`: conceitos em state=0 cujo parent está em state=2 (dominado)
- Seção visual com badges clicáveis na aba "Meus"

### 5. Auto-linking de pré-requisitos via IA (`generate-questions`)
- Prompt atualizado para retornar campo `prerequisites` (0-2 Knowledge Components)
- Tool schema inclui `prerequisites` como campo obrigatório
- `linkQuestionsToConcepts` agora seta `parent_concept_id` automaticamente com o primeiro pré-requisito

### 6. ErrorNotebook atualizado para grafo de conceitos
- Breadcrumb mostra caminho de pré-requisitos (conceitos, não decks)
- "Lacunas Fundacionais" → "Pré-requisitos Fracos"
- Suporta múltiplos source concepts

### 7. Donut Chart de Progresso por Categoria
- Gráfico de rosca (Recharts) na aba "Meus" agrupando conceitos por `category`
- Cada fatia = uma grande área médica, colorida por % de domínio
- Clicar na fatia filtra a lista por aquela categoria
- Exibe % total de domínio no centro

### 8. Fronteira Enforced (Conceitos Bloqueados)
- Conceitos cujo `parent_concept_id` aponta para conceito com `state !== 2` ficam bloqueados
- UI: opacity reduzida, ícone de cadeado, tooltip "Domine {prereq} primeiro"
- Conceitos bloqueados não podem ser estudados diretamente

### 9. Auto-mapeamento de Pré-requisitos via IA
- Botão "Mapear pré-requisitos com IA" na página de Conceitos
- Edge function `map-prerequisites` usa Lovable AI (gemini-2.5-flash) com tool calling
- Analisa todos os conceitos do usuário e retorna pares `{ concept, prerequisite }`
- Atualiza `parent_concept_id` em batch (não sobrescreve mapeamentos manuais)

### 10. Avaliação Diagnóstica Inicial (Knowledge Check)
- Botão "Diagnóstico Inicial" na página de Conceitos
- Seleciona ~20 conceitos distribuídos por profundidade no grafo
- Para cada conceito, busca uma questão vinculada
- Se acerta → marca conceito como dominado (state=2, stability=10)
- Se erra → marca como fraco (state=0) para revisão futura
- Exibe resultado final com contagem de acertos/erros

## Arquivos Modificados
| Arquivo | Mudança |
|---|---|
| Supabase migration | `parent_concept_id` + index |
| `src/services/conceptHierarchyService.ts` | Reescrito: grafo de conceitos |
| `src/services/globalConceptService.ts` | `parent_concept_id` no tipo, `cascadeOnError`, `fetchReadyToLearnConcepts`, `linkQuestionsToConcepts` com prerequisites, `mapPrerequisitesViaAI`, `fetchDiagnosticConcepts`, `markConceptMastered`, `markConceptWeak` |
| `src/hooks/useGlobalConcepts.ts` | Cascade automático no rating=1 |
| `src/pages/Concepts.tsx` | Donut chart, fronteira enforced, botão diagnóstico, botão mapear prereqs |
| `src/pages/ErrorNotebook.tsx` | Usa grafo de conceitos em vez de decks |
| `src/components/deck-detail/DeckQuestionsTab.tsx` | Passa prerequisites no linking |
| `supabase/functions/generate-questions/index.ts` | Campo prerequisites no schema + prompt |
| `supabase/functions/map-prerequisites/index.ts` | Nova edge function para IA mapear pré-requisitos |
| `supabase/config.toml` | Adicionada config map-prerequisites |
