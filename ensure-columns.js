require('dotenv').config();
const { Pool } = require('pg');

async function ensureColumns() {
  console.log('=== ENSURING DATABASE COLUMNS EXIST ===\n');
  
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('ERROR: DATABASE_URL not found. Set it in Railway or .env file');
    process.exit(1);
  }
  
  const pool = new Pool({ 
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    // List of required columns
    const requiredColumns = [
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
      'hormone_followup_male_weekly',
      'hormone_followup_male_monthly'
    ];
    
    console.log('Adding missing columns to analytics_data table...\n');
    
    for (const column of requiredColumns) {
      try {
        await pool.query(`
          ALTER TABLE analytics_data 
          ADD COLUMN IF NOT EXISTS ${column} INTEGER DEFAULT 0
        `);
        console.log(`✓ Column ${column} ensured`);
      } catch (err) {
        console.error(`✗ Error with column ${column}: ${err.message}`);
      }
    }
    
    // Verify all columns exist
    console.log('\nVerifying column existence...');
    const result = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns
      WHERE table_name = 'analytics_data'
      AND column_name = ANY($1)
      ORDER BY column_name
    `, [requiredColumns]);
    
    const existingColumns = result.rows.map(r => r.column_name);
    const missingColumns = requiredColumns.filter(col => !existingColumns.includes(col));
    
    if (missingColumns.length === 0) {
      console.log('\n✅ SUCCESS: All required columns exist!');
    } else {
      console.log('\n⚠️ WARNING: Some columns are still missing:');
      missingColumns.forEach(col => console.log(`   - ${col}`));
    }
    
  } catch (error) {
    console.error('\nERROR:', error.message);
  } finally {
    await pool.end();
  }
}

ensureColumns();