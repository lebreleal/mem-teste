

# Previsao Realista de Tempo na Geracao de Cards

## Problema

A tela de loading atual mostra apenas "Lote X de Y" com fases animadas aleatorias. O usuario nao tem ideia de quanto tempo falta. As fases ("Extraindo conteudo...", "Analisando conceitos...") sao cosmeticas e nao refletem o estado real.

## Solucao: Timer baseado em velocidade real dos lotes

A unica metrica confiavel que temos e o **tempo real que cada lote leva para completar**. Ao medir isso, podemos calcular a media e extrapolar o tempo restante com precisao.

```text
Lote 1: 23s  |  Lote 2: 18s  |  Media: 20.5s
Faltam 3 lotes -> ~62s restantes -> "~1 min restante"
```

## Mudancas

### 1. Expandir GenProgress com dados de tempo (`types.ts`)

Adicionar campos ao tipo `GenProgress`:

- `startedAt`: timestamp do inicio da geracao
- `lastBatchMs`: duracao do ultimo lote (ms)
- `avgBatchMs`: media movel de todos os lotes completados

### 2. Medir tempo real dos lotes (`useAIDeckFlow.ts`)

No loop de geracao, registrar o tempo antes e depois de cada grupo de lotes paralelos:

- Antes do `Promise.allSettled` -> `Date.now()`
- Depois -> calcular duracao e atualizar media movel
- Passar esses dados via `setGenProgress`

### 3. Mostrar tempo restante estimado (`GenerationProgress.tsx`)

Substituir as fases cosmeticas por informacao real:

- **Barra de progresso**: mantida (baseada em lotes)
- **Texto principal**: fase real baseada no progresso (nao em timer aleatorio)
- **Tempo estimado**: "~X min restantes" ou "~Xs restantes" calculado como `(totalBatches - currentBatch) * avgBatchMs`
- **Tempo decorrido**: "Xa decorridos" como referencia

A logica de exibicao:
- Antes do primeiro lote completar: "Estimando tempo..."
- Apos primeiro lote: "~X min restantes" (baseado na media real)
- Ultimo lote: "Finalizando..."
- Formatar: acima de 60s mostra minutos, abaixo mostra segundos

### 4. Fases realistas em vez de aleatorias

As fases atuais ciclam por timer a cada 3s, sem relacao com o estado real. Mudar para fases baseadas no progresso:

- 0% -> "Iniciando geracao..."
- 1-30% -> "Processando conteudo..."
- 31-70% -> "Gerando flashcards..."
- 71-99% -> "Finalizando cartoes..."
- 100% -> "Concluido!"

## Secao Tecnica

**Arquivos modificados:**

1. `src/components/ai-deck/types.ts` -- adicionar campos de tempo ao GenProgress
2. `src/components/ai-deck/useAIDeckFlow.ts` -- medir tempo dos lotes e propagar via genProgress
3. `src/components/ai-deck/GenerationProgress.tsx` -- exibir tempo estimado e fases realistas

**Calculo de estimativa:**

```text
avgBatchMs = soma de duracoes / lotes completados
remainingMs = (total - current) * avgBatchMs
// Para grupos paralelos (3 lotes simultaneos):
// a duracao do grupo e o max dos 3 lotes, entao a media ja captura isso naturalmente
```

**Formato de exibicao:**

```text
remainingMs > 90000 -> "~X min restantes"
remainingMs > 10000 -> "~Xs restantes"  
remainingMs <= 10000 -> "Quase pronto..."
```

