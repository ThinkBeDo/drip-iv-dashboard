#!/usr/bin/env node

// Quick script to delete records with same start/end date
const { Pool } = require('pg');
require('dotenv').config();

async function deleteBadDates() {
  const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:tXnJczJrBENdRQcxMzWLMnJPCQaXNLIu@autorack.proxy.rlwy.net:27586/railway';
  
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('railway') ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('🗑️  Deleting records with same start/end date...\n');
    
    // Show what will be deleted
    const toDelete = await pool.query(`
      SELECT id, week_start_date, week_end_date, actual_weekly_revenue
      FROM analytics_data 
      WHERE week_start_date = week_end_date
    `);
    
    if (toDelete.rows.length > 0) {
      console.log('Records to delete:');
      toDelete.rows.forEach(row => {
        console.log(`   ID ${row.id}: ${row.week_start_date} = ${row.week_end_date} ($${row.actual_weekly_revenue})`);
      });
      
      // Delete them
      const deleteResult = await pool.query(`
        DELETE FROM analytics_data 
        WHERE week_start_date = week_end_date
      `);
      
      console.log(`\n✅ Deleted ${deleteResult.rowCount} records with same start/end date`);
    } else {
      console.log('No records found with same start/end date');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

deleteBadDates();