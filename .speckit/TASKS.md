# TASKS

- [x] Run Jan 5-11, 2026 validation: verify $10,199 weight loss, $16,459.20 IV therapy, 90 infusions, non-member > 0
- [x] Use `/api/validate` on test week and capture included/excluded breakdown
- [ ] Upload Active Memberships file and confirm membership counts are populated (blocked: requires DATABASE_URL)
- [ ] Verify membership registry behavior on re-upload (blocked: requires DATABASE_URL)
- [ ] Test XLSX upload and UTF-16 .xls fallback (blocked: requires DATABASE_URL for upload endpoints)
- [ ] Investigate any remaining total revenue discrepancy (e.g., $146.70)
- [ ] Check for duplicate week rows in database if discrepancies persist (blocked: requires DATABASE_URL)
- [ ] Add a lightweight test script or checklist for expected values
- [x] Record any new bugs/decisions in docs/project_notes/*
