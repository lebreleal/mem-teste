# Melhorar cobertura de conteúdo na geração de decks por IA

## Implementado

### 1. PAGES_PER_BATCH reduzido de 10 → 3
Menos texto por chamada = análise mais profunda e exaustiva do conteúdo.

### 2. densityFactor reduzido
- Essential: 600 → 400
- Standard: 250 → 150
- Comprehensive: 120 → 80
Mais cards solicitados por batch, forçando cobertura mais completa.

### 3. Structured Output (tool calling) no generate-deck
Substituído JSON livre por tool calling com schema definido. Elimina truncamento de JSON e garante schema correto.

### 4. Threshold de deduplicação: 0.8 → 0.9
Apenas cards com 90%+ de palavras idênticas são removidos, preservando subtópicos similares.

### 5. Checklist de cobertura no prompt
Instrução adicionada ao final do prompt para o modelo verificar que cada parágrafo tem pelo menos 1 card.

### 6. Otimização de Múltipla Escolha (MC)
- Distribuição: Cloze 55%, Basic 35%, MC 10% (antes 50/30/20)
- MC só para diferenciação de 3+ conceitos similares
- Opções limitadas a exatamente 4, max 8 palavras cada
- Economia estimada: ~25% tokens de output

---

# Refatoração de Monolitos (Fase 1)

## Implementado

### StudyPlan.tsx: 1.580 → ~500 linhas
Extraídos 3 módulos:
- `StudyPlanDialogs.tsx` — WhatCanIDoDialog + CatchUpDialog (~250 linhas)
- `DeckHierarchySelector.tsx` — DeckHierarchySelector + ObjectiveDecksExpanded (~210 linhas)
- `ForecastSimulatorSection.tsx` — wrapper do simulador com state local (~120 linhas)

### ManageDeck.tsx: 1.169 → ~900 linhas
Extraído:
- `manage-deck/OcclusionEditor.tsx` — editor de oclusão de imagem (~250 linhas)

### DeckDetailContext.tsx: 1.064 → ~530 linhas (Fase 2)
Extraído:
- `DeckDetailHandlers.ts` — todos os useCallback handlers (~510 linhas)

### DeckSettings.tsx: 1.002 → ~660 linhas (Fase 2)
Extraído:
- `DeckSettingsModals.tsx` — todos os modais/dialogs (~400 linhas)

### FlashCard.tsx: 956 → ~480 linhas (Fase 2)
Extraído:
- `FlashCardMultipleChoice.tsx` — componente MultipleChoiceCard (~310 linhas)

---

# Rebalanceamento da Economia de Créditos IA

## Implementado

### 1. Redução de recompensas de missões (~75%)
| Missão | Antes | Depois |
|--------|-------|--------|
| daily_study_5 | 3 | 1 |
| daily_study_20 | 5 | 2 |
| daily_study_50 | 10 | 3 |
| daily_minutes_10 | 3 | 1 |
| daily_minutes_30 | 8 | 2 |
| weekly_100 | 15 | 5 |
| weekly_300 | 30 | 8 |

Total mensal free: ~1.500 → ~270 créditos.

### 2. Milestones de estudo removidos
Removidos os bônus de +5 (50 cards) e +10 (100 cards) do energyService.ts.

### 3. Bônus mensal premium implementado
500 créditos/mês concedidos automaticamente via check-subscription.
Usa reference_id único por período para evitar duplicatas.

### 4. Copy do PremiumModal atualizado
"1.500 créditos por mês" → "500 créditos por mês".

---

# Transação com Rollback de Créditos em Edge Functions

## Implementado

### 1. RPC `refund_energy` criada no banco
Função PostgreSQL que incrementa `energy` no perfil do usuário para devolver créditos.

### 2. `refundEnergy()` em `_shared/utils.ts`
Helper que chama a RPC com tratamento de erro silencioso (log only).

