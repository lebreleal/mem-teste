

# Refatoracao Total da Geracao de Flashcards por IA

## Diagnostico: Problemas Reais Encontrados

Analisei todo o pipeline de ponta a ponta. Estes sao os problemas concretos que afetam a qualidade:

### Problema 1: Batching por caracteres ignora fronteiras semanticas
O `splitTextIntoPages()` divide o texto em chunks de 2000 chars por paragrafo, e o `useAIDeckFlow` reagrupa em lotes de 12.000 chars. Isso pode cortar um conceito no meio -- a IA recebe um pedaco de uma explicacao num lote e o resto no proximo, gerando cards fragmentados.

### Problema 2: Distribuicao forcada de formatos (intercalacao rigida)
A regra atual exige distribuicao IGUAL entre formatos (basico, cloze, multipla escolha). Isso forca a IA a gerar ~33% de multipla escolha, quando o ideal pedagogico (conforme as 20 regras do SuperMemo) e que multipla escolha represente no maximo 20%. Cloze deveria dominar (50-60%) por ser o formato com maior poder mnemonico.

### Problema 3: DensityFactor generico demais
O calculo `batchText.length / densityFactor` e uma heuristica bruta. Para textos densos (ex: embriologia), gera poucos cards. Para textos redundantes, gera cards repetitivos.

### Problema 4: Sem deduplicacao entre lotes
Cada lote e independente. Se um conceito aparece em dois lotes (fronteira), a IA pode gerar cards duplicados.

### Problema 5: Ordem de contexto insuficiente
O prefixo `[CONTEXTO: trecho X de Y]` nao da informacao sobre o que veio antes, impedindo a IA de criar conexoes entre conceitos de lotes diferentes.

---

## Plano de Implementacao (5 blocos)

### Bloco 1: Distribuicao Realista de Formatos

**Arquivo:** `supabase/functions/generate-deck/index.ts`

Mudar a regra de intercalacao de "distribuicao IGUAL" para uma distribuicao pedagogica baseada nas 20 regras do SuperMemo:
- **Cloze: 50%** -- maior poder mnemonico, testa terminologia e fatos criticos
- **Basic (frente/verso): 30%** -- testa raciocinio, mecanismos, causa-efeito
- **Multipla escolha: 20%** -- testa diferenciacao de conceitos semelhantes

Alterar a secao de intercalacao em `getFormatInstructions()` para substituir "distribuicao IGUAL" por estas proporcoes. Quando o usuario selecionar apenas 2 formatos, ajustar proporcionalmente (ex: 60/40 cloze/basic).

### Bloco 2: Batching Semantico com Sobreposicao

**Arquivo:** `src/components/ai-deck/useAIDeckFlow.ts`

Substituir o batching por contagem de caracteres puro por um batching que respeita fronteiras de paragrafo com sobreposicao:

1. Manter `MAX_CHARS = 12000` como limite do lote
2. Adicionar **sobreposicao de contexto**: os ultimos 500 chars do lote anterior sao incluidos como prefixo `[CONTEXTO ANTERIOR: ...]` no lote seguinte, para que a IA saiba o que ja foi coberto
3. Nunca cortar no meio de um paragrafo -- se adicionar o proximo paragrafo excede o limite, fechar o lote atual e comecar um novo

Isso resolve o problema de fragmentacao semantica sem aumentar significativamente o custo (500 chars extras por lote e minimo).

### Bloco 3: Prompt Baseado nas 20 Regras do SuperMemo

**Arquivo:** `supabase/functions/generate-deck/index.ts`

Reestruturar o `DEFAULT_SYSTEM_PROMPT` para incorporar explicitamente os principios fundamentais do Dr. Piotr Wozniak:

```
PRINCIPIOS (baseados nas 20 Regras de Formulacao do Conhecimento):

1. COMPREENSAO PRIMEIRO: Nunca crie um card sobre algo que o material nao explica adequadamente.
2. MINIMO DE INFORMACAO: Cada card testa UMA unica memoria atomica. Respostas com mais de 1 frase sao proibidas para basic. Se precisar de mais, divida em cards separados.
3. CLOZE E REI: Cloze deletion e o formato mais poderoso para retencao. Use-o para fatos, termos, valores e nomes. Crie afirmacoes completas onde a lacuna e naturalmente dedutivel pelo contexto.
4. EVITE LISTAS: Nunca coloque uma lista como resposta. Se o material lista 5 itens, crie 5 cards separados.
5. REDUNDANCIA ESTRATEGICA: Para conceitos criticos, crie cards que testem o MESMO conceito de angulos diferentes (ex: "X causa Y" e "Y e causado por ___").
6. CONTEXTO MINIMO SUFICIENTE: A pergunta deve conter contexto suficiente para ter UMA unica resposta possivel, sem ambiguidade.
7. PERSONALIZACAO: Quando possivel, use exemplos praticos/clinicos em vez de definicoes abstratas.
```

### Bloco 4: Deduplicacao Pos-Geracao

**Arquivo:** `src/components/ai-deck/useAIDeckFlow.ts`

Adicionar uma etapa de deduplicacao apos coletar todos os cards de todos os lotes:

1. Normalizar o texto de cada card (lowercase, remover pontuacao, remover tags HTML)
2. Comparar similaridade entre cards usando uma heuristica simples: se o `front` de dois cards compartilha mais de 80% das palavras, marcar como duplicata
3. Manter apenas o card com resposta mais completa
4. Para cloze, comparar o texto base (sem as marcacoes `{{cX::}}`) -- se dois cloze tem o mesmo texto base e o mesmo indice, manter apenas um

Isso e feito no cliente, sem custo extra de IA.

### Bloco 5: DensityFactor Inteligente

**Arquivo:** `src/components/ai-deck/useAIDeckFlow.ts` e `supabase/functions/generate-deck/index.ts`

Ajustar o calculo de cards por lote:

**No frontend (useAIDeckFlow):**
- `comprehensive`: 120 chars/card (mais cards, cobertura total)
- `standard`: 250 chars/card
- `essential`: 600 chars/card

**No edge function:**
- Quando `cardCount = 0` (automatico), remover o `requestedCount` do prompt e deixar a instrucao ser o `detailLevel` puro, sem limite numerico. Isso libera a IA para gerar quantos cards forem necessarios.
- Quando `cardCount > 0`, manter o limite explicito mas aumentar o teto de 50 para 80 cards por chamada (para comprehensive em lotes grandes).

---

## Resumo das Mudancas

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/generate-deck/index.ts` | Novo system prompt (SuperMemo), distribuicao 50/30/20, teto de cards ajustado |
| `src/components/ai-deck/useAIDeckFlow.ts` | Batching semantico com sobreposicao, deduplicacao pos-geracao, densityFactor refinado |

## O que NAO muda

| Item | Motivo |
|------|--------|
| Schema JSON (front/back/type/options/correctIndex) | Compatibilidade com todo o frontend e DB |
| Processamento paralelo (3 lotes simultaneos) | Performance ja otimizada |
| Validacao cloze + mapCardType | Safety net essencial |
| Background generation (usePendingDecks) | Funciona corretamente |
| Expansao de cloze em rows no saveCardsToDeck | Logica de DB correta |
| ConfigStep.tsx, tipos, services | Nenhuma mudanca necessaria na UI |

