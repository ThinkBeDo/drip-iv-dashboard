# Architectural Decisions

Use ADRs to record significant architectural choices.

## Format

### ADR-XXX: Decision Title (YYYY-MM-DD)

**Context:**
- Why the decision was needed

**Decision:**
- What was chosen

**Alternatives Considered:**
- Option -> Why rejected

**Consequences:**
- Benefits
- Trade-offs

---

### ADR-001: Use Calculated Payment (Line) for Revenue (2026-01-31)

**Context:**
- Revenue discrepancy found between manual Excel checks and dashboard
- Manual checks used "Charges" column ($16,568), dashboard showed $15,606

**Decision:**
- Dashboard uses `Calculated Payment (Line)` column (post-discount amount)
- This is the correct business metric - actual revenue received after member discounts

**Alternatives Considered:**
- Use "Charges" column -> Rejected: overstates revenue before discounts applied

**Consequences:**
- Dashboard shows accurate revenue collected
- Manual validation must use same column for comparison
- Member discounts (~5-10%) explain apparent "discrepancy"

### ADR-002: Patient-Level Member Detection (2026-01-31)

**Context:**
- Need to count member vs non-member customers accurately
- Same patient may have both member-priced and non-member services in same week

**Decision:**
- Classify at patient level, not transaction level
- If ANY of a patient's services are member-priced, count them as member customer

**Alternatives Considered:**
- Transaction-level -> Rejected: same patient counted multiple times, inflates totals

**Consequences:**
- Accurate unique customer counts
- Pre-compute member status per patient before processing transactions

### ADR-003: Service Categorization via Pattern Matching (2026-01-31)

**Context:**
- Need to categorize services from OptiMantra export for dashboard bins
- Services identified by human-readable "Charge Desc" text

**Decision:**
- Use keyword pattern matching in `getServiceCategory()` function
- Categories: base_infusion, infusion_addon, injection, weight_management, membership, consultation, other

**Alternatives Considered:**
- Backend product IDs -> Rejected: not available in export file
- Database lookup table -> Partial: service_mapping table exists but not fully populated

**Consequences:**
- Easy to add new services by adding keywords
- Must maintain pattern lists when new services added
- Documentation needed (see docs/DASHBOARD_METRICS.md)
