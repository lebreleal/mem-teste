

## Ajustes no "Meu Plano" sem objetivos

### Problema 1: Mensagem do diálogo enganosa
O diálogo "Alterar limite de novos cards?" diz que cotas serao redistribuidas entre objetivos, mas sem objetivos nao ha redistribuicao.

**Solucao:** Condicionar a mensagem do `AlertDialog` (linhas 1540-1546 de `StudyPlan.tsx`):
- Com objetivos: manter mensagem atual sobre redistribuicao
- Sem objetivos: mostrar mensagem como "Este limite sera usado como referencia na simulacao e quando voce criar um objetivo. No modo manual, cada baralho usa seu proprio limite nas configuracoes."

### Problema 2: Slider de novos cards/dia sem efeito pratico
No modo manual (sem planos), o limite global e ignorado pela fila de estudo (`fetchStudyQueue` so aplica globalLimit quando `hasPlanActive = true`). Alterar o slider da uma falsa impressao de controle.

**Solucao:** Manter o slider visivel (ele afeta a simulacao e sera usado quando criar objetivos), mas adicionar uma nota informativa abaixo do slider quando `plans.length === 0`:
- Texto: "Sem objetivos ativos, cada baralho usa seu proprio limite individual. Crie um objetivo para que este limite global seja aplicado."
- Estilo: `text-[10px] text-amber-600 dark:text-amber-400` com icone de info

### Problema 3: Simulacao inclui decks arquivados
A query `deck-hierarchy` nao filtra decks arquivados (`is_archived`), fazendo com que a simulacao considere cards de decks que o usuario ja arquivou.

**Solucao em `src/hooks/useStudyPlan.ts`** (linhas 156-161): adicionar filtro `.eq('is_archived', false)` (ou equivalente) na query de `deckHierarchyQuery`. Verificar se o campo existe na tabela.

### Problema 4: Badges de alocacao por objetivo
As badges (linhas 1506-1518) ja sao condicionais a `plans.map(...)`, entao nao aparecem sem objetivos. Nenhuma mudanca necessaria aqui.

---

### Detalhes tecnicos

**Arquivo: `src/pages/StudyPlan.tsx`**

1. Linhas 1540-1546 - Condicionar mensagem do AlertDialog:
```typescript
<AlertDialogDescription className="space-y-2">
  <span className="block">
    Voce esta alterando de <strong>{globalCapacity.dailyNewCardsLimit}</strong> para <strong>{tempNewCards}</strong> novos cards por dia.
  </span>
  {plans.length > 0 ? (
    <span className="block text-amber-600 dark:text-amber-400">
      As cotas diarias de novos cards serao recalculadas e redistribuidas entre seus objetivos. O progresso de cards ja estudados hoje nao e afetado.
    </span>
  ) : (
    <span className="block text-muted-foreground">
      Este valor sera usado como referencia na simulacao. Sem objetivos ativos, cada baralho usa seu proprio limite individual.
    </span>
  )}
</AlertDialogDescription>
```

2. Linhas 1419-1421 - Adicionar nota informativa abaixo da descricao do slider quando sem objetivos:
```typescript
<p className="text-[10px] text-muted-foreground leading-relaxed">
  Cards que voce nunca estudou. {plans.length > 0
    ? 'O sistema distribui entre seus objetivos proporcionalmente.'
    : 'Crie um objetivo para que este limite global seja aplicado na fila de estudo.'}
</p>
```

**Arquivo: `src/hooks/useStudyPlan.ts`**

3. Linhas 156-161 - Filtrar decks arquivados na query de hierarquia. Precisamos verificar se o campo existe, mas assumindo que `is_archived` e um campo booleano na tabela `decks`:
```typescript
const { data } = await supabase
  .from('decks')
  .select('id, parent_deck_id')
  .eq('user_id', userId!)
  .or('is_archived.is.null,is_archived.eq.false');
```
Se o campo nao existir, usaremos o filtro equivalente disponivel (como excluir decks em pasta "Arquivo").

### Arquivos modificados
- `src/pages/StudyPlan.tsx` (mensagens condicionais)
- `src/hooks/useStudyPlan.ts` (filtro de arquivados na hierarquia)
