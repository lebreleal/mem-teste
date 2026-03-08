

## Diagnóstico: Activity View mostrando 0 cards/minutos

### Causa raiz

O problema está no ciclo de invalidação de cache:

1. **`submitReview.onSettled`** (em `useStudySession.ts`) invalida apenas `decks`, `deck-stats`, `cards-aggregated` — **NÃO invalida `study-stats` nem `activity-full`**
2. **`invalidateStudyQueries`** invalida tudo (incluindo `study-stats` e `activity-full`), mas só é chamada em `goBack()` — se o usuário navegar por outro caminho (browser back, bottom nav), nunca roda
3. **Cleanup do unmount** (linhas 110-114 do Study.tsx) só remove `study-queue` — **não invalida `study-stats` nem `activity-full`**

Resultado: o React Query serve dados stale (de antes da sessão) na Activity View.

### Fix

**`src/pages/Study.tsx`** — no `useEffect` de cleanup (unmount), adicionar invalidação de `study-stats` e `activity-full`:

```typescript
useEffect(() => {
  return () => {
    queryClient.removeQueries({ queryKey: studyQueueKey });
    // Ensure stats are fresh when navigating away
    queryClient.invalidateQueries({ queryKey: ['study-stats'] });
    queryClient.invalidateQueries({ queryKey: ['activity-full'] });
  };
}, [queryClient, studyQueueKey]);
```

**`src/hooks/useStudySession.ts`** — adicionar `study-stats` e `activity-full` ao `onSettled` da mutation para que cada review já invalide os stats:

```typescript
onSettled: () => {
  queryClient.invalidateQueries({ queryKey: ['decks'] });
  queryClient.invalidateQueries({ queryKey: ['deck-stats'] });
  queryClient.invalidateQueries({ queryKey: ['cards-aggregated'] });
  queryClient.invalidateQueries({ queryKey: ['study-stats'] });
  queryClient.invalidateQueries({ queryKey: ['activity-full'] });
},
```

São 2 edições pequenas, 2 arquivos.

