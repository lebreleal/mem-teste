

# Plano: Conceitos como Dashboard de Dominio

## Entendi seus questionamentos -- resumo

1. **Estudo duplicado**: "Estudar conceito" redireciona para estudar os mesmos cards = redundancia
2. **0 cards nos conceitos**: `syncConceptsFromQuestions` cria conceitos mas nunca popula `concept_cards`
3. **Interdisciplinaridade**: conceitos podem cruzar decks, mas estao presos a `deck_id`
4. **Origem das questoes**: 1 questao gera 3-4 conceitos, mas nao ha questoes suficientes por conceito para praticar
5. **Complexidade**: tudo gira em torno de 3 coisas (cards, questoes, conceitos) e 3 origens (manual, comunidade, plataforma)

## O que ja funciona e NAO vamos mexer

- `deck_concept_mastery` -- ja salva acerto/erro por conceito apos cada questao respondida (linhas 449-469 do DeckQuestionsTab)
- `ConceptMasterySection` -- autoavaliacao inline apos responder questao (Dominei/Mais ou menos/Nao entendi)
- Cards com FSRS -- recall individual, sem mudanca
- Questoes com pratica -- aplicacao, sem mudanca

## O que vamos mudar

### 1. Reescrever `useConceptMastery.ts` (NOVO)

Hook que substitui `useDeckConcepts`. Fonte de dados:
- Conceitos unicos extraidos de `deck_questions.concepts[]` do deck
- Nivel de dominio de `deck_concept_mastery` (strong/learning/weak)
- Contagem de questoes por conceito
- Cards relacionados via keyword search (somente visualizacao)

### 2. Reescrever `ConceptStatsCard.tsx`

- Mostrar: total conceitos, quantos fortes/parciais/fracos
- Botao principal: "Praticar fracos" → muda para aba Questoes filtrada por conceitos fracos
- Remover: botao "Criar conceito", contagem FSRS (new/learning/mastered)

### 3. Reescrever `ConceptList.tsx`

Cada conceito mostra:
- Nome + badge de dominio (Forte verde / Parcial amarelo / Fraco vermelho)
- Taxa de acerto (ex: "3/4 questoes corretas")
- Quantidade de questoes que testam esse conceito
- Expandir: mostra as questoes vinculadas + cards relacionados (keyword search, read-only)

Acoes por conceito:
- "Praticar" → muda tab para Questoes filtrada por esse conceito
- "Gerar questoes" → chama IA para criar questoes sobre o conceito (reusa logica existente)
- Remover: Renomear, Excluir, Editar cards, botao "Estudar" via FSRS

### 4. Adicionar `conceptFilter` no `DeckQuestionsTab`

- Nova prop `conceptFilter?: string`
- Quando definido, filtra questoes onde `concepts[]` contem esse nome
- `PersonalDeckTabs` passa o filtro ao clicar "Praticar" em um conceito

### 5. Limpar `DeckDetail.tsx`

- Remover imports: `useDeckConcepts`, `ConceptDialogs`, `CreateConceptDialog`, `EditConceptCardsDialog`
- Remover: `handleStudyConcept` (navigate to study), `createConceptOpen`, `editCardsTarget`
- Usar novo `useConceptMastery` no lugar

### 6. Deprecar (parar de usar, NAO deletar tabelas)

- `src/hooks/useDeckConcepts.ts` -- parar de importar
- `src/components/deck-detail/ConceptDialogs.tsx` -- parar de importar
- `src/services/conceptService.ts` -- parar de importar (manter arquivo)
- Tabelas `deck_concepts`, `concept_cards` -- manter no banco, nao usar

## Arquivos

| Acao | Arquivo |
|------|---------|
| Criar | `src/hooks/useConceptMastery.ts` |
| Reescrever | `src/components/deck-detail/ConceptStatsCard.tsx` |
| Reescrever | `src/components/deck-detail/ConceptList.tsx` |
| Editar | `src/pages/DeckDetail.tsx` |
| Editar | `src/components/deck-detail/DeckQuestionsTab.tsx` |

## Sobre interdisciplinaridade (preparado mas nao implementado agora)

O `deck_concept_mastery` ja tem `user_id` + `concept` (texto). Para agregar cross-deck no futuro, basta agrupar por `concept` ignorando `deck_id`. A estrutura suporta isso sem mudanca de schema. Quando existir o banco de questoes global, conceitos naturalmente se tornam globais.

