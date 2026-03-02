
# Corrigir carregamento infinito na visualizacao de decks grandes

## Problema identificado

Quando voce abre um deck com muitos subdecks (ex: 1000+ subdecks, 10k+ cards), o sistema faz **dezenas de requisicoes HTTP** sequenciais porque:

1. **`fetchAggregatedCardsMeta`**: Busca metadados de TODOS os cards enviando os 1000+ deck IDs em lotes de 300 -- isso gera 4+ rounds de requisicoes, cada um paginando 1000 rows por vez
2. **`fetchAggregatedStats`**: Faz a MESMA coisa -- busca todos os cards de novo so para contar estados (novo/aprendendo/dominado)
3. **`fetchAggregatedCardsPage`**: Tambem precisa lidar com 1000+ deck IDs para exibir apenas 200 cards

No Anki, tudo e instantaneo porque ele usa banco local. Aqui, cada operacao vira multiplas chamadas de rede.

## Solucao: 3 otimizacoes

### 1. Eliminar `fetchAggregatedStats` -- usar dados que ja existem

O `useDecks()` ja traz stats por deck (`new_count`, `learning_count`, `review_count`) via RPC `get_all_user_deck_stats`. Em vez de buscar todos os cards de novo, vamos **somar os stats dos decks descendentes** que ja estao em memoria.

- **Antes**: Query separada buscando todos os 10k+ cards para contar estados
- **Depois**: Soma simples de dados ja carregados (0 requisicoes)

### 2. Criar RPC `get_descendant_cards_page` no banco

Uma funcao SQL que usa CTE recursivo para encontrar todos os subdecks e retornar uma pagina de cards em **uma unica query**:

```text
get_descendant_cards_page(p_deck_id, p_limit, p_offset)
  -> WITH RECURSIVE descendant_decks AS (...)
     SELECT * FROM cards WHERE deck_id IN descendant_decks
     ORDER BY created_at DESC
     LIMIT p_limit OFFSET p_offset
```

- **Antes**: 4+ requisicoes HTTP com lotes de 300 IDs
- **Depois**: 1 unica query SQL

### 3. Criar RPC `count_descendant_cards_by_state` para contagem de metadados

Para os filtros (contagem por tipo e estado), criar uma funcao que retorna contagens agrupadas sem transferir dados de cards:

```text
count_descendant_cards_by_state(p_deck_id)
  -> Retorna: total, new_count, learning_count, review_count,
             basic_count, cloze_count, mc_count, occlusion_count, frozen_count
```

- **Antes**: Transfere 10k+ rows de metadados para o browser
- **Depois**: Retorna ~10 numeros em 1 query

## Arquivos que serao alterados

| Arquivo | Mudanca |
|---------|---------|
| **Migration SQL** | Criar 2 RPCs: `get_descendant_cards_page` e `count_descendant_cards_by_state` |
| `src/services/cardService.ts` | Adicionar funcoes que chamam os novos RPCs |
| `src/components/deck-detail/DeckDetailContext.tsx` | Usar stats dos `decks` em vez de query separada; usar novos RPCs para cards e contagens |
| `src/components/deck-detail/CardList.tsx` | Usar contagens do novo RPC em vez de iterar `cardsMeta` |

## Resultado esperado

- **Abertura do deck**: De 10-30 segundos para < 1 segundo
- **Requisicoes HTTP**: De 20-40 para 2-3
- **Dados transferidos**: De megabytes de metadata para kilobytes de contagens
