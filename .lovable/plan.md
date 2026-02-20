

# Otimizacao Pedagogica do Prompt de Geracao de Flashcards

## Resumo

Aplicar 4 melhorias pedagogicas ao prompt do edge function `generate-deck` para transformar a geracao em uma ferramenta de aprendizagem profunda, sem alterar a infraestrutura JSON/batching existente.

## Mudancas Detalhadas

### 1. Adicionar Principio da Atomicidade ao System Prompt (linha 15)

Novo principio #7 no `DEFAULT_SYSTEM_PROMPT`:

```
7. ATOMICIDADE: Cada cartao deve testar APENAS UMA ideia ou conceito. Se um topico tem 3 sub-pontos, crie 3 cartoes separados. Evite respostas longas com listas ou multiplos itens.
```

### 2. Angulo Cognitivo por Formato em `getFormatInstructions()` (linhas 72-74)

**Basic** (linha 72) -- adicionar angulo cognitivo:
```
Foque em perguntas de MECANISMO ("Como funciona?"), CAUSA-EFEITO ("Por que X causa Y?") e COMPARACAO ("Qual a diferenca entre X e Y?"). Evite perguntas de dicionario ("O que e X?") -- prefira perguntas que forcam o estudante a EXPLICAR e RACIOCINAR.
```

**Cloze** (linhas 44/64) -- adicionar foco de conteudo:
```
Foque em TERMINOLOGIA TECNICA crucial, VALORES NUMERICOS, NOMES PROPRIOS e LOCAIS ANATOMICOS. A lacuna deve ocultar a informacao que o estudante PRECISA saber de cor.
```

**Multiple Choice** (linha 74) -- substituir "distratores realistas" por regra mais rigorosa:
```
As alternativas incorretas DEVEM ser conceitos que EXISTEM no material mas estao INCORRETOS para aquela pergunta especifica. Isso forca o estudante a DIFERENCIAR conceitos semelhantes. NUNCA use distratores absurdos ou inventados que nao aparecam no texto.
```

### 3. Enriquecer modo Comprehensive em `getDetailInstruction()` (linha 22)

Adicionar ao final da instrucao comprehensive:
```
Extraia cada sub-topico, mesmo que pareca secundario. Se o texto citar uma EXCECAO, crie um cartao para essa excecao. Se citar um EXEMPLO concreto, crie um cartao sobre esse exemplo. Se houver listas, cada item merece seu proprio cartao atomico.
```

### 4. Regra Anti-Decoreba no Prompt Principal (linha 194)

Adicionar nova regra apos a linha de "tipos de pergunta":
```
- SEM DECOREBA: Nao faca perguntas que possam ser respondidas apenas citando uma definicao de memoria. Formule de modo que o estudante precise RACIOCINAR sobre o mecanismo, a causa ou a consequencia.
```

## O que NAO muda

| Item | Motivo |
|------|--------|
| Formato JSON (front/back/type/options/correctIndex) | Quebra parsing e frontend |
| Logica de batching/concorrencia no useAIDeckFlow | Funciona corretamente |
| Regra de intercalacao (linhas 95-107) | Ja implementada |
| Validacao cloze e mapCardType (linhas 268-291) | Safety net essencial |
| Fidelidade/Exclusividade/Ordem | Ja existem |

## Arquivo Modificado

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/generate-deck/index.ts` | System prompt + format instructions + detail instruction + prompt principal |

Nenhuma mudanca em tipos, services, hooks ou componentes frontend. O edge function sera redeployado automaticamente.

