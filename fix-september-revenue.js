const XLSX = require('xlsx');
const fs = require('fs');

const filePath = 'Patient Analysis (Charge Details & Payments) - V3  - With COGS (2).xls';

console.log('='.repeat(80));
console.log('SEPTEMBER REVENUE FIX - MISSING WEEKS GENERATOR');
console.log('='.repeat(80));

// Helper function to categorize services (based on server.js logic)
function categorizeService(desc) {
  if (!desc) return 'uncategorized';
  
  const lower = desc.toLowerCase();
  
  // Weight Loss / Semaglutide indicators
  if (lower.includes('semaglutide') || lower.includes('ozempic') || 
      lower.includes('wegovy') || lower.includes('weight') ||
      lower.includes('contrave') || lower.includes('tirzepatide')) {
    return 'semaglutide';
  }
  
  // IV Therapy indicators
  if (lower.includes('iv') || lower.includes('infusion') || 
      lower.includes('injection') || lower.includes('vitamin') ||
      lower.includes('therapy') || lower.includes('boost')) {
    return 'drip_iv';
  }
  
  return 'other';
}

try {
  console.log(`📂 Reading file: ${filePath}`);
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws);
  
  console.log(`✅ Loaded ${data.length} rows`);
  
  // Process data by week
  const weeklyData = new Map();
  
  data.forEach(row => {
    let dateStr = row['Date'] || row['Date Of Payment'] || '';
    
    if (!dateStr) return;
    
    // Convert Excel date serial to Date if needed
    if (typeof dateStr === 'number') {
      const excelEpoch = new Date(1899, 11, 30);
      const date = new Date(excelEpoch.getTime() + dateStr * 86400000);
      dateStr = date.toLocaleDateString('en-US');
    } else {
      dateStr = String(dateStr);
    }
    
    // Parse date
    let date = new Date(dateStr);
    if (isNaN(date.getTime()) || date.getFullYear() < 2020) {
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        const month = parseInt(parts[0]);
        const day = parseInt(parts[1]);
        let year = parseInt(parts[2]);
        if (year < 100) year += 2000;
        date = new Date(year, month - 1, day);
      }
    }
    
    if (date && !isNaN(date.getTime()) && date.getFullYear() === 2025 && date.getMonth() === 8) { // September
      // Find Monday of the week
      const dayOfWeek = date.getDay();
      const monday = new Date(date);
      monday.setDate(date.getDate() - dayOfWeek + 1);
      
      const weekKey = monday.toISOString().split('T')[0];
      
      if (!weeklyData.has(weekKey)) {
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        
        weeklyData.set(weekKey, {
          week_start_date: weekKey,
          week_end_date: sunday.toISOString().split('T')[0],
          total_revenue: 0,
          drip_iv_revenue: 0,
          semaglutide_revenue: 0,
          other_revenue: 0,
          new_individual_members: 0,
          new_family_members: 0,
          new_concierge_members: 0,
          new_corporate_members: 0,
          records: []
        });
      }
      
      const weekData = weeklyData.get(weekKey);
      const amount = parseFloat(row['Calculated Payment (Line)'] || 0);
      const chargeDesc = row['Charge Desc'] || '';
      
      // Add to total
      weekData.total_revenue += amount;
      weekData.records.push(row);
      
      // Categorize revenue
      const category = categorizeService(chargeDesc);
      if (category === 'drip_iv') {
        weekData.drip_iv_revenue += amount;
      } else if (category === 'semaglutide') {
        weekData.semaglutide_revenue += amount;
      } else {
        weekData.other_revenue += amount;
      }
      
      // Count new memberships
      if (chargeDesc.toUpperCase().includes('(NEW)')) {
        const desc = chargeDesc.toLowerCase();
        if (desc.includes('individual')) weekData.new_individual_members++;
        else if (desc.includes('family')) weekData.new_family_members++;
        else if (desc.includes('concierge')) weekData.new_concierge_members++;
        else if (desc.includes('corporate')) weekData.new_corporate_members++;
      }
    }
  });
  
  console.log(`\n📊 Found ${weeklyData.size} September weeks:`);
  
  const sortedWeeks = Array.from(weeklyData.entries()).sort(([a], [b]) => a.localeCompare(b));
  
  // Current week that exists in database (based on dashboard screenshot)
  const existingWeek = '2025-09-22';
  
  console.log('\nWeek Summary:');
  sortedWeeks.forEach(([weekKey, data]) => {
    const status = weekKey === existingWeek ? ' ✅ (EXISTS IN DB)' : ' ❌ (MISSING FROM DB)';
    console.log(`${weekKey} to ${data.week_end_date}: $${data.total_revenue.toFixed(2)}${status}`);
    console.log(`  IV: $${data.drip_iv_revenue.toFixed(2)}, Weight Loss: $${data.semaglutide_revenue.toFixed(2)}`);
    console.log(`  New Members: Ind=${data.new_individual_members}, Fam=${data.new_family_members}`);
  });
  
  // Generate SQL for missing weeks
  const missingWeeks = sortedWeeks.filter(([weekKey]) => weekKey !== existingWeek);
  
  if (missingWeeks.length === 0) {
    console.log('\n✅ No missing weeks found - all data is already in database');
    return;
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('GENERATING SQL FOR MISSING WEEKS');
  console.log('='.repeat(80));
  
  let sqlCommands = [];
  
  missingWeeks.forEach(([weekKey, data]) => {
    const sql = `
INSERT INTO analytics_data (
  week_start_date,
  week_end_date,
  actual_weekly_revenue,
  drip_iv_revenue_weekly,
  semaglutide_revenue_weekly,
  new_individual_members_weekly,
  new_family_members_weekly,
  new_concierge_members_weekly,
  new_corporate_members_weekly,
  upload_date,
  created_at
) VALUES (
  '${data.week_start_date}',
  '${data.week_end_date}',
  ${data.total_revenue.toFixed(2)},
  ${data.drip_iv_revenue.toFixed(2)},
  ${data.semaglutide_revenue.toFixed(2)},
  ${data.new_individual_members},
  ${data.new_family_members},
  ${data.new_concierge_members},
  ${data.new_corporate_members},
  CURRENT_DATE,
  NOW()
);`.trim();
    
    sqlCommands.push(sql);
    
    console.log(`\n📅 Week ${data.week_start_date} to ${data.week_end_date}:`);
    console.log(`   Total Revenue: $${data.total_revenue.toFixed(2)}`);
    console.log(`   IV Therapy: $${data.drip_iv_revenue.toFixed(2)}`);
    console.log(`   Weight Loss: $${data.semaglutide_revenue.toFixed(2)}`);
    console.log(`   New Members: ${data.new_individual_members + data.new_family_members + data.new_concierge_members + data.new_corporate_members}`);
  });
  
  // Write SQL to file
  const sqlContent = sqlCommands.join('\n\n');
  fs.writeFileSync('september-missing-weeks.sql', sqlContent);
  
  console.log(`\n💾 SQL commands written to: september-missing-weeks.sql`);
  
  // Calculate what monthly totals should be
  const allWeeks = Array.from(weeklyData.values());
  const totalRevenue = allWeeks.reduce((sum, week) => sum + week.total_revenue, 0);
  const totalIV = allWeeks.reduce((sum, week) => sum + week.drip_iv_revenue, 0);
  const totalSema = allWeeks.reduce((sum, week) => sum + week.semaglutide_revenue, 0);
  
  console.log('\n' + '='.repeat(80));
  console.log('SEPTEMBER 2025 MONTHLY TOTALS (AFTER FIX)');
  console.log('='.repeat(80));
  console.log(`Total Revenue: $${totalRevenue.toFixed(2)}`);
  console.log(`IV Therapy: $${totalIV.toFixed(2)}`);
  console.log(`Weight Loss: $${totalSema.toFixed(2)}`);
  console.log(`Weeks: ${allWeeks.length}`);
  console.log(`Goal: $128,500.00`);
  console.log(`Progress: ${(totalRevenue / 128500 * 100).toFixed(1)}%`);
  
  console.log('\n' + '='.repeat(80));
  console.log('NEXT STEPS');
  console.log('='.repeat(80));
  console.log('1. Connect to Railway PostgreSQL database');
  console.log('2. Execute the SQL commands in september-missing-weeks.sql');
  console.log('3. Verify dashboard shows correct monthly totals');
  console.log('4. Dashboard should now show monthly totals different from weekly');
  console.log('='.repeat(80));
  
} catch (error) {
  console.error('❌ Error:', error.message);
}