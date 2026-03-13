

# Análise do Sistema de Aprendizagem — Diagnóstico Completo

## O que vocês já implementaram (e está correto pela ciência)

| Princípio | Implementação | Base científica |
|---|---|---|
| **Repetição espaçada (FSRS-6)** | Cards e temas agendados por algoritmo | Ebbinghaus 1885, Pimsleur 1967 |
| **Mastery threshold (2x consecutivos)** | Exige 2 acertos para confirmar domínio | Bloom 1968 (mastery learning) |
| **Rating binário automático** | Sem autoavaliação — sistema decide certo/errado | Dunning-Kruger: alunos são maus autoavaliadores |
| **Confidence check** | "Chutei" vs "Tinha certeza" filtra acertos acidentais | Hunt 2003, metacognição calibrada |
| **Elaborative interrogation** | Após erro, pede explicação antes de mostrar resposta | Chi et al. 1994 (+30% retenção) |
| **Interleaved practice** | Shuffle Fisher-Yates nos temas fracos | Rohrer & Taylor 2007 (+20-40% retenção) |
| **Prerequisite graph** | Fronteira enforced — não estuda sem dominar pré-requisito | Knowledge Space Theory (ALEKS) |
| **Leech detection** | Após 3 erros consecutivos, interrompe e reforça | Anki leech system, evita "grinding" improdutivo |
| **Cascade on error** | Erro em tema filho reagenda ancestrais fracos | Modelo de conhecimento hierárquico |

**Veredicto: A fundação teórica é sólida.** Vocês implementaram mais princípios de neurociência do que 95% dos apps de estudo no mercado.

---

## Problemas reais identificados (gaps vs ciência)

### 1. Cards e Temas são sistemas PARALELOS desconectados
**Problema crítico.** O usuário estuda cards (flashcards FSRS) na tela Study.tsx E estuda temas (concepts FSRS) na tela StudyMode.tsx. São **dois loops de repetição espaçada independentes** sobre o mesmo conteúdo.

- Estudar um card NÃO atualiza o estado FSRS do tema vinculado
- Estudar um tema NÃO atualiza os cards vinculados
- O usuário faz trabalho duplicado sem perceber

**O que a ciência diz:** O "Knowledge Component" (tema) deveria ser a unidade fundamental. Cards são veículos de prática, não entidades de scheduling separadas. (Corbett & Anderson 1994 — Knowledge Tracing)

### 2. Sem retrieval practice real nos temas
**StudyMode** apresenta questões de múltipla escolha. Isso é **recognition**, não **recall**. A ciência mostra que recall livre (tentar lembrar sem opções) produz 50-100% mais retenção que múltipla escolha (Karpicke & Roediger 2008).

Os flashcards fazem retrieval real (frente → tenta lembrar → vira), mas os temas não aproveitam isso.

### 3. Sem feedback loop entre Card performance e Concept state
Quando o usuário erra um card vinculado ao tema "Pneumotórax", o tema "Pneumotórax" deveria enfraquecer automaticamente. Hoje isso não acontece — os dois sistemas são ilhas.

### 4. Diagnóstico inicial é opt-in manual
O diagnóstico deveria ser automático na primeira vez que o usuário tem temas suficientes. Atualmente requer clique manual num botão que o usuário nem entende.

### 5. Sem spacing effect nos temas de estudo
Os temas na Dashboard (DashboardDueThemes) mostram "Estudar tudo" que abre StudyMode com toda a fila. Não há limite diário de temas novos (como o `daily_new_limit` dos cards), então o usuário pode ser soterrado.

---

## Plano de Correção — Priorizado

### Fase 1: Unificar Cards ↔ Temas (impacto máximo)

**1a. Card review atualiza tema automaticamente**
- Em `Study.tsx` → `executeReview()`, após submeter review do card, buscar os temas vinculados (`question_concepts` → `global_concepts`)
- Se rating=1 (Again): chamar `updateConceptMastery(conceptId, false)` 
- Se rating≥3 (Good/Easy): chamar `updateConceptMastery(conceptId, true)`
- Não alterar o FSRS do tema diretamente — apenas atualizar contadores de mastery

**1b. Tema due sugere cards vinculados**
- Quando um tema está due, em vez de abrir StudyMode (múltipla escolha), oferecer opção de estudar os flashcards vinculados (retrieval real)
- DashboardDueThemes: "Estudar" abre os cards do tema, não o quiz MC

### Fase 2: Automatizar onboarding

**2a. Auto-trigger diagnóstico**
- Quando `global_concepts` count ≥ 10 e nenhum tem `last_reviewed_at`, mostrar banner automático no Dashboard: "Detectamos X temas — quer fazer um diagnóstico rápido?"
- Sem botão escondido na página de Conceitos

**2b. Auto-trigger mapeamento de pré-requisitos**
- Após `generate-questions` criar temas novos, se >5 temas sem `parent_concept_id`, chamar `map-prerequisites` automaticamente em background

### Fase 3: Limites e proteções

**3a. Daily theme limit**
- Limitar temas novos por dia (ex: 5) para evitar sobrecarga cognitiva
- Similar ao `daily_new_limit` dos cards

**3b. Mixed practice mode**
- Combinar cards + temas numa fila única de estudo
- Intercalar flashcard recall com questões MC do tema

---

## Resumo executivo

O sistema está **bem fundamentado** mas tem uma falha arquitetural central: **cards e temas são dois mundos paralelos**. O usuário estuda os dois sem que um informe o outro, gerando trabalho duplicado e confusão ("estudo cards? temas? os dois?").

A correção mais impactante é fazer com que estudar cards atualize automaticamente o estado dos temas vinculados, e vice-versa. Isso transforma o sistema de "duas ferramentas separadas" em "um sistema integrado de aprendizagem".

