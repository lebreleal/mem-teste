

# Diagnóstico Brutal: A Home Está Sobrecarregada

## O que o usuário vê hoje na Home (de cima pra baixo)

```text
┌─────────────────────────────────┐
│ 5 botões: Comunidade, Missões,  │  ← decisão 1
│ Provas, Questões, Meu Plano    │
├─────────────────────────────────┤
│ Caderno de Erros (X erros)      │  ← decisão 2
├─────────────────────────────────┤
│ Stats: streak, cards, minutos   │  ← informação
├─────────────────────────────────┤
│ Diagnóstico rápido (banner)     │  ← decisão 3
├─────────────────────────────────┤
│ 49 Temas para revisar           │  ← decisão 4 (TERROR)
├─────────────────────────────────┤
│ DeckCarousel com tempo estimado │  ← decisão 5 (2h+)
├─────────────────────────────────┤
│ Lista de baralhos + pastas      │  ← decisão 6
├─────────────────────────────────┤
│ Arquivados                      │  ← decisão 7
└─────────────────────────────────┘
```

**Resultado**: O usuário leigo abre o app e vê 7 blocos diferentes, cada um pedindo uma ação diferente. Ele não sabe por onde começar. Isso viola a Lei de Hick: mais opções = mais paralisia.

## Como o ALEKS resolve isso

O ALEKS tem UMA única ação na home: **"Continue Learning"**. Um botão. O sistema decide o que estudar. O aluno não escolhe nada.

## Proposta: "Botão Único" — Estudar Agora

A Home deveria ter um único CTA dominante que o sistema calcula automaticamente:

```text
┌─────────────────────────────────┐
│  Logo + Avatar                  │
├─────────────────────────────────┤
│  🔥 3 dias · 42 cards · 15min  │  ← info passiva (MiniStats)
├─────────────────────────────────┤
│                                 │
│   ┌───────────────────────┐     │
│   │   ▶  ESTUDAR AGORA    │     │  ← CTA ÚNICO DOMINANTE
│   │   12 cards · ~8min    │     │
│   └───────────────────────┘     │
│                                 │
│   O que vou estudar:            │
│   • 5 cards de revisão          │  ← resumo automático
│   • 3 cards novos               │
│   • 2 temas fracos              │
│   • 2 temas da fronteira        │
│                                 │
├─────────────────────────────────┤
│  📚 Meus Baralhos     [ver →]  │  ← colapsado por padrão
├─────────────────────────────────┤
│  ⚡ Atalhos                     │
│  Comunidade · Provas · Questões │  ← secundário, compacto
└─────────────────────────────────┘
```

## Lógica do "Estudar Agora" (fila única inteligente)

O sistema monta uma fila **unificada** com prioridade:

1. **Cards de revisão atrasados** (learning/relearning state 1/3)
2. **Cards de revisão agendados** (state 2, scheduled_date ≤ hoje)
3. **Temas fracos due** (global_concepts com erros, scheduled_date ≤ hoje) → abre flashcards vinculados
4. **Cards novos** (até daily_new_limit)
5. **Temas da fronteira** (novos, pré-requisitos dominados) → abre flashcards vinculados

O usuário não decide nada. Aperta um botão e estuda.

## Mudanças técnicas

### 1. Novo componente `StudyNowHero.tsx`
- Calcula a fila unificada usando dados de `useStudySession` + `useGlobalConcepts`
- Mostra contagem e tempo estimado
- Botão "Estudar Agora" navega para `/study/unified` (nova rota)
- Se fila vazia: mostra "Tudo em dia!" com confetti

### 2. Refatorar `Dashboard.tsx`
- Remove: `DashboardDueThemes`, `DiagnosticBanner` inline, `DeckCarousel` como item primário
- Adiciona: `StudyNowHero` como bloco principal
- Move baralhos para seção colapsável "Meus Baralhos"
- Compacta os 5 botões de atalho para uma linha horizontal menor

### 3. Lógica "Caderno de Erros" absorvida
- Não mostrar banner separado — os temas fracos já entram na fila do "Estudar Agora"
- O caderno de erros fica acessível via Perfil (gestão avançada)

### 4. Diagnóstico: auto-trigger antes do primeiro "Estudar Agora"
- Se existem 10+ conceitos não revisados, ao clicar "Estudar Agora" pela primeira vez, abre o Diagnóstico como passo obrigatório antes de começar
- Sem banner separado ocupando espaço

### 5. Comportamento "dia perdido"
- Se o usuário perdeu 1 dia: cards atrasados entram automaticamente na fila prioritária
- Sem punição explícita — o FSRS já reduz estabilidade naturalmente
- Mostrar mensagem encorajadora: "Você tem X revisões pendentes. Vamos retomar!"

### 6. Limite inteligente de sessão
- Calcular tempo estimado realista (avg_seconds_per_card × cards na fila)
- Se > 30min: mostrar "Sessão recomendada: 30min (X cards)" em vez de mostrar os 200 cards de uma vez
- O usuário pode optar por continuar depois

### O que NÃO muda
- Toda a infraestrutura FSRS, conceitos, prerequisitos, cascata
- Sub-páginas (DeckDetail, Study, ManageDeck, etc.)
- Perfil com estatísticas e biblioteca de temas

## Resumo

O problema não é que "as coisas não funcionam". O problema é que o usuário vê 7 decisões ao abrir o app quando deveria ver 1. A solução é um botão "Estudar Agora" que o sistema calcula automaticamente, absorvendo cards, temas fracos e fronteira numa fila única.

