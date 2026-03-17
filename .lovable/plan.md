

# Rodada 2 de Limpeza — Código Morto Restante

Analisei todo o código que sobrou após a primeira rodada. Encontrei **restos órfãos** dos sistemas que já deletamos, além de **arquivos/funções que ninguém mais importa**. Aqui vai o inventário:

---

## GRUPO A — Edge Functions Órfãs (servidor)
Essas funções ficam no servidor Supabase. Foram deletadas do frontend, mas as pastas das funções ainda existem.

| # | Edge Function | O que fazia | Ainda é usada? |
|---|---|---|---|
| A1 | `suggest-tags/` | IA sugeria tags para cartões | NAO — tags deletadas |
| A2 | `auto-tag-cards/` | IA criava tags em lote para um baralho | NAO — tags deletadas |
| A3 | `generate-questions/` | IA gerava questões de prova | NAO — provas deletadas |
| A4 | `grade-exam/` | IA corrigia resposta dissertativa | NAO — provas deletadas |
| A5 | `parse-questions/` | Parseava questões coladas de texto | NAO — provas deletadas |
| A6 | `map-prerequisites/` | Mapeava pré-requisitos entre conceitos | NAO — conceitos deletados |
| A7 | `generate-onboarding/` | Gerava baralho de boas-vindas | NAO — onboarding deletado |
| A8 | `tts/` | Text-to-Speech (ler cartão em voz alta) | NAO — TTS deletado |

**Ação:** Deletar as 8 pastas + remover as entradas do `supabase/config.toml`.

---

## GRUPO B — Funções Órfãs no adminService.ts
O arquivo `adminService.ts` ainda contém ~200 linhas de código morto de sistemas removidos:

| # | Funções | Sistema removido |
|---|---|---|
| B1 | `createAIConversation`, `saveAIChatMessage`, `deleteAIConversation`, `fetchAIConversations`, `fetchAIChatMessages` (linhas 99-142) | AI Agent (chat persistente) |
| B2 | `reviewSuggestion` (linhas 169-182) | Sugestões de Correção |
| B3 | `fetchTurmaExamDetail`, `fetchTurmaExamAttemptForResults`, `fetchTurmaExamAnswers`, `gradeExamQuestion`, `updateTurmaExamAnswer`, `updateTurmaExamAttemptScore` (linhas 185-263) | Provas de Turma |
| B4 | `fetchDeckQuestionCounts`, `fetchSalaQuestionCounts` (linhas 328-431) | Questões de Deck |

**Ação:** Remover essas funções do adminService.ts.

---

## GRUPO C — Funções Órfãs no aiService.ts
| # | Funções | Sistema removido |
|---|---|---|
| C1 | `GradeExamParams` (interface) + `gradeExamAnswer()` (linhas 31-118) | Provas |
| C2 | `GenerateExamQuestionsParams` (interface, linhas 50-58) | Provas |

**Ação:** Remover interfaces e funções de exam do aiService.ts.

---

## GRUPO D — Funções Órfãs no turmaDetailService.ts
| # | Funções | Sistema removido |
|---|---|---|
| D1 | `importTurmaExam()` + `TurmaExamInput` (linhas 42-80) | Provas |
| D2 | `fetchPendingSuggestions()`, `updateSuggestionStatus()`, `fetchCreatorCommunityStats()` (linhas 83-fim) | Sugestões de Correção + CreatorPanel |

**Ação:** Remover essas funções. Manter apenas `fetchTurmaPublic`, `fetchTurmaLessonFiles`, `fetchActiveSubscription`, `restoreSubscriptionStatus`, `processSubscription`.

---

## GRUPO E — Funções Órfãs em outros services
| # | Arquivo | Funções mortas | Motivo |
|---|---|---|---|
| E1 | `turmaLessonService.ts` | `importTurmaExamToPersonal()` (~50 linhas no final) | Provas deletadas |
| E2 | `turma/turmaExams.ts` | **Arquivo inteiro** | Provas de turma deletadas |
| E3 | `turma/index.ts` | Bloco de exports de `turmaExams` (~20 linhas) | Provas deletadas |
| E4 | `uiQueryService.ts` | `fetchDeckQuestionStats()` + `QuestionStatsResult` | Questões de deck deletadas |
| E5 | `dashboardService.ts` | `fetchDeckQuestionCounts()` | Questões de deck deletadas |
| E6 | `deck/deckCrud.ts` | `fetchQuestionCountsByDeck()` + referências a `deck_questions` | Questões deletadas |

---

## GRUPO F — Libs Órfãs (ninguém importa)
| # | Arquivo | O que fazia | Importado por alguém? |
|---|---|---|---|
| F1 | `src/lib/charDiff.ts` | Diff caracter-a-caracter (usado no SuggestCorrectionModal) | NAO |
| F2 | `src/lib/examUtils.ts` | Utilidades de provas | NAO |
| F3 | `src/lib/docUtils.ts` | Utilidades de documentos | NAO |

**Ação:** Deletar os 3 arquivos.

---

## GRUPO G — Referências de Questões em Componentes UI
| # | Componente | O que limpar |
|---|---|---|
| G1 | `DeckList.tsx` | Remove `fetchDeckQuestionCounts` import + query + prop `questionCountMap` |
| G2 | `SalaList.tsx` | Remove `fetchDeckQuestionCounts` import + query + `getQuestionCount` |
| G3 | `SalaCard.tsx` | Remove prop `questionCount` e a linha que mostra "X questões" |
| G4 | `DeckRow.tsx` | Remove prop `questionCountMap` e exibição de contagem de questões |
| G5 | `DeckStatsCard.tsx` | Remove `fetchDeckQuestionStats` import + seção de questões no card |
| G6 | `TurmaDetail.tsx` | Remove `fetchSalaQuestionCounts` import + query |
| G7 | `LessonContent.tsx` | Remove toda referência a `personalExams`, `personalQuestionCounts` |
| G8 | `AdminUsers.tsx` e `AdminUsageReport.tsx` | Limpar labels de features deletadas (grade_exam, auto_tag, suggest_tags, tts, generate_onboarding) dos mapas de nomes |
| G9 | `AdminIA.tsx` | Remover seção inteira de configuração de vozes TTS (~80 linhas) |

---

## GRUPO H — Config do Supabase
- Remover do `supabase/config.toml` as entradas das 8 edge functions deletadas

---

## Resumo de impacto

| Tipo | Quantidade |
|---|---|
| Edge functions deletadas | 8 pastas |
| Arquivos .ts/.tsx deletados | ~5 (charDiff, examUtils, docUtils, turmaExams.ts, etc.) |
| Funções removidas de arquivos existentes | ~30 funções |
| Componentes editados (limpeza de props/queries) | ~10 arquivos |
| Linhas removidas (estimativa) | ~1.500 linhas |

Tudo nessa lista pertence a sistemas que **você já mandou deletar**. Nenhum sistema novo é tocado.

