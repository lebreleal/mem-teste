

# Plano Completo: Otimizacao do Prompt + Correcao do Split de Paginas + Marcadores

Este plano inclui TODAS as melhorias pendentes: as 6 mudancas no prompt do generate-deck E as 2 correcoes no frontend.

---

## Parte 1: Corrigir `splitTextIntoPages` (texto do Word vira 1 pagina so)

**Arquivo:** `src/lib/pdfUtils.ts` (funcao `splitTextIntoPages`, linhas 55-73)

**Problema:** A funcao so divide por `\n{2,}` (quebra dupla). Texto do Word usa `\n` simples, entao o conteudo inteiro vira 1 unica "pagina".

**Solucao:** Adicionar fallbacks em cascata:
1. Tenta dividir por quebra dupla (`\n\n`)
2. Se algum bloco ainda e maior que `chunkSize`, re-divide por quebra simples (`\n`)
3. Se AINDA e grande demais (texto sem nenhuma quebra), corta no espaco mais proximo do limite

Resultado: um Word de 16 paginas vai gerar ~16 paginas no app tambem, independente do tipo de quebra de linha.

---

## Parte 2: Adicionar marcadores de pagina nos batches

**Arquivo:** `src/components/ai-deck/useAIDeckFlow.ts` (linha 291)

**Problema:** As paginas sao concatenadas sem separador, entao a IA nao sabe onde cada folha comeca/termina.

**Solucao:** Trocar:
```
batchPages.map(p => p.textContent).join('\n\n')
```
Por:
```
batchPages.map(p => `--- PÁGINA ${p.pageNumber} ---\n${p.textContent}`).join('\n\n')
```

Agora a IA recebe marcadores claros e consegue fazer a varredura "folha por folha" de verdade.

---

## Parte 3: 6 melhorias no prompt do generate-deck

**Arquivo:** `supabase/functions/generate-deck/index.ts`

### 3.1 Nova regra 11 -- Progressao Logica
Cards devem construir uma narrativa: conceito-pai antes do detalhe.

### 3.2 Cobertura "standard" -- varredura FOLHA POR FOLHA
Substitui instrucao generica por varredura sistematica folha por folha com verificacao final.

### 3.3 Redundancia com angulos cognitivos distintos (regra 5)
Fato / Mecanismo / Consequencia em vez de inversao simples da mesma frase.

### 3.4 Limite de 15 palavras em basic (regra 2)
"Se a resposta nao cabe em 1 linha, o cartao esta mal formulado."

### 3.5 Teste de qualidade para cloze
A resposta da lacuna deve ser unica e inequivoca. Exemplos de certo e errado.

### 3.6 Anti-padrao de cards triviais
Proibido cards com informacao obvia ou que podem ser adivinhados sem estudar.

---

## Resumo de arquivos

| Arquivo | Mudanca |
|---|---|
| `src/lib/pdfUtils.ts` | Refatorar `splitTextIntoPages` com fallbacks de quebra |
| `src/components/ai-deck/useAIDeckFlow.ts` | Adicionar marcadores `--- PÁGINA X ---` na concatenacao |
| `supabase/functions/generate-deck/index.ts` | 6 melhorias no prompt (regras 2, 5, 11, cobertura, cloze, anti-trivial) |

