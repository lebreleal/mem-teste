

# Analise Arquitetural do Memo Cards

## Resumo Geral

O projeto tem uma base arquitetural **solida e bem pensada**. A separacao em camadas (pages, hooks, services, types, lib) e clara, o README documenta bem as convencoes, e ha consistencia na maioria dos padroes. Dito isso, existem areas com oportunidades claras de melhoria. Vou classificar por severidade.

---

## PONTOS POSITIVOS (o que esta bom)

1. **Separacao em camadas bem definida** -- pages > hooks > services > types segue um padrao limpo e previsivel
2. **Barrel exports** em `types/index.ts` e `services/index.ts` facilitam imports
3. **README arquitetural** -- excelente para onboarding de novos devs
4. **Context API bem aplicado** -- `TurmaDetailContext` centraliza estado complexo corretamente
5. **Custom hooks de estado** -- `useDashboardState` extrai logica do componente
6. **Services puros** -- `cardService`, `deckService` nao tem dependencia de React
7. **Algoritmos isolados** -- SM-2 e FSRS em `lib/` com testes unitarios
8. **Edge functions com utils compartilhados** -- `_shared/utils.ts` centraliza CORS, auth, energia

---

## PROBLEMAS ENCONTRADOS

### Severidade ALTA

#### 1. DeckDetail.tsx e um "God Component" (1491 linhas)

Este e o maior problema arquitetural do projeto. Um unico arquivo contem:
- 30+ estados locais (`useState`)
- Logica de CRUD de cards
- Upload de imagens
- Integracao com IA
- 6+ modais/dialogs inline
- Filtros, busca, selecao em lote

**Impacto**: Qualquer dev novo levara muito tempo para entender e modificar. Alto risco de bugs ao alterar qualquer parte.

**Solucao**: Decompor seguindo o padrao ja usado em Dashboard e TurmaDetail:
- Criar `src/components/deck-detail/DeckDetailContext.tsx` ou `useDeckDetailState.ts`
- Extrair dialogs para `DeckDetailDialogs.tsx`
- Extrair a lista de cards para `CardList.tsx`
- Extrair o editor de cards para `CardEditorDialog.tsx`
- Extrair stats para `DeckStatsCard.tsx`

---

#### 2. Supabase direto em componentes de pagina

A regra do README diz "Sem Supabase direto em componentes", mas `DeckDetail.tsx` faz chamadas diretas ao Supabase:
- `supabase.from('cards').update(...)` nas linhas 355, 388
- `supabase.from('cards').delete()` na linha 407
- `supabase.storage.from('card-images').upload(...)` na linha 425
- `supabase.functions.invoke('enhance-card', ...)` na linha 484

O mesmo acontece em `TurmaDetailContext.tsx`:
- `supabase.from('turma_lesson_files')` direto no contexto
- `supabase.from('turma_exam_questions')` no `handleImportExam`

**Impacto**: Viola a separacao de camadas, dificulta testes e reutilizacao.

**Solucao**: Mover todas as chamadas Supabase para os respectivos services.

---

#### 3. Uso excessivo de `any` em types

O projeto desativa `noImplicitAny` no tsconfig e usa `any` extensivamente:
- `TurmaDetailContext` -- quase todos os campos sao `any` (turma, members, user, mutations...)
- `studyService.ts` -- `card: any`, `deckConfig: any`, `result: any`
- `deckService.ts` -- castings `as any` em quase toda operacao Supabase

**Impacto**: Perde-se toda a seguranca de tipos. Bugs de runtime que o TypeScript deveria pegar passam despercebidos.

**Solucao**: Criar interfaces proprias para cada entidade (TurmaSubject, TurmaLesson, TurmaMember, etc.) e tipar progressivamente.

---

### Severidade MEDIA

#### 4. Queries duplicadas entre DeckDetail e useStudySession

`DeckDetail.tsx` tem sua propria query `cards-aggregated` e `deck-stats` com logica de coleta de descendentes. O `useStudySession` tem logica similar. Nao ha um servico centralizado para "agregar stats de deck + descendentes".

**Solucao**: Criar um `useDeckAggregatedStats(deckId)` hook reutilizavel.

---

#### 5. Invalidacao de cache inconsistente

