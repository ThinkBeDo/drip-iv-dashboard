# Requirements

## v1 Requirements

### Revenue & Categorization
- [ ] **REV-01**: Primary revenue totals exclude memberships, tips, gift cards, and refunds/credits
- [ ] **REV-02**: Weight loss revenue is separated from IV therapy revenue
- [ ] **REV-03**: Weekly revenue matches manual validation for 2026-01-05 to 2026-01-11 ($30,759.12 total; $10,199 weight loss)
- [ ] **REV-04**: IV therapy revenue includes all non-membership services (including add-ons) and matches manual validation ($16,560.20 target)

### Service Counts & Customer Analytics
- [ ] **SVC-01**: Service counts are based on service-line items (not patient/visit), including add-ons
- [ ] **SVC-02**: Non-member customers are detected and reported correctly

### Validation & Debugging
- [ ] **VAL-01**: Add a validation endpoint to expose filters, inclusions/exclusions, and rollups
- [ ] **VAL-02**: Provide detailed logging for included/excluded services

### File Support
- [ ] **FILE-01**: Support UTF-16 TSV .xls exports as a fallback when XLSX parsing fails

## v2 Requirements

(None yet)

## Out of Scope

- Real-time POS integrations — file upload remains the source of truth
- UI redesign — focus on data correctness and validation

## Traceability

| Requirement | Phase |
|-------------|-------|
| REV-01 | — |
| REV-02 | — |
| REV-03 | — |
| REV-04 | — |
| SVC-01 | — |
| SVC-02 | — |
| VAL-01 | — |
| VAL-02 | — |
| FILE-01 | — |
