# Membership Registry Implementation

## Overview

This implementation adds a robust membership tracking system that prevents double counting of new memberships across weekly uploads. The system tracks the first time each membership appears in our uploads and counts it as "new" only when it has a Start Date in the previous week or future.

## Key Components

### 1. Database Schema (`membership_registry` table)

```sql
CREATE TABLE membership_registry (
  member_key TEXT PRIMARY KEY,                  -- normalized Patient + membership_type
  patient TEXT NOT NULL,
  membership_type TEXT NOT NULL,               -- one of: individual|family|concierge|corporate
  title_raw TEXT NOT NULL,                     -- original Title string from upload
  start_date DATE NOT NULL,
  first_seen_week DATE NOT NULL,               -- Monday of the week we first saw this in an upload
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 2. Week Window Helper

**Function:** `getWeekWindow(now, weekStartsOn)`
- Calculates the previous week's Monday-Sunday range
- Uses UTC dates to avoid timezone issues
- Monday = 1 (configurable but defaults to Monday start)

### 3. New Membership Processor

**Function:** `computeNewMembershipsFromUpload(rows, db, now)`

**Logic:**
1. For each membership in the Active Memberships upload:
   - Skip if Start Date < previous week Monday
   - Parse membership type from Title field
   - Build unique key: `lowercase(patient)|membership_type`
   - Check if already exists in registry
   - If new: insert into registry and increment counter

**Counting Rule:** 
- Start Date ≥ previous week Monday (covers "previous week or future")
- First appearance in our weekly uploads (registry prevents double counting)

### 4. Integration Points

**Import Workflow (`import-weekly-data.js`):**
- Replaces revenue-based membership counting with registry-based tracking
- Creates `membership_registry` table if not exists
- Calls `computeNewMembershipsFromUpload()` during database transaction
- Updates analytics data with new counts

**API (`/api/dashboard`):**
- Already returns the four new membership fields
- No changes needed - fields exist in schema

**Frontend (`public/index.html`):**
- Already binds to correct API fields
- CSS classes match field names exactly
- No changes needed

## Membership Type Parsing

The system normalizes membership types from the Title field:

- `includes("individual")` → `individual`
- `includes("family")` → `family` 
- `includes("concierge")` → `concierge`
- `includes("corporate")` → `corporate`
- Otherwise → skip (not a membership)

## Data Flow

1. **Weekly Upload:** Active Memberships Excel file processed
2. **Registry Check:** Each membership checked against `membership_registry`
3. **First-Seen Logic:** New memberships with valid Start Dates counted
4. **Database Update:** Counts stored in `analytics_data` table
5. **API Response:** `/api/dashboard` returns the four counters
6. **Frontend Display:** Dashboard tiles show the values

## Benefits

- **Idempotent:** Safe to reprocess the same week multiple times
- **Accurate:** Counts memberships when sold, not when service begins
- **Future-ready:** Handles future-dated Start Dates correctly
- **Audit Trail:** Full history preserved in registry table
- **Backward Compatible:** Existing API and frontend unchanged

## Testing

Run comprehensive tests with:
```bash
node test-membership-registry.js
```

Tests cover:
- Week window calculation
- First-time counting logic
- Double counting prevention
- Date boundary conditions
- Membership type parsing
- Invalid data handling

## Migration

The system automatically creates the `membership_registry` table during first run. For manual migration:

```bash
psql $DATABASE_URL -f database/migrations/003_add_membership_registry.sql
```

## Operational Notes

- **Reprocessing:** To reprocess a week, clear that week's entries from `membership_registry` first
- **Performance:** Registry queries are indexed on `member_key`, `membership_type`, and `first_seen_week`
- **Monitoring:** Check registry growth matches expected membership volume
- **Cleanup:** No automatic cleanup - registry grows indefinitely as designed

## Example Scenarios

**Scenario 1:** New membership sold last week with future start date
- Start Date: Next month
- First appears in this week's upload
- **Result:** Counted this week (when sold)

**Scenario 2:** Existing membership appears again
- Previously seen in registry
- **Result:** Not counted (prevents double counting)

**Scenario 3:** Old membership with past start date
- Start Date: 2 months ago
- First appears in upload
- **Result:** Not counted (too old, wasn't sold last week)

This implementation ensures accurate, idempotent membership tracking that matches the business rule: "count memberships the first time they appear in our uploads if sold last week or have future start dates."