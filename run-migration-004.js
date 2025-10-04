const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  console.log('Running migration 004_add_popular_weight_management.sql...\n');
  
  const sql = fs.readFileSync('database/migrations/004_add_popular_weight_management.sql', 'utf8');
  
  try {
    await pool.query(sql);
    console.log('✅ Migration completed successfully!\n');
    
    // Verify
    const result = await pool.query(`
      SELECT 
        week_start_date,
        popular_injections,
        popular_weight_management
      FROM analytics_data 
      WHERE week_start_date >= '2025-09-01'
      ORDER BY week_start_date
    `);
    
    console.log('Updated Popular Services:');
    result.rows.forEach(row => {
      console.log(`${row.week_start_date.toISOString().split('T')[0]}:`);
      console.log(`  Injections: ${row.popular_injections}`);
      console.log(`  Weight Management: ${row.popular_weight_management}`);
    });
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
  }
  
  await pool.end();
})();
