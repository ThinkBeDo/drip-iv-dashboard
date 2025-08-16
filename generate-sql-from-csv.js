const fs = require('fs');
const csv = require('csv-parse');

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

async function generateSQL(csvFilePath) {
  console.log('📊 Processing CSV file...\n');
  
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
    
    console.log(`Found ${records.length} rows\n`);
    
    // Group data by week
    const weeklyData = {};
    const membershipTracking = {};
    
    for (const row of records) {
      // Get the date from the Date column
      const dateStr = row['Date'];
      if (!dateStr) continue;
      
      // Parse the date
      const date = new Date(parseDate(dateStr));
      if (isNaN(date.getTime())) continue;
      
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
      } else if (service.includes('semaglutide') || service.includes('tirzepatide') || service.includes('weight')) {
        if (service.includes('consult')) {
          weeklyData[weekKey].sema_consults++;
        } else {
          weeklyData[weekKey].sema_injections++;
        }
      }
    }
    
    // Calculate total memberships
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
    
    const membershipTotals = {
      individual: totalMembers.individual.size,
      family: totalMembers.family.size * 2,
      concierge: totalMembers.concierge.size,
      corporate: totalMembers.corporate.size * 10,
      total: totalMembers.individual.size + (totalMembers.family.size * 2) + 
             totalMembers.concierge.size + (totalMembers.corporate.size * 10)
    };
    
    console.log('📊 Membership Summary:');
    console.log(`   Individual: ${membershipTotals.individual}`);
    console.log(`   Family: ${totalMembers.family.size} families (${membershipTotals.family} members)`);
    console.log(`   Concierge: ${membershipTotals.concierge}`);
    console.log(`   Corporate: ${totalMembers.corporate.size} companies (${membershipTotals.corporate} members)`);
    console.log(`   TOTAL: ${membershipTotals.total} members\n`);
    
    // Generate SQL
    let sql = '-- Drip IV July-August 2025 Data Import\n';
    sql += '-- Generated from revenue CSV file\n\n';
    
    const sortedWeeks = Object.keys(weeklyData).sort();
    
    for (const weekKey of sortedWeeks) {
      const week = weeklyData[weekKey];
      
      sql += `-- Week: ${week.week_start} to ${week.week_end}\n`;
      sql += `-- Revenue: $${week.revenue.toFixed(2)}, Customers: ${week.unique_customers.size}\n`;
      
      sql += `DELETE FROM analytics_data WHERE week_start_date = '${week.week_start}';\n`;
      
      sql += `INSERT INTO analytics_data (\n`;
      sql += `  week_start_date, week_end_date,\n`;
      sql += `  actual_weekly_revenue, weekly_revenue_goal,\n`;
      sql += `  actual_monthly_revenue, monthly_revenue_goal,\n`;
      sql += `  iv_infusions_weekday_weekly, iv_infusions_weekend_weekly,\n`;
      sql += `  iv_infusions_weekday_monthly, iv_infusions_weekend_monthly,\n`;
      sql += `  injections_weekday_weekly, injections_weekend_weekly,\n`;
      sql += `  injections_weekday_monthly, injections_weekend_monthly,\n`;
      sql += `  semaglutide_consults_weekly, semaglutide_injections_weekly,\n`;
      sql += `  semaglutide_consults_monthly, semaglutide_injections_monthly,\n`;
      sql += `  unique_customers_weekly, unique_customers_monthly,\n`;
      sql += `  member_customers_weekly, non_member_customers_weekly,\n`;
      sql += `  drip_iv_revenue_weekly, semaglutide_revenue_weekly,\n`;
      sql += `  drip_iv_revenue_monthly, semaglutide_revenue_monthly,\n`;
      sql += `  total_drip_iv_members, individual_memberships,\n`;
      sql += `  family_memberships, concierge_memberships, corporate_memberships,\n`;
      sql += `  upload_date\n`;
      sql += `) VALUES (\n`;
      sql += `  '${week.week_start}', '${week.week_end}',\n`;
      sql += `  ${week.revenue.toFixed(2)}, 32000,\n`;
      sql += `  ${(week.revenue * 4).toFixed(2)}, 128000,\n`;
      sql += `  ${week.iv_infusions_weekday}, ${week.iv_infusions_weekend},\n`;
      sql += `  ${week.iv_infusions_weekday * 4}, ${week.iv_infusions_weekend * 4},\n`;
      sql += `  ${week.injections_weekday}, ${week.injections_weekend},\n`;
      sql += `  ${week.injections_weekday * 4}, ${week.injections_weekend * 4},\n`;
      sql += `  ${week.sema_consults}, ${week.sema_injections},\n`;
      sql += `  ${week.sema_consults * 4}, ${week.sema_injections * 4},\n`;
      sql += `  ${week.unique_customers.size}, ${week.unique_customers.size * 4},\n`;
      sql += `  ${week.member_customers.size}, ${week.unique_customers.size - week.member_customers.size},\n`;
      sql += `  ${(week.revenue * 0.7).toFixed(2)}, ${(week.revenue * 0.3).toFixed(2)},\n`;
      sql += `  ${(week.revenue * 0.7 * 4).toFixed(2)}, ${(week.revenue * 0.3 * 4).toFixed(2)},\n`;
      sql += `  ${membershipTotals.total}, ${membershipTotals.individual},\n`;
      sql += `  ${membershipTotals.family}, ${membershipTotals.concierge}, ${membershipTotals.corporate},\n`;
      sql += `  NOW()\n`;
      sql += `);\n\n`;
    }
    
    // Write SQL to file
    fs.writeFileSync('july-august-import.sql', sql);
    console.log('✅ SQL file generated: july-august-import.sql\n');
    
    // Show summary
    console.log('📈 Weekly Summary:');
    let totalRevenue = 0;
    for (const weekKey of sortedWeeks) {
      const week = weeklyData[weekKey];
      console.log(`   ${week.week_start}: $${week.revenue.toFixed(2)}`);
      totalRevenue += week.revenue;
    }
    console.log(`   TOTAL: $${totalRevenue.toFixed(2)}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the generation
generateSQL('revenue-july-august.csv');