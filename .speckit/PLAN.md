# PLAN

## Current Focus: Verification + Remaining Gaps

### 0) Reconcile Revenue Breakdown (Completed)
- Add "Other Revenue" line so IV + Weight Loss + Other = Total Weekly/Monthly Actual

### 1) Validate Recent Fixes (Jan 5-11, 2026 test week)
- Verify revenue and counts match expected values after row-level changes
- Use `/api/validate` to inspect included/excluded rows and rollups
- Confirm non-member counts are > 0 and membership counts behave as expected

### 2) Membership Data Pipeline
- Upload Active Memberships file and confirm dashboard membership counts populate
- Verify membership registry logic behaves on re-uploads (no double counting)

### 3) File Upload Coverage
- Confirm XLSX works (Google Sheets export)
- Confirm UTF-16 TSV fallback handles problematic .xls
- Document any parsing errors and update schema validation if needed

### 4) Investigate Remaining Discrepancies (if any)
- Re-check total revenue discrepancies (e.g., $146.70 noted in Jan 5-11)
- Ensure database does not contain stale or duplicate week data
- Validate monthly totals are aggregated across all weeks present

### 5) Automation + Documentation
- Add lightweight test script for expected values (Jan 5-11, 2026)
- Update docs/project_notes if new bugs/decisions emerge
- Prepare brief validation summary for stakeholder review
