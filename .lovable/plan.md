

## Reduzir consumo do AI Tutor mantendo qualidade

### Problema raiz

O `max_tokens` esta fixo em **8000** para todas as acoes do tutor (hint, explain, explain-mc). Isso causa:

1. O modelo Gemini tende a preencher o espaco disponivel, gerando respostas enormes
2. O log estima completion como `8000 * 0.7 = 5600 tokens` por chamada, inflando metricas
3. O prompt pede "seja completo" sem impor limite de tamanho

### Solucao

Ajustar `max_tokens` por tipo de acao e adicionar instrucao de concisao nos prompts.

| Acao | max_tokens atual | max_tokens novo | Motivo |
|------|-----------------|-----------------|--------|
| hint (padrao) | 8000 | 800 | Sao 3 frases curtas |
| explain | 8000 | 3000 | Explicacao estruturada mas focada |
| explain-mc | 8000 | 2500 | Menos alternativas = menos texto |

### Mudancas no prompt

Adicionar ao final de cada prompt de explain/explain-mc uma instrucao de concisao:

- **explain**: "Seja objetivo. Limite a explicacao a no maximo 400 palavras no total."
- **explain-mc**: "Seja direto. Limite cada explicacao de alternativa a 1-2 frases. Total maximo: 350 palavras."
- **hint**: ja tem "Keep it under 3 sentences" - ok

### Estimativa de log mais realista

Mudar a formula de estimativa de `maxTokens * 0.7` para `maxTokens * 0.5`, que reflete melhor o uso real (o modelo raramente usa 70% do limite).

### Detalhes tecnicos

**Arquivo: `supabase/functions/ai-tutor/index.ts`**

1. **Linhas 43-57** - Ajustar `maxTokens` por acao:
   - Default (hint): `maxTokens = 800`
   - `explain`: `maxTokens = 3000`
   - `explain-mc`: `maxTokens = 2500`

2. **Linhas 46-50** - Adicionar instrucao de limite de palavras nos prompts de explain e explain-mc

3. **Linha 72** - Mudar fator de estimativa de `0.7` para `0.5`

### Impacto esperado

- Reducao de **60-75%** no consumo de tokens por chamada
- Respostas mais focadas e diretas (melhor UX, menos scroll)
- Metricas de custo mais precisas nos logs
- Qualidade mantida: as secoes obrigatorias (Referencia, Explicacao, Conexao) continuam no prompt, so limitamos a verbosidade

