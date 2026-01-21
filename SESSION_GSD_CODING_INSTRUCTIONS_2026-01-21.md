# GSD Coding Instructions - 2026-01-21

## Context and inputs reviewed
- Session task tracker: `Session GSD focus file - 01-21-26`
- Weekly data file: `Patient Analysis (Charge Details & Payments) - V3  - With COGS (2).xls`
- Code touchpoints: `server.js`, `public/index.html`

## Repo rules note
No `AGENTS.md` or other explicit "global rules" file exists in this repo. If there is an external rules file, add it to the repo or point to it before implementation.

## Weekly data file summary (2026-01-05 to 2026-01-11)
- Format: UTF-16 tab-separated text with .xls extension
- Columns (18): `Practitioner`, `Date`, `Date Of Payment`, `Patient`, [blank patient id column], `Patient State`, `Patient Zip`, `Super Bill`, `Charge Type`, `Charge Desc`, `Metrics`, `Charges`, `Total Discount`, `Tax`, `Charges - Discount`, `Calculated Payment (Line)`, `COGS`, `Qty`
- Charge types observed: `PROCEDURE` (132), `OFFICE_VISIT` (116), `TOTAL_TIPS` (31), `LAB` (4), `gift card ` (2), `referral credit` (1), `OTHER_SERVICES` (1), empty (1)
- Charge desc sample: `Membership - Individual`, `Tirzepatide Monthly`, `Semaglutide Weekly`, `Vitamin B12 Injection (Non Member)`, `TOTAL_TIPS`
- Count indicators: ~98 rows with `Non Member` or `Non-Member`, ~83 rows with `Member` (excluding Non Member), 29 membership rows, 31 tips rows, 3 gift-card rows

## Priority fixes (from session task list)

### 1) Revenue filtering and totals
Goal: membership, gift cards, and tips must NOT count as revenue in the primary totals.

Implementation notes:
- In `server.js` within `extractFromCSV`:
  - Introduce explicit helper checks for exclusions:
    - tips: `Charge Type == 'TOTAL_TIPS'` or `Charge Desc` contains `TOTAL_TIPS`
    - gift cards: `Charge Type` contains `gift card` or `Charge Desc` contains `gift card`
    - memberships: `Charge Desc` contains `membership` (exclude from revenue totals, but still track membership_revenue)
    - referral credits/refunds: already filtered, keep this logic
  - Apply the exclusion logic in BOTH of these locations:
    - the initial `filteredData` pipeline
    - the direct weekly/monthly totals calculation
  - Keep membership revenue in its own bucket (`membership_revenue_*`) but exclude it from `actual_*_revenue` and IV therapy totals.
- Ensure the total weekly revenue is the sum of eligible non-membership line items only.

Validation targets (from session notes):
- IV therapy revenue should equal $16,560.20 for the target week
- Total revenue discrepancy of ~$1,000 should be resolved by the filter changes

### 2) Weight loss income calculation
Goal: weight loss income is based on semaglutide + tirzepatide (+ contrave if present).

Implementation notes:
- In `extractFromCSV`, stop using visit-level totals for weight loss revenue; sum at the row level to avoid missing multi-service days.
- Ensure both weekly/monthly counters include:
  - `Semaglutide Weekly`, `Semaglutide Monthly`
  - `Tirzepatide Weekly`, `Tirzepatide Monthly`
  - `Contrave` if present
- Keep consult counts separate from injection counts as currently designed.

Validation target:
- Weight loss income should equal $10,199 for the test week

### 3) IV therapy revenue
Goal: include all services except memberships, gift cards, and tips.

Implementation notes:
- IV therapy revenue should be computed per row (not per visit) so multiple services on the same day are all included.
- Ensure IV therapy revenue includes add-ons and injections unless business rules explicitly exclude them. If the client wants a narrower definition (base infusion only), confirm before limiting.

### 4) Service counts must be service-level (not patient-level)
Goal: count each service line item, not each patient visit.

Implementation notes:
- Replace the patient+date `visitMap` counting with per-row counts.
- Use `Qty` as a multiplier if present; default to 1 if blank.
- Infusions: count rows that match `isBaseInfusionService` (and optionally `isInfusionAddon` if add-ons should count as services). Do NOT dedupe by patient/date.
- Injections: count rows that match `isStandaloneInjection` only.
- Keep weekday/weekend split based on each row's date.

Validation targets:
- Infusions total should match manual count (90 for the test week).
- Example: a patient with 4 services in one day must count as 4.

### 5) Non-member customer analytics
Goal: non-member customers should be > 0 for the test week.

Implementation notes:
- Build `weeklyCustomers`, `memberCustomers`, and `nonMemberCustomers` from rows rather than visits.
- Derive membership status based on `Charge Desc`:
  - Member if `member` is present and `non-member` is not.
  - Non-member if `non-member` is present.
- If a patient has both member and non-member rows in the same week, treat them as a member (document this rule in code comments).

### 6) File upload support (XLS + XLSX)
Goal: accept Optimantra XLS and Google Sheets XLSX.

Implementation notes:
- `/api/upload` already accepts `.xls` and `.xlsx`; verify `/api/upload-memberships` also enforces the same.
- Add a fallback in `extractFromExcel` for UTF-16 TSV files (like the provided `.xls`):
  - If `XLSX.readFile` fails, read as UTF-16 TSV and pass the parsed rows into `extractFromCSV`.

### 7) Membership schema validation
Goal: provide helpful errors for mismatched membership uploads.

Implementation notes:
- Add validation to `/api/upload-memberships` before parsing to ensure a minimum column set is present.
- Expected columns (any one of each group is acceptable):
  - name: `Customer` or `Name` or `Patient`
  - email: `Email` or `Email Address`
  - type: `Title` or `Membership Type` or `Type` or `Plan` or `Membership`

### 8) Remove "NEW" membership logic
Goal: stop relying on the `NEW` keyword in `Charge Desc`.

Implementation notes:
- Update `extractFromCSV` so `new_*_members_weekly` uses membership rows within the week range, without checking for `NEW`.
- Keep the existing week range logic; just remove the keyword dependency.

### 9) Add /api/validate endpoint
Goal: expose filter decisions and rollups for debugging.

Implementation notes:
- Add `GET /api/validate` in `server.js` that returns:
  - filters applied and excluded row counts
  - totals by category (IV, injection, weight loss, membership, other)
  - sample included/excluded rows with reasons (cap at ~20 each)
  - date range and row counts

## Suggested code touchpoints
- Revenue/service logic: `server.js` (`extractFromCSV`, `extractFromExcel`, helper categorization functions)
- Upload handling: `server.js` (`/api/upload`, `/api/upload-memberships`)
- UI totals display: `public/index.html` (ensure total infusions/injections are based on new service-level counts)

## Validation checklist
- Run upload with the provided weekly file and confirm week range 2026-01-05 to 2026-01-11.
- Confirm:
  - Weight loss income = $10,199
  - IV therapy revenue = $16,560.20
  - Infusions count = 90
  - Non-member customers > 0
- Verify totals do not include memberships, tips, or gift cards.
- Confirm membership upload errors are descriptive when columns are missing.

## Open questions to resolve with client
- Should infusion counts include add-on items (NAD, glutathione, etc.) as standalone services?
- If a patient has both member and non-member services in the same week, should they count as a member, non-member, or both?
- Should IV therapy revenue include weight loss injections, or should that stay isolated in weight loss revenue only?
