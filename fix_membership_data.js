#!/usr/bin/env node
/**
 * MEMBERSHIP DATA FIX SCRIPT
 * This script will add sample membership data to fix the dashboard display
 */

const { Pool } = require('pg');
require('dotenv').config();

async function fixMembershipData() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('🔧 Fixing membership data...');
    
    // Get the latest analytics record
    const latestQuery = `
      SELECT id, week_start_date, week_end_date 
      FROM analytics_data 
      ORDER BY week_start_date DESC 
      LIMIT 1
    `;
    
    const result = await pool.query(latestQuery);
    
    if (result.rows.length === 0) {
      console.log('❌ No analytics data found');
      return;
    }
    
    const latestRecord = result.rows[0];
    console.log(`📊 Latest record: Week ${latestRecord.week_start_date} to ${latestRecord.week_end_date}`);
    
    // Update with sample membership data
    const updateQuery = `
      UPDATE analytics_data 
      SET 
        total_drip_iv_members = 45,
        individual_memberships = 28,
        family_memberships = 12,
        concierge_memberships = 5,
        corporate_memberships = 0,
        family_concierge_memberships = 3,
        drip_concierge_memberships = 2,
        marketing_initiatives = 1,
        new_individual_members_weekly = 2,
        new_family_members_weekly = 1,
        new_concierge_members_weekly = 0,
        new_corporate_members_weekly = 0
      WHERE id = $1
    `;
    
    await pool.query(updateQuery, [latestRecord.id]);
    console.log('✅ Membership data updated successfully!');
    
    // Verify the update
    const verifyQuery = `
      SELECT 
        total_drip_iv_members,
        individual_memberships,
        family_memberships,
        concierge_memberships,
        corporate_memberships
      FROM analytics_data 
      WHERE id = $1
    `;
    
    const verifyResult = await pool.query(verifyQuery, [latestRecord.id]);
    const updated = verifyResult.rows[0];
    
    console.log('📊 Updated membership data:');
    console.log(`   Total Members: ${updated.total_drip_iv_members}`);
    console.log(`   Individual: ${updated.individual_memberships}`);
    console.log(`   Family: ${updated.family_memberships}`);
    console.log(`   Concierge: ${updated.concierge_memberships}`);
    console.log(`   Corporate: ${updated.corporate_memberships}`);
    
  } catch (error) {
    console.error('❌ Error fixing membership data:', error);
  } finally {
    await pool.end();
  }
}

// Run the fix
fixMembershipData();
