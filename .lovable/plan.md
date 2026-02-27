

## Fix: Easy graduation should produce a larger interval than Good

### Problem

When a learning card reaches its last step, pressing "Bom" (Good) and "Facil" (Easy) show the **same interval** (e.g., both 6d). This happens because `graduateToReview()` uses the same stability for both -- the only difference is `minDays` (1 vs 4), which has no effect when the computed interval already exceeds 4.

In Anki's FSRS implementation, Easy graduation applies a **bonus multiplier** to produce a meaningfully larger interval than Good.

### Is the 2-review graduation correct?

Yes. With default learning steps `[1, 10]`, the flow is:
1. New card → "Bom" → 10min (advance to step 1)
2. Step 1 → "Bom" → graduate to review (6d)

This matches Anki behavior. The user's concern about "graduating too fast" is unfounded -- this is standard.

### Fix

**File: `src/lib/fsrs.ts`**

Apply the easy bonus multiplier (`w[16]`) to the stability when graduating via Easy from learning/relearning states. This ensures Easy always produces a larger interval than Good.

Changes in the **State 1/3 (Learning/Relearning)** section:

**Before (line 216-217):**
```
// Easy -> graduate directly with minimum 4 days
return graduateToReview(w, s, d, requestedRetention, maximumInterval, 4);
```

**After:**
```
// Easy -> graduate with easy bonus applied to stability
const easyS = s * w[16]; // w[16] = easy bonus (1.8729)
return graduateToReview(w, easyS, d, requestedRetention, maximumInterval, 4);
```

Same change in **State 0 (New card)** section (line 185-186):

**Before:**
```
return graduateToReview(w, s, d, requestedRetention, maximumInterval, 4);
```

**After:**
```
const easyS = s * w[16];
return graduateToReview(w, easyS, d, requestedRetention, maximumInterval, 4);
```

### Expected Result

With default params and stability ~2.3 (w[2] for Good on new card):
- **Bom**: interval from S=2.3 → ~4-6d
- **Facil**: interval from S=2.3 * 1.87 = ~4.3 → ~8-11d

This matches Anki's behavior where Easy always gives a substantially longer interval during graduation.

### Files Changed

1. `src/lib/fsrs.ts` -- Apply w[16] easy bonus to stability during Easy graduation (2 locations: state 0 and state 1/3)

