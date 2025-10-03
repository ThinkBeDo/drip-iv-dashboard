const XLSX = require('xlsx');

const filePath = 'Patient Analysis (Charge Details & Payments) - V3  - With COGS (2).xls';

console.log('='.repeat(80));
console.log('DATA CATEGORIZATION INVESTIGATION');
console.log('='.repeat(80));
console.log('You mentioned September weeks should have ~$30K each, but analysis shows:');
console.log('- Sep 15-21: $54.01 (❌ Too low)');
console.log('- Sep 22-28: $29,842.51 (✅ Looks correct)'); 
console.log('- Sep 29-Oct 5: $2,237.30 (❌ Too low)');
console.log('');
console.log('Investigating potential issues...');

// Copy categorization logic from server.js
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
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws);
  
  console.log(`\n📂 Analyzing ${data.length} records...`);
  
  // Analyze by week with detailed categorization
  const weeklyAnalysis = new Map();
  let totalRecords = 0;
  let recordsWithRevenue = 0;
  let totalFileRevenue = 0;
  
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
      totalRecords++;
      
      // Find Monday of the week
      const dayOfWeek = date.getDay();
      const monday = new Date(date);
      monday.setDate(date.getDate() - dayOfWeek + 1);
      const weekKey = monday.toISOString().split('T')[0];
      
      if (!weeklyAnalysis.has(weekKey)) {
        weeklyAnalysis.set(weekKey, {
          total_revenue: 0,
          drip_iv_revenue: 0,
          semaglutide_revenue: 0,
          other_revenue: 0,
          uncategorized_revenue: 0,
          record_count: 0,
          charge_types: new Map(),
          sample_records: []
        });
      }
      
      const weekData = weeklyAnalysis.get(weekKey);
      const amount = parseFloat(row['Calculated Payment (Line)'] || 0);
      const chargeDesc = row['Charge Desc'] || '';
      const chargeType = row['Charge Type'] || '';
      
      if (amount > 0) {
        recordsWithRevenue++;
        totalFileRevenue += amount;
        
        weekData.total_revenue += amount;
        weekData.record_count++;
        
        // Track charge types
        weekData.charge_types.set(chargeType, (weekData.charge_types.get(chargeType) || 0) + amount);
        
        // Categorize
        const category = categorizeService(chargeDesc);
        if (category === 'drip_iv') {
          weekData.drip_iv_revenue += amount;
        } else if (category === 'semaglutide') {
          weekData.semaglutide_revenue += amount;
        } else if (category === 'other') {
          weekData.other_revenue += amount;
        } else {
          weekData.uncategorized_revenue += amount;
        }
        
        // Store sample records for investigation
        if (weekData.sample_records.length < 5) {
          weekData.sample_records.push({
            date: date.toDateString(),
            amount: amount,
            chargeDesc: chargeDesc,
            chargeType: chargeType,
            category: category,
            patient: row['Patient'] || 'Unknown'
          });
        }
      }
    }
  });
  
  console.log(`\n📊 Overall September 2025 Analysis:`);
  console.log(`   Total records: ${totalRecords}`);
  console.log(`   Records with revenue: ${recordsWithRevenue}`);
  console.log(`   Total file revenue: $${totalFileRevenue.toFixed(2)}`);
  console.log(`   Average per record: $${(totalFileRevenue / recordsWithRevenue).toFixed(2)}`);
  
  console.log(`\n📅 Weekly Breakdown:`);
  
  const sortedWeeks = Array.from(weeklyAnalysis.entries()).sort(([a], [b]) => a.localeCompare(b));
  
  sortedWeeks.forEach(([weekKey, data]) => {
    const endDate = new Date(weekKey);
    endDate.setDate(endDate.getDate() + 6);
    
    console.log(`\n🗓️  Week ${weekKey} to ${endDate.toISOString().split('T')[0]}:`);
    console.log(`   📈 Total Revenue: $${data.total_revenue.toFixed(2)} (${data.record_count} records)`);
    console.log(`   💉 IV Therapy: $${data.drip_iv_revenue.toFixed(2)}`);
    console.log(`   🏋️  Weight Loss: $${data.semaglutide_revenue.toFixed(2)}`);
    console.log(`   🔧 Other Services: $${data.other_revenue.toFixed(2)}`);
    console.log(`   ❓ Uncategorized: $${data.uncategorized_revenue.toFixed(2)}`);
    
    console.log(`\n   📋 Charge Types:`);
    [...data.charge_types.entries()].sort(([,a], [,b]) => b - a).forEach(([type, amount]) => {
      console.log(`      ${type}: $${amount.toFixed(2)}`);
    });
    
    console.log(`\n   🔍 Sample Records:`);
    data.sample_records.forEach((record, i) => {
      console.log(`      ${i + 1}. ${record.patient} - ${record.chargeDesc} - $${record.amount} (${record.category})`);
    });
    
    // Flag potential issues
    if (data.total_revenue < 10000) {
      console.log(`   ⚠️  WARNING: Revenue seems too low for a full week`);
    }
    if (data.uncategorized_revenue > data.total_revenue * 0.5) {
      console.log(`   ⚠️  WARNING: High uncategorized revenue - categorization may be failing`);
    }
    if (data.record_count < 50) {
      console.log(`   ⚠️  WARNING: Very few records for a full week`);
    }
  });
  
  console.log('\n' + '='.repeat(80));
  console.log('POTENTIAL ISSUES IDENTIFIED');
  console.log('='.repeat(80));
  
  // Check for missing data in certain weeks
  const lowRevenueWeeks = sortedWeeks.filter(([_, data]) => data.total_revenue < 10000);
  if (lowRevenueWeeks.length > 0) {
    console.log('\n❌ LOW REVENUE WEEKS DETECTED:');
    lowRevenueWeeks.forEach(([week, data]) => {
      console.log(`   ${week}: Only $${data.total_revenue.toFixed(2)} with ${data.record_count} records`);
    });
    console.log('\n   POSSIBLE CAUSES:');
    console.log('   1. 📁 Data is split across multiple Excel files');
    console.log('   2. 📅 Week boundaries may be incorrect'); 
    console.log('   3. 🗓️  Some data may be in different date columns');
    console.log('   4. 💰 Revenue may be in different amount columns');
  }
  
  // Check for categorization issues
  const highUncategorized = sortedWeeks.filter(([_, data]) => data.uncategorized_revenue > data.total_revenue * 0.3);
  if (highUncategorized.length > 0) {
    console.log('\n❌ CATEGORIZATION ISSUES DETECTED:');
    highUncategorized.forEach(([week, data]) => {
      console.log(`   ${week}: ${((data.uncategorized_revenue / data.total_revenue) * 100).toFixed(1)}% uncategorized`);
    });
  }
  
  console.log('\n✅ RECOMMENDATION:');
  if (lowRevenueWeeks.length > 0) {
    console.log('   The low revenue amounts suggest missing data files.');
    console.log('   Check if there are additional Excel files for September weeks.');
    console.log('   The current file may only contain partial data.');
  } else {
    console.log('   Revenue amounts look reasonable. The issue may be in the database upload process.');
  }
  
} catch (error) {
  console.error('❌ Error:', error.message);
}