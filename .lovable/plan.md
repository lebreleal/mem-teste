

# Gatilho de Erro Ativo (Leech Trigger)

## O que sera feito

Quando um card recebe "Errei" (rating=1) pela 3a vez **na mesma sessao**, o sistema interrompe o fluxo normal e abre uma **Mini-Sessao de Reforco** com cards relacionados ao mesmo conceito/tema. O aluno so volta ao card dificil depois de praticar a base.

## Implementacao

### 1. Rastrear erros por card na sessao (`Study.tsx`)

- Novo `useRef<Map<string, number>>` chamado `failCountRef` — conta quantas vezes cada card recebeu rating=1 na sessao atual.
- No `handleRate`, se `rating === 1`, incrementar o contador. Se atingir 3, ativar o estado `leechTriggered` com o card atual.

### 2. Buscar conceitos do card leech

- Quando leech dispara, buscar os conceitos vinculados ao card via: `deck_questions` (questoes do mesmo deck que referenciam o card ou compartilham conceitos) → `question_concepts` → `global_concepts`.
- Selecionar o conceito mais fraco (menor estabilidade FSRS) — mesmo padrao ja usado no ErrorNotebook.

### 3. Mini-Sessao de Reforco (novo estado na UI do Study)

- Novo estado `leechMode` no Study.tsx que renderiza uma tela intermediaria:
  - Mensagem: "Voce errou este card 3 vezes. Vamos reforcar o tema base antes de continuar."
  - Mostra o nome do tema fraco identificado.
  - Puxa cards do mesmo conceito (outros cards do usuario, via `getConceptRelatedCards` que ja existe no `globalConceptService`).
  - Exibe esses cards como mini-flashcards simplificados (frente/verso, sem rating FSRS — apenas "Entendi" para avancar).
  - Apos ver todos os cards de reforco (ou botao "Voltar a sessao"), retorna ao fluxo normal.
  - O card leech volta pra fila com `learning_step` resetado.

### 4. Fallback sem conceitos

- Se o card nao tiver conceitos vinculados (nenhuma questao com `question_concepts`), mostrar uma mensagem mais simples: "Card dificil detectado. Revise o conteudo antes de continuar." com o back_content do card expandido + botao "Continuar".

## Arquivos a editar

| Arquivo | Mudanca |
|---|---|
| `src/pages/Study.tsx` | Adicionar `failCountRef`, deteccao de leech no `handleRate`, estado `leechMode`, UI da mini-sessao |
| `src/services/globalConceptService.ts` | Adicionar `getCardConcepts(cardId)` — busca conceitos de um card especifico via questions |

## Notas

- Nao precisa de nova tabela — o contador e local a sessao (ref).
- O `ConceptDrillQuiz` ja existente nao sera usado aqui — a mini-sessao mostra **cards** (flashcards de base), nao questoes. O objetivo e reconstruir fundamento, nao testar.
- O limiar de 3 erros e configuravel (constante `LEECH_THRESHOLD`).

