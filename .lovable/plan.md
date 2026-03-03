

## Plano: Refatorar generate-deck para usar Tool Calling com Structured Outputs

### Problema atual

O prompt está correto e completo, mas o GPT não respeita bem o formato JSON quando instruído via texto livre. O resultado: cards malformados, parsing frágil (4 níveis de fallback), distribuição ignorada, e clozes sem a sintaxe `{{c1::}}`.

### Solução: `response_format` com `json_schema` + `strict: true`

A OpenAI oferece **Structured Outputs** — quando você passa um JSON Schema com `strict: true` no `response_format`, o modelo é **forçado** a gerar output que corresponde exatamente ao schema. Isso elimina:
- Todo o parsing manual (linhas 306-381 de fallbacks)
- Cards com tipo errado
- JSON malformado/truncado
- Clozes sem sintaxe correta

### Alterações em `supabase/functions/generate-deck/index.ts`

**1. Usar `response_format` com JSON Schema em vez de pedir JSON no prompt**

```typescript
response_format: {
  type: "json_schema",
  json_schema: {
    name: "flashcards",
    strict: true,
    schema: {
      type: "object",
      properties: {
        cards: {
          type: "array",
          items: {
            type: "object",
            properties: {
              front: { type: "string" },
              back: { type: "string" },
              type: { type: "string", enum: ["basic", "cloze", "multiple_choice"] },
              options: { type: "array", items: { type: "string" } },
              correctIndex: { type: "number" }
            },
            required: ["front", "back", "type", "options", "correctIndex"],
            additionalProperties: false
          }
        }
      },
      required: ["cards"],
      additionalProperties: false
    }
  }
}
```

> Nota: com `strict: true`, todos os campos precisam estar em `required` (OpenAI exige). `options` e `correctIndex` serão `[]` e `0` para cards que não são MCQ — isso é esperado e tratado no pós-processamento.

**2. Limpar o prompt — remover instruções de formato JSON**

- Remover `getOutputExamples()` completamente
- Remover "Responda APENAS com o JSON" do system prompt
- Remover a linha "FORMATO DE SAÍDA" do user prompt
- O prompt fica 100% focado em **qualidade pedagógica** — o schema cuida do formato

**3. Eliminar todo o bloco de parsing frágil (linhas 306-381)**

Substituir por simplesmente:
```typescript
const aiData = await aiResponse.json();
const parsed = JSON.parse(aiData.choices[0].message.content);
let cards = parsed.cards;
```

Com structured outputs, o JSON é **garantido** válido. Zero fallbacks necessários.

**4. Aumentar `max_tokens` para 16384 → 32768**

GPT-4o suporta até 16k de output, mas GPT-4o-mini suporta até 16k também. Manter 16384 mas usar `max_completion_tokens` (o campo correto para a API da OpenAI) em vez de `max_tokens`.

**5. Prompt refinado — foco em qualidade, não em formato**

O system prompt permanece praticamente igual (já está excelente), com estas mudanças:
- Remover "Responda APENAS com o JSON solicitado" (desnecessário com structured outputs)
- Remover exemplos de JSON do user prompt (o schema já define a estrutura)
- Manter 100% das regras pedagógicas (SuperMemo, anti-padrões, método ativo, etc.)

### Resumo de impacto

- **1 arquivo editado**: `supabase/functions/generate-deck/index.ts`
- **~80 linhas removidas** (parsing frágil + exemplos de output)
- **~10 linhas adicionadas** (schema no request body)
- **Zero breaking changes** no frontend — o response continua com `{ cards: [...], usage: {...} }`
- Qualidade dos cards melhora drasticamente porque o modelo não precisa mais "decidir" o formato

