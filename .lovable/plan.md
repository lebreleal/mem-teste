

## Diagnóstico: Por que os custos estão errados

Analisei os dados do Google Cloud Billing que você forneceu e cruzei com os dados no banco `ai_token_usage`. Encontrei **3 problemas críticos**:

### Problema 1: Thinking tokens NÃO contabilizados no custo (causa principal)

O Gemini 2.5 gera "thinking tokens" (raciocínio interno) que são cobrados como output, mas nosso cálculo ignora:

```text
Exemplo real do banco (generate_deck, Pro):
  prompt_tokens:     4,387
  completion_tokens: 3,007  ← só contamos estes
  total_tokens:     15,134
  thinking_tokens:   7,740  ← = 15134 - 4387 - 3007 (IGNORADOS!)

Custo atual:   (3,007 / 1M) × $10 = $0.030
Custo REAL:   (10,747 / 1M) × $10 = $0.107  ← 3.6x maior

Exemplo (ai_tutor, Flash):
  prompt=582, completion=685, total=2150
  thinking = 883 tokens ignorados → 2.3x undercount
```

A fórmula correta para output é: `total_tokens - prompt_tokens` (inclui thinking + completion).

### Problema 2: Entradas fantasma com 0 tokens

No banco existem muitas entradas com `model=""` e `prompt_tokens=0, completion_tokens=0, total_tokens=0`:
- O `generate-deck` usa `skipLog: true` (servidor não loga), mas o cliente chama `logAggregatedTokenUsage` que insere no banco com dados vazios quando o modelo não foi capturado corretamente
- O `ai-chat` tem várias entradas com 0 tokens onde o `streamWithUsageCapture` não conseguiu capturar o usage

### Problema 3: Preços de Flash input possivelmente desatualizados

Seu billing do Google mostra Flash input a ~$0.30/M tokens (R$1.77/425K tokens), mas nosso sistema usa $0.15/M. O Google pode ter atualizado os preços do 2.5 Flash.

### Validação cruzada com seu relatório Google

| SKU Google | Tokens | Custo Google (BRL) | Nossa estimativa | Diferença |
|---|---|---|---|---|
| Pro input | 396K | R$2.92 | ✓ correto ($1.25/M) | OK |
| Pro output | 715K | R$42.23 | ❌ só contamos ~40% (sem thinking) | **2-4x baixo** |
| Flash output | 1.3M | R$19.20 | ❌ thinking ignorados | **2-3x baixo** |
| Flash input | 425K | R$0.75 | ❌ preço $0.15 vs real $0.30 | **2x baixo** |
| Flash Lite output | 150K | R$0.36 | ~OK | OK |

---

## Plano de Correção

### 1. Corrigir fórmula de custo (AdminUsageReport + AdminUsers)

Mudar `calcCostUSD` para usar `total_tokens - prompt_tokens` como tokens de output:

```typescript
const calcCostUSD = (model: string, promptTokens: number, completionTokens: number, totalTokens: number): number => {
  const pricing = MODEL_PRICING[model] ?? { input: 0.15, output: 0.60 };
  // total_tokens includes thinking tokens; real output = total - prompt
  const realOutputTokens = Math.max(totalTokens - promptTokens, completionTokens);
  return (promptTokens / 1_000_000) * pricing.input + (realOutputTokens / 1_000_000) * pricing.output;
};
```

### 2. Atualizar preços do Flash input

Baseado no billing real do Google:
- `gemini-2.5-flash` input: $0.15 → **$0.30/M** (matching Google billing)
- Manter output thinking rate at $3.50/M (mas agora contando thinking tokens corretamente, o rate efetivo de non-thinking $0.60 + thinking $3.50 será blended corretamente)

Reavaliando: como agora contamos ALL output tokens (thinking + regular), e eles têm preços diferentes ($0.60 non-thinking, $3.50 thinking), devemos usar um rate médio. Dos dados: Flash output total = $19.20 BRL / 1.3M tokens ≈ $2.50/M blended. Usaremos **$2.50/M** para Flash output.

Preços corrigidos:
```typescript
'gemini-2.5-flash':      { input: 0.30, output: 2.50 },
'gemini-2.5-flash-lite': { input: 0.10, output: 0.40 },
'gemini-2.5-pro':        { input: 1.25, output: 10.00 },
```

### 3. Eliminar entradas fantasma

- No `useAIDeckFlow.ts`: Não chamar `logAggregatedTokenUsage` (o servidor já loga com `skipLog: false` por default). Remover a chamada client-side duplicada.
- Na UI: Filtrar/destacar visualmente entradas com 0 tokens para facilitar limpeza.

### 4. Adicionar coluna "Thinking Tokens" na tabela

Exibir na tabela do relatório: Prompt | Completion | Thinking | Total, onde thinking = total - prompt - completion.

### Arquivos a editar:
- `src/pages/AdminUsageReport.tsx` — corrigir calcCostUSD, preços, adicionar coluna thinking
- `src/pages/AdminUsers.tsx` — mesmas correções de preço e fórmula
- `src/components/ai-deck/useAIDeckFlow.ts` — remover `logAggregatedTokenUsage` duplicado (servidor já loga individualmente por batch)

