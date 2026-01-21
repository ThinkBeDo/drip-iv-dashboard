# Drip IV Analytics Dashboard

## What This Is
A web-based analytics dashboard for Drip IV wellness centers to upload weekly revenue/service reports and view performance metrics, service volumes, and membership analytics. It is used by operations and leadership to reconcile financials, track services delivered, and monitor membership trends.

## Core Value
Accurate weekly and monthly metrics from uploaded reports so leadership can trust the dashboard for decisions.

## Requirements

### Validated

- ✓ Upload weekly revenue data files (XLS/XLSX/CSV) and parse into metrics — existing
- ✓ Dashboard renders revenue, service volume, and membership metrics — existing
- ✓ Persist weekly metrics in PostgreSQL and serve via API — existing
- ✓ Upload membership roster to update membership counts — existing

### Active

- [ ] Fix revenue filtering so memberships, tips, and gift cards are excluded from primary revenue totals
- [ ] Separate IV therapy revenue from weight loss revenue (dedicated bucket)
- [ ] Count services at service-line level (including add-ons) instead of patient/visit level
- [ ] Fix non-member customer detection and reporting
- [ ] Add validation/debug endpoint to show filters and inclusions
- [ ] Support UTF-16 TSV .xls exports when XLSX parsing fails

### Out of Scope

- Real-time POS integrations — not needed; file upload is the source of truth
- Major UI redesign — focus is data correctness and validation

## Context
- Single-node Express app (`server.js`) with static frontend (`public/index.html`).
- Parsing logic for CSV/XLSX/PDF is centralized in `server.js` and contains multiple filtering and categorization paths.
- Current discrepancies in revenue and service counts were reported using the week of 2026-01-05 to 2026-01-11 and the provided data file.
- GSD codebase map is in `.planning/codebase/`.

## Constraints
- **Tech stack**: Node.js + Express + PostgreSQL — existing production stack
- **Data source**: Upload files from Optimantra/Google Sheets — no direct API feeds
- **Accuracy**: Metrics must match manual Excel validation for the target week

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Count services (including add-ons) at service-line level | Leadership wants service counts to reflect every billed service line | — Pending |
| Exclude weight loss revenue from IV therapy revenue | Separate revenue buckets improve clarity | — Pending |

---
*Last updated: 2026-01-21 after GSD initialization*
