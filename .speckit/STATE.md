# STATE

## Status
- Date: 2026-01-31
- Summary: **ROOT CAUSE FOUND** - Expected values ($16,459.20 IV, 90 infusions) used 'Charges' column (pre-discount). Dashboard correctly uses 'Calculated Payment' (post-discount $15,060.60, 71 infusions). Database verified, no duplicates. Updated stale Railway connection string.

## What Changed This Session
- Traced raw Excel data column-by-column to find discrepancy source
- 'Charges' column IV total = $16,414 (matches expected); 'Calculated Payment' = $15,060.60 (dashboard value)
- Member discounts on IV services = $879.60 explains most of the gap
- Updated diagnose-database.js with new Railway URL (yamanote.proxy.rlwy.net:16060)
- Documented root cause in docs/project_notes/issues.md

## Next Step
- Optional: Add 7 missing services to categorization (Pepcid, Steroid Shot, Tri-Immune, Amino Acids, Normal Saline 500 ML) - adds ~$479 to IV total
- Can now upload memberships (118 members parsed, DB accessible)

## Blockers
- None - Railway DB now accessible with updated connection string
