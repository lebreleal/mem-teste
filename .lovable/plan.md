

# Tutor IA com resposta fluida estilo ChatGPT (streaming)

## O que muda

Atualmente, quando voce clica em "Explicar Assunto", "Explicar Alternativas" ou "Dica", o sistema espera a resposta INTEIRA da IA e so depois mostra tudo de uma vez. Isso parece robotico.

A mudanca e fazer o texto aparecer **palavra por palavra** em tempo real, como no ChatGPT -- dando a sensacao de uma pessoa real digitando a explicacao.

## Custo

**Sem custo adicional.** E a mesma chamada de IA que ja existe, so muda a forma de entrega (streaming vs esperar tudo). O custo em creditos permanece identico (2 creditos Flash / 10 creditos Pro).

## Mudancas tecnicas

### 1. Edge Function `ai-tutor` -- habilitar streaming

Atualmente a funcao espera a resposta completa da OpenAI e retorna `{ hint: "texto" }`. A mudanca:

- Adicionar `stream: true` na chamada da OpenAI
- Retornar o `response.body` diretamente como `text/event-stream` (mesmo padrao do `ai-chat` que ja funciona)
- Mover o `logTokenUsage` para antes do stream (sem dados de usage exatos, como o ai-chat ja faz)

### 2. Frontend `Study.tsx` -- novo `handleTutorRequest` com streaming

Substituir a chamada `invokeTutor()` (que espera tudo) por um fetch direto com leitura de stream SSE:

- Usar `fetch()` para chamar a edge function
- Ler o stream com `ReadableStream` + `TextDecoder`
- Parsear linhas SSE (`data: {...}`) extraindo `choices[0].delta.content`
- Atualizar o estado (`hintResponse`, `explainResponse`, `mcExplainResponse`) a cada token recebido -- o texto vai crescendo progressivamente

### 3. Frontend `FlashCard.tsx` -- renderizacao com ReactMarkdown

Trocar o `dangerouslySetInnerHTML` + `formatMarkdown` por `ReactMarkdown` nos blocos de resposta do tutor (hint, explain, mcExplain). Isso:

- Renderiza markdown corretamente mesmo durante o streaming
- Mantem consistencia com o `StudyChatModal` que ja usa `ReactMarkdown`
- Adicionar um cursor piscante (CSS) no final do texto enquanto `isTutorLoading` estiver ativo

### 4. Animacao de carregamento

Manter o `TutorLoadingAnimation` existente apenas nos primeiros instantes (antes do primeiro token chegar). Assim que o primeiro token aparece, a animacao some e o texto comeca a fluir.

## Resumo dos arquivos

| Arquivo | Mudanca |
|---|---|
| `supabase/functions/ai-tutor/index.ts` | Habilitar `stream: true` e retornar SSE stream |
| `src/pages/Study.tsx` | Novo handleTutorRequest com leitura de stream SSE |
| `src/components/FlashCard.tsx` | Usar ReactMarkdown + cursor piscante nos blocos de resposta |
| `src/services/aiService.ts` | Funcao `invokeTutor` pode ser mantida (nao sera mais usada pelo Study, mas nao quebra nada) |

