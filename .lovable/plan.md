

# Correcoes no Algoritmo de Geracao de Flashcards por IA

## Problemas Identificados

1. **Modelo Pro nao funciona**: O hook `useAIModel` exige confirmacao via `ProModelConfirmDialog` ao selecionar Pro, mas o `AICreateDeckDialog` nunca renderiza esse dialog. O resultado: ao clicar em Pro, o estado `pendingPro` fica `true` mas ninguem confirma, entao o modelo permanece como Flash.

2. **Limite de 12.000 caracteres fixo**: A edge function `generate-deck` trunca o texto em `textContent.slice(0, 12000)` (linha 138). Se uma pagina ou batch tem mais de 12k chars, o conteudo e cortado silenciosamente, gerando cobertura incompleta.

3. **Cobertura "Abrangente" insuficiente**: A instrucao para o nivel "comprehensive" diz apenas "cobertura ampla e detalhada" mas nao garante 100% do conteudo. Alem disso, o batch de 6 paginas pode gerar conteudo demais para uma unica chamada, causando truncamento e alucinacoes.

4. **Sem splitting inteligente por caracteres**: Nao existe logica para dividir texto longo em multiplas requisicoes quando excede um limite seguro.

---

## Solucao

### 1. Corrigir o botao Pro no AICreateDeckDialog

**Arquivos**: `src/components/ai-deck/useAIDeckFlow.ts`, `src/components/AICreateDeckDialog.tsx`

- Expor `pendingPro`, `confirmPro`, `cancelPro` do hook `useAIDeckFlow`
- Renderizar `ProModelConfirmDialog` dentro do `AICreateDeckDialog`

### 2. Splitting inteligente por caracteres na geracao

**Arquivo**: `src/components/ai-deck/useAIDeckFlow.ts`

Atualmente: batches de 6 paginas fixo, sem considerar tamanho do texto.

Nova logica:
- Definir `MAX_CHARS_PER_REQUEST = 6000` (metade do limite seguro do modelo, para evitar alucinacoes)
- Em vez de agrupar por 6 paginas, agrupar por limite de caracteres
- Quando o texto acumulado de um batch ultrapassa `MAX_CHARS_PER_REQUEST`, iniciar um novo batch
- Isso garante que cada requisicao tenha tamanho controlado e a IA produza conteudo de qualidade

### 3. Ajustar cobertura por nivel de detalhe

**Arquivo**: `supabase/functions/generate-deck/index.ts`

Mudancas na funcao `getDetailInstruction`:
- **Essencial**: Manter como esta (conceitos fundamentais)
- **Padrao**: Instrucao mais forte para cobrir todos os topicos principais do material
- **Abrangente**: Instrucao explicita para cobrir 100% do conteudo, cada paragrafo, cada conceito, sem pular nada

Remover o truncamento fixo de 12.000 caracteres (ja que o splitting inteligente no frontend garante batches menores).

### 4. Ajustar quantidade de cards por nivel de detalhe

**Arquivo**: `src/components/ai-deck/useAIDeckFlow.ts`

Quando `targetCardCount === 0` (automatico):
- Calcular estimativa baseada no nivel de detalhe e tamanho do texto
- **Essencial**: ~1 card por 500 chars
- **Padrao**: ~1 card por 300 chars  
- **Abrangente**: ~1 card por 150 chars (garantir cobertura total)

---

## Detalhes Tecnicos

### Novo algoritmo de batching (useAIDeckFlow.ts)

```text
const MAX_CHARS = 6000;
const batches: string[][] = [[]]; // array de arrays de textos

let currentSize = 0;
for (const page of selectedPages) {
  const text = page.textContent.trim();
  if (currentSize + text.length > MAX_CHARS && batches[batches.length-1].length > 0) {
    batches.push([]);
    currentSize = 0;
  }
  batches[batches.length-1].push(text);
  currentSize += text.length;
}
```

Cada batch e enviado como uma requisicao separada. O numero de cards por batch e proporcional ao tamanho do texto naquele batch.

### Instrucoes de detalhe melhoradas (generate-deck/index.ts)

- **essential**: "Crie poucos cartoes focados nos 3-5 conceitos mais fundamentais. Priorize o que cairia numa prova."
- **standard**: "Crie cartoes cobrindo TODOS os topicos e conceitos presentes no material. Nao pule nenhum tema mencionado."
- **comprehensive**: "Crie cartoes para CADA conceito, definicao, mecanismo, exemplo e detalhe presente no material. A cobertura deve ser de 100% - o estudante deve conseguir dominar todo o conteudo apenas com os cartoes. Nao pule NADA."

### Edge function: remover truncamento fixo

Linha 138 atual: `const trimmedContent = textContent.slice(0, 12000);`

Nova logica: aceitar o texto completo do batch (que ja vem limitado pelo frontend a ~6000 chars). Manter um limite de seguranca de 10000 chars como fallback.

### ProModelConfirmDialog no AICreateDeckDialog

Adicionar no return do componente, apos todos os steps:
```text
<ProModelConfirmDialog 
  open={flow.pendingPro} 
  onConfirm={flow.confirmPro} 
  onCancel={flow.cancelPro}
  baseCost={CREDITS_PER_PAGE * flow.selectedPages.length} 
/>
```

---

## Ordem de Implementacao

1. Corrigir botao Pro (expor pendingPro/confirmPro do hook + renderizar dialog)
2. Novo algoritmo de batching por caracteres no useAIDeckFlow
3. Atualizar instrucoes de detalhe na edge function
4. Remover truncamento fixo de 12k na edge function
5. Deploy da edge function

