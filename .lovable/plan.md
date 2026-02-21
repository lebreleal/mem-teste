
# Corrigir Slider de Cards Novos e Refletir Globalmente

## Problemas Identificados

1. **Slider nao funciona visualmente**: Usa `onValueCommit` sem estado local, entao ao arrastar nada muda na tela ate soltar
2. **Limite global nao reflete no estudo**: No `fetchStudyQueue`, o limite por deck (`daily_new_limit = 15`) ainda limita o resultado com `Math.min(newLimit, planNewLimit)` -- ou seja, se o deck tem 15 e o plano aloca 20, o deck fica em 15
3. **Falta feedback**: O usuario muda o slider mas nao entende o impacto

## Solucao

### 1. Corrigir Slider (visual + funcional)

**Arquivo:** `src/pages/StudyPlan.tsx`

- Adicionar estado local `tempNewCards` para controlar o slider durante o drag
- Usar `onValueChange` para atualizar visualmente em tempo real
- Usar `onValueCommit` para persistir no banco

### 2. Limite global governa quando ha plano ativo

**Arquivo:** `src/services/studyService.ts`

Quando o deck pertence a um plano ativo, o `daily_new_limit` do deck e **ignorado** em favor da alocacao calculada pelo plano. A logica muda de:

```
effectiveNewLimit = Math.min(deckConfig.daily_new_limit, planAllocation)
```

Para:

```
effectiveNewLimit = planAllocation  // plano governa completamente
```

Isso garante que o slider global de 30 cards/dia realmente distribua 30 cards entre os decks, sem ser limitado pelos 15 ou 20 configurados manualmente em cada deck.

Para decks **fora** de qualquer plano, o `daily_new_limit` do deck continua funcionando normalmente.

### 3. Mostrar distribuicao clara na UI

**Arquivo:** `src/pages/StudyPlan.tsx`

Abaixo do slider, exibir a distribuicao resultante de forma mais clara:

```
Cards novos por dia: [====30====]

Distribuicao automatica:
  Anatomia (900 restantes, 30d) → 18/dia
  Fisiologia (100 restantes, 30d) → 3/dia
  Sem plano: usa limite do deck
```

### 4. Corrigir alocacao no hook (usar contagem real por deck)

**Arquivo:** `src/hooks/useStudyPlan.ts`

Atualmente a estimativa de cards novos por deck e imprecisa (divide totalNew igualmente). Buscar a contagem real de cards novos por deck usando uma query adicional agrupada por `deck_id`.

---

## Mudancas por arquivo

| Arquivo | Mudanca |
|---------|---------|
| `StudyPlan.tsx` | Estado local para slider + distribuicao visual melhorada |
| `studyService.ts` | Remover `Math.min(newLimit, planNewLimit)` -- plano governa quando ativo |
| `useStudyPlan.ts` | Buscar contagem real de novos por deck (nao estimar com divisao igual) |

## Fluxo apos mudancas

1. Usuario arrasta slider para 40 → ve "40" em tempo real
2. Solta o slider → persiste no banco
3. Distribuicao recalcula: Anatomia 36/dia, Fisiologia 4/dia
4. Na sessao de estudo, Anatomia recebe exatamente 36 cards novos (sem ser limitado pelo antigo "15" do deck)
5. Decks sem plano continuam usando seu limite manual
