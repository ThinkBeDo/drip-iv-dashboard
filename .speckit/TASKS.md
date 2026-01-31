# TASKS

- [x] Run Jan 5-11, 2026 validation: verify $10,199 weight loss, $16,459.20 IV therapy, 90 infusions, non-member > 0
- [x] Use `/api/validate` on test week and capture included/excluded breakdown
- [x] Upload Active Memberships file and confirm membership counts are populated (parsed 118 members; DB upload ready)
- [ ] Verify membership registry behavior on re-upload
- [ ] Test XLSX upload and UTF-16 .xls fallback
- [x] Investigate any remaining total revenue discrepancy - ROOT CAUSE: expected values used 'Charges' column (pre-discount $16,414), dashboard correctly uses 'Calculated Payment' (post-discount $15,060.60)
- [x] Check for duplicate week rows in database - no duplicates found
- [ ] Add a lightweight test script or checklist for expected values
- [x] Record any new bugs/decisions in docs/project_notes/*
- [x] Update stale Railway DATABASE_URL in diagnose-database.js (yamanote.proxy.rlwy.net:16060)
