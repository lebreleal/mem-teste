

# Melhorar responsividade e animacao de loading da IA

## Problema atual
1. A resposta da IA "quebra a visao" -- o conteudo longo extrapola o layout, nao tem scroll adequado e empurra os botoes de rating para fora da tela
2. O loading e um simples spinner generico sem contexto -- o usuario nao entende o que a IA esta fazendo

## Solucao

### 1. Responsividade da resposta da IA

**FlashCard basico/cloze/occlusion (linhas 612-633):**
- Envolver todo o conteudo (card + resposta do tutor) em um container com scroll (`overflow-y-auto`) e altura limitada (`max-h` calculada)
- A resposta da IA tera `max-h-[50vh] overflow-y-auto` proprio para nao empurrar os botoes
- Adicionar `break-words` e `overflow-wrap` no bloco de prosa para evitar quebras de layout

**MultipleChoiceCard (linhas 303-323):**
- Mesma logica: limitar altura da resposta do tutor com scroll interno

### 2. Animacao de loading com fases

Substituir o spinner simples por uma animacao com 3 fases rotativas que indicam o processo da IA:

```
Fase 1: "Lendo cartao..."        (icone BookOpen)     -- 0-2s
Fase 2: "Buscando fonte confiavel..."  (icone Search)  -- 2-4s  
Fase 3: "Elaborando explicacao..." (icone Sparkles)    -- 4s+
```

Cada fase tera:
- Icone animado (pulse suave)
- Texto descritivo
- Barra de progresso indeterminada com shimmer
- Transicao suave entre fases (fade)

Isso sera implementado como um componente `TutorLoadingAnimation` inline no FlashCard.

### Arquivos modificados

- `src/components/FlashCard.tsx`:
  - Novo componente `TutorLoadingAnimation` com as 3 fases
  - Substituir o spinner nos botoes de "Explicar" e "Dica do Tutor" pela animacao
  - Quando `isTutorLoading === true`, mostrar o componente de animacao no lugar onde a resposta apareceria
  - Limitar altura da resposta com scroll interno
  - Corrigir overflow de texto longo com `break-words`

### Detalhes tecnicos

**TutorLoadingAnimation**: componente que usa `useState` + `useEffect` com `setInterval` para ciclar entre as 3 fases a cada ~2.5s. Renderiza dentro do mesmo espaco onde a resposta aparece, com fundo `bg-primary/5` e borda `border-primary/20`.

**Responsividade**: O bloco de resposta da IA recebe `max-h-[40vh] overflow-y-auto` com `scrollbar-hide` e a classe `break-words` no container de prosa. O layout externo do FlashCard basico usa `flex flex-col h-full` com `min-h-0` no container scrollavel.

