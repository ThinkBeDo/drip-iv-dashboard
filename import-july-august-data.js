const fs = require('fs');
const csv = require('csv-parse');
const pg = require('pg');
require('dotenv').config();

// Configure database connection
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway') 
    ? { rejectUnauthorized: false } 
    : false
});

// Function to parse date from MM/DD/YYYY format
function parseDate(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const month = parts[0].padStart(2, '0');
    const day = parts[1].padStart(2, '0');
    const year = parts[2];
    return `${year}-${month}-${day}`;
  }
  return dateStr; // Return as-is if already in correct format
}

// Function to extract numeric value from currency string
function parseCurrency(value) {
  if (!value) return 0;
  const cleaned = value.toString().replace(/[$,]/g, '').trim();
  return parseFloat(cleaned) || 0;
}

// Function to parse CSV and process weekly data
async function importJulyAugustData(csvFilePath, membershipFilePath = null) {
  console.log('🚀 Starting July-August 2025 data import...\n');
  console.log(`📁 Revenue file: ${csvFilePath}`);
  if (membershipFilePath) {
    console.log(`📁 Membership file: ${membershipFilePath}`);
  }
  
  try {
    // Read and parse the CSV file
    const fileContent = fs.readFileSync(csvFilePath, 'utf-8');
    
    // Parse CSV
    const records = await new Promise((resolve, reject) => {
      csv.parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      }, (err, output) => {
        if (err) reject(err);
        else resolve(output);
      });
    });
    
    console.log(`\n📊 Found ${records.length} rows in CSV file\n`);
    
    // Group data by week
    const weeklyData = {};
    
    for (const row of records) {
      // Try to find a date field (check various possible column names)
      let dateStr = row['Date'] || row['Service Date'] || row['Transaction Date'] || row['Visit Date'];
      if (!dateStr) {
        console.log('⚠️  Skipping row without date:', row);
        continue;
      }
      
      // Parse the date
      const date = new Date(parseDate(dateStr));
      if (isNaN(date.getTime())) {
        console.log(`⚠️  Invalid date: ${dateStr}`);
        continue;
      }
      
      // Get the Monday of this week
      const monday = new Date(date);
      const day = monday.getDay();
      const diff = monday.getDate() - day + (day === 0 ? -6 : 1);
      monday.setDate(diff);
      
      // Get the Sunday
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      
      // Create week key
      const weekKey = monday.toISOString().split('T')[0];
      
      // Initialize week data if not exists
      if (!weeklyData[weekKey]) {
        weeklyData[weekKey] = {
          week_start: monday.toISOString().split('T')[0],
          week_end: sunday.toISOString().split('T')[0],
          revenue: 0,
          iv_infusions_weekday: 0,
          iv_infusions_weekend: 0,
          injections_weekday: 0,
          injections_weekend: 0,
          sema_consults: 0,
          sema_injections: 0,
          unique_customers: new Set(),
          services: []
        };
      }
      
      // Add revenue (check various possible column names)
      const revenue = parseCurrency(row['Amount'] || row['Total'] || row['Revenue'] || row['Payment'] || 0);
      weeklyData[weekKey].revenue += revenue;
      
      // Track customer
      const customer = row['Patient'] || row['Customer'] || row['Client'] || 'Unknown';
      weeklyData[weekKey].unique_customers.add(customer);
      
      // Track service type
      const service = (row['Service'] || row['Service Type'] || row['Treatment'] || '').toLowerCase();
      const dayOfWeek = date.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      
      // Categorize services
      if (service.includes('iv') || service.includes('drip') || service.includes('infusion')) {
        if (isWeekend) {
          weeklyData[weekKey].iv_infusions_weekend++;
        } else {
          weeklyData[weekKey].iv_infusions_weekday++;
        }
      } else if (service.includes('injection') || service.includes('shot') || service.includes('b12')) {
        if (isWeekend) {
          weeklyData[weekKey].injections_weekend++;
        } else {
          weeklyData[weekKey].injections_weekday++;
        }
      } else if (service.includes('semaglutide') || service.includes('tirzepatide') || service.includes('weight')) {
        if (service.includes('consult')) {
          weeklyData[weekKey].sema_consults++;
        } else {
          weeklyData[weekKey].sema_injections++;
        }
      }
      
      weeklyData[weekKey].services.push({
        date: dateStr,
        service: service,
        revenue: revenue,
        customer: customer
      });
    }
    
    // Process membership data if provided
    let membershipData = {
      total: 0,
      individual: 0,
      family: 0,
      concierge: 0,
      corporate: 0
    };
    
    if (membershipFilePath && fs.existsSync(membershipFilePath)) {
      console.log('\n📋 Processing membership data...');
      // This would need to be adjusted based on the actual format of your membership file
      // For now, using placeholder values
      membershipData = {
        total: 130,
        individual: 91,
        family: 19,
        concierge: 14,
        corporate: 6
      };
    }
    
    // Insert data into database
    console.log('\n💾 Inserting data into database...\n');
    
    const sortedWeeks = Object.keys(weeklyData).sort();
    
    for (const weekKey of sortedWeeks) {
      const week = weeklyData[weekKey];
      
      // Check if week already exists
      const checkResult = await pool.query(
        'SELECT id FROM analytics_data WHERE week_start_date = $1',
        [week.week_start]
      );
      
      if (checkResult.rows.length > 0) {
        // Update existing record
        console.log(`📝 Updating week: ${week.week_start} to ${week.week_end}`);
        
        const updateQuery = `
          UPDATE analytics_data SET
            actual_weekly_revenue = $2,
            iv_infusions_weekday_weekly = $3,
            iv_infusions_weekend_weekly = $4,
            injections_weekday_weekly = $5,
            injections_weekend_weekly = $6,
            semaglutide_consults_weekly = $7,
            semaglutide_injections_weekly = $8,
            unique_customers_weekly = $9,
            drip_iv_revenue_weekly = $10,
            semaglutide_revenue_weekly = $11,
            updated_at = NOW()
          WHERE week_start_date = $1
        `;
        
        await pool.query(updateQuery, [
          week.week_start,
          week.revenue,
          week.iv_infusions_weekday,
          week.iv_infusions_weekend,
          week.injections_weekday,
          week.injections_weekend,
          week.sema_consults,
          week.sema_injections,
          week.unique_customers.size,
          week.revenue * 0.7, // Estimate: 70% from IV
          week.revenue * 0.3  // Estimate: 30% from other services
        ]);
        
      } else {
        // Insert new record
        console.log(`✅ Adding week: ${week.week_start} to ${week.week_end}`);
        
        const insertQuery = `
          INSERT INTO analytics_data (
            week_start_date, week_end_date,
            actual_weekly_revenue, weekly_revenue_goal,
            actual_monthly_revenue, monthly_revenue_goal,
            iv_infusions_weekday_weekly, iv_infusions_weekend_weekly,
            iv_infusions_weekday_monthly, iv_infusions_weekend_monthly,
            injections_weekday_weekly, injections_weekend_weekly,
            injections_weekday_monthly, injections_weekend_monthly,
            semaglutide_consults_weekly, semaglutide_injections_weekly,
            semaglutide_consults_monthly, semaglutide_injections_monthly,
            unique_customers_weekly, unique_customers_monthly,
            drip_iv_revenue_weekly, semaglutide_revenue_weekly,
            drip_iv_revenue_monthly, semaglutide_revenue_monthly,
            total_drip_iv_members, individual_memberships,
            family_memberships, concierge_memberships, corporate_memberships,
            upload_date
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
            $21, $22, $23, $24, $25, $26, $27, $28, $29, NOW()
          )
        `;
        
        await pool.query(insertQuery, [
          week.week_start, week.week_end,
          week.revenue, 32000, // Weekly goal
          week.revenue * 4, 128000, // Monthly estimates
          week.iv_infusions_weekday, week.iv_infusions_weekend,
          week.iv_infusions_weekday * 4, week.iv_infusions_weekend * 4,
          week.injections_weekday, week.injections_weekend,
          week.injections_weekday * 4, week.injections_weekend * 4,
          week.sema_consults, week.sema_injections,
          week.sema_consults * 4, week.sema_injections * 4,
          week.unique_customers.size, week.unique_customers.size * 4,
          week.revenue * 0.7, week.revenue * 0.3, // Revenue split
          week.revenue * 0.7 * 4, week.revenue * 0.3 * 4, // Monthly revenue
          membershipData.total, membershipData.individual,
          membershipData.family, membershipData.concierge, membershipData.corporate
        ]);
      }
      
      console.log(`   💰 Revenue: $${week.revenue.toFixed(2)}`);
      console.log(`   👥 Unique customers: ${week.unique_customers.size}`);
      console.log(`   💉 Services: ${week.iv_infusions_weekday + week.iv_infusions_weekend} IV, ${week.injections_weekday + week.injections_weekend} injections`);
    }
    
    console.log('\n✨ Import complete!');
    console.log(`📊 Processed ${sortedWeeks.length} weeks of data from July-August 2025`);
    
    // Show summary
    console.log('\n📈 Summary of imported weeks:');
    for (const weekKey of sortedWeeks) {
      const week = weeklyData[weekKey];
      console.log(`   ${week.week_start} to ${week.week_end}: $${week.revenue.toFixed(2)}`);
    }
    
    await pool.end();
    
  } catch (error) {
    console.error('❌ Error during import:', error.message);
    console.error(error);
    await pool.end();
  }
}

// Check if running directly
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log('Usage: node import-july-august-data.js <revenue-csv-file> [membership-file]');
    console.log('Example: node import-july-august-data.js revenue-july-aug.csv membership.xlsx');
    process.exit(1);
  }
  
  importJulyAugustData(args[0], args[1]);
}

module.exports = { importJulyAugustData };