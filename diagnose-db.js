require('dotenv').config();
const { Pool } = require('pg');

async function diagnoseDatabaseIssues() {
  console.log('=== DATABASE DIAGNOSTIC CHECK ===\n');
  
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('ERROR: DATABASE_URL not found in environment');
    return;
  }
  
  console.log('Connecting to Railway database...');
  console.log('Connection string:', connectionString.replace(/:[^@]+@/, ':****@'));
  
  const pool = new Pool({ 
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    // 1. Check if table exists
    console.log('\n1. Checking if analytics_data table exists...');
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'analytics_data'
      );
    `);
    console.log('Table exists:', tableCheck.rows[0].exists);
    
    if (!tableCheck.rows[0].exists) {
      console.error('CRITICAL: analytics_data table does not exist!');
      return;
    }
    
    // 2. Check what columns exist
    console.log('\n2. Checking columns in analytics_data table...');
    const columnsResult = await pool.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'analytics_data'
      ORDER BY column_name;
    `);
    
    const columns = columnsResult.rows.map(col => col.column_name);
    console.log('Total columns:', columns.length);
    
    // Check for service count columns
    const serviceColumns = [
      'semaglutide_injections_weekly',
      'semaglutide_injections_monthly',
      'new_individual_members_weekly',
      'new_family_members_weekly',
      'new_concierge_members_weekly',
      'new_corporate_members_weekly',
      'new_individual_members_monthly',
      'new_family_members_monthly',
      'new_concierge_members_monthly',
      'new_corporate_members_monthly',
      'iv_infusions_weekend_weekly',
      'iv_infusions_weekend_monthly',
      'injections_weekend_weekly',
      'injections_weekend_monthly',
      'weight_loss_injections_weekly',
      'weight_loss_injections_monthly',
      'hormone_followup_female_weekly',
      'hormone_followup_female_monthly',
      'hormone_followup_male_weekly',
      'hormone_followup_male_monthly'
    ];
    
    console.log('\n3. Checking for service count columns:');
    for (const col of serviceColumns) {
      const exists = columns.includes(col);
      console.log(`   ${col}: ${exists ? '✓ EXISTS' : '✗ MISSING'}`);
    }
    
    // 3. Check actual data for Aug 25-31 week
    console.log('\n4. Checking data for week Aug 25-31, 2024...');
    const dataResult = await pool.query(`
      SELECT * FROM analytics_data 
      WHERE week_start = '2024-08-25'::date
      LIMIT 1;
    `);
    
    if (dataResult.rows.length > 0) {
      const data = dataResult.rows[0];
      console.log('Record found! Key metrics:');
      console.log('   Total Revenue:', data.total_revenue);
      console.log('   IV Therapy Revenue:', data.iv_therapy_revenue);
      console.log('   Weight Loss Revenue:', data.weight_loss_revenue);
      
      // Check service counts if columns exist
      if (columns.includes('semaglutide_injections_weekly')) {
        console.log('\n   Service Counts:');
        console.log('   - Semaglutide Injections (weekly):', data.semaglutide_injections_weekly || 0);
        console.log('   - Weight Loss Injections (weekly):', data.weight_loss_injections_weekly || 0);
        console.log('   - New Individual Members:', data.new_individual_members_weekly || 0);
        console.log('   - New Family Members:', data.new_family_members_weekly || 0);
        console.log('   - Weekend IV Infusions:', data.iv_infusions_weekend_weekly || 0);
        console.log('   - Weekend Injections:', data.injections_weekend_weekly || 0);
      } else {
        console.log('\n   ⚠️  Service count columns not found - cannot display counts');
      }
    } else {
      console.log('No data found for this week');
    }
    
    // 4. Check all weeks with data
    console.log('\n5. Checking all weeks with any service count data...');
    const query = columns.includes('semaglutide_injections_weekly') 
      ? `SELECT week_start, total_revenue, 
          semaglutide_injections_weekly,
          weight_loss_injections_weekly,
          new_individual_members_weekly,
          iv_infusions_weekend_weekly
         FROM analytics_data 
         WHERE semaglutide_injections_weekly > 0 
            OR weight_loss_injections_weekly > 0
            OR new_individual_members_weekly > 0
            OR iv_infusions_weekend_weekly > 0
         ORDER BY week_start DESC
         LIMIT 10;`
      : `SELECT week_start, total_revenue 
         FROM analytics_data 
         ORDER BY week_start DESC 
         LIMIT 5;`;
         
    const allWeeksResult = await pool.query(query);
    
    if (columns.includes('semaglutide_injections_weekly')) {
      if (allWeeksResult.rows.length > 0) {
        console.log('Weeks with service count data:');
        allWeeksResult.rows.forEach(row => {
          console.log(`   ${row.week_start.toISOString().split('T')[0]}: ` +
            `Sema=${row.semaglutide_injections_weekly || 0}, ` +
            `WL=${row.weight_loss_injections_weekly || 0}, ` +
            `NewMem=${row.new_individual_members_weekly || 0}, ` +
            `Weekend=${row.iv_infusions_weekend_weekly || 0}`);
        });
      } else {
        console.log('   ⚠️  NO weeks have any service count data > 0');
        console.log('   This suggests data is not being saved to these columns');
      }
    } else {
      console.log('Recent weeks (service columns not available):');
      allWeeksResult.rows.forEach(row => {
        console.log(`   ${row.week_start.toISOString().split('T')[0]}: $${row.total_revenue}`);
      });
    }
    
    // 5. Run the migration manually if columns are missing
    const missingColumns = serviceColumns.filter(col => !columns.includes(col));
    if (missingColumns.length > 0) {
      console.log('\n6. ATTEMPTING TO ADD MISSING COLUMNS...');
      for (const col of missingColumns) {
        try {
          await pool.query(`ALTER TABLE analytics_data ADD COLUMN IF NOT EXISTS ${col} INTEGER DEFAULT 0`);
          console.log(`   ✓ Added column: ${col}`);
        } catch (err) {
          console.log(`   ✗ Failed to add ${col}: ${err.message}`);
        }
      }
      console.log('\n   Migration completed. Re-run this script to verify columns were added.');
    }
    
  } catch (error) {
    console.error('\nERROR:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('Cannot connect to database. Check DATABASE_URL in .env');
    }
  } finally {
    await pool.end();
    console.log('\n=== DIAGNOSTIC CHECK COMPLETE ===');
  }
}

diagnoseDatabaseIssues();