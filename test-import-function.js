const path = require('path');
const { importWeeklyData } = require('./import-weekly-data');

async function testImport() {
  console.log('Testing importWeeklyData function with actual files...\n');
  
  const revenueFile = path.join(__dirname, 'Patient Analysis (Charge Details & Payments) - V3  - With COGS (2).csv');
  const membershipFile = path.join(__dirname, 'Drip IV Active Memberships.xlsx');
  
  try {
    console.log('Revenue file:', revenueFile);
    console.log('Membership file:', membershipFile);
    console.log('\nCalling importWeeklyData...\n');
    
    const result = await importWeeklyData(revenueFile, membershipFile);
    
    console.log('\n=== IMPORT RESULTS ===');
    console.log('\nDate Range:');
    console.log('  Week Start:', result.week_start_date);
    console.log('  Week End:', result.week_end_date);
    
    console.log('\nRevenue:');
    console.log('  Weekly Revenue: $' + result.actual_weekly_revenue.toFixed(2));
    console.log('  Monthly Revenue: $' + result.actual_monthly_revenue.toFixed(2));
    console.log('  IV Revenue (Weekly): $' + result.drip_iv_revenue_weekly.toFixed(2));
    console.log('  Semaglutide Revenue (Weekly): $' + result.semaglutide_revenue_weekly.toFixed(2));
    
    console.log('\nCustomers:');
    console.log('  Unique Weekly:', result.unique_customers_weekly);
    console.log('  Unique Monthly:', result.unique_customers_monthly);
    console.log('  Members Weekly:', result.member_customers_weekly);
    console.log('  Non-Members Weekly:', result.non_member_customers_weekly);
    
    console.log('\nService Counts:');
    console.log('  IV Infusions (Weekday):', result.iv_infusions_weekday_weekly);
    console.log('  IV Infusions (Weekend):', result.iv_infusions_weekend_weekly);
    console.log('  Injections (Weekday):', result.injections_weekday_weekly);
    console.log('  Injections (Weekend):', result.injections_weekend_weekly);
    
    console.log('\nMembership:');
    console.log('  Total Members:', result.total_drip_iv_members);
    console.log('  Individual:', result.individual_memberships);
    console.log('  Family:', result.family_memberships);
    console.log('  Concierge:', result.concierge_memberships);
    console.log('  Corporate:', result.corporate_memberships);
    
    console.log('\n✅ Import test completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Import test failed:', error.message);
    console.error('Stack:', error.stack);
  }
  
  // Exit after test
  process.exit(0);
}

testImport();