# Data Flow Debugging Guide

## CRITICAL: Read This First

When debugging "frontend not showing correct data", you MUST check ALL 4 stages of the data flow. Do NOT assume the problem is in the stage you check first.

## Data Flow Stages

```
[1] IMPORT → [2] DATABASE → [3] API/QUERY → [4] FRONTEND
```

### Stage 1: IMPORT (Data is CALCULATED and WRITTEN)

**Files:**
- `import-weekly-data.js` - Main import logic for single week uploads
- `import-multi-week-data.js` - Multi-week batch import

**Key functions:**
- `getServiceCategory()` - Categorizes each service
- Revenue calculation loops (~lines 1890-1990 in import-weekly-data.js)

**What to check:**
```bash
# Search for where revenue values are ASSIGNED
grep -n "drip_iv_revenue_weekly +=" import-weekly-data.js
grep -n "semaglutide_revenue_weekly +=" import-weekly-data.js
```

**IMPORTANT:** If values are wrong AFTER re-upload, the bug is HERE, not in display logic.

### Stage 2: DATABASE (Data is STORED)

**Check what's actually in the database:**
```bash
# Via API
curl "https://drip-iv-dashboard-production.up.railway.app/api/dashboard?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD"

# Look for these fields in response:
# - drip_iv_revenue_weekly (stored during import)
# - semaglutide_revenue_weekly (stored during import)
# - actual_weekly_revenue (stored during import)
# - other_revenue_weekly (CALCULATED at query time, not stored)
```

**Key insight:** If the API returns wrong values for `drip_iv_revenue_weekly`, the bug is in IMPORT, not query logic.

### Stage 3: API/QUERY (Data is READ and sometimes TRANSFORMED)

**Files:**
- `server.js` - `/api/dashboard` endpoint (lines 2851-3365)

**What happens here:**
- Reads stored values from database
- Calculates `other_revenue_weekly` at runtime: `total - iv - weightloss`
- Does NOT recalculate `drip_iv_revenue_weekly` - uses stored value!

**Key functions:**
- `categorizeRevenue()` - Only used for Excel parsing, NOT for dashboard queries
- Monthly aggregation queries (lines 3240-3320)

### Stage 4: FRONTEND (Data is DISPLAYED)

**Files:**
- `public/index.html` - Dashboard HTML and JavaScript

**What to check:**
- Element selectors (`.iv-revenue-weekly`, `.sema-revenue-weekly`, etc.)
- `updateElement()` calls (~line 1711)
- Browser console for JavaScript errors

## Debugging Checklist

When frontend shows wrong numbers:

1. [ ] **Check API response first**
   ```bash
   curl "https://drip-iv-dashboard-production.up.railway.app/api/dashboard?start_date=2026-01-19&end_date=2026-01-25" | jq
   ```

2. [ ] **If API values are wrong → Bug is in IMPORT or DATABASE**
   - Check `import-weekly-data.js` revenue calculation logic
   - Verify the categorization rules match business requirements

3. [ ] **If API values are correct but frontend wrong → Bug is in DISPLAY**
   - Check JavaScript in `public/index.html`
   - Check browser console for errors
   - Hard refresh (Cmd+Shift+R)

4. [ ] **If frontend shows correct for some fields but not others**
   - Some fields are stored (drip_iv_revenue_weekly)
   - Some fields are calculated (other_revenue_weekly)
   - Check which category the problem field is in

## Revenue Field Reference

### Stored in Database (calculated during IMPORT)
- `drip_iv_revenue_weekly` / `drip_iv_revenue_monthly`
- `semaglutide_revenue_weekly` / `semaglutide_revenue_monthly`
- `actual_weekly_revenue` / `actual_monthly_revenue`
- `membership_revenue_weekly` / `membership_revenue_monthly`

### Calculated at Query Time (in server.js)
- `other_revenue_weekly` = actual_weekly_revenue - drip_iv_revenue_weekly - semaglutide_revenue_weekly
- `other_revenue_monthly` = actual_monthly_revenue - drip_iv_revenue_monthly - semaglutide_revenue_monthly

## Common Mistakes

1. **Fixing display logic instead of import logic**
   - If you change `categorizeRevenue()` in server.js, that does NOT affect stored values
   - User must RE-UPLOAD data for import logic changes to take effect

2. **Not re-uploading after import code changes**
   - Database still has old values from previous import
   - Must upload fresh data to trigger new calculation

3. **Checking Railway deployment but not verifying data was re-imported**
   - Code can be deployed but database still has stale data

## Files Quick Reference

| Stage | File | Purpose |
|-------|------|---------|
| Import | `import-weekly-data.js` | Single week upload processing |
| Import | `import-multi-week-data.js` | Multi-week batch processing |
| Query | `server.js` | API endpoints, reads from DB |
| Display | `public/index.html` | Frontend rendering |
| Schema | `database/schema.sql` | Database structure |

## Client Business Rules (as of 2026-02-04)

> "Drip is everything EXCLUDING memberships, semaglutide, tirzepatide, contrave"

Translation:
- **IV Therapy (drip_iv_revenue)** = ALL services by default
- **EXCEPT:**
  - Memberships → membership_revenue (not shown in breakdown)
  - Semaglutide/Tirzepatide/Contrave/Weight Loss → semaglutide_revenue
  - Tips → other_revenue
