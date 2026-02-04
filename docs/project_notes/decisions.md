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

### ADR-004: Use MAX() for Customer Count Aggregation (2026-02-04)

**Context:**
- When viewing aggregated date ranges (multiple weeks), customer counts were inflated
- SUM() was adding per-week unique customer counts, counting same customer multiple times

**Decision:**
- Use MAX() instead of SUM() for customer count fields in aggregation queries
- Display a warning when viewing aggregated data that counts are approximate

**Alternatives Considered:**
- Re-query raw transaction data for true unique count -> Rejected: requires storing patient names, expensive query
- Show "N/A" for aggregated views -> Rejected: some data better than none

**Consequences:**
- Customer counts in aggregated views show peak weekly value, not true unique count
- Warning displayed to users so they understand approximation
- Trade-off: slightly less accurate but much simpler implementation

### ADR-005: IV Therapy Revenue Excludes Standalone Injections (2026-02-04)

**Context:**
- Documentation incorrectly stated IV Therapy includes injections
- Client expected higher IV Therapy revenue based on this

**Decision:**
- IV Therapy Revenue = base_infusion + infusion_addon categories ONLY
- Standalone injections (B12, Xeomin, etc.) tracked separately in Injections metric
- This matches actual code behavior since implementation

**Alternatives Considered:**
- Include injections in IV Therapy -> Rejected: would require code change and reprocessing all historical data

**Consequences:**
- Clear separation: IV bags vs standalone shots
- Documentation updated to match code
- Client education needed on what each metric represents

### ADR-006: IV Therapy as Default Revenue Category (2026-02-04)

**Context:**
- Client clarified: "Drip is everything EXCLUDING memberships, semaglutide, tirzepatide, contrave"
- Previous implementation defaulted unmatched services to "other_revenue"
- This caused ~$748 to show as "Other Revenue" instead of "IV Therapy"

**Decision:**
- Change default category from `other_revenue` to `drip_iv_revenue`
- Only explicit exclusions go elsewhere:
  - Memberships → membership_revenue (not shown in revenue breakdown)
  - Semaglutide/Tirzepatide/Contrave → semaglutide_revenue (Weight Loss)
  - Tips only → other_revenue
- Lab Draw Fee, hormones, ketamine, etc. → all default to IV Therapy

**Alternatives Considered:**
- Explicit whitelist for IV Therapy → Rejected: maintenance burden, new services would default to "other"
- Keep "Other Revenue" category prominent → Rejected: client wants simplicity (IV vs Weight Loss)

**Consequences:**
- Simpler mental model: everything is IV Therapy unless explicitly excluded
- "Other Revenue" will typically be $0 or minimal (just tips)
- New services automatically categorized as IV Therapy (usually correct)
- Must explicitly add weight loss drugs to exclusion list when new ones come out
