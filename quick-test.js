const { importWeeklyData } = require('./import-weekly-data');

// Mock a simple database pool
global.pool = {
  query: async () => ({ rows: [] }),
  end: async () => {}
};

async function quickTest() {
  const revenueFile = '/Users/tylerlafleur/Downloads/Patient Analysis (Charge Details & Payments) - V3  - With COGS (1).xls';
  
  try {
    console.log('Testing import...');
    const result = await importWeeklyData(revenueFile, null, global.pool);
    
    console.log('\nSERVICE COUNTS:');
    console.log('Weight Loss Injections:', result.semaglutide_injections_weekly || 0);
    console.log('Weekend Infusions:', result.iv_infusions_weekend_weekly || 0);
    console.log('Weekend Injections:', result.injections_weekend_weekly || 0);
    console.log('\nNEW MEMBERSHIPS:');
    console.log('Individual:', result.new_individual_members_weekly || 0);
    console.log('Family:', result.new_family_members_weekly || 0);
    console.log('Concierge:', result.new_concierge_members_weekly || 0);
    
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

quickTest();
