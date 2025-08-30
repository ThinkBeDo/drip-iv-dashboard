const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

// Try environment variable first, then fall back to the known Railway URL
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:tXnJczJrBENdRQcxMzWLMnJPCQaXNLIu@autorack.proxy.rlwy.net:27586/railway';

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not found in environment variables');
  process.exit(1);
}

console.log('Using database:', DATABASE_URL.replace(/:[^:@]+@/, ':****@'));

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 30000,
});

async function diagnoseDatabase() {
  console.log('🔍 COMPREHENSIVE DATABASE DIAGNOSTIC\n');
  console.log('=' .repeat(60));
  
  try {
    // Test 1: Basic connection
    console.log('\n📊 TEST 1: Database Connection');
    console.log('-'.repeat(40));
    const connTest = await pool.query('SELECT NOW() as time, current_database() as db');
    console.log('✅ Connected to database:', connTest.rows[0].db);
    console.log('   Server time:', connTest.rows[0].time);
    
    // Test 2: Check table structure
    console.log('\n📊 TEST 2: Table Structure');
    console.log('-'.repeat(40));
    const schemaQuery = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'analytics_data'
      ORDER BY ordinal_position
    `);
    
    if (schemaQuery.rows.length === 0) {
      console.log('❌ Table analytics_data does not exist!');
      return;
    }
    
    console.log('✅ Table analytics_data columns:');
    schemaQuery.rows.forEach(col => {
      console.log(`   ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? 'NOT NULL' : ''}`);
    });
    
    // Test 3: Count all records
    console.log('\n📊 TEST 3: Record Count');
    console.log('-'.repeat(40));
    const countResult = await pool.query('SELECT COUNT(*) as total FROM analytics_data');
    console.log('Total records in database:', countResult.rows[0].total);
    
    // Test 4: Show ALL records with dates
    console.log('\n📊 TEST 4: ALL Records (showing dates and revenue)');
    console.log('-'.repeat(40));
    const allRecords = await pool.query(`
      SELECT 
        id,
        week_start_date,
        week_end_date,
        actual_weekly_revenue,
        total_drip_iv_members,
        created_at,
        LENGTH(week_start_date::text) as start_len,
        LENGTH(week_end_date::text) as end_len
      FROM analytics_data
      ORDER BY week_start_date DESC, created_at DESC
    `);
    
    if (allRecords.rows.length === 0) {
      console.log('❌ No records found in database!');
    } else {
      console.log(`Found ${allRecords.rows.length} records:\n`);
      allRecords.rows.forEach((row, i) => {
        console.log(`Record ${i + 1} (ID: ${row.id}):`);
        console.log(`   Week Start: "${row.week_start_date}" (length: ${row.start_len})`);
        console.log(`   Week End: "${row.week_end_date}" (length: ${row.end_len})`);
        console.log(`   Revenue: $${row.actual_weekly_revenue || 0}`);
        console.log(`   Members: ${row.total_drip_iv_members || 0}`);
        console.log(`   Created: ${row.created_at}`);
        console.log('');
      });
    }
    
    // Test 5: Specific date queries
    console.log('\n📊 TEST 5: Date Query Tests for Aug 18-24, 2025');
    console.log('-'.repeat(40));
    
    // Query 1: Exact string match
    console.log('\nQuery 1: Exact string match');
    const exactMatch = await pool.query(`
      SELECT id, week_start_date, week_end_date, actual_weekly_revenue
      FROM analytics_data
      WHERE week_start_date = '2025-08-18'
         OR week_end_date = '2025-08-24'
    `);
    console.log(`   Results: ${exactMatch.rows.length} records`);
    if (exactMatch.rows.length > 0) {
      exactMatch.rows.forEach(row => {
        console.log(`   - ID ${row.id}: ${row.week_start_date} to ${row.week_end_date}, Revenue: $${row.actual_weekly_revenue}`);
      });
    }
    
    // Query 2: Date cast match
    console.log('\nQuery 2: Date cast match');
    const dateCast = await pool.query(`
      SELECT id, week_start_date, week_end_date, actual_weekly_revenue
      FROM analytics_data
      WHERE week_start_date::date = '2025-08-18'::date
         OR week_end_date::date = '2025-08-24'::date
    `);
    console.log(`   Results: ${dateCast.rows.length} records`);
    if (dateCast.rows.length > 0) {
      dateCast.rows.forEach(row => {
        console.log(`   - ID ${row.id}: ${row.week_start_date} to ${row.week_end_date}, Revenue: $${row.actual_weekly_revenue}`);
      });
    }
    
    // Query 3: The overlap query used in server.js
    console.log('\nQuery 3: Overlap query (as used in server.js)');
    const overlapQuery = await pool.query(`
      SELECT id, week_start_date, week_end_date, actual_weekly_revenue
      FROM analytics_data
      WHERE (week_start_date::date, week_end_date::date) OVERLAPS 
            ('2025-08-18'::date, '2025-08-24'::date)
    `);
    console.log(`   Results: ${overlapQuery.rows.length} records`);
    if (overlapQuery.rows.length > 0) {
      overlapQuery.rows.forEach(row => {
        console.log(`   - ID ${row.id}: ${row.week_start_date} to ${row.week_end_date}, Revenue: $${row.actual_weekly_revenue}`);
      });
    }
    
    // Query 4: Range query
    console.log('\nQuery 4: Range query');
    const rangeQuery = await pool.query(`
      SELECT id, week_start_date, week_end_date, actual_weekly_revenue
      FROM analytics_data
      WHERE week_start_date::date >= '2025-08-18'::date
        AND week_start_date::date <= '2025-08-24'::date
    `);
    console.log(`   Results: ${rangeQuery.rows.length} records`);
    if (rangeQuery.rows.length > 0) {
      rangeQuery.rows.forEach(row => {
        console.log(`   - ID ${row.id}: ${row.week_start_date} to ${row.week_end_date}, Revenue: $${row.actual_weekly_revenue}`);
      });
    }
    
    // Test 6: Check for duplicate or conflicting records
    console.log('\n📊 TEST 6: Duplicate/Conflicting Records');
    console.log('-'.repeat(40));
    const duplicates = await pool.query(`
      SELECT week_start_date, week_end_date, COUNT(*) as count
      FROM analytics_data
      GROUP BY week_start_date, week_end_date
      HAVING COUNT(*) > 1
      ORDER BY week_start_date DESC
    `);
    
    if (duplicates.rows.length === 0) {
      console.log('✅ No duplicate week records found');
    } else {
      console.log('⚠️  Found duplicate records for these weeks:');
      duplicates.rows.forEach(row => {
        console.log(`   ${row.week_start_date} to ${row.week_end_date}: ${row.count} records`);
      });
    }
    
    // Test 7: Show raw data types
    console.log('\n📊 TEST 7: Raw Data Type Analysis');
    console.log('-'.repeat(40));
    const typeQuery = await pool.query(`
      SELECT 
        id,
        pg_typeof(week_start_date) as start_type,
        pg_typeof(week_end_date) as end_type,
        week_start_date::text as start_text,
        week_end_date::text as end_text
      FROM analytics_data
      LIMIT 3
    `);
    
    if (typeQuery.rows.length > 0) {
      console.log('Data type information for first 3 records:');
      typeQuery.rows.forEach(row => {
        console.log(`   ID ${row.id}:`);
        console.log(`      Start type: ${row.start_type}, Value: "${row.start_text}"`);
        console.log(`      End type: ${row.end_type}, Value: "${row.end_text}"`);
      });
    }
    
    // Test 8: Test a fresh insert and retrieval
    console.log('\n📊 TEST 8: Insert and Retrieve Test');
    console.log('-'.repeat(40));
    
    // First, delete any test records
    await pool.query(`
      DELETE FROM analytics_data 
      WHERE week_start_date = '2025-08-18' 
        AND week_end_date = '2025-08-24'
    `);
    
    // Insert a test record
    const testInsert = await pool.query(`
      INSERT INTO analytics_data (
        week_start_date,
        week_end_date,
        actual_weekly_revenue,
        total_drip_iv_members,
        created_at,
        updated_at
      ) VALUES (
        '2025-08-18',
        '2025-08-24',
        12345.67,
        100,
        NOW(),
        NOW()
      ) RETURNING id, week_start_date, week_end_date, actual_weekly_revenue
    `);
    
    console.log('✅ Inserted test record:');
    console.log(`   ID: ${testInsert.rows[0].id}`);
    console.log(`   Dates: ${testInsert.rows[0].week_start_date} to ${testInsert.rows[0].week_end_date}`);
    console.log(`   Revenue: $${testInsert.rows[0].actual_weekly_revenue}`);
    
    // Try to retrieve it with different queries
    console.log('\n   Retrieving with exact match:');
    const retrieve1 = await pool.query(`
      SELECT id, actual_weekly_revenue 
      FROM analytics_data 
      WHERE week_start_date = '2025-08-18'
    `);
    console.log(`   Found: ${retrieve1.rows.length > 0 ? 'YES' : 'NO'}`);
    
    console.log('\n   Retrieving with overlap:');
    const retrieve2 = await pool.query(`
      SELECT id, actual_weekly_revenue 
      FROM analytics_data 
      WHERE (week_start_date::date, week_end_date::date) OVERLAPS 
            ('2025-08-18'::date, '2025-08-24'::date)
    `);
    console.log(`   Found: ${retrieve2.rows.length > 0 ? 'YES' : 'NO'}`);
    
    console.log('\n=' .repeat(60));
    console.log('DIAGNOSTIC COMPLETE');
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error('Error details:', error);
  } finally {
    await pool.end();
  }
}

// Run the diagnostic
diagnoseDatabase().catch(console.error);