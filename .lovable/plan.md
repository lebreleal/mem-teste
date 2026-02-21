
# Distribuicao Inteligente de Cards Novos por Dia — IMPLEMENTADO ✅

## O que foi feito

### 1. Migration: `daily_new_cards_limit` em `profiles` ✅
- Coluna `daily_new_cards_limit integer NOT NULL DEFAULT 30` adicionada

### 2. Algoritmo de alocação proporcional em `useStudyPlan.ts` ✅
- Peso por deck: `newRemaining / daysLeft`
- Distribuição proporcional do orçamento global
- Mínimo de 1 card/dia por deck ativo
- Alocação por plano (para exibição) e por deck (para fila de estudo)

### 3. Integração em `fetchStudyQueue` (`studyService.ts`) ✅
- Busca `daily_new_cards_limit` do perfil
- Calcula alocação por deck em tempo real
- Aplica `Math.min(deckConfig.daily_new_limit, planAllocation)` 
- Decks fora de planos mantêm comportamento original

### 4. UI no Meu Plano (`StudyPlan.tsx`) ✅
- Slider de "Cards novos por dia" no hero card
- Badges mostrando distribuição por objetivo

### 5. Simulador conectado (`useForecastSimulator.ts`) ✅
- `defaultNewCardsPerDay` agora vem do perfil em vez de hardcoded 30
