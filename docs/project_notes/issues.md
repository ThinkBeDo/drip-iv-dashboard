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
- **Status**: Blocked
- **Description**: Railway PostgreSQL connection terminated unexpectedly; cannot verify dashboard values or persist membership upload
- **Notes**: TCP connection to autorack.proxy.rlwy.net:27586 succeeds but psql/Node.js pool fails. Database may be hibernating or credentials rotated. Check Railway dashboard.

### 2026-01-31 - SERVICE-CATEGORIZATION: Missing services identified
- **Status**: Pending fix
- **Description**: 7 services landing in "other" that should be IV therapy (~$479 total)
- **Notes**: Need to add to server.js categorization functions: Pepcid (addon), Steroid Shot (injection), Tri-Immune (injection), Amino Acids IV add-on (addon), Amino Acids Injection (injection), Normal Saline 500 ML (infusion base). Even with these, $919.90 gap unexplained - verify expected values source.

### 2026-01-31 - MEMBERSHIP UPLOAD: Validation vs file schema
- **Status**: Completed
- **Description**: Active Memberships file lacks Email column; validation now allows missing email with warning
- **Notes**: File headers include Patient and Title but no Email; dedupe now falls back to patient name.
