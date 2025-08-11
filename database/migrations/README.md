# Database Migrations

## Current Issue Fix: Missing Popular Services Columns

### Problem
The production database is missing columns that the application expects:
- `popular_infusions`
- `popular_infusions_status`
- `popular_injections`
- `popular_injections_status`

### Solution
The server now automatically checks and adds these columns on startup. However, if you need to manually run the migration:

#### Option 1: Using Railway CLI
```bash
railway run psql $DATABASE_URL < database/migrations/001_add_popular_services_columns.sql
```

#### Option 2: Using Railway Dashboard
1. Go to your Railway project
2. Click on the PostgreSQL service
3. Go to the "Data" tab
4. Click "Query"
5. Copy and paste the contents of `001_add_popular_services_columns.sql`
6. Click "Run Query"

#### Option 3: Using any PostgreSQL client
Connect using your DATABASE_URL and run:
```sql
ALTER TABLE analytics_data 
ADD COLUMN IF NOT EXISTS popular_infusions TEXT[] DEFAULT ARRAY['Energy', 'NAD+', 'Performance & Recovery'],
ADD COLUMN IF NOT EXISTS popular_infusions_status VARCHAR(50) DEFAULT 'Active',
ADD COLUMN IF NOT EXISTS popular_injections TEXT[] DEFAULT ARRAY['Tirzepatide', 'Semaglutide', 'B12'],
ADD COLUMN IF NOT EXISTS popular_injections_status VARCHAR(50) DEFAULT 'Active';
```

### Verification
After running the migration, verify with:
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'analytics_data' 
AND column_name LIKE 'popular%';
```

You should see 4 rows with the new columns.

## Auto-Migration Feature
The server now includes automatic migration checking on startup (server.js lines 1798-1839). When the server starts, it:
1. Checks if required columns exist
2. Automatically adds missing columns
3. Logs the migration status

This ensures the database schema stays in sync with the application code.