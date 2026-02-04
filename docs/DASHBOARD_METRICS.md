# Dashboard Metrics Definitions

This document provides clear definitions for all metrics displayed on the Drip IV Dashboard. Use this as the reference for validating dashboard numbers against source data.

---

## Revenue Performance

### Total Weekly Revenue
- **Source Column**: `Calculated Payment (Line)` (NOT `Charges`)
- **Definition**: Sum of all payments received during the week (Mon-Sun)
- **Includes**: All positive payment values after discounts
- **Excludes**: Refunds (negative values), $0 transactions
- **Note**: This is the **post-discount** amount, not the pre-discount charge amount

### IV Therapy Revenue
- **Definition**: Revenue from IV infusions and add-ons (base infusions + add-on services)
- **Note**: Standalone injections are tracked separately and are NOT included in IV Therapy revenue
- **Categories Included**:
  - `base_infusion`: Saline 1L, Normal Saline 500 ML, Hydration, Performance & Recovery, Energy, Immunity, Alleviate, All Inclusive, Lux Beauty, Methylene Blue Infusion, NAD 250mg/500mg
  - `infusion_addon`: Vitamin D3, Glutathione, NAD (lower doses), Toradol, Magnesium, Vitamin B12, Zofran, Biotin, Vitamin C, Zinc, Mineral Blend, Vita-Complex, Taurine, Pepcid, Amino Acids (IV add-on)
- **Categories NOT Included** (tracked separately):
  - `injection`: B12 Injection, Metabolism Boost Injection, Biotin, Taurine, Xeomin Neurotoxin, Steroid Shot, Tri-Immune, Amino Acids Injection, NAD 50-200mg

### Weight Loss Revenue
- **Definition**: Revenue from weight management services
- **Services Included**: Semaglutide, Tirzepatide, Contrave, anything with "weight loss" in description

### Membership Revenue
- **Definition**: Revenue from membership fees
- **Includes**: Services containing "membership" (but NOT pricing suffixes like "(member)")
- **Note**: "(Member)" at end of service name indicates member pricing, not a membership fee

---

## Service Volume Analytics

### IV Infusions
- **Definition**: Count of **base infusion** services delivered
- **Counts As Visit**: Each `base_infusion` service = 1 infusion
- **Add-ons Do NOT Count**: Glutathione, Toradol, etc. added to an infusion are NOT separate infusions
- **Weekday vs Weekend**: Based on service date (Mon-Fri = weekday, Sat-Sun = weekend)

**Services That Count as Infusions:**
| Service | Category |
|---------|----------|
| Saline 1L | base_infusion |
| Normal Saline 500 ML | base_infusion |
| Hydration | base_infusion |
| Performance & Recovery | base_infusion |
| Energy | base_infusion |
| Immunity | base_infusion |
| Alleviate | base_infusion |
| All Inclusive | base_infusion |
| Lux Beauty | base_infusion |
| Methylene Blue Infusion | base_infusion |
| NAD 250mg/500mg | base_infusion |

### Injections (Regular)
- **Definition**: Count of standalone injection services (NOT weight loss)
- **Excludes**: Semaglutide, Tirzepatide (counted in Weight Loss)

**Services That Count as Injections:**
| Service | Category |
|---------|----------|
| B12 Injection | injection |
| Metabolism Boost Injection | injection |
| Biotin Injection | injection |
| Taurine Injection | injection |
| Xeomin Neurotoxin | injection |
| Steroid Shot | injection |
| Tri-Immune | injection |
| Amino Acids Injection | injection |
| NAD 50-200mg | injection |

### Weight Loss Injections
- **Definition**: Count of Semaglutide and Tirzepatide injections
- **Does NOT Include**: Contrave (oral medication), consultations

---

## Customer Analytics

### Unique Customers
- **Definition**: Distinct patient names with at least one paid service in the period
- **Counted At**: Patient level, not transaction level
- **Example**: If "John Smith" has 3 services, he counts as 1 unique customer

### Member Customers
- **Definition**: Unique customers who received at least one service at member pricing
- **Detection**: Any service with "(member)" in the description (NOT "(non-member)")
- **Note**: This is **patient-level** - if ANY of a patient's services are member-priced, they're counted as a member

