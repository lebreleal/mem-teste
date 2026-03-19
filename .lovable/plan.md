

# Plano: Remover fallback Lovable Gateway + Eliminar gargalo `fetchAllCardIds`

## Situação Atual

### AI Gateway
- `GOOGLE_AI_KEY` **ja esta configurada** nos secrets do Supabase
- Porem `getAIConfig()` ainda tem fallback para `LOVABLE_API_KEY` / `ai.gateway.lovable.dev` (linhas 28-32 de `_shared/utils.ts`). No servidor proprio, se `GOOGLE_AI_KEY` estiver setada, funciona. Mas o fallback deve ser removido para evitar confusao.

### Performance — Por que esta lento

O **maior gargalo** é `fetchAllCardIds()` em `studyService.ts` (linhas 188-210). Essa funcao:
1. Divide todos os deckIds ativos em batches de 300
2. Para cada batch, pagina de 1000 em 1000 **sequencialmente** com `while (hasMore)`
3. So depois de terminar TODAS as paginas de TODOS os batches, continua para Round 3

Para um usuario com 50 decks e 5000 cards, isso pode gerar 5-10 round-trips sequenciais ao Supabase. Cada round-trip custa ~100-300ms = **1-3 segundos so nessa etapa**.

Alem disso, `fetchAllCardIds` busca IDs de **todos os decks ativos do usuario** (nao so os que vai estudar), porque precisa calcular limites globais. Isso e necessario, mas deve ser feito no servidor, nao com paginacao no cliente.

## Mudancas

### 1. Remover fallback do Lovable Gateway
**Arquivo: `supabase/functions/_shared/utils.ts`**
- `getAIConfig()`: usar apenas `GOOGLE_AI_KEY`, sem fallback. Se nao existir, lançar erro claro.
- `getModelMap()`: remover logica de prefixo condicional, usar nomes diretos sempre.

### 2. Criar RPC `get_all_card_ids_for_user` (Migration SQL)
```sql
CREATE OR REPLACE FUNCTION public.get_all_card_ids_for_user(p_user_id uuid)
RETURNS TABLE(id uuid, deck_id uuid) 
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.deck_id
  FROM cards c
  INNER JOIN decks d ON d.id = c.deck_id
  WHERE d.user_id = p_user_id
    AND d.is_archived = false;
$$;
```
Uma unica query no servidor, sem paginacao, sem batches. Retorna todos os `(id, deck_id)` de uma vez.

### 3. Substituir `fetchAllCardIds` pela RPC
**Arquivo: `src/services/studyService.ts`**
- Remover a funcao `fetchAllCardIds` inteira (linhas 188-210)
- No `Promise.all` do Round 2, trocar `fetchAllCardIds()` por:
  ```ts
  supabase.rpc('get_all_card_ids_for_user', { p_user_id: userId })
  ```
- Ajustar o resultado para usar `rpcResult.data ?? []`

### 4. Atualizar tipos no Supabase types
- O arquivo `src/integrations/supabase/types.ts` sera atualizado automaticamente apos a migration.

## Arquivos afetados

| Arquivo | Mudanca |
|---|---|
| `supabase/functions/_shared/utils.ts` | Remover fallback Lovable, so Google direto |
| Migration SQL | Criar RPC `get_all_card_ids_for_user` |
| `src/services/studyService.ts` | Trocar `fetchAllCardIds()` por chamada RPC |

## Impacto esperado
- **AI**: funciona exclusivamente com `GOOGLE_AI_KEY`, sem dependencia do Lovable
- **Performance**: eliminacao de 5-10 round-trips sequenciais → 1 unica chamada RPC. Estimativa de melhoria: **1-3 segundos mais rapido** no inicio da sessao de estudo

