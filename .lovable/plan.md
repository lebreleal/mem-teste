

## Plan: Remover gambiarras e corrigir imports quebrados de forma limpa

### Diagnóstico

O código atual tem duas categorias de problemas:

1. **Gambiarras de auto-reload** adicionadas em `App.tsx`, `main.tsx` e `errorLogger.ts` — lógica de `sessionStorage`, limpeza de caches, e reload automático que mascara erros ao invés de corrigí-los.

2. **Código morto que referencia tabelas deletadas** — funções `countDeckQuestionsRecursive` e `fetchQuestionCountsByDeck` em `deckCrud.ts` que acessam `deck_questions` sem nenhum consumidor real (nenhum import encontrado fora do próprio arquivo).

### Mudanças

#### 1. Remover gambiarra de auto-reload (3 arquivos)

**`src/App.tsx`** — Remover a função `lazyRetry` e voltar ao `lazy()` padrão do React. O try/catch com sessionStorage e reload forçado será removido.

**`src/main.tsx`** — Remover a função `cleanupStaleModuleCaches()` inteira e sua chamada. Manter apenas `setupGlobalErrorHandlers()` e o render.

**`src/lib/errorLogger.ts`** — Remover as funções `isStaleModuleError()` e `recoverFromStaleModuleError()`. Remover as chamadas a elas dentro de `setupGlobalErrorHandlers`. Manter apenas o logging puro (envio para `app_error_logs`).

#### 2. Remover código morto sem consumidores (1 arquivo)

**`src/services/deck/deckCrud.ts`** — Remover `collectDeckHierarchyIds`, `countDeckQuestionsRecursive` e `fetchQuestionCountsByDeck` (linhas ~394-456). Nenhum outro arquivo importa essas funções.

### Resultado

- Zero gambiarras de auto-reload
- Zero funções órfãs
- O `errorLogger` continua registrando erros no Supabase normalmente
- O `GlobalErrorBoundary` continua protegendo contra tela branca

