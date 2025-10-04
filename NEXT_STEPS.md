# Next Steps - Drip IV Dashboard

## ✅ Completed Tasks

1. **Weight Loss Injection Counts** - Now displaying correctly (115 total for September)
2. **Service Categorization** - Semaglutide/Tirzepatide only in Weight Management, not Injections
3. **Data Persistence** - All September data stored and protected from overwrites

## 🔴 Action Required: Upload Membership Data

### Why Membership Shows 0
The revenue files (Patient Analysis) don't contain membership information. You need to upload the Active Memberships file separately.

### How to Upload Memberships

**Option 1: Via API (Recommended)**
```bash
curl -X POST http://localhost:3000/api/upload-memberships \
  -F "file=@Drip IV Active Memberships (3).xlsx"
```

**Option 2: Via Frontend**
If you have a file upload interface, use the `/api/upload-memberships` endpoint.

### What This Will Fix
- Total Active Members count
- Individual/Family/Concierge/Corporate breakdowns
- New member signups will still show (they come from revenue data)

## 📊 Current Dashboard Data (September 2025)

### Week 4 (Sept 22-28) - Most Recent
```
Revenue:
  Total: $31,749
  IV Therapy: $15,499
  Weight Loss: $7,710

Service Counts:
  IV Infusions: 76 weekly
  Regular Injections: 19 weekly
  Weight Loss Injections: 26 weekly

New Memberships:
  Family: 4 new signups
```

### Full September Totals
```
Total Revenue: $128,370
IV Therapy: $57,920
Weight Loss: $33,305

Service Counts:
  Regular Injections: 51 total
  Weight Loss Injections: 115 total
  
New Memberships:
  Family: 15 new signups
```

## 🔍 How to Verify Everything is Working

### 1. Check Weight Loss Injection Counts
```bash
curl -s http://localhost:3000/api/dashboard | jq '{
  wl_injections_weekly: .data.semaglutide_injections_weekly,
  wl_injections_monthly: .data.semaglutide_injections_monthly
}'
```

Expected: `26 weekly, 115 monthly` (for September)

### 2. Check Popular Services Separation
```bash
curl -s http://localhost:3000/api/dashboard | jq '{
  popular_injections: .data.popular_injections,
  popular_weight_management: .data.popular_weight_management
}'
```

Expected:
- Injections: B12, Glutathione, Metabolism Boost
- Weight Management: Tirzepatide, Semaglutide

### 3. Check Database Directly
```bash
node -e "
const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  const result = await pool.query('SELECT week_start_date, semaglutide_injections_weekly, popular_injections, popular_weight_management FROM analytics_data ORDER BY week_start_date DESC LIMIT 1');
  console.log(result.rows[0]);
  await pool.end();
})();
"
```

## 📁 Files to Keep

### Important Files
- `server.js` - Main application logic
- `import-september-data.js` - Automated September import script
- `database/migrations/004_add_popular_weight_management.sql` - Migration for popular services

### Documentation
- `WEIGHT_LOSS_INJECTION_FIX_SUMMARY.md` - Details of fixes applied
- `NEXT_STEPS.md` - This file
- `SERVICE-MAPPING.md` - Service categorization rules

### Data Files
- `Patient Analysis (Charge Details & Payments) - V3 - With COGS (3).xls` - Revenue data
- `Drip IV Active Memberships (3).xlsx` - Membership data (needs to be uploaded)
- `Optimantra Services Export with Dashboard Bin Allocations.xlsx` - Service mapping reference

## 🚀 Future Uploads

### Weekly Revenue Data
```bash
# Upload new week's revenue file
curl -X POST http://localhost:3000/api/upload \
  -F "file=@Patient_Analysis_Week_XX.xls"
```

### Updated Memberships
```bash
# Upload updated membership file
curl -X POST http://localhost:3000/api/upload-memberships \
  -F "file=@Active_Memberships_Updated.xlsx"
```

## ⚠️ Important Notes

1. **Duplicate Protection**: The system prevents uploading the same week twice. Delete the existing record first if you need to re-upload.

2. **Monthly Totals**: When viewing a single week, the "monthly" values shown are calculated from that week's file data only. For accurate monthly totals, use the aggregate API:
   ```bash
   curl "http://localhost:3000/api/dashboard?start_date=2025-09-01&end_date=2025-09-28&aggregate=true"
   ```

3. **Service Categorization**: 
   - Weight loss medications (Semaglutide, Tirzepatide) are automatically excluded from regular injections
   - They appear only in the Weight Management section
   - This is enforced by the `isStandaloneInjection()` function in server.js

## 🐛 Troubleshooting

### If injection counts seem wrong:
- Check that weight loss meds aren't being counted twice
- Verify the `popular_weight_management` column exists in database
- Ensure migration 004 has been run

### If popular services show weight loss meds in injections:
- Re-run migration 004: `node -e "require('./database/migrations/004_add_popular_weight_management.sql')"`
- Re-import the affected week's data

### If membership data is still 0 after upload:
- Verify the membership file format matches expected structure
- Check server logs for upload errors
- Ensure the file has the correct column names

## 📞 Support

All code changes have been committed to GitHub:
- Commit 76f8cfe: Added semaglutide_injections_weekly/monthly storage
- Commit 786f12d: Separated weight loss meds from regular injections

Repository: https://github.com/ThinkBeDo/drip-iv-dashboard
