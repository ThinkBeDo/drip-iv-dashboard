# TASKS

- [x] Run Jan 5-11, 2026 validation: verify $10,199 weight loss, $16,459.20 IV therapy, 90 infusions, non-member > 0
- [x] Use `/api/validate` on test week and capture included/excluded breakdown
- [x] Upload Active Memberships file and confirm membership counts are populated (parsed 118 members; DB upload ready)
- [x] Add "Other Revenue" to reconcile totals with IV Therapy + Weight Loss
- [ ] Verify membership registry behavior on re-upload
- [ ] Test XLSX upload and UTF-16 .xls fallback
- [x] Investigate any remaining total revenue discrepancy - ROOT CAUSE: expected values used 'Charges' column (pre-discount $16,414), dashboard correctly uses 'Calculated Payment' (post-discount $15,060.60)
- [x] Check for duplicate week rows in database - no duplicates found
- [ ] Add a lightweight test script or checklist for expected values
- [x] Record any new bugs/decisions in docs/project_notes/*
- [x] Update stale Railway DATABASE_URL in diagnose-database.js (yamanote.proxy.rlwy.net:16060)

## Next Session
- [ ] Download latest week's data from Optimantra (Patient Analysis with Charge Details & Payments)
- [ ] User provides raw files to Claude for independent calculation
- [ ] Claude calculates expected values from raw data (using 'Calculated Payment' column)
- [ ] User runs web app upload and shows dashboard results
- [ ] Compare Claude's calculations vs dashboard - troubleshoot any mismatches
- [ ] Also download and upload latest Active Memberships file to verify 118 members populate
