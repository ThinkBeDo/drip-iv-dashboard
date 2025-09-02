#!/usr/bin/env node

const { importWeeklyData } = require('./import-weekly-data');

async function testImport() {
  console.log('🧪 Testing import with production file...\n');
  
  const revenueFile = '/Users/tylerlafleur/Downloads/Patient Analysis (Charge Details & Payments) - V3  - With COGS (1).xls';
  const membershipFile = '/Users/tylerlafleur/Downloads/Drip IV Active Memberships (1).xlsx';
  
  try {
    const result = await importWeeklyData(revenueFile, membershipFile);
    
    console.log('\n✅ Import completed successfully!');
    console.log('\nFINAL RESULTS:');
    console.log('═'.repeat(60));
    console.log(`Week: ${result.week_start_date} to ${result.week_end_date}`);
    console.log(`Total Weekly Revenue: $${result.actual_weekly_revenue}`);
    console.log(`Total Monthly Revenue: $${result.actual_monthly_revenue}`);
    console.log(`IV Therapy Revenue: $${result.drip_iv_revenue_weekly}`);
    console.log(`Weight Loss Revenue: $${result.semaglutide_revenue_weekly}`);
    console.log(`Total Members: ${result.total_drip_iv_members}`);
    console.log('═'.repeat(60));
    
  } catch (error) {
    console.error('❌ Import failed:', error.message);
    console.error(error.stack);
  }
}

testImport();
