

## Problemas identificados e plano

### Bug 1: 404 ao criar deck com IA

**Causa raiz**: Em `useAIDeckFlow.ts`, linhas 104, 481, e 526, o navigate usa:
```ts
navigate(`/manage/${targetDeckId}`)
```
Mas a rota real em `App.tsx` (linha 99) é:
```ts
/decks/:deckId/manage
```

**Correção**: Trocar todas as 3 ocorrencias de `navigate('/manage/...')` para `navigate('/decks/${targetDeckId}/manage')`.

---

### Feature 2: Adicionar cartão abaixo do selecionado (apenas manual)

**Situacao atual**: `handleAddCard` cria um card vazio com `created_at = now()`. O card vai para o final da lista (sorted by `created_at ASC`). No estudo, novos cards (state=0) entram na fila ordenados por `created_at ASC` (query na linha 213 de studyService.ts).

**O que o usuario quer**: Ao clicar "+", o novo card deve aparecer logo abaixo do card selecionado, e na sessao de estudo deve manter essa posicao visual.

**Abordagem**: Adicionar um campo `sort_order` na tabela `cards` (default null). Cards com `sort_order` definido sao ordenados por ele; cards sem `sort_order` usam `created_at` como fallback. Ao inserir abaixo do card selecionado, calcular o `sort_order` entre o card atual e o proximo.

**Porém**, isso tem implicacoes significativas. Vou propor algo mais simples:

**Abordagem simplificada** (sem migration): Manipular o `created_at` do novo card para ficar entre o card selecionado e o proximo card na lista. Ex: se card 2 tem `created_at = T` e card 3 tem `created_at = T+1ms`, o novo card recebe `created_at = T + 0.5ms`. Isso garante a posicao visual e de estudo sem alterar schema.

**Implementacao**:

1. Em `ManageDeck.tsx` — `handleAddCard`:
   - Pegar o `created_at` do `sortedCards[selectedIndex]` e do `sortedCards[selectedIndex + 1]`
   - Calcular timestamp intermediario
   - Passar ao `createCard` com `created_at` explicito

2. Em `cardMutations.ts` — `createCard`:
   - Aceitar campo opcional `created_at` no input

3. No estudo nada muda — a query já ordena por `created_at ASC`, entao o card fica na posicao correta automaticamente.

---

### Simulacao de impacto no FSRS e estudo

**Cenario atual** (sem mudanca):
```text
Cards no deck: 1(T1), 2(T2), 3(T3), ..., 52(T52)
Daily new limit: 2
Dia 1: estuda card 1, 2
Dia 2: estuda card 3, 4
...
```

**Cenario com inserção no meio** (card 57 inserido abaixo do card 3):
```text
Cards: 1(T1), 2(T2), 3(T3), 57(T3.5), 4(T4), ..., 52(T52)
Dia 1: estuda 1, 2
Dia 2: estuda 3, 57  ← 57 entra na posicao visual correta
Dia 3: estuda 4, 5
```

**Impacto no FSRS**: Zero. O FSRS so processa cards quando eles sao revisados pela primeira vez. Um card novo (state=0) nao tem stability/difficulty. A posicao na fila so afeta **quando** ele sera visto pela primeira vez, nao **como** ele sera agendado.

**Impacto nos limites diarios**: Nenhum. O `get_study_queue_limits` conta cards revisados hoje, nao posicao. Inserir um card no meio nao altera contagem.

**Impacto no cenario descrito pelo usuario**:
```text
Dia 0: 52 cards existem (1-52)
Dia 0: crio cards 53-56 no final
Dia 0: insiro card 57 abaixo do card 3 → created_at entre 3 e 4
Fila: 1, 2, 3, 57, 4, 5, ..., 52, 53, 54, 55, 56
Com limit=2/dia:
  Dia 1: 1, 2
  Dia 2: 3, 57  ← correto! 57 entra na ordem visual
  Dia 3: 4, 5
  ...
  Dia 27: 53, 54
  Dia 28: 55, 56
```

Sem a mudanca, o card 57 iria para o final (depois do 56), e so seria estudado no dia 29.

---

### Resumo das mudancas

| Arquivo | Mudanca |
|---|---|
| `useAIDeckFlow.ts` | Fix 3x `navigate('/manage/...')` → `navigate('/decks/.../manage')` |
| `ManageDeck.tsx` | `handleAddCard` calcula `created_at` intermediario entre card selecionado e proximo |
| `cardMutations.ts` | `createCard` aceita `created_at` opcional |

Nenhuma migration necessaria. Nenhuma mudanca no FSRS ou study queue.

