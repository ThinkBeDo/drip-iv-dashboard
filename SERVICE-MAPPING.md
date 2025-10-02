# Service-to-Bin Mapping System

## Overview

The service-to-bin mapping system provides deterministic categorization of revenue line items from weekly Optimantra exports. This replaces heuristic-based categorization with an exact, versioned mapping that ensures every service lands in the correct database buckets.

## Architecture

### Database Tables

#### `service_mapping`
Source of truth for service categorization. Loaded from Excel file.

**Columns:**
- `service_name` - Service name from Optimantra (e.g., "All Inclusive (Member)")
- `service_type` - Service type (e.g., "PROCEDURE", "OFFICE_VISIT")
- `default_charge` - Default charge amount
- `revenue_perf_bin` - Revenue performance category ("IV therapy", "Weight Loss")
- `service_volume_bin` - Service volume category ("IV Infusions", "Injections", "Weight Management", "Total Hormone Services")
- `customer_bin` - Customer type ("Member", "Non-member Customers", or NULL)
- `normalized_service_name` - Auto-generated lowercase trimmed name for matching
- `normalized_service_type` - Auto-generated lowercase trimmed type for matching

**Unique Constraint:** `(normalized_service_name, normalized_service_type)`

#### `unmapped_services`
Tracks services that couldn't be matched during import for operational review.

**Columns:**
- `week_start` - Week start date
- `file_row` - Full row data as JSONB
- `normalized_service_name` - Normalized service name that failed to match
- `normalized_service_type` - Normalized service type

#### `analytics_data` (enhanced)
Added three new columns:
- `revenue_perf_bin TEXT` - Mapped revenue performance category
- `service_volume_bin TEXT` - Mapped service volume category
- `customer_bin TEXT` - Mapped customer type category

### Mapping Flow

```
Weekly CSV Upload
  ↓
parse-drip-csv.js (adds normalized_service_name, normalized_service_type)
  ↓
import-weekly-data.js
  ↓
lookupServiceMapping(normalized_name, normalized_type)
  ├─ Exact match on (name, type) → Return bins
  ├─ Fallback: Name-only match if unique → Return bins
  └─ No match → trackUnmappedService() → Continue without bins
  ↓
INSERT/UPDATE analytics_data with bins
```

## Usage

### 1. Load Service Mapping

First time or after Excel file updates:

```bash
npm run load:mapping

# Or with custom file:
node scripts/load-service-mapping.js --file=path/to/mapping.xlsx
```

This will:
- Read Excel file
- Normalize service names and types
- Fix known typos ("Total Hormne Services" → "Total Hormone Services")
- UPSERT into `service_mapping` table
- Display bin distribution statistics

### 2. Import Weekly Revenue

Import works as before, but now also populates bin columns:

```bash
# Use existing web interface or CLI
node import-weekly-data.js --file=weekly-revenue.csv --weekStart=2025-01-06
```

### 3. Audit Unmapped Services

Check which services couldn't be matched:

```bash
# All unmapped services
npm run audit:unmapped

# Specific week
npm run audit:unmapped -- --weekStart=2025-01-06

# Limit results
npm run audit:unmapped -- --limit=5
```

Output shows:
- Week-by-week breakdown
- Count of unmapped rows
- Top unmapped services
- Suggested next steps

### 4. Update Mapping

When new services are added to Optimantra:

1. Update Excel file with new services and their bins
2. Run `npm run load:mapping` to reload
3. Re-import affected weeks to populate bins
4. Verify with `npm run audit:unmapped`

## Idempotency & Safety

- **Deterministic**: Same input always produces same output
- **Idempotent**: Re-running weekly imports updates existing records safely
- **Versioned**: `mapping_meta` table tracks mapping file hash and timestamp
- **Transactional**: All database operations wrapped in transactions
- **Graceful**: Unmapped services are logged but don't break imports

## Normalization Rules

### Service Names
- Converted to lowercase
- Trimmed of whitespace
- Matched against `normalized_service_name` column

### Service Types
- Converted to lowercase
- Trimmed of whitespace
- Empty strings normalized to ''
- Matched against `normalized_service_type` column

### Known Fixes
- "Total Hormne Services" → "Total Hormone Services" (typo correction)

## Bin Values

### Revenue Performance Bins
- `IV therapy` - IV infusions and related services
- `Weight Loss` - Weight management services

### Service Volume Bins
- `IV Infusions` - Full IV drip services
- `Injections` - Quick injection services
- `Weight Management` - Semaglutide, Tirzepatide, weight loss
- `Total Hormone Services` - Hormone therapy services

### Customer Bins
- `Member` - Member-priced services
- `Non-member Customers` - Non-member-priced services
- `NULL` - Not customer-specific (e.g., consultations)

## Testing

Run categorization tests:

```bash
npm run test:categorization
```

Tests verify:
- Member vs Non-member differentiation
- IV therapy vs Weight Loss revenue bins
- Service volume categorization
- Typo normalization
- Unmapped service tracking

## Troubleshooting

### Services not being categorized

1. Check if mapping is loaded:
   ```sql
   SELECT COUNT(*) FROM service_mapping;
   ```

2. Check for unmapped services:
   ```bash
   npm run audit:unmapped
   ```

3. Verify normalized format:
   ```sql
   SELECT normalized_service_name, normalized_service_type
   FROM service_mapping
   WHERE service_name ILIKE '%search term%';
   ```

### Mapping file not loading

1. Verify file path
2. Check Excel file has correct columns:
   - Service Name
   - Service Type
   - Charges
   - Revenue Performance Bins
   - Service Volume Analytics Bin
   - Customer Analytics Bin

3. Check database connectivity

### Bins not appearing in dashboard

1. Ensure `ensure-columns.js` has been run:
   ```bash
   npm run ensure:columns
   ```

2. Verify bin columns exist:
   ```sql
   SELECT revenue_perf_bin, service_volume_bin, customer_bin
   FROM analytics_data
   LIMIT 5;
   ```

## Migration Checklist

- [x] Run migration: `database/migrations/004_add_service_mapping.sql`
- [x] Ensure columns: `npm run ensure:columns`
- [x] Load mapping: `npm run load:mapping`
- [x] Test categorization: `npm run test:categorization`
- [ ] Re-import last 2 weeks
- [ ] Audit unmapped: `npm run audit:unmapped`
- [ ] Verify dashboard displays correct bins

## Operational Workflow

**Weekly Import:**
1. Receive Optimantra export
2. Upload via web interface (existing workflow)
3. Review unmapped services: `npm run audit:unmapped --weekStart=YYYY-MM-DD`
4. If unmapped > 0: Add to Excel → `npm run load:mapping` → Re-import week

**New Service Added:**
1. Add to Excel mapping file with bins
2. `npm run load:mapping`
3. Re-import affected weeks (optional, for historical accuracy)

**Mapping Freshness Check:**
```sql
SELECT * FROM mapping_meta ORDER BY loaded_at DESC LIMIT 1;
```

Shows last mapping load time and hash.
