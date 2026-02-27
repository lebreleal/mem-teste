
## Bug: Dashboard shows 20 new cards but study queue returns 0

### Root Cause

There is an inconsistency in how the **global daily new card limit** (`daily_new_cards_limit` / `weekly_new_cards` from the user profile) is applied:

| Component | Applies global limit? | Result |
|---|---|---|
| Dashboard Carousel (no plan) | NO - passes `undefined` | Shows 20 new |
| Deck Detail page | YES - always | Shows 0 new |
| Study Queue (`fetchStudyQueue`) | YES - always | Returns 0 cards |

### Why it happens

In `src/pages/Dashboard.tsx` (line 359):
```text
globalNewRemaining={hasPlan ? state.globalNewRemaining : undefined}
```

When there is no active study plan, `globalNewRemaining` is passed as `undefined` to the carousel. Inside `getDeckTodayStats`, this causes the carousel to use only the **deck-level limit** (default 20), ignoring the global cap entirely.

Meanwhile, the study queue in `studyService.ts` ALWAYS fetches the profile's `daily_new_cards_limit` and `weekly_new_cards`, applying it as a hard cap. If the user has already studied enough new cards from other decks today to exhaust this global limit, the study queue returns 0 cards -- but the carousel still shows 20.

### Fix

**File: `src/pages/Dashboard.tsx`** (line 359)
- Always pass `globalNewRemaining` to the carousel, regardless of whether a plan is active:
```text
globalNewRemaining={state.globalNewRemaining}
```

This ensures the carousel display matches what the study queue will actually deliver.

### Technical Details

- `globalNewRemaining` is computed in `useDashboardState.ts` as `Math.max(0, todayGlobalLimit - globalNewReviewedToday)` and already handles both plan and non-plan scenarios correctly (scoping to plan roots when a plan exists, or all roots otherwise).
- No changes needed to `studyService.ts` or `DeckDetailContext.tsx` -- they already apply the global limit correctly.
- The `Study.tsx` progress counter fix from the previous edit is unrelated and did not introduce this bug.
