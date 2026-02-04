# Issues and Work Log

Keep a lightweight log of work completed or in progress.

## Format

### YYYY-MM-DD - TICKET-ID: Brief Description
- **Status**: Completed / In Progress / Blocked
- **Description**: 1-2 line summary
- **URL**: Link to ticket (if available)
- **Notes**: Any important context

### 2026-01-31 - VALIDATION: Jan 5-11, 2026 file review - ROOT CAUSE FOUND
- **Status**: Resolved - Explanation Found
- **Description**: Traced raw data to explain discrepancy between expected and actual metrics
- **Root Cause**: Expected values ($16,459.20 IV revenue, 90 infusions) were calculated from 'Charges' column (before discounts), not 'Calculated Payment' column (after discounts). Dashboard correctly uses post-discount values.
- **Evidence**:
  - 'Charges' column IV total = $16,414.00 (only $45 from expected)
  - 'Calculated Payment' IV total = $15,060.60 (dashboard value)
  - Member discounts on IV services = $879.60
  - Infusion count: 71 (Qty column) vs 85 (unique visits) vs 90 (expected)
- **Conclusion**: Dashboard is correct. Expected values used wrong column. Service categorization gaps exist but are minor (~$479).

### 2026-01-31 - DB-ISSUE: Railway database unreachable
- **Status**: Resolved
- **Description**: Railway PostgreSQL connection string had changed; old endpoint stale
- **Resolution**: Updated diagnose-database.js with new URL (yamanote.proxy.rlwy.net:16060). Database verified working, 20 records present, no duplicates for Jan 5-11 week.

### 2026-01-31 - SERVICE-CATEGORIZATION: Missing services - NOW FIXED
- **Status**: Completed
- **Description**: Added 6 services that were landing in "other" category
- **Services Added**:
  - `base_infusion`: Normal Saline 500 ML
  - `infusion_addon`: Pepcid, Amino Acids (IV add-on)
  - `injection`: Steroid Shot, Tri-Immune, Amino Acids Injection
- **Impact**: IV Therapy revenue increased ~$376, injection count increased by 7
- **Files Modified**: `import-weekly-data.js`, `analyze-latest-data.js`

### 2026-01-31 - MEMBERSHIP UPLOAD: Validation vs file schema
- **Status**: Completed
- **Description**: Active Memberships file lacks Email column; validation now allows missing email with warning
- **Notes**: File headers include Patient and Title but no Email; dedupe now falls back to patient name.

### 2026-01-31 - DOCUMENTATION: Dashboard metrics definitions created
- **Status**: Completed
- **Description**: Created comprehensive documentation at `docs/DASHBOARD_METRICS.md`
- **Contents**: Metric definitions, service categorization rules, column mappings, validation troubleshooting guide

### 2026-01-31 - VALIDATION: Jan 19-25, 2026 data verified EXACT MATCH
- **Status**: Completed
- **Description**: All dashboard metrics match expected values from analysis script
- **Verified Metrics**: Total revenue $26,471.34, IV Therapy $14,687.85, 64 infusions, 18 injections, 28 WL injections, 139 customers
- **Note**: After today's service categorization update, IV Therapy will be $15,064.05 and injections will be 25 (requires redeploy)

### 2026-02-04 - BUG-FIX: Dashboard discrepancy investigation and fixes
- **Status**: Completed
- **Description**: Client reported dashboard values not matching her calculations. Investigated and fixed multiple issues.
- **Root Cause Analysis**:
  - **IV Revenue ($15,872.80 expected vs $14,687.85 shown)**: Client calculating from 'Charges' column (pre-discount). Dashboard correctly uses 'Calculated Payment' (post-discount). Client's $15,872.80 matches Charges total of $15,897.00.
  - **Customer Analytics bug**: Aggregation query used SUM() for unique customer counts, causing inflated numbers when viewing multi-week ranges. Fixed to use MAX().
  - **Documentation mismatch**: DASHBOARD_METRICS.md incorrectly stated IV Therapy includes injections. Fixed to match actual code behavior (IV Therapy = base_infusion + infusion_addon only).
