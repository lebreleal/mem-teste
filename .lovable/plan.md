

# Otimizar Velocidade de Geracao + Corrigir Botao Reload

## Diagnostico: Por que esta lento?

Hoje, para um PDF de 49 paginas (~98k chars), o sistema faz:

```text
16 batches x 3 formatos = 48 chamadas de API (sequenciais por batch)
48 chamadas x ~15s cada = ~4-8 minutos
```

A separacao por formato (1 chamada por formato por batch) foi criada para "evitar alucinacoes", mas o prompt JA lida perfeitamente com multiplos formatos misturados -- ele tem instrucoes de distribuicao uniforme e exemplos para cada tipo.

## Solucao: 3 mudancas combinadas

### Mudanca 1 -- Remover separacao por formato (MAIOR IMPACTO)

Enviar TODOS os formatos em UMA unica chamada por batch, como era originalmente. O prompt ja tem instrucoes para distribuir uniformemente entre os formatos.

| Antes | Depois |
|-------|--------|
| 16 batches x 3 chamadas = 48 calls | 16 batches x 1 chamada = 16 calls |

Reducao de 66% no numero de chamadas, sem nenhuma perda de qualidade.

### Mudanca 2 -- Aumentar batch size (6k para 12k chars)

Moderado e seguro -- 12k chars e menos de 1% da janela de contexto do Gemini (1M tokens). Da MAIS contexto por chamada, o que MELHORA a qualidade.

| Antes | Depois |
|-------|--------|
| 16 batches | ~8 batches |

### Mudanca 3 -- Paralelizar batches (ate 3 simultaneos)

Executar 2-3 batches ao mesmo tempo usando pool de concorrencia.

| Antes | Depois |
|-------|--------|
| 8 batches sequenciais | 3 rodadas de 3 batches |

### Resultado final

```text
ANTES: 48 chamadas sequenciais = 4-8 min
DEPOIS: ~8 chamadas em 3 rodadas = 30s-1.5 min
```

Reducao de ~80% no tempo, SEM tocar no prompt.

## Prompt: Analise

O prompt atual esta muito bom. Pontos fortes:

- Instrucoes de fidelidade (EXCLUSIVIDADE, nao inventar)
- Autocontido (nunca referenciar figuras/anexos)
- Exemplos corretos e incorretos para cloze
- Distribuicao obrigatoria entre formatos
- Validacao de cloze no pos-processamento

NAO muda nada no prompt. Ele ja suporta multiplos formatos numa unica chamada.

## Botao Reload no Admin

O botao existe mas usa `variant="ghost"` que e praticamente invisivel. Trocar para `variant="outline"` com icone destacado.

## Arquivos a alterar

### 1. `src/components/ai-deck/useAIDeckFlow.ts`
- Remover loop de formatos -- enviar `cardFormats` completo em 1 chamada por batch
- Aumentar `MAX_CHARS` de 6000 para 12000
- Adicionar pool de concorrencia para processar ate 3 batches simultaneos
- Simplificar logica de progresso (total = numero de batches, nao batches x formatos)

### 2. `supabase/functions/generate-deck/index.ts`
- Aumentar trim de 10000 para 16000 caracteres (acompanhar batch maior)
- Aumentar `max_tokens` de 8192 para 12000 (resposta maior para mais cards)

### 3. `src/pages/AdminUsers.tsx`
- Trocar botao Reload de `variant="ghost"` para `variant="outline"`

## Detalhes tecnicos

### useAIDeckFlow.ts -- Nova logica simplificada

```typescript
const MAX_CHARS = 12000; // era 6000
const CONCURRENT_BATCHES = 3;

// Montar batches (igual, so muda o MAX_CHARS)
// ...

const totalBatches = textBatches.length;
setGenProgress({ current: 0, total: totalBatches, creditsUsed: 0 });

// Processar em grupos de 3 batches simultaneos
for (let i = 0; i < totalBatches; i += CONCURRENT_BATCHES) {
  const group = textBatches.slice(i, i + CONCURRENT_BATCHES);

  const groupPromises = group.map((batch, gi) => {
    const batchIdx = i + gi;
    const batchCost = batch.pageCount * getCost(CREDITS_PER_PAGE, isPremium);

    return aiService.generateDeckCards({
      textContent: batch.texts.join('\n\n'),
      cardCount: targetCardCount > 0
        ? Math.max(3, Math.ceil(targetCardCount / totalBatches))
        : 0,  // deixar a IA decidir (melhor qualidade)
      detailLevel,
      cardFormats,  // TODOS os formatos de uma vez
      customInstructions: customInstructions.trim() || undefined,
      aiModel: model,
      energyCost: batchCost,
      skipLog: true,
    });
  });

  const results = await Promise.allSettled(groupPromises);
  // coletar cards e usage de cada resultado...

  // Atualizar progresso
  setGenProgress(prev => ({
    current: Math.min(i + CONCURRENT_BATCHES, totalBatches),
    total: totalBatches,
    creditsUsed: totalEnergyCost,
  }));
}
```

### generate-deck/index.ts -- Limites maiores

```typescript
const trimmedContent = textContent.slice(0, 16000); // era 10000
// ...
max_tokens: 12000  // era 8192
```

### AdminUsers.tsx -- Botao visivel

```typescript
<Button variant="outline" size="sm" ...>
  <RefreshCw className="w-4 h-4 mr-1" />
  Atualizar
</Button>
```

## Por que NAO perde qualidade?

1. O prompt ja foi desenhado para multiplos formatos -- tem instrucoes de distribuicao e exemplos
2. Mais texto por batch = MAIS contexto = menos alucinacao (a IA entende melhor o tema)
3. 12k chars e trivial para o Gemini (janela de 1M tokens)
4. A validacao de cloze no pos-processamento continua intacta
5. O retry automatico para 503 ja esta implementado

