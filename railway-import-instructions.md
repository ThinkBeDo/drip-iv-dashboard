# Railway Database Import Instructions

## Quick Import Steps

Since the direct database connection is having issues, here are the steps to import the data using Railway's dashboard:

### Option 1: Using Railway Dashboard (Recommended)

1. **Open Railway Dashboard**
   - Go to https://railway.app
   - Navigate to your project
   - Click on your PostgreSQL service

2. **Access Query Tab**
   - Click on the "Query" tab in your PostgreSQL service
   - This opens a SQL query interface

3. **Execute the SQL Import**
   - Copy the entire contents of `july-august-import.sql`
   - Paste it into the Railway query interface
   - Click "Run Query"

### Option 2: Using Railway CLI

1. **Install Railway CLI** (if not already installed)
   ```bash
   brew install railway
   ```

2. **Login to Railway**
   ```bash
   railway login
   ```

3. **Link to your project**
   ```bash
   railway link
   ```

4. **Execute the SQL file**
   ```bash
   railway run psql $DATABASE_URL < july-august-import.sql
   ```

### Option 3: Using psql with connection string

```bash
psql "postgresql://postgres:HAKCPSPQMVOhnwIEtFgiNLjOmJzJMlxR@autorack.proxy.rlwy.net:16513/railway?sslmode=require" < july-august-import.sql
```

## Data Summary

The SQL file contains data for **10 weeks** from May 27, 2025 to August 18, 2025:

- **Total Revenue**: $205,984.35
- **Total Members**: 169
  - Individual: 102
  - Family: 36 (72 members)
  - Concierge: 21
  - Corporate: 10 (100 members)

## Verification

After importing, verify the data by running this query in Railway:

```sql
SELECT 
  week_start_date,
  week_end_date,
  actual_weekly_revenue,
  total_drip_iv_members
FROM analytics_data
WHERE week_start_date >= '2025-05-01'
ORDER BY week_start_date;
```

You should see 10 weeks of data with revenue and membership information.

## Dashboard Check

After importing:
1. Refresh your dashboard at your deployment URL
2. You should see:
   - Weekly Revenue Status showing current week data
   - Monthly Revenue Status with aggregated monthly totals
   - Membership section showing 169 total members
   - Service volume charts populated with IV infusions and injection data