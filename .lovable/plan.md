

## Bug: Global profile limit silently overrides deck-level limit

### Problem

There are **two separate limits** controlling new cards per day:

1. **Deck-level limit** (`daily_new_limit` on the deck) -- the one you changed to 100
2. **Global profile limit** (`daily_new_cards_limit` on your profile) -- defaults to 30

Even after increasing the deck limit to 100, the global profile limit (30) still caps everything. After studying 30 new cards today, `globalRemaining = 30 - 30 = 0`, so the system shows 0 new cards regardless of the deck setting.

### Root Cause

The global profile limit (`daily_new_cards_limit`) was designed for the Study Plan feature but is **always applied**, even without an active plan. Its default value of 30 silently restricts all decks.

### Fix

When there is **no active study plan**, the global profile limit should NOT be applied. Only the deck-level limit should govern new cards. This matches the expected behavior: if a user explicitly sets a deck to 100 new/day, that should be respected.

**3 files need the same logic change:**

1. **`src/services/studyService.ts`** (the actual study queue)
   - When no plan exists, use only `deckRemaining` instead of `Math.min(deckRemaining, globalRemaining)`

2. **`src/components/deck-detail/DeckDetailContext.tsx`** (deck detail page counters)
   - Same change: skip `globalRemaining` when `!isPlanControlled`

3. **`src/components/dashboard/useDashboardState.ts`** (dashboard carousel counters)
   - Same change: when no plan is active, use only deck limit

### Technical Details

In each file, the change is the same pattern:

**Before:**
```text
// No plan: min(deck, global)
effectiveNew = Math.min(deckRemaining, globalRemaining)
```

**After:**
```text
// No plan: only deck limit applies (global limit is a Study Plan feature)
effectiveNew = deckRemaining
```

When a plan IS active, the global limit continues to work as before -- it governs the shared pool across all plan decks.

This ensures that:
- Users without a Study Plan get exactly what their deck settings say
- Users WITH a Study Plan get the global cap behavior they configured
- Changing a deck's limit to 100 immediately shows the remaining cards
