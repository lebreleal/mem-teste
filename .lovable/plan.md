

# Auditoria: Salas Seguidas e Pontinho Vermelho

## Diagnóstico

### 1. Pontinho vermelho ("Atualização disponível")
A RPC `get_community_deck_updates` compara `synced_at` do deck local com `MAX(updated_at)` dos cards/deck do criador. O pontinho aparece quando o criador modificou algo depois do `synced_at` do seguidor.

**Bug encontrado:** Após o `syncFollowerDecks` copiar cards novos do criador, ele **nunca atualiza o `synced_at`** do deck local. Resultado: o pontinho vermelho fica pulsando **para sempre**, mesmo depois que a sincronização rodou com sucesso.

**Correção:** Ao final de `syncFollowerDecks`, atualizar `synced_at = now()` em todos os decks locais que foram processados (independente de ter copiado cards novos ou não), para que o pontinho desapareça.

### 2. Estatísticas e progresso da sala seguida
A lógica de `collectStudyStats` (já corrigida no commit anterior) aplica `daily_new_limit` uma vez por hierarquia (matéria). O gauge usa `salaDifficultyStats` que busca `state` e `difficulty` dos cards reais. Ambos estão corretos.

**Nenhum bug adicional encontrado** nas estatísticas de salas seguidas.

### 3. Sub-decks não sincronizados
O `syncFollowerDecks` filtra `source_turma_deck_id IS NOT NULL`, mas sub-decks espelhados herdam do parent e **não têm** `source_turma_deck_id`. Ou seja, se o criador adicionar cards em um sub-deck, eles **nunca são sincronizados** para o seguidor.

**Correção:** Expandir a lógica de sync para também percorrer sub-decks do deck espelhado, comparando com sub-decks do deck original via `parent_deck_id`.

---

## Plano de Implementação

### Arquivo: `src/services/followerBootstrap.ts`

**A. Atualizar `synced_at` após sync (linhas ~113-115)**
Após o loop de sync, fazer `UPDATE decks SET synced_at = now()` nos decks processados, para que o pontinho vermelho desapareça.

**B. Incluir sub-decks no sync incremental**
Após processar cada deck-raiz espelhado, buscar seus sub-decks locais e os sub-decks correspondentes do original, e sincronizar cards faltantes também nesses níveis.

---

## Resultado esperado
- Pontinho vermelho aparece apenas quando realmente há cards novos do criador ainda não sincronizados
- Após entrar na sala (que dispara o sync automático), o pontinho desaparece
- Sub-decks também recebem cards novos do criador

