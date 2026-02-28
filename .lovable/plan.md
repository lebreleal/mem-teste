

## Bug Fix: Study Queue Stale Cache + StudyPlan Without Objectives

### Problem 1: Farmacologia "Nenhum card para estudar"

**Root cause:** When the user completes a study session, the study queue cache stores an empty result. When they return to study the same deck (now with 1 review card due), React Query has stale cached data (empty array). Because the hook uses `staleTime: Infinity`, `isLoading` is `false` (there IS cached data), so the loading spinner is skipped. The empty stale data renders the "Nenhum card para estudar" screen immediately, even though a background refetch is happening.

**Fix in `src/pages/Study.tsx`:**
- Change the loading guard (line 463) to also show the spinner when the queue hasn't been initialized yet AND data is being fetched in the background: `if (isLoading || (!queueInitialized && isFetching))`
- Expose `isFetching` from `useStudySession` hook

**Fix in `src/hooks/useStudySession.ts`:**
- Export `isFetching: studyQueue.isFetching` alongside `isLoading`

---

### Problem 2: StudyPlan requires creating an objective

**Current behavior:** Line 1222 of `StudyPlan.tsx` gates the entire dashboard behind `plans.length === 0`, showing only a "Criar meu primeiro objetivo" empty state.

**Desired behavior:** When no plans exist, the user should still see:
- The simulation section (forecast) using ALL active decks and sub-decks
- The "Novos cards por dia" slider configuration
- A smaller CTA to create an objective (non-blocking)

**Changes:**

1. **`src/hooks/useStudyPlan.ts`** (lines 154-160 and 316):
   - When `plans.length === 0`, set `allDeckIds` to all active root deck IDs (instead of empty)
   - Adjust `expandedDeckIds` to include descendants of all active decks
   - Allow `computed` metrics to work without plans (remove the `plans.length === 0` null guard on line 316, use fallback values)

2. **`src/pages/StudyPlan.tsx`** (lines 1222-1277):
   - Replace the full empty-state gate with a streamlined dashboard that shows:
     - A compact CTA card encouraging the user to create an objective (not blocking)
     - The "Novos cards por dia" config section (reuse existing code)
     - The `ForecastSimulatorSection` with all active decks
   - The "Meus Objetivos" section is conditionally shown only when `plans.length > 0`

---

### Technical Details

**File: `src/hooks/useStudySession.ts`**
- Add `isFetching: studyQueue.isFetching` to the return object

**File: `src/pages/Study.tsx`**
- Destructure `isFetching` from `useStudySession`
- Change loading condition: `if (isLoading || (!queueInitialized && isFetching))`

**File: `src/hooks/useStudyPlan.ts`**
- In `allDeckIds` memo: when plans are empty, fetch all active root deck IDs from a new query
- In `computed` memo: remove the `plans.length === 0` early return, provide fallback metrics without plan-specific data (no target date, no health status, just totals and simulation data)

**File: `src/pages/StudyPlan.tsx`**
- Remove the `if (plans.length === 0) { return ... }` gate
- Add a non-blocking "Criar objetivo" card inside the existing dashboard when `plans.length === 0`
- When no plans exist, hide the "Meus Objetivos" section and the "Status + Carga de Hoje" hero card
- Keep the "Configuracoes" (novos cards/dia) and "Simulador" sections always visible

