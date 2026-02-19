
# Botao "Explicar" para todos os tipos de card

## Resumo
Adicionar o botao "Explicar" (atualmente so disponivel para multipla escolha) a **todos os tipos de card** (basico, cloze, oclusao). Alem disso, melhorar a explicacao para incluir uma **referencia academica** e uma explicacao didatica completa, como um professor experiente.

## Abordagem: 1 requisicao otimizada (em vez de 2)

Duas requisicoes separadas teriam problemas: custo dobrado de creditos, latencia alta, e a segunda requisicao nao teria acesso real ao livro. A IA nao consegue "ler" o livro recomendado -- ela apenas conhece o conteudo por ter sido treinada nele.

**Solucao**: Uma unica requisicao com um prompt que instrui a IA a:
1. Identificar a area/disciplina do card
2. Recomendar 1-2 referencias academicas classicas para aquele assunto
3. Explicar o conceito de forma didatica e completa, como um professor experiente
4. Conectar a explicacao ao conteudo do card

Isso e mais rapido, mais barato, e produz resultado equivalente.

## Mudancas

### 1. Edge Function `ai-tutor` -- novo action `explain`
- Adicionar um novo branch `action === 'explain'` (generico, para qualquer tipo de card)
- Prompt dedicado que:
  - Le frente e verso do card
  - Identifica a disciplina/tema
  - Recomenda livros-referencia academicos
  - Explica o conceito de forma completa e didatica
  - Max tokens: ~800 (explicacao mais longa que dica)

### 2. FlashCard (basic/cloze) -- adicionar botao "Explicar"
- Apos virar o card e ver a resposta, mostrar um botao "Explicar com IA" (similar ao que ja existe no multipla escolha)
- O botao chama `onTutorRequest({ action: 'explain' })`
- A resposta do tutor aparece abaixo do card em um bloco estilizado
- Custo: mesmos 2 creditos do tutor

### 3. MultipleChoiceCard -- renomear action
- Manter o `explain-mc` existente (funciona bem para multipla escolha)
- Opcionalmente, tambem disponibilizar o novo `explain` generico

### 4. Exibicao da resposta
- Quando `action === 'explain'`, mostrar a resposta com icone de livro (BookOpen)
- Incluir secao visual separada para a referencia bibliografica

## Detalhes Tecnicos

### Prompt do `explain` (ai-tutor/index.ts)
```
Voce e um professor universitario experiente. O aluno esta estudando com flashcards e precisa entender o conceito por tras deste card.

FRENTE DO CARD: {front}
VERSO DO CARD: {back}

Responda nesta estrutura:
1. **Referencia Academica**: Cite 1-2 livros ou fontes academicas classicas sobre este assunto
2. **Explicacao**: Explique o conceito de forma didatica e completa, como se estivesse dando aula particular. Use analogias e exemplos praticos.
3. **Conexao com o card**: Relacione sua explicacao diretamente com a pergunta/resposta do card.

Responda na mesma lingua do card. Seja completo mas claro.
```

### Arquivos modificados
- `supabase/functions/ai-tutor/index.ts` -- novo branch de prompt
- `src/components/FlashCard.tsx` -- botao "Explicar" no card basico/cloze (apos flip)
- Nenhuma mudanca necessaria em `Study.tsx` ou `aiService.ts` -- o fluxo ja suporta `action` customizado

### Fluxo do usuario
1. Card aparece (frente)
2. Usuario vira o card (ve a resposta)
3. Botao "Explicar com IA" aparece abaixo dos botoes de rating
4. Usuario clica -> loading -> explicacao aparece com referencia bibliografica
5. Usuario avalia o card normalmente
