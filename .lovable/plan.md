

## Correção de Bugs na Sessão de Estudo

### Bug 1: Cards enterrados aparecem na fila de estudo

**Causa raiz:** A query `fetchStudyQueue` usa o filtro:
```
state.eq.0,state.eq.1,state.eq.3,and(state.eq.2,scheduled_date.lte.now)
```
Para cards com **state 0** (novos), **state 1** (aprendendo) e **state 3** (reaprendendo), nao ha filtro por `scheduled_date`. Quando um card e enterrado, o `handleBury` muda apenas o `scheduled_date` para amanha, mas NAO muda o estado. Resultado: cards enterrados com state 0, 1 ou 3 continuam aparecendo na fila.

**Impacto:** O card de Anatomia enterrado continua aparecendo como "1 Dominado" E aparece na sessao de estudo.

**Correcao em `src/services/studyService.ts`:**
- Calcular `endOfToday` (23:59:59 local em ISO)
- Filtrar state 0: `and(state.eq.0,or(scheduled_date.is.null,scheduled_date.lte.{endOfToday}))`
- Filtrar state 1/3: `and(state.in.(1,3),scheduled_date.lte.{endOfToday})`
- State 2 permanece: `and(state.eq.2,scheduled_date.lte.{now})`

---

### Bug 2: Sessao de estudo em loop (quick_review)

**Causa raiz:** Em `submitCardReview`, o modo `quick_review` retorna `interval_days: 0` sempre. Como o Study.tsx usa `result.interval_days === 0` para decidir manter o card na sessao, os cards NUNCA saem da fila, criando um loop infinito.

**Correcao em `src/services/studyService.ts`:**
- Mudar `interval_days: 0` para `interval_days: 1` no retorno do modo `quick_review`

---

### Bug 3: Barra de progresso nao avanca corretamente

**Causa raiz:** O progresso usa `uniqueReviewedCount / initialQueueSize`. Quando um card em aprendizado e re-revisado, o ID ja esta no Set, entao `size` nao muda. A barra fica parada.

**Correcao em `src/pages/Study.tsx`:**
- Usar progresso baseado em cards que SAIRAM da fila: `(initialQueueSize - localQueue.length) / initialQueueSize * 100`
- Atualizar o contador de texto para: `{cardsCompleted}/{totalCards}` onde `cardsCompleted = initialQueueSize - localQueue.length`
- Isso garante que a barra so avanca quando cards realmente concluem (graduam ou sao removidos), dando feedback preciso ao usuario

---

### Bug 4: Timer do "Dificil" parece nao funcionar

**Analise:** O timer funciona corretamente no codigo. Quando o usuario marca "Dificil" em um card de aprendizado, o card e reagendado com um intervalo (ex: 5.5min ou 22.5min dependendo dos learning_steps). Se ainda houver outros cards na fila (novos/revisao), eles sao mostrados ANTES do timer expirar. O usuario so ve a tela de espera quando TODOS os cards restantes estao aguardando.

**Nao e um bug**, mas a UX pode confundir. O usuario ve o proximo card imediatamente e pensa que o timer nao esta funcionando. Nenhuma mudanca de codigo necessaria - o comportamento esta correto e alinhado com o Anki.

---

### Detalhes tecnicos

**Arquivo: `src/services/studyService.ts`**

1. Na funcao `fetchStudyQueue` (bloco de filtro de cards, ~linha 83):
```typescript
const endOfToday = new Date();
endOfToday.setHours(23, 59, 59, 999);
const endOfTodayISO = endOfToday.toISOString();
const nowISO = new Date().toISOString();

// Filtro que exclui cards enterrados (scheduled_date > fim de hoje)
.or(`and(state.eq.0,or(scheduled_date.is.null,scheduled_date.lte.${endOfTodayISO})),and(state.in.(1,3),scheduled_date.lte.${endOfTodayISO}),and(state.eq.2,scheduled_date.lte.${nowISO})`)
```

2. Na funcao `submitCardReview`, modo `quick_review` (~linha 235):
```typescript
return {
  state: newState,
  stability: 0,
  difficulty: 0,
  scheduled_date: card.scheduled_date,
  interval_days: 1  // era 0, causava loop infinito
};
```

**Arquivo: `src/pages/Study.tsx`**

3. Progresso (linhas 154-156):
```typescript
const cardsCompleted = initialQueueSize - localQueue.length;
const progressPercent = initialQueueSize > 0
  ? Math.min(100, (cardsCompleted / initialQueueSize) * 100)
  : 0;
```

4. Contador de texto (linha 556):
```typescript
<span className="text-xs font-bold text-muted-foreground tabular-nums">
  {cardsCompleted}/{initialQueueSize}
</span>
```

### Arquivos modificados
- `src/services/studyService.ts` (filtro de fila + quick_review interval_days)
- `src/pages/Study.tsx` (calculo de progresso + contador)
