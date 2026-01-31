# Issues and Work Log

Keep a lightweight log of work completed or in progress.

## Format

### YYYY-MM-DD - TICKET-ID: Brief Description
- **Status**: Completed / In Progress / Blocked
- **Description**: 1-2 line summary
- **URL**: Link to ticket (if available)
- **Notes**: Any important context

### 2026-01-31 - VALIDATION: Jan 5-11, 2026 file review
- **Status**: In Progress
- **Description**: Ran `/api/validate` and local parsing on weekly file to compare expected metrics
- **Notes**: Weight loss revenue matches ($10,199). IV therapy revenue computed at $15,060.60 (expected $16,459.20). Infusion count from base-infusion logic is 71 (expected 90). Non-member customers > 0 (118). Need to reconcile expected values vs file or expand service categorization.

### 2026-01-31 - MEMBERSHIP UPLOAD: Validation vs file schema
- **Status**: Completed
- **Description**: Active Memberships file lacks Email column; validation now allows missing email with warning
- **Notes**: File headers include Patient and Title but no Email; dedupe now falls back to patient name.
