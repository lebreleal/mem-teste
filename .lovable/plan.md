
# Sistema de Publicacao Hierarquica de Decks

## Resumo

Quando um deck pai e publicado na comunidade, ele mostra os cards de toda a sua arvore de descendentes publicados. Cada nivel da hierarquia tambem pode ser acessado individualmente, mostrando apenas seus cards + descendentes publicados (sem incluir ancestrais). Os cards sao compartilhados por referencia (mesmo card_id), sem duplicacao.

## Modelo Visual

```text
Anatomia (pai, 0 cards proprios)
  └─ 25-02-26 (filho, 10 cards)
       └─ Sub-deck (neto, 5 cards)

Na comunidade:
  "Anatomia"  -> 15 cards (0+10+5, toda a arvore)
  "25-02-26"  -> 15 cards (10+5, sem o pai)
  "Sub-deck"  -> 5 cards (apenas seus proprios)
```

- Despublicar "25-02-26" remove seus 10 cards de "Anatomia" (mas o sub-deck de 25-02 continua se estiver ativo)
- Sugestoes sao por card_id, entao aparecem em qualquer publicacao que contenha aquele card

## Mudancas

### 1. Migracao SQL - campo `is_published` na tabela `turma_decks`

Adicionar coluna `is_published boolean NOT NULL DEFAULT true` a `turma_decks`. Isso permite controlar individualmente a visibilidade de cada deck na hierarquia sem deletar o registro.

### 2. `turmaService.ts` - fetchTurmaDecks com contagem agregada

Atualizar `fetchTurmaDecks` para:
- Buscar `is_published` junto com os outros campos
- Calcular `card_count` como agregado: cards do deck + cards de todos descendentes **publicados** (percorrendo a arvore via `parent_deck_id` nos decks e verificando `is_published` nos turma_decks)
- Retornar `is_published` no resultado

### 3. `turmaService.ts` - nova funcao `toggleDeckPublished`

Criar funcao para alternar `is_published` de um `turma_deck` individual. Isso permite que o admin despublique um filho sem remover da arvore.

### 4. `turmaService.ts` - shareDeck ja recursivo (manter)

O `shareDeck` ja insere pai + descendentes. Manter esse comportamento. Cada um entra com `is_published = true` por padrao.

### 5. `PublicDeckPreview` - carregar cards da sub-arvore publicada

Na query `public-deck-cards`, ao inves de buscar `cards WHERE deck_id = deckId`, buscar:
1. Todos os `turma_decks` da mesma turma
2. Filtrar descendentes publicados do deck atual (percorrer arvore de `parent_deck_id` onde `is_published = true`)
3. Buscar cards de todos esses deck_ids + o proprio deck

As sugestoes ja funcionam por `card_id`, entao aparecem naturalmente.

### 6. `ContentTab.tsx` - exibicao e controle de publicacao

- Mostrar `card_count` agregado (ja vira atualizado do fetchTurmaDecks)
- Para admins: adicionar toggle de olho (publicado/despublicado) no dropdown de cada deck
- Decks com `is_published = false` aparecem com opacidade reduzida + icone de olho fechado (apenas para admins)
- Membros comuns so veem decks publicados

### 7. `turma.ts` - tipo TurmaDeck

Adicionar `is_published?: boolean` ao tipo `TurmaDeck`.

### 8. `useTurmaHierarchy.ts` - mutation toggleDeckPublished

Adicionar mutation para chamar a nova funcao `toggleDeckPublished` e invalidar queries.

## Detalhes Tecnicos

### Algoritmo de contagem agregada (fetchTurmaDecks)

```text
Para cada turma_deck TD:
  1. Encontrar todos descendentes de TD.deck_id via parent_deck_id
  2. Filtrar apenas os que tem turma_deck com is_published = true
  3. Somar cards de TD.deck_id + descendentes publicados
  4. Retornar como card_count
```

### Algoritmo de carregamento de cards (PublicDeckPreview)

```text
1. Buscar turma_decks WHERE turma_id = X
2. Construir arvore de parent_deck_id
3. A partir do deck atual, coletar deck_ids da sub-arvore onde is_published = true
4. Buscar cards WHERE deck_id IN (deck_ids_da_subtree)
```

### Logica de despublicacao

Quando admin desativa `is_published` de um deck filho:
- O deck filho desaparece da view de membros
- Os cards desse filho sao removidos da contagem do pai
- Mas se o filho tem sub-decks publicados, esses sub-decks continuam aparecendo e seus cards continuam na contagem do pai (pois o caminho vai direto do avo pro neto)

Correcao: na verdade, se o pai direto esta despublicado, os netos tambem devem sumir do pai. A arvore e cortada no ponto despublicado. Ou seja, percorrer descendentes para somente enquanto `is_published = true` em cada nivel.
