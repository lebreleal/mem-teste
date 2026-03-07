

# Corrigir importacao lenta/infinita de 28k+ cards

## Problema identificado

Ao importar 28.462 cards do Anki com subdecks, o sistema fica em "Salvando..." infinitamente. Dois problemas principais:

1. **Sem feedback de progresso**: O `pendingStore` e setado com `progress: { current: 0, total: X }` mas NUNCA e atualizado durante a importacao. O usuario ve "Salvando..." sem saber se esta funcionando ou travou.

2. **Payload muito grande por batch**: Cards do Anki frequentemente contem HTML pesado com imagens (base64 ou URLs). Um batch de 500 cards com imagens pode ter 10-50MB por requisicao, causando timeouts no Supabase (limite padrao de ~30s). Um unico timeout quebra toda a importacao porque o `throw error` para tudo.

3. **Erro silencioso sem retry**: Se uma requisicao HTTP falha no meio da importacao (timeout, rede), todo o processo falha sem tentar novamente. Diferente do Anki local que nao depende de rede.

## Solucao: 3 melhorias

### 1. Adicionar progresso em tempo real durante a importacao

Modificar `importDeckWithSubdecks` e `importDeck` no `deckService.ts` para aceitar um callback `onProgress(current, total)` que atualiza o pendingStore a cada batch inserido.

No `Dashboard.tsx`, passar o callback que atualiza o pendingStore:

```text
await importDeckWithSubdecks(
  userId, name, folderId, cards, subdecks, algo, revlog,
  (current, total) => pendingStore.updatePending(pendingId, { 
    progress: { current, total } 
  })
);
```

### 2. Reduzir batch size e adicionar retry para cards grandes

- Estimar o tamanho do payload antes de enviar: se a media de tamanho por card e > 5KB, reduzir o batch de 500 para 200 ou 100
- Adicionar retry com backoff exponencial (3 tentativas) em cada batch de cards, similar ao `withRetry` que ja existe no `cardService.ts`
- Isto evita que um timeout quebre toda a importacao

### 3. Continuar apos erros parciais em vez de abortar

Atualmente, um erro em qualquer batch faz `throw error` e para tudo. Para 28k cards, isto significa que se o batch #45 de 57 falhar, perde-se todo o progresso. Mudar para:
- Registrar erros parciais mas continuar com os proximos batches
- No final, informar quantos cards foram importados vs. quantos falharam
- Tentar re-inserir os falhados uma vez ao final

## Arquivos que serao alterados

| Arquivo | Mudanca |
|---------|---------|
| `src/services/deckService.ts` | Adicionar parametro `onProgress` callback nas funcoes `importDeck` e `importDeckWithSubdecks`; adicionar retry com backoff; batch size adaptativo; tolerancia a erros parciais |
| `src/pages/Dashboard.tsx` | Passar callback `onProgress` ao chamar importacao; mostrar progresso real no pendingStore |

## Resultado esperado

- Usuario ve progresso real: "Salvando... 5.200 / 28.462 cartoes"
- Importacao nao quebra por timeout em 1 batch -- faz retry automatico
- Se alguns cards falharem, os outros sao salvos normalmente
- Batch size adapta-se ao tamanho do conteudo (cards com imagens = batches menores)

