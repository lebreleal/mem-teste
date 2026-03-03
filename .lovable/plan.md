

## Plano: Substituir o Prompt por Versão Especializada em Medicina + Engenharia de Prompt Otimizada

### Análise do Estado Atual

O prompt atual (linhas 5-47) é **genérico** — fala de "SuperMemo" e "método ativo" mas não tem foco médico. A distribuição é 50/30/20 (cloze/basic/MCQ). O prompt do usuário é bom e mais adequado para medicina, mas tem problemas de engenharia:

1. **Distribuição 60/30/10** — MCQ a 10% é pouco; com Structured Outputs e `strict: true`, podemos ser mais agressivos
2. **Falta de exemplos concretos** no system prompt — o GPT precisa de few-shot para calibrar qualidade
3. **Instruções duplicadas** entre system e user prompt — confunde o modelo sobre prioridade

### Proposta: Fusão Inteligente

Mesclar o melhor do prompt atual (estrutura técnica, anti-padrões, regras de cloze) com o prompt médico do usuário (precisão terminológica, cobertura exaustiva, distratores plausíveis). O resultado é um prompt **unificado** que funciona para medicina E para qualquer área.

### Alterações em `supabase/functions/generate-deck/index.ts`

**1. Novo `DEFAULT_SYSTEM_PROMPT` — fusão otimizada**

Substituir linhas 5-47 por um prompt que:
- Mantém as 11 regras pedagógicas existentes (já validadas)
- Adiciona as 6 Diretrizes de Ouro do usuário como princípios de topo
- Remove redundâncias (anti-padrões listados 2x atualmente)
- Adiciona **few-shot examples** dentro do system prompt (3 exemplos concretos de cada tipo) — isso é o que mais impacta qualidade no GPT
- Reforça: "MEMORIZAÇÃO DE PRECISÃO" — termos técnicos, valores, classificações devem virar cloze
- Reforça: "COBERTURA EXAUSTIVA" — varredura linha por linha, cada detalhe vira card

**2. Ajuste de distribuição em `getFormatInstructions`**

Quando os 3 formatos estão ativos (linha 136-140):
- Cloze: ~60% (subiu de 50%) — "Rei" para memorização técnica
- Basic: ~30% (mantém) — mecanismos, causa-efeito
- MCQ: ~10% (desceu de 20%) — apenas nível residência, distratores plausíveis

**3. User prompt mais enxuto**

O user prompt (linhas 257-283) tem muita repetição do system prompt. Reduzir para:
- Contagem de cards + nível de detalhe
- Instruções customizadas do usuário
- Formatos permitidos + regras de campos
- Conteúdo-base
- Remover regras pedagógicas que já estão no system (o GPT prioriza system prompt)

**4. Few-shot examples no system prompt**

Adicionar 2-3 exemplos concretos de cada tipo de card direto no system prompt. Isso é a técnica de prompt engineering que mais impacta qualidade em modelos GPT:

```
EXEMPLO CLOZE IDEAL:
"A enzima responsável pela conversão de angiotensinogênio em angiotensina I é a {{c1::renina}}, secretada pelas células {{c2::justaglomerulares}} do rim."

EXEMPLO BASIC IDEAL:
Front: "Por que a aldosterona causa hipocalemia?"
Back: "Reabsorve Na+ e secreta K+ no túbulo coletor."

EXEMPLO MCQ IDEAL:
Front: "Qual caspase inicia a via extrínseca da apoptose?"
Options: ["Caspase-9", "Caspase-8", "Caspase-3", "Caspase-10"]
correctIndex: 1
```

### Resumo de impacto

- **1 arquivo editado**: `supabase/functions/generate-deck/index.ts`
- **~60 linhas alteradas** (system prompt + user prompt + distribuição)
- **Zero breaking changes** — schema e response format inalterados
- **Qualidade esperada**: cards muito mais precisos tecnicamente, com cobertura exaustiva e distribuição correta

