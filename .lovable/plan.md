

# Qualidade Maxima: Batching por Paginas + Metodo Ativo

## Problema Atual

O sistema junta texto de varias paginas num bloco de 12.000 caracteres, perdendo contexto e foco. O modelo recebe um "textao" e tenta gerar cards genericos. Alem disso, o output trava em 16.000 tokens, cortando cards.

## Solucao: 3 Mudancas

### 1. Frontend: Batching por Paginas (useAIDeckFlow.ts)

Substituir toda a logica complexa de paragrafos + overlap por agrupamento simples:

```text
Antes: Paragrafos -> acumula 12.000 chars -> overlap 500 chars -> batch
Depois: Paginas selecionadas -> agrupa de 10 em 10 -> batch
```

- `PAGES_PER_BATCH = 10` (10 paginas ~ 5.000 tokens input, seguro)
- Sem overlap, sem prefixo "[CONTEXTO ANTERIOR]" (desnecessario com paginas)
- Mantem `CONCURRENT_BATCHES = 3` (paralelismo)
- Mantem deduplicacao entre lotes
- Mantem background generation

O codigo fica muito mais simples: um `for` que fatia o array de paginas de 10 em 10.

### 2. Backend: Capacidade + Cobertura (generate-deck/index.ts)

**max_tokens: 16.000 -> 65.000**
- Gemini 2.5 Flash suporta ate 65.536 tokens de output
- Elimina truncagem em 99% dos casos
- 10 paginas geram ~30-50 cards (~4.000 tokens), muito abaixo do limite

**Remover truncagem de input** (linha 209)
- Atualmente: `textContent.slice(0, 16000)` corta conteudo silenciosamente
- Novo: sem truncagem (o frontend ja controla o tamanho via PAGES_PER_BATCH)

**Prompt de cobertura reforçado:**
- "Compreensao Primeiro" muda de restritivo para inclusivo: "Se o material menciona um conceito sem explicacao profunda, crie um card factual simples em vez de ignora-lo"
- Nivel `standard` ganha instrucao explicita: "COBERTURA COMPLETA — NAO pule NENHUM tema mencionado"

### 3. Prompt de Metodo Ativo (generate-deck/index.ts)

Adicionar principios de aprendizagem ativa no system prompt:

- **Interrogacao Elaborativa**: "Por que isso funciona assim?" em vez de "O que e X?"
- **Pratica Intercalada**: Variar o angulo cognitivo entre cards consecutivos (mecanismo, aplicacao, comparacao)
- **Geracao Ativa**: O estudante deve PRODUZIR a resposta, nao reconhece-la
- **Conexoes**: Cards que conectam conceitos entre si ("Como X se relaciona com Y?")

Texto adicionado ao prompt:

```
METODO ATIVO (obrigatorio):
- INTERROGACAO ELABORATIVA: Pergunte "Por que?" e "Como?" em vez de "O que e?"
- CONEXOES: Crie cards que conectam conceitos entre si do mesmo material
- APLICACAO: Sempre que possivel, use cenarios praticos/clinicos
- CONTRASTE: Compare conceitos similares para forcas diferenciacao
```

## Resumo de Impacto

| Item | Antes | Depois |
|------|-------|--------|
| Unidade de batch | 12.000 caracteres | 10 paginas |
| Overlap entre lotes | 500 chars + prefixo | Nenhum |
| max_tokens output | 16.000 | 65.000 |
| Truncagem de input | Sim (16k chars) | Nao |
| Risco de truncagem | Alto | Quase zero |
| Metodo ativo | Parcial | Explicito no prompt |
| Complexidade do codigo | Alta | Baixa |

## Arquivos Modificados

1. **`src/components/ai-deck/useAIDeckFlow.ts`** — simplificar `handleGenerate` (batching por paginas em vez de caracteres)
2. **`supabase/functions/generate-deck/index.ts`** — max_tokens 65k, remover truncagem input, reforcar prompt cobertura + metodo ativo

## O que NAO muda

- Deduplicacao entre lotes (mantida)
- Processamento paralelo de 3 lotes (mantido)
- Contagem de creditos por pagina (mantida)
- Background generation (mantido)
- Logica de custo e logging (mantida)
- Repair de JSON truncado (mantido como safety net)