### 3. Rollback em todas as 5 edge functions
- `generate-deck`: refund em erros AI (429/502/503), parse errors, 0 cards gerados
- `enhance-card`: refund em erros AI e parse errors
- `enhance-import`: refund em erros AI e parse errors
- `ai-tutor`: refund em erros pré-stream (429/502/503/connection error)
- `ai-chat`: refund em erros pré-stream (429/502/503/connection error)

### Nota sobre streaming
Para `ai-tutor` e `ai-chat`, o refund só ocorre se a API falhar ANTES de iniciar o stream.
Se o stream já começou, os créditos são considerados consumidos legitimamente.

---

# Dashboard Performance & Bug Fixes

## Implementado

### 1. FIX CRÍTICO: `get_study_stats_summary` RPC corrigida
- Bug: `operator does not exist: date = text` causava streak=0 no Dashboard
- Fix: Cast explícito `COALESCE(v_profile.last_study_reset_date, '')::text = v_today::text`
- Resultado: Streak (foginho) agora mostra valor correto, consistente com ActivityView

### 2. Community deck updates consolidada em RPC server-side
- Antes: 3 queries sequenciais (turma_decks → decks → cards) no cliente
- Depois: 1 RPC `get_community_deck_updates(p_user_id)` que retorna IDs com updates pendentes
- Redução: 3 requests → 1

### 3. useDecks com staleTime de 2 minutos
- Antes: sem staleTime → refetch em cada re-render/focus
- Depois: `staleTime: 2 * 60_000` — cache de 2 minutos
- Redução de refetches desnecessários no Dashboard

### 4. DeckCarousel: aggregate stats O(1) via Map
- Antes: `getAggregateRaw()` recursivo O(n²) chamado para cada deck no carousel
- Depois: `buildAggregateMap()` pre-computa stats uma vez em O(n), lookup O(1) via Map
- Impacto: eliminação de milhares de `.filter()` por render em decks com sub-decks

## Resumo de impacto

| Métrica | Antes | Depois |
|---------|-------|--------|
| Streak display | BUG (sempre 0) | ✅ Correto |
| Community update queries | 3 sequenciais | 1 RPC |
| staleTime useDecks | 0 (default) | 2min |
| DeckCarousel aggregate | O(n²) recursivo | O(1) Map lookup |

---

# Otimização de Requisições do Dashboard

## Implementado

### Fase A: useStudyPlan com opção `full` (economia: -3 queries no Dashboard)
- `retentionQuery`, `planHealthQuery`, `forecastQuery` agora só disparam com `{ full: true }`
- Dashboard chama `useStudyPlan()` (core), StudyPlan chama `useStudyPlan({ full: true })`

### Fase B: deck-hierarchy via cache (economia: -1 query)
- Removida query separada `['deck-hierarchy']`
- Usa `queryClient.getQueryData(['decks', userId])` do cache de `useDecks`

### Fase C: Missões com cache (economia: -2 queries)
- `missionService.fetchMissions` aceita `cachedDailyCards`, `cachedTotalCards`, `cachedDeckCount`
- `useMissions` passa dados de `useProfile` e `useDecks`, evitando re-buscar profile e deck count

### Fase D: useIsAdmin com useQuery (economia: cache compartilhado)
- Convertido de useState/useEffect para `useQuery` com `staleTime: 10min`

### Fase E: Subscription polling 5min (economia: -80% Edge Function calls)
- `refetchInterval` de 60s → 5min, com `refetchOnWindowFocus: true`

### Fase F: Aggregate stats memoizado (economia: CPU)
- `getRawAggregateStats` em `useDashboardState` agora usa `useMemo` + Map
- Build O(n) uma vez, lookup O(1) por deck

## Resumo de impacto
| Otimização | Economia |
|------------|----------|
| useStudyPlan split (A) | -3 queries |
| deck-hierarchy cache (B) | -1 query |
| Missões com cache (C) | -2 queries |
| useIsAdmin useQuery (D) | cache 10min |
| Subscription polling (E) | -80% calls |
| AggregateStats memo (F) | O(n²) → O(1) |
| **TOTAL Dashboard load** | **~20-24 → ~14-16 req** |
