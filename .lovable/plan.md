

## Fix: Carousel deck cards ignoring deck-level limits when no plan is active

### Problem

After the previous fix that always passes `globalNewRemaining` to the carousel, the individual deck cards (Histologia, Anatomia) in the top carousel section now use the global limit instead of deck-level limits. This causes them to show "0 new" when the global limit is exhausted, even though deck-level limits allow more cards.

The banner totals (138 new, 10 learning, 10 review) are correct because `allDecksStats` already uses deck-level limits when no plan exists. But each `DeckStudyCard` receives `globalNewRemaining` and uses it to cap new cards.

### Root Cause

In `src/pages/Dashboard.tsx` line 359, `globalNewRemaining` is always passed to the carousel. Inside `DeckCarousel.tsx`, each `DeckStudyCard` receives this value (line 283) and `getDeckTodayStats` uses it as a cap (line 42-44). When no plan is active, `globalNewRemaining` should not be passed to individual deck cards.

### Fix

**File: `src/pages/Dashboard.tsx`** (line 359)

Revert to only passing `globalNewRemaining` when a plan is active:

```
globalNewRemaining={hasPlan ? state.globalNewRemaining : undefined}
```

This was the original code before the earlier fix. The earlier fix was addressing a different issue (dashboard deck list showing wrong counts), which is now correctly handled by the `useDashboardState.ts` change to `getAggregateStats`. The carousel has its own independent stats calculation (`getDeckTodayStats`) that already handles the no-plan case correctly by using deck-level limits when `globalNewRemaining` is undefined.

### Why this is safe

- The deck list section (bottom) uses `getAggregateStats` from `useDashboardState.ts` -- already fixed to use only deck limits when no plan
- The carousel banner uses `allDecksStats` -- already correct, uses deck limits when no plan
- The carousel deck cards use `getDeckTodayStats` -- correctly uses deck limits when `globalNewRemaining` is `undefined`
- When a plan IS active, `globalNewRemaining` continues to be passed and everything works as before
