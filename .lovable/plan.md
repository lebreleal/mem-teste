

## Bug Fix: Last card in session loops infinitely

### Problem
When the user finishes the last card in a study session, the completion screen ("Sessao Completa!") never appears. Instead, the same card keeps reappearing and can be reviewed indefinitely.

### Root Cause
In `src/pages/Study.tsx` (lines 107-112), the `displayedCard` state is only updated when `nextCard` is truthy:

```text
useEffect(() => {
  if (!isTransitioning && nextCard) {   // <-- never clears displayedCard
    setDisplayedCard(nextCard);
  }
}, [cardKey, isTransitioning]);

const currentCard = displayedCard ?? nextCard;
```

When the last card is removed from `localQueue`, `nextCard` becomes `null`, but `displayedCard` retains the old card. Since `currentCard = displayedCard ?? nextCard`, it resolves to the stale card, preventing the completion screen from rendering. The user can then re-submit reviews on this ghost card infinitely.

### Fix
**File:** `src/pages/Study.tsx`

Change the `useEffect` to always sync `displayedCard` with `nextCard` (including `null`):

```typescript
useEffect(() => {
  if (!isTransitioning) {
    setDisplayedCard(nextCard);
  }
}, [cardKey, isTransitioning]);
```

By removing the `&& nextCard` guard, when the queue empties and `nextCard` is `null`, `displayedCard` will also be set to `null`, allowing `currentCard` to become `null` and triggering the "Sessao Completa!" screen.

### Risk Assessment
- **Low risk**: The guard `!isTransitioning` still prevents mid-animation flicker.
- The `nextCard` guard was originally added to prevent the displayed card from disappearing during transitions, but `isTransitioning` already handles that case.
- No other files need changes.

