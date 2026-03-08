

# Levantamento de Linhas por Arquivo

## Arquivos GIGANTES (700+ linhas) -- PROBLEMATICOS

```text
Arquivo                                    | Linhas | Veredicto
-------------------------------------------|--------|-------------------
src/integrations/supabase/types.ts         | 2.871  | Auto-gerado, OK
src/pages/StudyPlan.tsx                    | 1.580  | CRITICO - page+UI+logic
src/pages/ManageDeck.tsx                   | 1.169  | CRITICO - monolito
src/components/deck-detail/DeckDetailCtx   | 1.064  | ALTO - context gigante
src/pages/DeckSettings.tsx                 | 1.002  | CRITICO - monolito
src/components/FlashCard.tsx               |   956  | ALTO - card+preview+edit
src/components/ImportCardsDialog.tsx        |   942  | ALTO - dialog monolito
src/components/StudyCardActions.tsx         |   791  | ALTO - muitas responsab.
src/components/deck-detail/CardList.tsx     |   666  | MEDIO-ALTO
src/hooks/useStudyPlan.ts                  |   638  | ALTO - 7 queries num hook
src/pages/ExamSetup.tsx                    |   644  | ALTO - setup monolito
src/components/lesson-detail/LessonContent |   625  | MEDIO-ALTO
```

## Arquivos GRANDES (400-700 linhas) -- MERECEM ATENÇÃO

```text
Arquivo                                    | Linhas | Veredicto
-------------------------------------------|--------|-------------------
src/pages/LessonDetail.tsx                 |   575  | MEDIO - orquestrador
src/components/ImageOcclusion.tsx           |   570  | MEDIO - canvas complexo
src/pages/Index.tsx                        |   541  | MEDIO - landing page
src/pages/Dashboard.tsx                    |   477  | OK apos refatoracao
src/components/OnboardingDialog.tsx         |   460  | MEDIO - wizard
src/pages/Study.tsx                        |   447  | MEDIO
src/index.css                              |   442  | OK - CSS
src/pages/Turmas.tsx                       |   433  | MEDIO
src/pages/ActivityView.tsx                 |   420  | MEDIO
src/pages/TurmaDetail.tsx                  |   412  | OK - delegou bem
src/components/RichEditor.tsx              |   406  | MEDIO - tiptap wrapper
src/components/dashboard/useDashboardState |   403  | MEDIO
```

## Arquivos SAUDAVEIS (< 400 linhas)

```text
Arquivo                                    | Linhas
-------------------------------------------|-------
src/components/SuggestCorrectionModal.tsx   |   377
src/components/StudyChatModal.tsx           |   366
src/services/studyService.ts               |   365
src/pages/DeckDetail.tsx                   |   362
src/pages/ExamTake.tsx                     |   360
src/components/dashboard/DeckCarousel.tsx   |   355
src/lib/fsrs.ts                            |   300
src/services/turma/turmaContent.ts         |   271
src/pages/Feedback.tsx                     |   257
src/lib/studyUtils.ts                      |   253
src/pages/ExamResults.tsx                  |   247
src/hooks/useExams.ts                      |   242
src/services/turma/turmaCrud.ts            |   242
src/components/PomodoroFloater.tsx          |   229
src/pages/Profile.tsx                      |   227
src/pages/MemoGrana.tsx                    |   208
src/pages/Missions.tsx                     |   202
src/pages/Performance.tsx                  |   196
src/services/missionService.ts             |   188
src/hooks/useForecastSimulator.ts          |   187
src/pages/Auth.tsx                         |   167
src/components/AICreateDeckDialog.tsx       |   163
src/services/aiService.ts                  |   145
src/services/examService.ts               |   143
src/services/turma/turmaExams.ts           |   136
src/hooks/useAuth.tsx                      |   129
src/components/PersonalNotes.tsx           |   122
src/pages/ExamCreate.tsx                   |   114
src/components/DeckCard.tsx                |   113
src/lib/pdfUtils.ts                        |    97
src/hooks/useTurmas.ts                     |    95
src/services/walletService.ts              |    94
src/hooks/useDecks.ts                      |    89
src/hooks/useStudySession.ts              |    68
src/hooks/usePerformance.ts               |    50
src/components/BottomNav.tsx               |    44
src/hooks/useCards.ts                      |    41
src/hooks/useWallet.ts                     |    24
src/components/EnergyFloater.tsx           |    23
```

---

## Analise: Esta Certo ou Nao?

**Voce esta CERTO** -- o `types.ts` do Supabase tem 2.871 linhas, mas isso e auto-gerado e nao se mexe. O problema real esta nos **12 arquivos acima de 600 linhas** que sao codigo manual:

### Os 5 piores ofensores:

1. **StudyPlan.tsx (1.580 linhas)** -- Uma pagina com UI, logica de drag-and-drop, modais, formatadores, tudo junto. Deveria ser 4-5 arquivos.

2. **ManageDeck.tsx (1.169 linhas)** -- Editor de cards com formularios, preview, estados de edicao, validacao. Monolito classico.

3. **DeckDetailContext.tsx (1.064 linhas)** -- Um Context com queries, mutations, handlers, dialogos. Faz tudo: CRUD de cards, reordenacao, bulk actions, tags, import, export.

4. **DeckSettings.tsx (1.002 linhas)** -- Formulario de configuracoes com muitas secoes inline ao inves de componentes separados.

5. **FlashCard.tsx (956 linhas)** -- Depois da extracao de `flashCardUtils`, ainda tem 956 linhas. Mistura renderizacao, edicao inline, preview de intervalos, animacoes.

### Veredicto geral:

- **14 arquivos acima de 500 linhas** = quantidade ALTA para um projeto React. A regra pratica e manter componentes abaixo de 300 linhas e hooks abaixo de 200.
- Os servicos e hooks menores estao **bem estruturados** (turma/, card/, deck/ ja foram modularizados).
- O problema se concentra nas **pages e componentes complexos** que nao foram decompostos.

### Quer que eu faca um plano de refatoracao para os piores? Os candidatos sao:
- StudyPlan.tsx (1.580 → ~4 arquivos)
- ManageDeck.tsx (1.169 → ~3 arquivos)
- DeckDetailContext.tsx (1.064 → ~3 arquivos)
- DeckSettings.tsx (1.002 → ~3 arquivos)
- FlashCard.tsx (956 → ~2 arquivos)

