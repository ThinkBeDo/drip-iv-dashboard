const fs = require('fs');
const csv = require('csv-parse');
const pg = require('pg');
require('dotenv').config();

// Configure database connection
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:HAKCPSPQMVOhnwIEtFgiNLjOmJzJMlxR@autorack.proxy.rlwy.net:16513/railway',
  ssl: { rejectUnauthorized: false }
});

// Function to parse date from M/D/YY format
function parseDate(dateStr) {
  if (!dateStr) return null;
  
  // Handle M/D/YY format
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const month = parts[0].padStart(2, '0');
    const day = parts[1].padStart(2, '0');
    let year = parts[2];
    
    // Handle 2-digit year
    if (year.length === 2) {
      year = '20' + year;
    }
    
    return `${year}-${month}-${day}`;
  }
  return dateStr;
}

// Function to extract numeric value from currency string
function parseCurrency(value) {
  if (!value) return 0;
  const cleaned = value.toString().replace(/[$,]/g, '').trim();
  return parseFloat(cleaned) || 0;
}

// Get Monday of the week for a date
function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d;
}

// Get Sunday from Monday
function getSunday(monday) {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return sunday;
}

async function importDripData(csvFilePath) {
  console.log('🚀 Starting Drip IV July-August 2025 data import...\n');
  console.log(`📁 Processing file: ${csvFilePath}\n`);
  
  try {
    // Read the CSV file
    const fileContent = fs.readFileSync(csvFilePath, 'utf-8');
    
    // Parse CSV
    const records = await new Promise((resolve, reject) => {
      csv.parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_quotes: true,
        skip_records_with_empty_values: false
      }, (err, output) => {
        if (err) reject(err);
        else resolve(output);
      });
    });
    
    console.log(`📊 Found ${records.length} rows in CSV file\n`);
    
    // Group data by week
    const weeklyData = {};
    const membershipTracking = {};
    
    for (const row of records) {
      // Get the date from the Date column
      const dateStr = row['Date'];
      if (!dateStr) continue;
      
      // Parse the date
      const date = new Date(parseDate(dateStr));
      if (isNaN(date.getTime())) {
        console.log(`⚠️  Invalid date: ${dateStr}`);
        continue;
      }
      
      // Get the Monday and Sunday of this week
      const monday = getMonday(date);
      const sunday = getSunday(monday);
      
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
          member_customers: new Set(),
          services: [],
          memberships: {
            individual: new Set(),
            family: new Set(),
            concierge: new Set(),
            corporate: new Set()
          }
        };
      }
      
      // Get service details
      const service = (row['Charge Desc'] || '').toLowerCase();
      const customer = row['Patient'] || 'Unknown';
      const revenue = parseCurrency(row['Calculated Payment (Line)'] || row['Charges - Discount'] || 0);
      
      // Add revenue
      weeklyData[weekKey].revenue += revenue;
      
      // Track unique customer
      weeklyData[weekKey].unique_customers.add(customer);
      
      // Check if it's a membership
      if (service.includes('membership')) {
        weeklyData[weekKey].member_customers.add(customer);
        
        if (service.includes('individual')) {
          weeklyData[weekKey].memberships.individual.add(customer);
        } else if (service.includes('family')) {
          weeklyData[weekKey].memberships.family.add(customer);
        } else if (service.includes('concierge')) {
          weeklyData[weekKey].memberships.concierge.add(customer);
        } else if (service.includes('corporate')) {
          weeklyData[weekKey].memberships.corporate.add(customer);
        }
      }
      
      // Categorize services
      const dayOfWeek = date.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      
      if (service.includes('iv') || service.includes('drip') || service.includes('infusion') || 
          service.includes('nad') || service.includes('myers') || service.includes('immune')) {
        if (isWeekend) {
          weeklyData[weekKey].iv_infusions_weekend++;
        } else {
          weeklyData[weekKey].iv_infusions_weekday++;
        }
      } else if (service.includes('injection') || service.includes('shot') || service.includes('b12') || 
                 service.includes('glutathione') || service.includes('vitamin')) {
        if (isWeekend) {
          weeklyData[weekKey].injections_weekend++;
        } else {
          weeklyData[weekKey].injections_weekday++;
        }
      } else if (service.includes('semaglutide') || service.includes('tirzepatide') || service.includes('wegovy') || 
                 service.includes('ozempic') || service.includes('weight loss')) {
        if (service.includes('consult')) {
          weeklyData[weekKey].sema_consults++;
        } else {
          weeklyData[weekKey].sema_injections++;
        }
      }
      
      // Store service detail
      weeklyData[weekKey].services.push({
        date: dateStr,
        service: row['Charge Desc'],
        revenue: revenue,
        customer: customer
      });
    }
    
    // Calculate total memberships across all weeks
    let totalMembers = {
      individual: new Set(),
      family: new Set(),
      concierge: new Set(),
      corporate: new Set()
    };
    
    for (const week of Object.values(weeklyData)) {
      week.memberships.individual.forEach(m => totalMembers.individual.add(m));
      week.memberships.family.forEach(m => totalMembers.family.add(m));
      week.memberships.concierge.forEach(m => totalMembers.concierge.add(m));
      week.memberships.corporate.forEach(m => totalMembers.corporate.add(m));
    }
    
    const currentMembershipTotals = {
      individual: totalMembers.individual.size,
      family: totalMembers.family.size * 2, // Family counts as 2
      concierge: totalMembers.concierge.size,
      corporate: totalMembers.corporate.size * 10, // Corporate counts as 10
      total: totalMembers.individual.size + (totalMembers.family.size * 2) + 
             totalMembers.concierge.size + (totalMembers.corporate.size * 10)
    };
    
    console.log('📊 Membership Summary:');
    console.log(`   Individual: ${currentMembershipTotals.individual}`);
    console.log(`   Family: ${totalMembers.family.size} (${currentMembershipTotals.family} members)`);
    console.log(`   Concierge: ${currentMembershipTotals.concierge}`);
    console.log(`   Corporate: ${totalMembers.corporate.size} (${currentMembershipTotals.corporate} members)`);
    console.log(`   TOTAL: ${currentMembershipTotals.total} members\n`);
    
    // Insert/update data in database
    console.log('💾 Updating database...\n');
    
    const sortedWeeks = Object.keys(weeklyData).sort();
    
    for (const weekKey of sortedWeeks) {
      const week = weeklyData[weekKey];
      
      // Check if week exists
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
            weekly_revenue_goal = 32000,
            actual_monthly_revenue = $3,
            monthly_revenue_goal = 128000,
            iv_infusions_weekday_weekly = $4,
            iv_infusions_weekend_weekly = $5,
            iv_infusions_weekday_monthly = $6,
            iv_infusions_weekend_monthly = $7,
            injections_weekday_weekly = $8,
            injections_weekend_weekly = $9,
            injections_weekday_monthly = $10,
            injections_weekend_monthly = $11,
            semaglutide_consults_weekly = $12,
            semaglutide_injections_weekly = $13,
            semaglutide_consults_monthly = $14,
            semaglutide_injections_monthly = $15,
            unique_customers_weekly = $16,
            unique_customers_monthly = $17,
            member_customers_weekly = $18,
            non_member_customers_weekly = $19,
            drip_iv_revenue_weekly = $20,
            semaglutide_revenue_weekly = $21,
            drip_iv_revenue_monthly = $22,
            semaglutide_revenue_monthly = $23,
            total_drip_iv_members = $24,
            individual_memberships = $25,
            family_memberships = $26,
            concierge_memberships = $27,
            corporate_memberships = $28,
            updated_at = NOW()
          WHERE week_start_date = $1
        `;
        
        await pool.query(updateQuery, [
          week.week_start,
          week.revenue,
          week.revenue * 4, // Monthly estimate
          week.iv_infusions_weekday,
          week.iv_infusions_weekend,
          week.iv_infusions_weekday * 4,
          week.iv_infusions_weekend * 4,
          week.injections_weekday,
          week.injections_weekend,
          week.injections_weekday * 4,
          week.injections_weekend * 4,
          week.sema_consults,
          week.sema_injections,
          week.sema_consults * 4,
          week.sema_injections * 4,
          week.unique_customers.size,
          week.unique_customers.size * 4,
          week.member_customers.size,
          week.unique_customers.size - week.member_customers.size,
          week.revenue * 0.7, // IV revenue estimate
          week.revenue * 0.3, // Sema revenue estimate
          week.revenue * 0.7 * 4,
          week.revenue * 0.3 * 4,
          currentMembershipTotals.total,
          currentMembershipTotals.individual,
          currentMembershipTotals.family,
          currentMembershipTotals.concierge,
          currentMembershipTotals.corporate
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
            member_customers_weekly, non_member_customers_weekly,
            drip_iv_revenue_weekly, semaglutide_revenue_weekly,
            drip_iv_revenue_monthly, semaglutide_revenue_monthly,
            total_drip_iv_members, individual_memberships,
            family_memberships, concierge_memberships, corporate_memberships,
            upload_date
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
            $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
            $31, NOW()
          )
        `;
        
        await pool.query(insertQuery, [
          week.week_start, week.week_end,
          week.revenue, 32000,
          week.revenue * 4, 128000,
          week.iv_infusions_weekday, week.iv_infusions_weekend,
          week.iv_infusions_weekday * 4, week.iv_infusions_weekend * 4,
          week.injections_weekday, week.injections_weekend,
          week.injections_weekday * 4, week.injections_weekend * 4,
          week.sema_consults, week.sema_injections,
          week.sema_consults * 4, week.sema_injections * 4,
          week.unique_customers.size, week.unique_customers.size * 4,
          week.member_customers.size,
          week.unique_customers.size - week.member_customers.size,
          week.revenue * 0.7, week.revenue * 0.3,
          week.revenue * 0.7 * 4, week.revenue * 0.3 * 4,
          currentMembershipTotals.total,
          currentMembershipTotals.individual,
          currentMembershipTotals.family,
          currentMembershipTotals.concierge,
          currentMembershipTotals.corporate
        ]);
      }
      
      console.log(`   💰 Revenue: $${week.revenue.toFixed(2)}`);
      console.log(`   👥 Customers: ${week.unique_customers.size} (${week.member_customers.size} members)`);
      console.log(`   💉 Services: ${week.iv_infusions_weekday + week.iv_infusions_weekend} IV, ${week.injections_weekday + week.injections_weekend} injections\n`);
    }
    
    console.log('✨ Import complete!\n');
    console.log('📈 Weekly Revenue Summary:');
    let totalRevenue = 0;
    for (const weekKey of sortedWeeks) {
      const week = weeklyData[weekKey];
      console.log(`   ${week.week_start} to ${week.week_end}: $${week.revenue.toFixed(2)}`);
      totalRevenue += week.revenue;
    }
    console.log(`   TOTAL: $${totalRevenue.toFixed(2)}`);
    
    await pool.end();
    
  } catch (error) {
    console.error('❌ Error during import:', error.message);
    console.error(error);
    await pool.end();
  }
}

// Run the import
importDripData('revenue-july-august.csv');