

# Corrigir generate-deck: Aplicar TODAS as mudanças pendentes

## O que esta errado

O arquivo `generate-deck/index.ts` nunca recebeu as mudanças dos planos aprovados. Esta tudo no estado original:

| Item | Estado Atual (ERRADO) | Correto |
|------|----------------------|---------|
| Distribuicao | 33% uniforme (linha 98) | Cloze 55%, Basico 30%, MC 15% |
| max_tokens | 8.192 (linha 205) | 65.000 |
| Truncagem input | slice(0, 10000) (linha 167) | Sem truncagem |
| MC distratores | "distratores realistas" (linha 77) | Conceitos reais do material |
| Metodo Ativo | Ausente | Bloco explicito no prompt |

## Mudancas

### 1. Distribuicao ponderada (linha 94-99)

Substituir a logica uniforme por:

```text
Se 3 formatos: Cloze ~55%, Basico ~30%, MC ~15%
Se 2 formatos:
  - Cloze + Basico: 65% / 35%
  - Cloze + MC: 75% / 25%
  - Basico + MC: 70% / 30%
Se 1 formato: 100% (ja funciona)
```

Adicionar orientacao de QUANDO usar cada formato:
- Cloze (55%): fatos, definicoes, valores, nomes, localizacoes
- Basico (30%): mecanismos, causa-efeito, comparacoes, "por que?", "como?"
- MC (15%): aplicacao pratica, diagnostico diferencial, cenarios de decisao

### 2. Instrucao de MC rigorosa (linha 77)

De:
```
"options" com 4-5 alternativas plausíveis (não absurdas). "correctIndex" com o índice correto (0-based). As alternativas incorretas devem ser distratores realistas.
```

Para:
```
Pergunta de APLICACAO ou DIFERENCIACAO na "front". "back" vazio.
"options" com 4-5 alternativas. "correctIndex" com indice correto (0-based).
REGRAS DOS DISTRATORES:
- Os distratores DEVEM ser conceitos REAIS presentes no material fornecido
- As alternativas devem ser do MESMO campo semantico (ex: se a resposta e um musculo, distratores sao outros musculos do texto)
- PROIBIDO inventar alternativas genericas ou obviamente absurdas
- O estudante deve precisar PENSAR e DIFERENCIAR para acertar
```

### 3. Remover truncagem de input (linha 167)

De: `const trimmedContent = textContent.slice(0, 10000);`
Para: `const trimmedContent = textContent;`

O frontend ja controla o tamanho via batching por paginas (10 paginas por batch).

### 4. max_tokens: 8192 para 65000 (linha 205)

Gemini 2.5 Flash suporta ate 65.536 tokens de output. Elimina truncagem de resposta.

### 5. Metodo Ativo no system prompt (linhas 8-20)

Adicionar ao DEFAULT_SYSTEM_PROMPT:

```text
METODO ATIVO (obrigatorio):
- INTERROGACAO ELABORATIVA: Pergunte "Por que?" e "Como?" em vez de "O que e?"
- CONEXOES: Crie cards que conectam conceitos entre si do mesmo material
- APLICACAO: Sempre que possivel, use cenarios praticos/clinicos
- CONTRASTE: Compare conceitos similares para forcar diferenciacao
- COBERTURA: Se o material menciona um conceito sem explicacao profunda, crie um card factual simples em vez de ignora-lo
```

### 6. Nivel standard reforçado (linha 26)

De: `"Crie cartões cobrindo TODOS os tópicos..."`
Para: adicionar `"COBERTURA COMPLETA — NAO pule NENHUM tema mencionado no material."`

## Arquivo modificado

`supabase/functions/generate-deck/index.ts` — 6 pontos de alteracao

## O que NAO muda

- Logica de cloze safety validation (linhas 256-270)
- mapCardType (linhas 125-135)
- Parsing JSON e repair de truncagem
- Logging, energia, autenticacao
- Frontend (useAIDeckFlow.ts) — ja esta com batching por paginas

