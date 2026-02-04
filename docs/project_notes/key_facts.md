# Key Facts

Store non-sensitive configuration facts and references. Do NOT store secrets, passwords, tokens, or private keys.

## Safe to store
- Hostnames, ports, project IDs, service account emails
- Public URLs and documentation links
- Environment names and deployment targets

## Format

### Category Name
- Item: Value

---

### Deployment
- Platform: Railway
- Database: PostgreSQL on Railway
- Auto-deploy: Yes, on push to main branch

### Data Sources
- Revenue Data: "Patient Analysis (Charge Details & Payments) - V3 - With COGS" XLS export from OptiMantra
- Membership Data: "Drip IV Active Memberships" XLSX export from OptiMantra
- Revenue Column Used: `Calculated Payment (Line)` (post-discount)
- Week Boundaries: Monday through Sunday

### Dashboard Metrics Documentation
- Location: `docs/DASHBOARD_METRICS.md`
- Contains: All metric definitions, service categorization rules, validation guide

### Service Categories
- base_infusion: Saline 1L, Normal Saline 500 ML, Hydration, Energy, Immunity, etc.
- infusion_addon: Glutathione, Toradol, Zofran, Pepcid, Amino Acids IV, etc.
- injection: B12, Metabolism Boost, Steroid Shot, Tri-Immune, Xeomin, etc. (tracked separately, NOT in IV Therapy)
- weight_management: Semaglutide, Tirzepatide, Contrave
- membership: Membership fees (NOT services with "(member)" pricing suffix)

### Revenue Metric Definitions (2026-02-04 UPDATED)
- **IV Therapy Revenue**: EVERYTHING except memberships, weight loss, and tips
- **Weight Loss Revenue**: Semaglutide, Tirzepatide, Contrave only
- **Other Revenue**: Tips only (should be ~$0 most weeks)
- **Column Used**: `Calculated Payment (Line)` = post-discount actual revenue
- **NOT Used**: `Charges` column = pre-discount list price

### Client Rule (2026-02-04)
> "Drip is everything EXCLUDING memberships, semaglutide, tirzepatide, contrave"

### CRITICAL: Data Flow for Debugging
- **Import files** (`import-weekly-data.js`, `import-multi-week-data.js`): Calculate and STORE revenue values
- **Server.js**: READS stored values, calculates `other_revenue` at runtime
- **If frontend shows wrong numbers after re-upload**: Bug is in IMPORT, not display
- **Full guide**: See `docs/DATA_FLOW_DEBUG.md`

### Common Discrepancy Causes
- Manual Excel totals using "Charges" column vs dashboard using "Calculated Payment"
- Member discounts typically account for 5-10% difference
- Aggregated customer counts use MAX() not true unique count

### Membership Types
- Individual: 85 (as of Jan 2026)
- Family: 16-17
- Concierge: 14
- Drip & Concierge: 4 (overlap)
- Total Active: ~120
