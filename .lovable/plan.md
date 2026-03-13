

## Minha Análise Honesta

### O que concordo 100%

**Remover o sistema unificado faz sentido.** O `StudyNowHero` + `/study/all` + `useUnifiedQueue` adicionaram ~400 linhas de complexidade para algo que na prática confunde o aluno -- ele perde contexto de qual deck está estudando. O `DeckCarousel` já mostra exatamente o que precisa estudar por deck (novos, aprendendo, revisão) com botão "Estudar" direto. É superior.

**Promover o DeckCarousel** -- ele já está pronto, só está escondido dentro de um `<details>` colapsável. Colocar ele no topo resolve 80% do problema de UX.

### Onde tenho preocupação

**O mapa de conquistas por deck tem risco médio.** O problema não é escala de dados, é a **qualidade do grafo de pré-requisitos**. Hoje o `parent_concept_id` é preenchido pela IA via `map-prerequisites`, que funciona em batch e nem sempre acerta a ordem. Se o grafo estiver errado, o "mapa de conquista" vai mostrar uma progressão que não faz sentido (ex: "Farmacologia de anti-hipertensivos" aparecendo antes de "Fisiologia renal"). 

**Mitigação:** mostrar o mapa como visualização de progresso (dominado vs não dominado) sem bloquear nada. O bloqueio por pré-requisito (`lockedIds`) já existe na página de Conceitos, mas forçar isso no mapa visual pode frustrar se o grafo estiver errado.

### Plano de Implementação

**Fase 1 — Limpeza (remover sistema unificado)**

| Ação | Arquivo |
|---|---|
| Deletar `StudyNowHero.tsx` | `src/components/dashboard/StudyNowHero.tsx` |
| Deletar `useUnifiedQueue.ts` | `src/hooks/useUnifiedQueue.ts` |
| Remover `fetchUnifiedStudyQueue` (~100 linhas) | `src/services/studyService.ts` |
| Remover rota `/study/all` | `src/App.tsx` |
| Remover lógica `isUnifiedMode` / `__all__` | `src/hooks/useStudySession.ts` |
| Remover refs de tracking ALEKS (`deckStatsRef`, `correctCount`, `wrongCount`, `sessionElapsed`) | `src/pages/Study.tsx` |
| Remover import de `StudyNowHero` | `src/pages/Dashboard.tsx` |

**Fase 2 — Dashboard focado no dia**

- Tirar `DeckCarousel` do `<details>` colapsável e colocar como conteúdo principal
- Adicionar seção compacta "Conceitos do dia" mostrando `dueConcepts` com mini-donut de progresso
- Manter atalhos rápidos (Comunidade, Missões, etc.) mas abaixo do carousel

**Fase 3 — Mapa de conquistas por deck (Concepts page)**

- Criar `DeckConceptMap.tsx` -- componente que renderiza uma "linha de conquista" por deck
- Agrupa conceitos por deck via `question_concepts → deck_questions → deck_id`
- Ordena pelo grafo de `parent_concept_id` (topological sort)
- Visual: nós conectados por linha, estados: ✅ dominado (verde), 🔄 aprendendo (amarelo), 🔒 bloqueado (cinza), ⭕ novo (outline)
- A página Conceitos mostra a lista de decks, cada um expandível com seu mapa
- O donut chart existente (`CategoryDonutChart`) fica como overview geral no topo

**Sobre a reconstrução do mapa quando adicionam cards:** não quebra porque:
- Conceitos são criados via `linkQuestionsToConcepts` (deduplicados por nome)
- O grafo é recalculado pelo `map-prerequisites` (async, não bloqueia)
- O componente só lê `global_concepts` + joins -- é sempre consistente com o estado atual

### Arquivos novos
- `src/components/concepts/DeckConceptMap.tsx`

### Arquivos editados
- `src/pages/Dashboard.tsx` -- remove StudyNowHero, promove DeckCarousel
- `src/pages/Concepts.tsx` -- reestrutura aba "Meus" com mapas por deck
- `src/pages/Study.tsx` -- remove branches unificados e tracking ALEKS
- `src/hooks/useStudySession.ts` -- remove `__all__` mode
- `src/services/studyService.ts` -- remove `fetchUnifiedStudyQueue`
- `src/App.tsx` -- remove rota `/study/all`

### Arquivos deletados
- `src/components/dashboard/StudyNowHero.tsx`
- `src/hooks/useUnifiedQueue.ts`

