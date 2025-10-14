require('dotenv').config();
const { Pool } = require('pg');

// Get DATABASE_URL from environment or command line argument
const databaseUrl = process.env.DATABASE_URL || process.argv[2];

if (!databaseUrl) {
  console.error('❌ Error: DATABASE_URL not found');
  console.log('\nUsage:');
  console.log('  node fix-popular-injections.js [DATABASE_URL]');
  console.log('\nOr set DATABASE_URL environment variable');
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function fixPopularInjections() {
  try {
    console.log('🔧 Fixing popular_injections in database...');
    
    // First, check current state
    const checkResult = await pool.query(`
      SELECT week_start_date, popular_injections, popular_weight_management 
      FROM analytics_data 
      ORDER BY week_start_date DESC 
      LIMIT 5
    `);
    
    console.log('\n📊 Current state (last 5 weeks):');
    checkResult.rows.forEach(row => {
      console.log(`  Week ${row.week_start_date}:`);
      console.log(`    Popular Injections: ${row.popular_injections}`);
      console.log(`    Popular Weight Mgmt: ${row.popular_weight_management}`);
    });
    
    // Remove Tirzepatide and Semaglutide from popular_injections
    const updateResult = await pool.query(`
      UPDATE analytics_data
      SET popular_injections = ARRAY(
        SELECT elem FROM unnest(popular_injections) AS elem
        WHERE elem NOT ILIKE '%tirzepatide%' AND elem NOT ILIKE '%semaglutide%'
      )
      WHERE popular_injections && ARRAY(
        SELECT elem FROM unnest(popular_injections) AS elem
        WHERE elem ILIKE '%tirzepatide%' OR elem ILIKE '%semaglutide%'
      )
      RETURNING week_start_date, popular_injections
    `);
    
    console.log(`\n✅ Updated ${updateResult.rowCount} records`);
    
    if (updateResult.rowCount > 0) {
      console.log('\n📝 Updated weeks:');
      updateResult.rows.forEach(row => {
        console.log(`  Week ${row.week_start_date}: ${row.popular_injections}`);
      });
    }
    
    // Set default if empty
    const defaultResult = await pool.query(`
      UPDATE analytics_data
      SET popular_injections = ARRAY['B12 Injection', 'Vitamin D', 'Metabolism Boost']
      WHERE (popular_injections IS NULL OR array_length(popular_injections, 1) IS NULL OR array_length(popular_injections, 1) = 0)
      RETURNING week_start_date
    `);
    
    if (defaultResult.rowCount > 0) {
      console.log(`\n🔄 Set default values for ${defaultResult.rowCount} empty records`);
    }
    
    // Verify final state
    const verifyResult = await pool.query(`
      SELECT week_start_date, popular_injections, popular_weight_management 
      FROM analytics_data 
      ORDER BY week_start_date DESC 
      LIMIT 5
    `);
    
    console.log('\n✨ Final state (last 5 weeks):');
    verifyResult.rows.forEach(row => {
      console.log(`  Week ${row.week_start_date}:`);
      console.log(`    Popular Injections: ${row.popular_injections}`);
      console.log(`    Popular Weight Mgmt: ${row.popular_weight_management}`);
    });
    
    console.log('\n✅ Database fix complete!');
    
  } catch (error) {
    console.error('❌ Error fixing database:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

fixPopularInjections();
