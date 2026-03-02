

# Correcao: Erro ao Gerar Deck com IA (Mensagem Enganosa)

## Problema
Quando o texto e dividido em 12 paginas, as chamadas em lote para a API do Google AI falham por rate limit (HTTP 429). O codigo atual nao diferencia esse erro de "conteudo insuficiente", mostrando a mensagem errada ao usuario.

## Causa Raiz
No `useAIDeckFlow.ts`, o `Promise.allSettled` captura os erros silenciosamente (apenas `console.error`). Quando TODOS os lotes falham, `allCards` fica vazio e o codigo cai no toast generico "O conteudo pode ser insuficiente".

## Solucao

### Arquivo: `src/components/ai-deck/useAIDeckFlow.ts`

**1. Rastrear falhas nos lotes** -- Adicionar contadores `failedCount` e `lastErrorMsg` no loop de geracao (apos `Promise.allSettled`, linhas ~355-369):

```typescript
let failedCount = 0;
let lastErrorMsg = '';

for (const result of results) {
  if (result.status === 'fulfilled') {
    allCards.push(...result.value.cards);
    // ... tracking existente
  } else {
    failedCount++;
    const msg = result.reason?.message || '';
    if (msg) lastErrorMsg = msg;
    console.error('Batch call failed:', result.reason);
  }
}
```

**2. Diferenciar mensagens de erro** -- Nos dois pontos onde verificamos `dedupedCards.length === 0` (linhas ~393-415), substituir a mensagem generica:

```typescript
// Logica para ambos os caminhos (background e foreground)
if (dedupedCards.length === 0) {
  const allFailed = failedCount === totalBatches;
  const title = allFailed
    ? 'Erro ao gerar cartoes'
    : 'Nenhum cartao gerado';
  const description = allFailed
    ? (lastErrorMsg || 'Servico de IA indisponivel. Tente novamente em alguns segundos.')
    : 'O conteudo pode ser insuficiente.';

  toast({ title, description, variant: 'destructive' });
  // ... resto da logica existente (setStep('config') ou removePending)
}
```

**3. Mover declaracao das variaveis** -- `failedCount` e `lastErrorMsg` serao declaradas ANTES do loop principal de lotes (antes do `for` na linha ~313), para acumular erros de todos os grupos de lotes.

## Escopo
- Apenas 1 arquivo modificado: `useAIDeckFlow.ts`
- Sem alteracao de prompts ou edge functions
- A edge function `generate-deck` ja retorna mensagens claras para 429/503/502

