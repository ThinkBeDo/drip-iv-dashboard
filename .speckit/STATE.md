# STATE

## Status
- Date: 2026-02-04
- Summary: Added "Other Revenue" to reconcile Total Weekly/Monthly Actual with IV Therapy + Weight Loss. Clarified metrics documentation to match code behavior.

## What Changed This Session
- Computed `other_revenue_weekly/monthly` in `/api/dashboard` to reconcile totals
- Added "Other Revenue" rows to weekly/monthly revenue cards in `public/index.html`
- Updated `docs/DASHBOARD_METRICS.md` to define Other Revenue and clarify totals
- Logged the change in `docs/project_notes/issues.md`

## Next Step
- Verify Jan 19–25, 2026 week: IV + Weight Loss + Other = Total Weekly Actual
- Optional: Provide DATABASE_URL for read-only verification against Railway

## Blockers
- None - Railway DB now accessible with updated connection string
