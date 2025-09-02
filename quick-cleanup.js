#!/usr/bin/env node

const { Pool } = require('pg');
require('dotenv').config();

async function quickCleanup() {
  const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:tXnJczJrBENdRQcxMzWLMnJPCQaXNLIu@autorack.proxy.rlwy.net:27586/railway';
  
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('railway') ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('🗑️  Quick cleanup of September 2nd bad records...\n');
    
    // Delete records with September 2nd dates (these are the problematic ones)
    const deleteResult = await pool.query(`
      DELETE FROM analytics_data 
      WHERE week_start_date = '2025-09-02' 
      OR week_end_date = '2025-09-02'
      OR (week_start_date = week_end_date AND week_start_date::text LIKE '%2025-09-02%')
    `);
    
    console.log(`✅ Deleted ${deleteResult.rowCount} bad September 2nd records`);
    
    // Check what remains
    const remaining = await pool.query(`
      SELECT id, week_start_date, week_end_date, actual_weekly_revenue
      FROM analytics_data 
      ORDER BY upload_date DESC LIMIT 3
    `);
    
    console.log('\n📊 Remaining records:');
    if (remaining.rows.length === 0) {
      console.log('   No records found');
    } else {
      remaining.rows.forEach(row => {
        console.log(`   ID ${row.id}: ${row.week_start_date} to ${row.week_end_date} ($${row.actual_weekly_revenue})`);
      });
    }
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
  } finally {
    await pool.end();
  }
}

quickCleanup();