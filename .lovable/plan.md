

# Diagnóstico: "Estudar Agora" Quebrado + Plano de Correção

## Problemas Identificados

### Bug Principal: O botão mente para o usuário
O Hero mostra "82 revisão · 19 aprendendo · 111 novos" (agregado de TODOS os baralhos), mas ao clicar navega para `/study/{firstPendingDeckId}` — que carrega cards de **um único baralho**. O usuário espera estudar tudo, mas estuda só um pedaço.

### Bug 2: Não existe rota unificada
Não existe `/study/unified`. O `Study.tsx` requer `deckId` ou `folderId` via `useParams`. Sem isso, não carrega nada.

### Bug 3: Temas (concepts) não entram na sessão
O Hero conta "50 temas" no total mas a rota de estudo só busca cards via `fetchStudyQueue`. Os temas due nunca são incluídos na sessão real.

### Bug 4: Session cap é cosmético
O banner "Sessão recomendada: 30min" é apenas visual. A sessão real carrega todos os cards do baralho sem respeitar o cap.

### Bug 5: Estudar direto nos baralhos (DeckCarousel)
Cada baralho no carousel tem botão "Estudar" próprio que vai pra `/study/{deckId}`. Isso **está correto** — é acesso direto para power users. O problema é que contradiz a promessa do Hero.

## Solução: Rota Unificada Real

### 1. Nova rota `/study/all` no `App.tsx`
Adicionar rota que carrega `Study.tsx` sem `deckId`/`folderId`, sinalizando modo unificado.

### 2. Novo service: `fetchUnifiedStudyQueue` no `studyService.ts`
- Busca cards de TODOS os baralhos do escopo (plan mode ou todos) numa única query
- Aplica limites por hierarquia (new/review) igual ao `fetchStudyQueue` atual
- Intercala cards de diferentes baralhos (não estuda um baralho inteiro antes do próximo)
- Prioridade: learning/relearning → review → new (mesma lógica atual, mas cross-deck)
- Usa o config do baralho de cada card para `submitReview` (já funciona assim — o card tem `deck_id`)

### 3. Adaptar `useStudySession.ts`
- Novo modo: quando `deckId === 'all'` e sem `folderId`, chama `fetchUnifiedStudyQueue`
- O `submitReview` já funciona por card individual (busca `deckConfig` do card.deck_id), precisa adaptar para buscar config do deck correto

### 4. Adaptar `Study.tsx`
- Detectar modo unificado (`deckId === 'all'`)
- No `goBack`, voltar para `/dashboard` em vez de `/decks/:id`
- Para `submitReview`, buscar `deckConfig` do deck do card atual (não do deck da rota)

### 5. `StudyNowHero.tsx` — navegar para `/study/all`
- Trocar `navigate(`/study/${q.firstPendingDeckId}`)` por `navigate('/study/all')`

### 6. Session cap real (fase 2, opcional)
- Por agora, o cap fica cosmético — o service já respeita daily limits per deck
- Implementar cap real requer truncar a fila unificada, o que pode ser feito depois

### 7. Temas na fila (fase 2, opcional)
- Integrar concepts due na fila unificada é complexo (são quizzes, não flashcards)
- Manter separado por agora — o Hero pode mostrar link para `/conceitos` se há temas due

## Resumo das mudanças concretas

| Arquivo | Mudança |
|---|---|
| `App.tsx` | Adicionar rota `/study/all` |
| `studyService.ts` | Nova função `fetchUnifiedStudyQueue` |
| `useStudySession.ts` | Detectar modo `all`, chamar service correto |
| `Study.tsx` | Adaptar goBack, deckConfig per-card |
| `StudyNowHero.tsx` | Navegar para `/study/all` |
| `useUnifiedQueue.ts` | Expor `pendingDeckIds` para o service |

A retenção FSRS está funcionando corretamente — o algoritmo, os estados, o agendamento estão todos íntegros. O problema é puramente de **navegação e montagem da fila**.

