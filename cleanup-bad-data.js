#!/usr/bin/env node

const { Pool } = require('pg');
require('dotenv').config();

async function cleanupBadData() {
  // Use Railway production database URL
  const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:tXnJczJrBENdRQcxMzWLMnJPCQaXNLIu@autorack.proxy.rlwy.net:27586/railway';
  
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('railway') ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('🧹 Cleaning up bad database records...\n');
    
    // Check current records
    console.log('📊 Current records in database:');
    const current = await pool.query(`
      SELECT id, week_start_date, week_end_date, actual_weekly_revenue, upload_date
      FROM analytics_data 
      ORDER BY id DESC
    `);
    
    current.rows.forEach(row => {
      console.log(`   ID ${row.id}: ${row.week_start_date} to ${row.week_end_date} ($${row.actual_weekly_revenue}) - uploaded ${row.upload_date?.toISOString().split('T')[0]}`);
    });
    
    // Look for bad records (same start/end date, or $0 revenue when it should have data)
    const badRecords = current.rows.filter(row => 
      row.week_start_date === row.week_end_date || 
      (parseFloat(row.actual_weekly_revenue) === 0 && row.week_start_date.includes('2025-09-02'))
    );
    
    if (badRecords.length > 0) {
      console.log('\n🗑️  Found bad records to delete:');
      badRecords.forEach(row => {
        console.log(`   ID ${row.id}: ${row.week_start_date} to ${row.week_end_date} ($${row.actual_weekly_revenue})`);
      });
      
      // Delete bad records
      for (const record of badRecords) {
        await pool.query('DELETE FROM analytics_data WHERE id = $1', [record.id]);
        console.log(`✅ Deleted bad record ID ${record.id}`);
      }
      
      console.log('\n✅ Cleanup complete! Database is ready for fresh uploads.');
    } else {
      console.log('\n✅ No bad records found. Database looks clean.');
    }
    
    // Show final state
    const final = await pool.query(`
      SELECT id, week_start_date, week_end_date, actual_weekly_revenue
      FROM analytics_data 
      ORDER BY id DESC
    `);
    
    console.log('\n📊 Final database state:');
    if (final.rows.length === 0) {
      console.log('   Database is empty - ready for uploads');
    } else {
      final.rows.forEach(row => {
        console.log(`   ID ${row.id}: ${row.week_start_date} to ${row.week_end_date} ($${row.actual_weekly_revenue})`);
      });
    }
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
  } finally {
    await pool.end();
  }
}

cleanupBadData();