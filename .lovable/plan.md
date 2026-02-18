

# Corrigir Geracao de Cloze e Equilibrar Distribuicao

## Problema Real

A IA recebe uma instrucao vaga ("distribua uniformemente") e ignora -- gera 78% basic porque e o formato mais facil. Alem disso, quando tenta gerar cloze, frequentemente gera perguntas sem a sintaxe `{{c1::...}}` porque a instrucao nao e suficientemente estruturada.

A solucao anterior (reclassificar cloze invalido para basic no servidor) so mascara o problema -- o usuario pediu cloze e recebe basic.

## Nova Abordagem: Geracoes Separadas por Formato

Em vez de pedir para a IA gerar todos os formatos de uma vez (e ela priorizar basic), fazer **uma chamada separada por formato**, cada uma com contagem exata e prompt especializado.

### Como funciona

1. O frontend calcula o total de cards para o batch (baseado em chars/densityFactor)
2. Divide o total igualmente entre os formatos selecionados (ex: 30 cards, 3 formatos = 10 cada)
3. Faz uma requisicao por formato, passando `cardFormats: ["cloze"]` com `cardCount: 10`
4. Concatena os resultados de todas as chamadas

### Vantagens

- A IA recebe instrucao de UM UNICO formato por chamada -- nao pode "fugir" para basic
- O prompt de cloze pode ser ultra-especializado sem confundir com instrucoes de basic
- Distribuicao exata garantida por design (nao depende da IA respeitar porcentagens)
- Se um formato falhar, os outros continuam funcionando

## Mudancas

### 1. Frontend: useAIDeckFlow.ts

Dentro do loop de batches, adicionar um loop interno por formato:

```text
Para cada batch de texto:
  Para cada formato selecionado (ex: qa, cloze, multiple_choice):
    batchCardCount = total_do_batch / num_formatos
    chamar generate-deck com cardFormats=[formato_unico] e cardCount=batchCardCount
    acumular cards
```

O progresso mostrara: "Requisicao X de Y" (batches * formatos).

### 2. Edge Function: generate-deck/index.ts

- Manter validacao de cloze como **rede de seguranca** (se mesmo com formato unico a IA gerar cloze invalido, reclassificar)
- Quando `formats.length === 1` e o formato e cloze, usar um prompt ainda mais enfatico com exemplos positivos e negativos
- Aumentar exemplos de output para cloze

### 3. Prompt de Cloze Especializado

Quando a chamada e exclusivamente para cloze, o prompt incluira:

- "TODOS os cartoes DEVEM ser do tipo cloze com a sintaxe {{c1::resposta}}"
- "CADA cartao e uma AFIRMACAO COMPLETA com uma ou mais lacunas"
- "NUNCA gere uma pergunta -- cloze e SEMPRE uma afirmacao declarativa"
- Multiplos exemplos corretos e incorretos
- "Se o front NAO contiver {{c1::, o cartao sera DESCARTADO automaticamente"

## Detalhes Tecnicos

### useAIDeckFlow.ts - Novo loop de geracao

O loop principal muda de:

```text
for batch in textBatches:
  chamar API com todos os formatos
```

Para:

```text
for batch in textBatches:
  for format in cardFormats:
    formatCardCount = ceil(batchCardCount / cardFormats.length)
    chamar API com cardFormats=[format], cardCount=formatCardCount
    acumular cards
```

Total de requisicoes = textBatches.length * cardFormats.length. O custo de energia e dividido proporcionalmente.

### generate-deck/index.ts - Validacao de seguranca

Apos o parse, manter a validacao de cloze:

```text
const CLOZE_REGEX = /\{\{c\d+::/;

// Para cards que deveriam ser cloze mas nao tem a sintaxe:
if (mappedType === "cloze" && !CLOZE_REGEX.test(c.front)) {
  // Converter para basic como fallback de seguranca
  return {
    front: c.front.replace(/[:\.]+$/, "?"),
    back: c.back || "Informacao nao fornecida",
    type: "basic"
  };
}
```

### Calculo de energia

O custo total nao muda -- continua sendo `selectedPages.length * CREDITS_PER_PAGE * modelMultiplier`. A divisao por formato dentro de cada batch distribui o custo proporcionalmente:

```text
batchCost = batch.pageCount * getCost(CREDITS_PER_PAGE)
costPerFormat = ceil(batchCost / cardFormats.length)
```

Para evitar cobrar a mais, deduzir energia apenas na primeira chamada do batch e passar `energyCost: 0` nas demais.

## Ordem de Implementacao

1. Alterar loop de geracao no `useAIDeckFlow.ts` (loop por formato dentro de cada batch)
2. Atualizar progresso para refletir total de requisicoes (batches * formatos)
3. Adicionar validacao de cloze como rede de seguranca no `generate-deck/index.ts`
4. Deploy da edge function

