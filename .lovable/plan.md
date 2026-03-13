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
- Se acerta 2x consecutivas → marca conceito como dominado (state=2, stability=10)
- Se erra → marca como fraco (state=0) para revisão futura
- Exibe resultado final com contagem de acertos/erros

### 11. Princípios de Neurociência Aplicados (Learning Science)

#### Rating Automático Binário (StudyMode)
- Removidos botões manuais "Errei/Bom/Fácil"
- Sistema atribui rating=3 (correto) ou rating=1 (incorreto) automaticamente
- Base: Dunning-Kruger — alunos são maus autoavaliadores

#### Mastery Threshold (MASTERY_THRESHOLD = 2)
- Exige 2 acertos consecutivos para confirmar domínio de um conceito
- Aplicado tanto no StudyMode quanto no DiagnosticMode
- Base: Bloom 1968 (mastery learning), reduz falso positivo de 25% (chute em 4 alternativas)

#### Interleaved Practice (ErrorNotebook)
- Botão "Estudar todos (prática intercalada)" embaralha todos os conceitos fracos
- Fisher-Yates shuffle garante aleatoriedade uniforme
- Base: Rohrer & Taylor 2007 (+20-40% retenção vs blocked practice)

#### Elaborative Interrogation (StudyMode)
- Após erro, campo de texto: "Por que a alternativa X está correta?"
- Aluno tenta explicar antes de ver a explicação da IA
- Opcional (pode pular), mas ativa encoding profundo
- Base: Chi et al. 1994, Dunlosky et al. 2013 (+30% retenção)

#### Confidence-Based Assessment (StudyMode)
- Após acertar, pergunta "Você tinha certeza?"
- Se "Chutei" → não incrementa streak, exige mais uma questão
- Impede que chutes sortudos confirmem domínio
- Base: Hunt 2003, Dunlosky & Rawson 2012 (calibração metacognitiva)

## Correções Arquiteturais — Unificação Cards ↔ Temas

### 12. Card Review → Concept Mastery Sync (Fase 1a)
- `Study.tsx` → `executeReview()` agora chama `getCardConcepts` + `updateConceptMastery` após cada review
- Se rating≥3: incrementa correct_count do tema vinculado
- Se rating=1: incrementa wrong_count do tema vinculado
- Execução non-blocking (fire-and-forget) para não impactar performance do estudo

### 13. Temas Due → Flashcard Retrieval (Fase 1b)
- `DashboardDueThemes.tsx` agora navega para `/study/{deckId}` ao clicar em um tema
- Busca deck vinculado via `question_concepts` → `deck_questions` → `deck_id`
- Fallback para `/conceitos` se não houver deck vinculado
- Removido StudyMode inline — temas due sugerem flashcards (recall real > recognition)

### 14. Auto-trigger Diagnóstico Inicial (Fase 2a)
- Novo componente `DiagnosticBanner.tsx` no Dashboard
- Aparece automaticamente quando 10+ conceitos existem sem `last_reviewed_at`
- Botão "Iniciar diagnóstico" abre `DiagnosticMode` inline
- Dismissível com persistência em localStorage

### 15. Auto-trigger Mapeamento de Pré-requisitos (Fase 2b)
- Função `tryAutoMapPrerequisites` adicionada em `globalConceptService.ts`
- Chamada automaticamente após `linkQuestionsToConcepts` (fire-and-forget)
- Só executa se >80% dos conceitos não têm `parent_concept_id` (first-time scenario)
- Guard contra execução duplicada via `_autoMapInFlight` Set

### 16. Daily Theme Limit (Fase 3a)
- Constante `DAILY_NEW_THEME_LIMIT = 5` em `useGlobalConcepts.ts`
- `newThemeRemaining` calculado com base em temas revisados hoje pela primeira vez
- Exposto no hook para UI consumir (banners, limites)

## Arquivos Modificados
| Arquivo | Mudança |
|---|---|
| Supabase migration | `parent_concept_id` + index |
| `src/services/conceptHierarchyService.ts` | Reescrito: grafo de conceitos |
| `src/services/globalConceptService.ts` | `parent_concept_id` no tipo, `cascadeOnError`, `fetchReadyToLearnConcepts`, `linkQuestionsToConcepts` com prerequisites, `mapPrerequisitesViaAI`, `fetchDiagnosticConcepts`, `markConceptMastered`, `markConceptWeak`, `tryAutoMapPrerequisites` |
| `src/hooks/useGlobalConcepts.ts` | Cascade automático no rating=1, `DAILY_NEW_THEME_LIMIT`, `newThemeRemaining` |
| `src/pages/Concepts.tsx` | Donut chart, fronteira enforced, botão diagnóstico, botão mapear prereqs |
| `src/pages/ErrorNotebook.tsx` | Interleaved practice, botão "Estudar todos" com shuffle |
| `src/components/concepts/StudyMode.tsx` | Rating binário automático, mastery threshold, elaborative interrogation, confidence check |
| `src/components/concepts/DiagnosticMode.tsx` | Mastery threshold de 2 questões, useEffect fix |
| `src/components/deck-detail/DeckQuestionsTab.tsx` | Passa prerequisites no linking |
| `supabase/functions/generate-questions/index.ts` | Campo prerequisites no schema + prompt |
| `supabase/functions/map-prerequisites/index.ts` | Nova edge function para IA mapear pré-requisitos |
| `supabase/config.toml` | Adicionada config map-prerequisites |
| `src/pages/Study.tsx` | Sync card review → concept mastery |
| `src/components/dashboard/DashboardDueThemes.tsx` | Navega para deck ao invés de StudyMode |
| `src/components/dashboard/DiagnosticBanner.tsx` | **Novo** — Auto-trigger diagnóstico |
| `src/pages/Dashboard.tsx` | Adicionado DiagnosticBanner |
