
# Corrigir Precificacao de IA + Otimizar Velocidade do Gemini Pro

## Problema 1: Desconto Premium nao aplicado no Flash

A memoria do sistema diz que **Premium recebe 50% de desconto no Flash** (1 credito vs 2 por pagina), mas o codigo atual em `useAIModel.ts` nao considera o status Premium. O `costMultiplier` e fixo em 1 para Flash e 5 para Pro, independente do plano do usuario.

**Resultado:** Usuarios Premium pagam o mesmo que gratuitos pelo Flash -- o desconto prometido nao existe.

**Solucao:** Alterar `useAIModel.ts` para aceitar `isPremium` e aplicar o desconto:
- Flash: Premium paga 1 credito/pagina (multiplicador 0.5), Free paga 2 (multiplicador 1)
- Pro: 10 creditos/pagina para todos (multiplicador 5)

Atualizar `useAIDeckFlow.ts` para passar `isPremium` ao `getCost`.

## Problema 2: Gemini Pro muito lento (sequencial por formato)

Os logs mostram que cada chamada ao Gemini Pro leva 10-30 segundos. Com 3 formatos (QA, Cloze, MC) por batch, cada batch demora 30-90 segundos. Com multiplos batches, o tempo total facilmente passa de 3-5 minutos.

**Causa raiz:** As chamadas por formato sao feitas **sequencialmente** dentro de cada batch. O loop em `useAIDeckFlow.ts` espera cada formato terminar antes de iniciar o proximo.

**Solucao:** Paralelizar as chamadas por formato dentro de cada batch usando `Promise.all`. Isso reduz o tempo de cada batch de ~90s para ~30s (o tempo da chamada mais lenta).

## Problema 3: Botao "Segundo plano" demora 10s para aparecer

Em `GenerationProgress.tsx`, a condicao `elapsed >= 10` faz o botao de dismiss so aparecer apos 10 segundos. O usuario fica preso sem saber que pode sair.

**Solucao:** Remover a condicao de 10 segundos -- mostrar o botao imediatamente.

## Problema 4: Retry para erro 503 + mensagens diferenciadas

Implementar `fetchWithRetry()` centralizado em `_shared/utils.ts` e diferenciar erros 403/429/503 nos edge functions.

## Problema 5: Preambulo indesejado no ai-tutor

Adicionar system prompt anti-preambulo padrao no `ai-tutor`.

---

## Arquivos a alterar

### Frontend

1. **`src/hooks/useAIModel.ts`**
   - `getCost` passa a considerar `isPremium`
   - Flash Premium: multiplicador 0.5 (1 credito/pagina)
   - Flash Free: multiplicador 1 (2 creditos/pagina)
   - Pro: multiplicador 5 para todos

2. **`src/components/ai-deck/useAIDeckFlow.ts`**
   - Passar `isPremium` para `getCost`
   - Paralelizar chamadas por formato dentro de cada batch com `Promise.all`

3. **`src/components/ai-deck/GenerationProgress.tsx`**
   - Remover `elapsed >= 10` do botao de dismiss

4. **`src/components/AIModelSelector.tsx`**
   - Passar `isPremium` para exibir custo correto

5. **`src/components/ai-deck/ConfigStep.tsx`**
   - Garantir que o custo exibido reflete o desconto Premium

### Edge Functions

6. **`supabase/functions/_shared/utils.ts`**
   - Adicionar funcao `fetchWithRetry(url, options, maxRetries)` com retry para 503

7. **`supabase/functions/generate-deck/index.ts`**
   - Usar `fetchWithRetry` em vez de `fetch` direto
   - Diferenciar erros 403, 429, 503

8. **`supabase/functions/ai-tutor/index.ts`**
   - Usar `fetchWithRetry`
   - Adicionar system prompt padrao anti-preambulo
   - Diferenciar erros

9. **`supabase/functions/ai-chat/index.ts`**
   - Usar `fetchWithRetry`
   - Diferenciar erros

---

## Detalhes tecnicos

### getCost com Premium (useAIModel.ts)

```typescript
const getCost = useCallback((baseCost: number, isPremium = false) => {
  const multiplier = model === 'flash' && isPremium
    ? 0.5  // Premium: 1 credito/pagina
    : MODEL_CONFIG[model].costMultiplier;
  return Math.ceil(baseCost * multiplier);
}, [model]);
```

### Paralelizacao por formato (useAIDeckFlow.ts)

Dentro do loop de batches, ao inves de iterar sequencialmente pelos formatos:

```typescript
// ANTES: sequencial (lento)
for (const format of formats) {
  const result = await aiService.generateDeckCards({...});
}

// DEPOIS: paralelo (3x mais rapido)
const formatPromises = formats.map((format, f) => 
  aiService.generateDeckCards({
    ...commonParams,
    cardFormats: [format],
    energyCost: f === 0 ? batchCost : 0,
  })
);
const results = await Promise.allSettled(formatPromises);
```

### fetchWithRetry (_shared/utils.ts)

```typescript
export async function fetchWithRetry(
  url: string, options: RequestInit, maxRetries = 2
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);
    if (response.status !== 503 || attempt === maxRetries) return response;
    console.warn(`503 retry ${attempt+1}/${maxRetries}`);
    await new Promise(r => setTimeout(r, 2000));
  }
  return await fetch(url, options);
}
```

### System prompt anti-preambulo (ai-tutor)

```
Voce e um tutor educacional direto e objetivo.
PROIBIDO: saudacoes, elogios, preambulos, "Ola", "Otima pergunta", "Excelente iniciativa".
Va direto ao conteudo. Use Markdown para formatacao.
```

### Impacto esperado

- **Velocidade Pro**: Reducao de ~60-70% no tempo total (3 formatos em paralelo)
- **Custo Premium Flash**: Metade do preco (1 credito vs 2 por pagina)
- **UX**: Botao de segundo plano imediato, retry automatico para 503
- **Qualidade**: Sem preambulos no tutor