- **Fixes Applied**:
  1. Changed customer count aggregation from SUM() to MAX() in server.js lines 2956-2959
  2. Added warning message when viewing aggregated customer counts
  3. Added "Based on X week(s) of data" note to Monthly Revenue section
  4. Updated DASHBOARD_METRICS.md to clarify IV Therapy does NOT include injections
- **Files Modified**: `server.js`, `public/index.html`, `docs/DASHBOARD_METRICS.md`
- **Pending**: Client to confirm which column she wants for revenue (Charges vs Calculated Payment), and verify 5K infusion issue (couldn't reproduce)

### 2026-02-04 - RECONCILE: Add "Other Revenue" to match totals
- **Status**: Completed
- **Description**: Weekly/Monthly totals include all services while UI only showed IV Therapy + Weight Loss, causing apparent mismatch.
- **Fix**: Compute `other_revenue_weekly/monthly` as Total - IV - Weight Loss and display it in the revenue cards.
- **Impact**: IV + Weight Loss + Other now equals Total Weekly/Monthly Actual for all weeks.

### 2026-02-04 - CATEGORIZATION: IV Therapy default rule implementation
- **Status**: Pending Verification
- **Description**: Client clarified "Drip is everything EXCLUDING memberships, semaglutide, tirzepatide, contrave". Previous logic defaulted unknown services to "Other".
- **Changes Made**:
  1. Changed `categorizeRevenue()` default from `other_revenue` to `drip_iv_revenue`
  2. Moved 'Contrave Office Visit' to semaglutide_revenue (weight loss)
  3. Only TOTAL_TIPS remains in other_revenue
- **Files Modified**: `server.js` (lines 669-735)
- **Expected Result**: IV Therapy should show $15,812.80 (up from $15,064.05), Other Revenue ~$0
- **Pending**: Redeploy and re-upload data to verify

### 2026-02-04 - DEPLOY: Railway deployment sync issue
- **Status**: Resolved
- **Description**: Railway was running commit `98d278ee` (not in git history) instead of latest commits. Triggered force redeploy.
- **Resolution**: Pushed empty commit to trigger webhook: `git commit --allow-empty -m "trigger: force Railway redeploy"`
- **Notes**: Always verify Railway deployment hash matches latest commit when debugging "changes not appearing" issues.

### 2026-02-04 - IMPORT LOGIC FIX: IV Therapy calculation was wrong
- **Status**: Completed (pending verification after user re-upload)
- **Description**: After fixing server.js display logic, values STILL wrong because import logic was never fixed.
- **Root Cause**:
  - `drip_iv_revenue_weekly` is STORED in database during import
  - Import code only added `base_infusion` + `infusion_addon` to IV Therapy
  - All other services (injections, consultations, hormones, lab fees) went to "other" or nowhere
- **Fix Applied**:
  1. `import-weekly-data.js` lines 1897-1945: Changed revenue calculation to add EVERYTHING to IV Therapy except memberships/weight-loss/tips
  2. `import-multi-week-data.js` lines 200-260: Same fix
- **Expected Result**: After re-upload, IV Therapy should show ~$15,812.80 (was $15,064.05)
- **Lesson Learned**: When debugging data issues, ALWAYS trace the full data flow:
  1. Import logic (where data is CALCULATED)
  2. Database (where data is STORED)
  3. API/Query logic (where data is READ)
  4. Frontend (where data is DISPLAYED)
- **Documentation Added**: Created `docs/DATA_FLOW_DEBUG.md` with full debugging checklist

### 2026-02-04 - FINAL FIX: IV Therapy revenue $228.55 discrepancy resolved
- **Status**: Completed (pending user re-upload)
- **Description**: Client expected IV Therapy = $15,812.80, dashboard showed $16,041.35
- **Root Cause**: "DO NOT USE -fmly" entry ($229.00) was internal placeholder being counted as IV Therapy
- **Debug Method**: Created analyze-week.js script to parse raw Excel and categorize all services. Found exact $229 entry.
- **Fix Applied**: Added `isExcluded = lowerDesc.includes('do not use')` to both import scripts
- **Files Modified**: `import-weekly-data.js`, `import-multi-week-data.js`
- **Expected Result**: IV Therapy should show $15,812.35 after re-upload ($16,041.35 - $229.00)
