# Service-to-Bin Mapping System

## Overview

The service-to-bin mapping system provides deterministic categorization of revenue line items from weekly Optimantra exports. This replaces heuristic-based categorization with an exact, versioned mapping that ensures every service lands in the correct database buckets.

**✨ Fully Automatic:** Database migrations and service mapping load automatically on server startup. No manual steps required!

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

## Automatic System

### How It Works

**On Server Startup:**
1. 🔧 Runs all pending SQL migrations from `database/migrations/` folder
2. 🗺️  Auto-loads Excel mapping if `service_mapping` table is empty
3. ✅ Server starts ready with up-to-date schema and mappings

**Zero Manual Steps Required!** Just deploy your code and the system handles everything.

### What Happens on Deploy

```
Railway Deploy → Server Starts
  ↓
database/run-migrations.js
  ├─ Creates schema_migrations tracking table
  ├─ Checks for new .sql files in migrations/
  ├─ Runs only new migrations (001, 002, 003, 004...)
  └─ Logs: "✅ X new migrations completed"
  ↓
database/auto-load-mapping.js
  ├─ Checks if service_mapping table is empty
  ├─ If empty: Loads from Excel automatically
  ├─ If populated: Logs service count and last update
  └─ Logs: "✅ 174 services loaded" or "Already loaded"
  ↓
Server Ready! 🚀
```

### Monitoring Status

**Check via API:**
```bash
# Full health check with migration + mapping status
curl https://your-app.railway.app/api/health

# Migration status only
curl https://your-app.railway.app/api/migrations

# Service mapping status only
curl https://your-app.railway.app/api/service-mapping
```

**Example Response:**
```json
{
  "status": "ok",
  "migrations": {
    "status": "up_to_date",
    "totalMigrations": 4,
    "completedCount": 4,
    "pendingCount": 0
  },
  "serviceMapping": {
    "status": "loaded",
    "serviceCount": 174,
    "metadata": {
      "loaded_at": "2025-01-02T15:30:00Z",
      "row_count": 174,
      "mapping_hash": "abc123..."
    }
  }
}
```

## Manual Commands (Optional)

You can still run these manually if needed:

### Load/Reload Service Mapping

```bash
npm run load:mapping

# Or with custom file:
node scripts/load-service-mapping.js --file=path/to/mapping.xlsx
```

Use this when:
- Updating Excel mapping with new services
- Fixing mapping errors
- Force reloading after Excel changes

### Audit Unmapped Services

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

### Update Mapping Workflow

When new services are added to Optimantra:

1. Update Excel file with new services and their bins
2. Commit and push to GitHub
3. Railway auto-deploys → Mapping auto-loads
4. (Optional) Verify with `curl https://your-app/api/service-mapping`

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

### Mapping file not loading automatically

1. Check server startup logs for mapping load status
2. Verify Excel file exists at project root: `Optimantra Services Export with Dashboard Bin Allocations.xlsx`
3. Check Excel file has correct columns:
   - Service Name
   - Service Type
   - Charges
   - Revenue Performance Bins
   - Service Volume Analytics Bin
   - Customer Analytics Bin
4. Check API status: `curl https://your-app/api/service-mapping`

### Migrations not running

1. Check server logs for migration errors
2. Verify migration files exist in `database/migrations/` folder
3. Check migration status: `curl https://your-app/api/migrations`
4. If stuck, check `schema_migrations` table for completed migrations

### Bins not appearing in dashboard

1. Verify migrations ran successfully (creates bin columns):
   ```sql
   SELECT revenue_perf_bin, service_volume_bin, customer_bin
   FROM analytics_data
   LIMIT 5;
   ```

2. Check that mapping is loaded:
   ```sql
   SELECT COUNT(*) FROM service_mapping;
   ```

## Deployment Checklist

**Fully Automated - Just Deploy!**

- [x] Create migration files in `database/migrations/`
- [x] Commit Excel mapping file to repo
- [x] Push to GitHub
- [ ] Railway auto-deploys
- [ ] Server starts → Migrations run automatically
- [ ] Service mapping loads automatically
- [ ] Verify with `/api/health` endpoint

**Optional Post-Deploy:**
- [ ] Check logs for migration success
- [ ] Verify mapping loaded: `curl https://your-app/api/service-mapping`
- [ ] Audit unmapped: `npm run audit:unmapped` (if any exist)

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
