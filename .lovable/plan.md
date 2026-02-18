

## Problema Identificado

O bug principal esta na linha 24 do `useStudySession.ts`:

```text
const card = studyQueue.data?.cards.find(c => c.id === cardId);
```

Quando voce erra um card (rating 1 ou 2), o Study.tsx atualiza o card no `localQueue` com os novos valores (state, stability, difficulty, scheduled_date). Porem, quando voce revisa esse card novamente, o `submitReview` busca os dados **originais** do card no cache da query (que nunca muda, pois tem `staleTime: Infinity`).

Resultado: o algoritmo recebe dados antigos (estado original, scheduled_date original) e calcula um intervalo completamente errado -- por isso aparece "1 segundo" ao inves dos 10 minutos esperados.

## Solucao

Modificar o `useStudySession` para aceitar o card atualizado diretamente, em vez de buscar do cache stale.

### Alteracoes

**1. `src/hooks/useStudySession.ts`**
- Mudar o `mutationFn` do `submitReview` para receber o objeto `card` completo (com dados atualizados) ao inves de apenas `cardId`
- Remover o `find` que busca do cache stale

**2. `src/pages/Study.tsx`**
- No `handleRate`, passar o `currentCard` completo (que ja tem os dados atualizados do `localQueue`) para o `submitReview.mutate`

### Detalhes Tecnicos

Antes:
```text
submitReview.mutate({ cardId: currentCard.id, rating })
// dentro do hook: busca card antigo do cache
```

Depois:
```text
submitReview.mutate({ card: currentCard, rating })
// dentro do hook: usa o card diretamente, com dados frescos
```

Isso garante que quando um card em aprendizado e revisado pela segunda vez, o algoritmo recebe o state=1, a stability atualizada, e o scheduled_date correto -- produzindo intervalos consistentes com o que os botoes mostram.

### Sobre os algoritmos FSRS e SM2

Comparei ambos com as implementacoes de referencia open-source (ts-fsrs, femto-fsrs) e as formulas estao corretas:
- FSRS: init_stability, init_difficulty, retrievability, next_recall_stability, next_forget_stability, stability_to_interval -- todos batem com o FSRS-4.5
- SM2: calculo do EFactor, progressao de intervalos, graduacao -- corretos

O problema nao esta nos algoritmos em si, mas nos dados stale sendo passados para eles.

