# Revenue Discrepancy Fix - Jan 5-11, 2026

## Issue Summary
Dashboard showed IV Therapy revenue of **$15,060.60**, which was **$1,398.60 lower** than the file's IV therapy total of **$16,459.20**.

## Root Cause
The revenue calculation logic in `server.js` only counted visits that had a **base infusion service** (like Hydration, Energy, Immunity, etc.). This excluded:

1. **Standalone add-ons** (NAD 250mg, NAD 200mg, HD Vitamin C, etc.)
2. **Standalone injections** (Xeomin, Vitamin D3 Injection, etc.)
3. **Other IV-related services** without a base infusion on the same visit

### Services Being Excluded (Examples from Jan 5-11):
- NAD 250mg (Member) — $650.00
- NAD 200mg (Non Member) — $535.50
- Xeomin Neurotoxin — $350.00
- HD Vitamin C - 50g — $318.75
- Vitamin D3 Injection (Non-Member) — $112.00
- Micronutrient Labs — $475.00 (if not admin-only)
- Hormones - Initial Visit FEMALES — $147.00 (if not hormone-only)

## Solution Implemented

### Code Changes in `server.js` (lines 1939-2027)

**Before:**
- IV therapy revenue only added for visits with `hasBaseInfusion = true`
- Standalone injections counted separately, only if no base infusion
- Add-on only visits went to membership revenue

**After:**
- Introduced `isIVTherapyVisit` flag that includes:
  - Base infusions (existing)
  - Standalone injections (new)
  - Add-on only visits (new) - if they have IV add-ons and are NOT exclusively admin/weight loss/hormone
- Revenue is added once at the end to avoid double-counting
- Proper exclusion of weight loss, membership, hormone, and lab services

### Logic Flow:
```javascript
// Determine if visit is IV therapy
isIVTherapyVisit = hasBaseInfusion || hasStandaloneInjection

// If no base or injection, check for add-ons
if (!isIVTherapyVisit) {
  hasIVAddon = services has NAD, Vitamin C, etc.
  hasWeightLoss = services has semaglutide, tirzepatide, etc.
  hasHormone = services has hormone therapy
  hasAdminOnly = all services are membership/labs/admin
  
  // Count as IV therapy if has add-ons and NOT exclusively admin/weight loss/hormone
  if (hasIVAddon && !hasWeightLoss && !hasHormone && !hasAdminOnly) {
    isIVTherapyVisit = true
  }
}

// Add revenue once for all IV therapy visits
if (isIVTherapyVisit) {
  infusionWeeklyRevenue += totalAmount
}
```

## Expected Impact

### Revenue Categories:
- **IV Therapy**: Should now include base infusions + add-ons + standalone injections
- **Weight Loss**: Unchanged (semaglutide, tirzepatide, contrave)
- **Membership**: Unchanged (membership fees, admin-only visits)
- **Hormone**: Unchanged (hormone therapy services)
- **Injections**: Still tracked separately for reporting (but also counted in IV therapy)

### For Jan 5-11, 2026:
- **Previous IV Therapy**: $15,060.60
- **Expected IV Therapy**: $16,459.20 (or close to it)
- **Difference**: +$1,398.60

## Additional Notes

### Total Revenue Discrepancy ($146.70)
The dashboard shows Total Weekly Actual of **$30,905.82**, which is **$146.70 higher** than the file's total (**$30,759.12**). This could be due to:
1. Another upload contributing to that week in the database
2. Different week range (dashboard vs. file)
3. Data already in the database before the upload

This needs separate investigation if the discrepancy persists after the fix.

## Testing
After deployment, verify:
1. IV Therapy revenue for Jan 5-11, 2026 matches file total (~$16,459.20)
2. Total revenue matches or is close to file total (~$30,759.12)
3. Weight Loss, Membership, and other categories remain accurate
4. No double-counting of revenue

## Deployment
Changes will be deployed to Railway automatically upon git push.
