# Bug Log

Keep entries brief and chronological. Each entry should include date, issue, solution, and prevention notes if applicable.

## Format

### YYYY-MM-DD - Brief Description
- **Issue**: What went wrong
- **Root Cause**: Why it happened
- **Solution**: How it was fixed
- **Prevention**: How to avoid it in the future

### 2026-01-31 - Membership upload rejected valid file (missing email)
- **Issue**: `/api/upload-memberships` rejected the Active Memberships file because it has no Email column.
- **Root Cause**: Validation required Email/Email Address despite the real file only having Patient and Title.
- **Solution**: Made email optional; warn and dedupe by patient name when email is missing.
- **Prevention**: Validate against real source files before enforcing required columns.

### 2026-01-31 - Services miscategorized as "other" causing revenue undercount
- **Issue**: ~$376 of IV Therapy revenue was being categorized as "other"; 7 injections not counted.
- **Root Cause**: Service categorization logic missing patterns for Pepcid, Steroid Shot, Tri-Immune, Amino Acids, Normal Saline 500 ML.
- **Solution**: Added missing services to `isBaseInfusionService()`, `isInfusionAddon()`, `isStandaloneInjection()` in import-weekly-data.js.
- **Prevention**: When new services are added to OptiMantra, check if they need categorization rules.

### 2026-02-04 - Customer counts inflated when viewing aggregated multi-week data
- **Issue**: Customer Analytics showed inflated unique customer counts (e.g., 200+ instead of ~80) when viewing aggregated date ranges.
- **Root Cause**: SQL aggregation query used `SUM(unique_customers_weekly)` which incorrectly added per-week unique counts. Same customer appearing in multiple weeks was counted multiple times.
- **Solution**: Changed `SUM()` to `MAX()` for customer count fields in server.js (lines 2956-2959). Added warning flag when viewing aggregated data.
- **Prevention**: For "unique" counts, never use SUM() in aggregation queries. Use MAX() or recalculate from raw data.

### 2026-02-04 - Documentation stated IV Therapy includes injections (incorrect)
- **Issue**: Client expected IV Therapy revenue to include injections based on DASHBOARD_METRICS.md documentation.
- **Root Cause**: Documentation was written incorrectly; code has always excluded standalone injections from IV Therapy revenue.
- **Solution**: Updated DASHBOARD_METRICS.md to clarify IV Therapy = base_infusion + infusion_addon only. Injections tracked separately.
- **Prevention**: When documenting metrics, verify against actual code behavior, not assumptions.

### 2026-02-04 - Service categorization fix not applied to server.js (revenue ~$748 short)
- **Issue**: Dashboard IV Therapy revenue showing $15,064 instead of client's calculated $15,812 (~$748 difference).
- **Root Cause**: 2026-01-31 fix added missing services to import-weekly-data.js but NOT to server.js. The /api/dashboard endpoint uses server.js categorization functions.
- **Solution**: Added missing services to server.js: 'pepcid', 'amino acid' in isInfusionAddon(); 'steroid shot', 'tri-immune', 'tri immune' in isStandaloneInjection().
- **Prevention**: When fixing service categorization, ensure ALL files with categorization logic are updated (server.js, import-weekly-data.js, analyze-latest-data.js).

### 2026-02-04 - Revenue categorization defaulting to "Other" instead of "IV Therapy"
- **Issue**: IV Therapy revenue still $748 short ($15,064.05 vs expected $15,812.80). "Other Revenue" showing $4,548.54.
- **Root Cause**: The `categorizeRevenue()` function in server.js defaulted unmatched services to `other_revenue`. Client rule: "Drip is everything EXCLUDING memberships, semaglutide, tirzepatide, contrave."
- **Solution**:
  1. Changed default return from `other_revenue` to `drip_iv_revenue` in categorizeRevenue()
  2. Moved 'Contrave Office Visit' from other_revenue to semaglutide_revenue (it's weight loss)
  3. Only TOTAL_TIPS remains in other_revenue category
- **Prevention**: Client's business rules should be documented upfront. Default should be the most common category (IV Therapy), not "other".

### 2026-02-04 - Railway not deploying latest commits
- **Issue**: After pushing commits, dashboard not reflecting changes. User saw old behavior.
- **Root Cause**: Railway showing commit `98d278ee` (not in git history) instead of latest `acd2998`. Possible stale deployment or GitHub webhook issue.
- **Solution**: Pushed empty commit to trigger redeploy: `git commit --allow-empty -m "trigger: force Railway redeploy"`
- **Prevention**: Always verify Railway deployment commit hash matches latest push before debugging code issues.
