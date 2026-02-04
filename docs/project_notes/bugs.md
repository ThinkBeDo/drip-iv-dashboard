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
