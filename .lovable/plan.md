
# Corrigir Editor de Cloze no Estudo

## Problemas Identificados

### 1. Logica de edicao ignora cards irmaos (c1, c2)
Quando um texto cloze tem `{{c1::O2}}` e `{{c2::alveolos pulmonares}}`, o sistema cria **2 registros separados no banco** com o mesmo `front_content` mas `back_content` diferente (`{"clozeTarget":1}` e `{"clozeTarget":2}`).

O editor no estudo (`StudyCardActions`) faz `UPDATE` em **apenas 1 card** (o que esta sendo estudado), sem tocar nos irmaos. Se o usuario editar o texto frontal, os irmaos ficam dessincronizados.

A pagina de gerenciamento do deck (`DeckDetailContext`) ja tem toda a logica correta: encontra irmaos, atualiza todos, cria novos se adicionar cloze numbers, deleta se remover.

### 2. `back_content` nao e parseado corretamente
No `openEdit`, o `back_content` de um cloze e JSON (`{"clozeTarget":1,"extra":""}`) mas o editor coloca esse JSON inteiro no campo `back`, em vez de extrair apenas o `extra`.

### 3. Visual da caixa "Como usar" fora do padrao
A caixa de instrucoes de cloze no estudo (imagem 1) usa estilo cinza apagado. O padrao correto (imagem 2 - "Novo Card") usa borda amarela com icone de lapis e texto mais informativo.

## Solucao

Replicar a logica de edicao de cloze do `DeckDetailContext` no `StudyCardActions`, e alinhar o visual.

## Mudancas

### 1. `StudyCardActions.tsx` - Corrigir `openEdit` para parsear `back_content` do cloze

Quando `card_type === 'cloze'`, extrair `extra` do JSON em vez de usar o JSON inteiro:

```text
} else if (card.card_type === 'cloze') {
  setEditorType('cloze');
  try {
    const parsed = JSON.parse(card.back_content);
    if (typeof parsed.clozeTarget === 'number') {
      setBack(parsed.extra || '');
    } else {
      setBack(card.back_content);
    }
  } catch {
    setBack(card.back_content);
  }
}
```

### 2. `StudyCardActions.tsx` - Corrigir `handleSave` para cloze com logica de irmaos

O save precisa:
1. Buscar TODOS os cards cloze irmaos (mesmo `front_content` do card original)
2. Detectar cloze numbers no texto editado (c1, c2, etc.)
3. Atualizar irmaos existentes com o novo `front_content`
4. Criar novos cards se o usuario adicionou um cloze number
5. Deletar cards de cloze numbers removidos

Para isso, adicionar uma query para buscar os irmaos do card no `handleSave`. A logica sera identica a do `DeckDetailContext` (linhas 490-557).

### 3. `StudyCardActions.tsx` - Atualizar `onCardUpdated` apos edicao de cloze

Apos salvar irmaos, invalidar as queries de estudo e atualizar o card na fila local com o novo `front_content`.

### 4. `StudyCardActions.tsx` - Alinhar visual da caixa "Como usar Cloze"

Trocar o estilo cinza atual pelo padrao amarelo do "Novo Card":

```text
<div className="rounded-xl border border-warning/40 bg-warning/5 p-3 space-y-1.5">
  <p className="text-xs font-bold text-warning flex items-center gap-1.5">
    <Pencil className="h-3 w-3" /> Como usar Cloze
  </p>
  <p className="text-[11px] text-muted-foreground">
    Selecione o texto e clique para criar um <strong>cloze</strong>.
    Clozes com mesmo numero viram o <strong>mesmo card</strong>.
  </p>
  <p className="text-[11px] text-muted-foreground">
    Cria um cloze com <strong>numero novo</strong>, gerando um <strong>card separado</strong>.
  </p>
</div>
```

## Detalhes Tecnicos

### Busca de irmaos no estudo

O `StudyCardActions` nao tem acesso a lista completa de cards do deck (diferente do `DeckDetailContext`). Para encontrar irmaos, sera necessario fazer uma query direta ao Supabase:

```text
const { data: siblings } = await supabase
  .from('cards')
  .select('id, front_content, back_content, card_type')
  .eq('deck_id', card.deck_id)
  .eq('card_type', 'cloze')
  .eq('front_content', card.front_content);
```

### Fluxo do save para cloze

1. Extrair cloze numbers do `front` editado (`{{c1::...}}`, `{{c2::...}}`)
2. Buscar irmaos no banco
3. Mapear `clozeTarget` existente para card IDs
4. Comparar cloze numbers novos vs existentes
5. Atualizar todos os irmaos com o novo `front_content`
6. Criar cards para numbers novos
7. Deletar cards para numbers removidos
8. Invalidar queries e atualizar a fila local

### Impacto na fila de estudo

Ao salvar, se o `front_content` mudou, todos os irmaos (que podem estar na fila) precisam ser atualizados. O `onCardUpdated` ja atualiza o card atual na `localQueue`. Para irmaos que tambem estao na fila, sera necessario atualizar seus `front_content` tambem. Isso sera feito passando uma callback mais robusta ou invalidando a query de estudo.

## Arquivos Modificados

- `src/components/StudyCardActions.tsx` - Toda a logica de edicao e visual
