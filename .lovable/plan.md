

# Correcao da Organizacao Hierarquica de Importacao

## Diagnostico dos Problemas

Analisei a funcao `organize-import` e identifiquei 3 causas raiz:

### 1. Modelo fraco (gpt-4o-mini)
O modelo mini nao tem capacidade de raciocinio suficiente para analisar 400+ cards e criar categorias inteligentes. Ele tende a "simplificar" jogando muitos cards num unico grupo.

### 2. Prompt sobre-engenheirado
O prompt atual tem 10 regras rigidas com numeros especificos (10-50 cards, 60 limite, max 40 chars, etc). Isso confunde o modelo em vez de ajudar. A melhor pratica e dar diretrizes simples e deixar o modelo raciocinar.

### 3. Output truncado
Com 500 cards x 120 chars = ~60K caracteres de input, mais a resposta contendo todos os indices, o gpt-4o-mini pode atingir o limite de output tokens e truncar o JSON. Resultado: cards nao atribuidos caem todos no ultimo grupo (os 241 cards de "Acompanhamento Pre-natal").

## Solucao

### Mudanca 1: Modelo gpt-4o
Trocar para `gpt-4o` que tem raciocinio superior e output de ate 16K tokens (vs 4K do mini em tool calls).

### Mudanca 2: Prompt simplificado e natural
Em vez de 10 regras rigidas, usar um prompt curto e claro:

```text
Organize os flashcards em uma arvore tematica.
- Agrupe por tema/assunto real do conteudo
- Se um grupo ficar grande demais, subdivida-o
- A hierarquia pode ter ate 3 niveis
- Cada grupo final deve ser estudavel isoladamente
```

Sem numeros rigidos. O modelo decide naturalmente quantos cards cabem em cada grupo.

### Mudanca 3: Schema recursivo (3 niveis)
Permitir children dentro de children. Isso permite estruturas como:

```text
Obstetricia
  Pre-natal
    Consultas de rotina (20 cards)
    Exames (15 cards)
  Parto
    Normal (22 cards)
    Cesarea (18 cards)
```

### Mudanca 4: Auto-split como fallback
Apos receber a resposta da IA, se algum grupo folha ainda tiver mais de 60 cards, dividir automaticamente em chunks menores. Isso garante que mesmo se o modelo falhar, nenhum grupo fica gigante.

### Mudanca 5: Resumo mais compacto
Reduzir de 120 para 80 caracteres por card, cabendo mais cards no contexto sem perder informacao util.

## Detalhes Tecnicos

### Edge Function `organize-import/index.ts`

- Trocar `model: "gpt-4o-mini"` por `model: "gpt-4o"`
- Reduzir slice de 120 para 80 chars por card
- Simplificar system prompt (remover regras numericas rigidas)
- Schema da tool call: children recursivo (children podem ter children)
- Pos-processamento: auto-split de grupos folha com >60 cards em chunks de ~25

### Frontend `ImportCardsDialog.tsx`

- `SubdeckPreview`: renderizacao recursiva que suporta qualquer profundidade
- `countLeafCards`: ja e recursivo, funciona sem mudancas

### `deckService.ts`

- `createDeckTree`: tornar genuinamente recursivo (children com children)
- Tipo do parametro aceitar children aninhados recursivamente

### `Dashboard.tsx`

- Sem mudancas estruturais, apenas garantir que o tipo SubdeckOrganization com children recursivos e aceito

## Arquivos Afetados

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/organize-import/index.ts` | Modelo gpt-4o, prompt simples, schema recursivo, auto-split |
| `src/components/ImportCardsDialog.tsx` | Preview recursivo para N niveis |
| `src/services/deckService.ts` | createDeckTree recursivo |