Diferentes mutations invalidam queries de formas diferentes:
- `useCards.deleteCard` invalida `['cards', deckId]` e `['decks']` mas NAO `['deck-stats']` ou `['cards-aggregated']`
- `useStudySession.submitReview` invalida `['decks']`, `['deck-stats']`, `['cards-aggregated']`
- `DeckDetail.handleDelete` invalida `['cards-aggregated']` e `['deck-stats']` manualmente

**Impacto**: Dados desatualizados em certas telas apos operacoes.

**Solucao**: Centralizar a lista de query keys relacionadas e criar um helper `invalidateDeckRelatedQueries(queryClient, deckId)`.

---

#### 6. FlashCard.tsx tambem e muito grande (681 linhas)

Contem `MultipleChoiceCard` como componente interno, alem de funcoes utilitarias (`renderCloze`, `renderOcclusion`, `formatMarkdown`).

**Solucao**: Extrair `MultipleChoiceCard`, `ClozeCard`, `OcclusionCard` como componentes separados. Mover utils para `lib/cardRenderUtils.ts`.

---

#### 7. Operacoes em lote sem batching

`bulkMoveDecks`, `bulkArchiveDecks`, `bulkDeleteDecks` e `handleBulkDelete` (cards) fazem loops com `await` sequencial:

```text
for (const id of ids) {
  await supabase.from('cards').delete().eq('id', id);
}
```

**Impacto**: Lento para muitos itens; se um falha no meio, fica em estado inconsistente.

**Solucao**: Usar `.in('id', ids)` para operacoes em lote quando possivel, ou `Promise.all` com tratamento de erro.

---

### Severidade BAIXA

#### 8. Imports duplicados de tipos

`CardRow` e re-exportado em 3 lugares: `types/deck.ts`, `services/cardService.ts`, `hooks/useCards.ts`. Funciona, mas adiciona confusao sobre a "fonte da verdade".

---

#### 9. Mistura de extensoes `.ts` e `.tsx` em hooks

`useAuth.tsx`, `useExamNotifications.tsx`, `use-mobile.tsx` usam `.tsx` (porque retornam JSX via Provider), enquanto os demais usam `.ts`. Isso e tecnicamente correto, mas nao ha documentacao explicando a convencao.

---

#### 10. Ausencia de Error Boundaries granulares

Existe um `ErrorBoundary.tsx` generico, mas nao e usado em sub-arvores criticas (Study, DeckDetail). Um erro em qualquer sub-componente derruba a pagina inteira.

---

## FACILIDADE PARA OUTRO PROGRAMADOR (Nota: 7/10)

| Aspecto | Nota | Comentario |
|---------|------|------------|
| Estrutura de diretorios | 9/10 | Clara e bem documentada |
| README | 9/10 | Excelente guia arquitetural |
| Consistencia de padroes | 6/10 | Dashboard e Turma seguem o padrao; DeckDetail nao |
| Tipagem | 4/10 | Muito `any`, dificulta entendimento de contratos |
| Tamanho dos arquivos | 5/10 | DeckDetail e FlashCard sao muito grandes |
| Naming conventions | 8/10 | Consistente (useX, xService, etc.) |
| Separacao de concerns | 6/10 | Boa na teoria, quebrada na pratica em alguns lugares |

---

## PLANO DE ACAO RECOMENDADO (por prioridade)

1. **Decompor DeckDetail.tsx** -- maior ganho imediato de legibilidade
2. **Eliminar Supabase direto em paginas** -- respeitar a camada de services
3. **Tipar TurmaDetailContext** -- substituir `any` por interfaces reais
4. **Centralizar invalidacao de cache** -- um helper para queries relacionadas a decks
5. **Extrair sub-componentes do FlashCard** -- por tipo de card
6. **Usar batch operations** -- `.in()` ao inves de loops sequenciais

---

## CONCLUSAO

O projeto tem uma **fundacao arquitetural boa** com convencoes claras documentadas. Os problemas existentes sao principalmente de **disciplina de execucao** -- o padrao correto ja esta estabelecido (veja Dashboard e TurmaDetail), mas nem todas as partes do codigo o seguem. O maior ofensor e o `DeckDetail.tsx` que concentra demais. Com as melhorias sugeridas, a base de codigo ficaria significativamente mais facil de manter e entender por qualquer programador.

