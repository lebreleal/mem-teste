

# Analise Critica: UX Atual vs. o que a Neurociencia Recomenda

## O Problema Real

Agora o usuario tem **3 lugares diferentes** para interagir com aprendizagem ativa:

1. **Dashboard** → Estudar Cards (FSRS)
2. **Deck > aba Questoes** → Praticar questoes, colar questoes, gerar com IA
3. **Deck > aba Conceitos** → Ver conceitos locais do deck, praticar fracos
4. **/conceitos** (menu global) → Revisar conceitos globais com FSRS

Isso e **fragmentacao cognitiva**. O usuario precisa decidir "onde ir" antes de estudar. Bjork (1994) e Roediger (2006) mostram que **a fricao para iniciar** e o maior inimigo da consistencia de estudo.

## O que a Neurociencia Recomenda: Unificacao

### Principio: "Um botao, uma sessao"

O usuario nao deveria escolher entre "estudar cards", "praticar questoes" ou "revisar conceitos". A sessao de estudo ideal **mistura tudo** (interleaving) em uma unica fila:

1. Cards due (FSRS) → recall puro
2. Conceitos due (FSRS) → questao variada  
3. Novos cards → aprendizagem

Mas isso e uma mudanca **enorme** de arquitetura. Para AGORA, a mudanca minima e pratica e:

## Plano: Simplificar DeckDetail (remover aba Conceitos local)

A aba "Conceitos" dentro do deck e **redundante** com a pagina global `/conceitos`. Os conceitos ja sao globais. Manter uma visao local cria confusao ("qual e a visao real?").

### Mudancas:

**1. DeckDetail.tsx — PersonalDeckTabs: remover aba Conceitos**
- Mudar grid de 3 colunas para 2 (Cards + Questoes)
- Remover imports de `ConceptList`, `ConceptStatsCard`, `useConceptMastery`
- Remover handlers `handlePracticeConcept`, `handlePracticeWeak`, `handleGenerateQuestions`
- Remover estado `conceptFilter`
- No `DeckQuestionsTab`, remover prop `conceptFilter`

**2. DeckDetail.tsx — LinkedDeckTabs: manter como esta (Cards + Questoes + Sugestoes)**
- Sem mudanca, ja nao tem conceitos

**3. Pagina /conceitos: adicionar link de acesso rapido**
- Na pagina global de conceitos, ao expandir um conceito, mostrar de quais decks vieram as questoes vinculadas (ja tem os dados via `question_concepts` → `deck_questions.deck_id`)

**4. Dashboard: adicionar badge de conceitos due**
- No header ou em um card pequeno, mostrar "X conceitos para revisar" com link para `/conceitos`
- Isso guia o usuario sem fragmentar a navegacao

### O que NAO mudar agora:
- A fila unificada (cards + conceitos juntos) e o ideal, mas e uma refatoracao muito grande — fica para depois
- A pagina `/conceitos` continua como esta, funciona bem como hub global

### Resultado esperado:
```text
ANTES (4 lugares):
  Dashboard → Cards
  Deck > Cards
  Deck > Questoes  
  Deck > Conceitos ← REDUNDANTE
  /conceitos ← GLOBAL

DEPOIS (3 lugares, claros):
  Dashboard → Cards + badge "X conceitos due"
  Deck > Cards + Questoes (2 abas)
  /conceitos → Hub global de conceitos (FSRS)
```

Cada lugar tem um proposito claro:
- **Dashboard**: visao geral + iniciar estudo de cards
- **Deck**: gerenciar conteudo (cards + questoes)
- **Conceitos**: dominio tematico global com SR

