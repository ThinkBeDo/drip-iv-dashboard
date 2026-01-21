# Roadmap

## Overview

4 phases | 9 requirements | v1 coverage: 100%

| # | Phase | Goal | Requirements | Success Criteria |
|---|-------|------|--------------|------------------|
| 1 | Revenue Accuracy | Align revenue totals with manual validation and correct category separation | REV-01, REV-02, REV-03, REV-04 | 4 |
| 2 | Service & Customer Counts | Count services at line-item level and fix non-member detection | SVC-01, SVC-02 | 3 |
| 3 | Validation & Logging | Make filtering and rollups explainable via API/logs | VAL-01, VAL-02 | 3 |
| 4 | File Support | Add UTF-16 TSV fallback parsing | FILE-01 | 2 |

---

## Phase 1: Revenue Accuracy
**Goal:** Match weekly totals and ensure clean category separation (IV vs weight loss, exclude memberships/tips/gift cards).

**Requirements:** REV-01, REV-02, REV-03, REV-04

**Success criteria:**
1. Weekly totals for 2026-01-05 to 2026-01-11 match manual validation ($30,759.12 total; $10,199 weight loss; $16,560.20 IV therapy).
2. Memberships, tips, gift cards, and credits/refunds are excluded from primary revenue totals.
3. Weight loss revenue is reported only in its own bucket and never included in IV therapy totals.
4. Revenue calculations are row-based (not visit-based) to avoid missing services.

## Phase 2: Service & Customer Counts
**Goal:** Count all services correctly at service-line level and fix non-member customer reporting.

**Requirements:** SVC-01, SVC-02

**Success criteria:**
1. Service counts include add-ons and are based on line items (not deduped by patient/date).
2. Infusion/injection counts match manual review for the target week.
3. Non-member customers are > 0 for the target week and match manual expectations.

## Phase 3: Validation & Logging
**Goal:** Provide explainability for filters and rollups.

**Requirements:** VAL-01, VAL-02

**Success criteria:**
1. `/api/validate` returns filter rules, inclusion/exclusion counts, and rollups.
2. Logs show what was included/excluded with reasons (capped samples).
3. Validation output ties directly to dashboard metrics for the selected week.

## Phase 4: File Support
**Goal:** Accept UTF-16 TSV .xls exports when XLSX parsing fails.

**Requirements:** FILE-01

**Success criteria:**
1. If `XLSX.readFile` fails, parser falls back to UTF-16 TSV and continues.
2. Fallback path produces the same metrics as standard XLSX parsing for the target week.

---
*Last updated: 2026-01-21 after roadmap creation*