### Non-Member Customers
- **Definition**: Unique customers with NO member-priced services
- **Calculation**: Total Unique Customers - Member Customers

---

## Membership Analytics

### Total Active Members
- **Source**: Active Memberships file upload
- **Definition**: Count of all active membership records

### Membership Types

| Dashboard Field | File Match Criteria |
|-----------------|-------------------|
| Individual | Title contains "individual" |
| Family | Title contains "family" (but NOT "concierge") |
| Concierge | Title contains "concierge" (but NOT "drip" or "family") |
| Family & Concierge | Title contains BOTH "family" AND "concierge" |
| Drip & Concierge | Title contains BOTH "concierge" AND "drip" |
| Corporate | Title contains "corporate" |

### New Memberships (This Week)
- **Definition**: Membership fees charged in revenue file with "NEW" in the description
- **Detection**: Regex `/\bnew\b/i` matches word "new" (case insensitive)
- **Example**: "$109 Membership - Family (NEW)" counts as 1 new family membership

---

## Data Source Columns

### Revenue File (Patient Analysis)
| Column | Usage |
|--------|-------|
| Date | Service date (for week grouping, weekday/weekend) |
| Patient | Customer identification |
| Charge Desc | Service categorization |
| Calculated Payment (Line) | **Revenue amount (POST-discount)** |
| Charges | Pre-discount amount (NOT used for dashboard) |
| Qty | Service quantity |

### Membership File (Active Memberships)
| Column | Usage |
|--------|-------|
| Patient | Member identification |
| Title | Membership type classification |
| Start Date | For new membership detection |

---

## Common Validation Issues

### "My manual count doesn't match the dashboard"

1. **Check which column you're using**
   - Dashboard uses `Calculated Payment (Line)` (after discounts)
   - Manual counts often use `Charges` (before discounts)
   - Member discounts can create ~5-10% difference

2. **Check how you're counting services**
   - Dashboard counts by **service category**, not by line item
   - Add-ons (Glutathione, Toradol) don't count as separate visits
   - Only base infusions count toward infusion totals

3. **Check date boundaries**
   - Dashboard uses Monday-Sunday weeks
   - Manual filtering might use different boundaries

### "Membership counts seem off"

1. **Check for overlap categories**
   - "Concierge & Drip" members are NOT in plain "Concierge" count
   - "Family & Concierge" members are NOT in plain "Family" count

2. **Check the file being used**
   - Dashboard shows data from last uploaded membership file
   - File might be outdated

---

## Service Categorization Reference

### Category: `base_infusion`
Revenue → IV Therapy | Counts → IV Infusions
- Saline 1L, Normal Saline 500 ML
- Hydration, Performance & Recovery, Energy
- Immunity, Alleviate, All Inclusive
- Lux Beauty, Methylene Blue Infusion
- NAD 250mg, NAD 500mg

### Category: `infusion_addon`
Revenue → IV Therapy | Counts → (none, doesn't add to visit count)
- Vitamin D3, Glutathione, Toradol
- Magnesium, Vitamin B12, Zofran
- Biotin, Vitamin C, Zinc
- Mineral Blend, Vita-Complex, Taurine
- Pepcid, Amino Acids (IV add-on)
- NAD (lower doses when part of infusion)

### Category: `injection`
Revenue → IV Therapy | Counts → Injections
- B12 Injection, Metabolism Boost Injection
- Biotin Injection, Taurine Injection
- Xeomin Neurotoxin, Steroid Shot
- Tri-Immune, Amino Acids Injection
- NAD 50mg-200mg (standalone)

### Category: `weight_management`
Revenue → Weight Loss | Counts → Weight Loss Injections
- Semaglutide, Tirzepatide
- Contrave, Weight Loss (anything)

### Category: `membership`
Revenue → Membership | Counts → (handled separately via membership file)
- Any service with "membership" in name
- Excludes pricing suffixes like "(member)"

### Category: `consultation`
Revenue → Other | Counts → (none)
- Consultation, Consult
- Follow-up, Initial Visit
- Hormone services

### Category: `other`
Revenue → Other | Counts → (none)
- Anything not matching above categories
- Labs, office visits, tips, etc.

---

*Last Updated: January 31, 2026*
