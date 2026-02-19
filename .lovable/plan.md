

## Problema

Ao arquivar um baralho dentro de uma pasta, ele fica "escondido" dentro dessa pasta. Se o usuario deletar a pasta, o `delete_folder_cascade` exclui permanentemente todos os baralhos da pasta -- incluindo os arquivados -- causando perda de dados.

## Solucao proposta

Alterar o comportamento do `delete_folder_cascade` para **desarquivar e mover para a raiz** os baralhos arquivados antes de deletar a pasta, em vez de excluir tudo cegamente. Alem disso, adicionar uma secao "Arquivados" visivel na raiz do Dashboard para que o usuario sempre encontre seus itens arquivados.

### Mudancas

### 1. Alterar a funcao SQL `delete_folder_cascade`

Antes de deletar os baralhos de uma pasta, mover os baralhos arquivados para a raiz (folder_id = NULL) em vez de excluir:

```sql
-- Dentro de delete_folder_cascade, ANTES de deletar os decks:
-- Mover baralhos arquivados para raiz em vez de excluir
UPDATE decks SET folder_id = NULL WHERE folder_id = p_folder_id AND is_archived = true;

-- Depois, continuar deletando apenas os NAO arquivados
FOR r IN SELECT id FROM decks WHERE folder_id = p_folder_id LOOP
  PERFORM delete_deck_cascade(r.id);
END LOOP;
```

A mesma logica se aplica a sub-pastas: pastas arquivadas dentro da pasta sendo deletada tambem devem ser movidas para a raiz.

### 2. Adicionar aviso visual ao deletar pasta com itens arquivados

No dialog de confirmacao de exclusao de pasta, informar o usuario caso a pasta contenha itens arquivados, explicando que eles serao movidos para a raiz.

### 3. Garantir visibilidade de arquivados na raiz

Verificar que o botao "Mostrar Arquivados" na raiz do Dashboard exibe corretamente os baralhos e pastas com `folder_id = NULL` e `is_archived = true` -- isso ja funciona pelo filtro atual (`folder_id === currentFolderId` onde `currentFolderId = null`).

---

### Secao tecnica

**Migracao SQL**: Atualizar a funcao `delete_folder_cascade` para preservar itens arquivados.

**Arquivos afetados**:
- Nova migracao SQL (alteracao da funcao `delete_folder_cascade`)
- `src/components/dashboard/DashboardDialogs.tsx` (aviso no dialog de exclusao, se necessario)

