

# Explicacao IA direto no Chat

## Situacao Atual

Quando voce clica em "Explicar assunto com IA", a explicacao aparece num cartaozinho inline abaixo do card de estudo. Isso tem dois problemas:
- A formatacao fica apertada (max-h-[40vh], texto pequeno)
- Se surgir uma duvida durante a leitura, voce precisa abrir o chat separadamente e perder a explicacao

## O que vai mudar

Ao clicar em "Explicar assunto com IA", o sistema vai abrir o **StudyChatModal** diretamente e a explicacao vai aparecer como a primeira mensagem do assistente, com streaming em tempo real. Depois que terminar, voce pode continuar perguntando duvidas ali mesmo, sem perder o contexto.

O fluxo dos outros modos (dica/hint antes de virar, e explicacao de alternativas no multipla escolha) continua inline como esta hoje -- so o "Explicar assunto" muda.

## Fluxo novo

1. Usuario vira o card
2. Clica em "Explicar assunto com IA"
3. O ChatModal abre imediatamente
4. A explicacao aparece como primeira mensagem do assistente (streaming)
5. Ao terminar, o usuario pode digitar perguntas de follow-up no mesmo chat

## Detalhes Tecnicos

### 1. StudyChatModal - aceitar mensagem inicial (StudyChatModal.tsx)

Adicionar uma nova prop `initialAssistantMessage` que, quando presente:
- Insere a mensagem como primeira mensagem do assistente ao abrir
- Permite que o usuario continue a conversa normalmente depois

Tambem adicionar prop `onStreamExplain` -- uma funcao que o modal chama ao abrir para disparar o streaming da explicacao. Isso permite que o modal controle o streaming internamente.

Alternativa mais simples: o modal recebe `streamingExplainResponse` (string que vai crescendo) e `isExplainStreaming` como props, e renderiza como primeira mensagem do assistente enquanto faz streaming. Quando o streaming termina, a mensagem fica fixa e o usuario pode continuar.

### 2. FlashCard.tsx - redirecionar "Explicar assunto" para o chat

- O botao "Explicar assunto com IA" (linhas 860-872) em vez de chamar `onTutorRequest({ action: 'explain' })` inline, vai chamar uma nova callback `onOpenExplainChat`
- Remover a renderizacao inline do `explainResponse` para cards basicos/cloze (linhas 721-735) -- a explicacao agora vive no chat

### 3. Study.tsx - orquestrar o fluxo

- Quando `onOpenExplainChat` e chamado:
  1. Abrir o `StudyChatModal` (`setChatOpen(true)`)
  2. Disparar o tutor request com action `explain`
  3. Passar o `explainResponse` (que ja faz streaming) como prop para o `StudyChatModal`
- O `StudyChatModal` renderiza o `explainResponse` como primeira mensagem do assistente
- Quando o streaming termina, o usuario pode enviar mensagens normais

### 4. Mudancas no StudyChatModal

- Nova prop: `streamingResponse?: string | null` -- conteudo da explicacao em streaming
- Nova prop: `isStreamingResponse?: boolean` -- se esta fazendo streaming
- Quando `streamingResponse` existe e o modal abre:
  - Renderizar como primeira mensagem do assistente (role: assistant)
  - Mostrar cursor de loading enquanto `isStreamingResponse` for true
  - Quando streaming terminar, converter para mensagem fixa no array `messages`
  - A partir dai, usuario pode continuar conversando normalmente (cada mensagem nova custa creditos como hoje)
- Manter a formatacao rica do chat (ReactMarkdown com prose classes) que ja e bem melhor que o inline

### 5. Ajuste de formatacao no chat (bonus)

- Adicionar classes de prose mais generosas no chat para melhorar a leitura de explicacoes longas
- Garantir que listas, titulos, codigo e paragrafos fiquem bem formatados

### Arquivos a editar

1. `src/components/StudyChatModal.tsx` -- novas props de streaming, logica de mensagem inicial
2. `src/components/FlashCard.tsx` -- botao "Explicar assunto" chama nova callback em vez de inline; remover renderizacao inline do explain para basic/cloze
3. `src/pages/Study.tsx` -- passar explainResponse e isStreaming para o StudyChatModal; abrir chat ao clicar explicar

