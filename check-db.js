#!/usr/bin/env node

const { Pool } = require('pg');
require('dotenv').config();

async function checkDatabase() {
  const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:tXnJczJrBENdRQcxMzWLMnJPCQaXNLIu@autorack.proxy.rlwy.net:27586/railway';
  
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('railway') ? { rejectUnauthorized: false } : false
  });

  try {
    // Get ALL records to see what's in there
    const result = await pool.query(`
      SELECT 
        id,
        week_start_date,
        week_end_date,
        actual_weekly_revenue,
        actual_weekly_iv_therapy,
        actual_weekly_weight_loss,
        actual_weekly_memberships,
        actual_weekly_other,
        upload_date
      FROM analytics_data
      ORDER BY week_start_date DESC, upload_date DESC
    `);
    
    console.log('📊 ALL Database Records:');
    console.log('========================\n');
    
    if (result.rows.length === 0) {
      console.log('No records found in database');
    } else {
      result.rows.forEach(row => {
        console.log(`ID ${row.id}:`);
        console.log(`  Week: ${row.week_start_date} to ${row.week_end_date}`);
        console.log(`  Total: $${row.actual_weekly_revenue}`);
        console.log(`  - IV: $${row.actual_weekly_iv_therapy}`);
        console.log(`  - WL: $${row.actual_weekly_weight_loss}`);
        console.log(`  - Mem: $${row.actual_weekly_memberships}`);
        console.log(`  - Other: $${row.actual_weekly_other}`);
        console.log(`  Uploaded: ${row.upload_date?.toISOString()}`);
        console.log('');
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkDatabase();