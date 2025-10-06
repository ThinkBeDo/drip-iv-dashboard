// Multi-week import functionality for Drip IV Dashboard
// This handles uploads that contain multiple weeks of data

const { Pool } = require('pg');
const fs = require('fs');
const XLSX = require('xlsx');
const iconv = require('iconv-lite');
const { parse } = require('csv-parse/sync');

// Import existing helper functions from import-weekly-data.js
const { 
  processRevenueData, 
  processMembershipData, 
  getServiceCategory,
  setDatabasePool 
} = require('./import-weekly-data');

// Database pool will be passed from server.js
let pool = null;

// Function to set the database pool
function setMultiWeekDatabasePool(dbPool) {
  pool = dbPool;
  console.log('📊 Multi-week database pool configured');
}

// Helper function to parse dates from different formats
function parseRowDate(row) {
  let dateStr = row['Date'] || row['Date Of Payment'] || '';
  if (!dateStr) return null;
  
  // Handle Excel serial numbers
  if (typeof dateStr === 'number') {
    const excelEpoch = new Date(1899, 11, 30);
    return new Date(excelEpoch.getTime() + dateStr * 86400000);
  }
  
  // Handle date strings
  let date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    // Try parsing MM/DD/YY format
    const parts = String(dateStr).split('/');
    if (parts.length === 3) {
      let [month, day, year] = parts.map(p => parseInt(p));
      if (year < 100) year += 2000;
      date = new Date(year, month - 1, day);
    }
  }
  
  return isNaN(date.getTime()) ? null : date;
}

// Initialize metrics for a single week
function initializeWeekMetrics() {
  return {
    // Service counts
    iv_infusions_weekday_weekly: 0,
    iv_infusions_weekend_weekly: 0,
    injections_weekday_weekly: 0,
    injections_weekend_weekly: 0,
    
    // Customer analytics (use Sets, convert to numbers later)
    unique_customers_weekly: new Set(),
    member_customers_weekly: new Set(),
    non_member_customers_weekly: new Set(),
    
    // Revenue data
    actual_weekly_revenue: 0,
    drip_iv_revenue_weekly: 0,
    semaglutide_revenue_weekly: 0,
    membership_revenue_weekly: 0,
    other_revenue_weekly: 0,
    
    // Additional service counts
    semaglutide_injections_weekly: 0,
    semaglutide_consults_weekly: 0,
    weight_loss_injections_weekly: 0,
    
    // New membership tracking (will be calculated separately)
    new_individual_members_weekly: 0,
    new_family_members_weekly: 0,
    new_concierge_members_weekly: 0,
    new_corporate_members_weekly: 0,
    
    // Date tracking
    weekStartDate: null,
    weekEndDate: null
  };
}

// MULTI-WEEK: Process revenue data by week groups instead of single aggregation
function analyzeRevenueDataByWeeks(csvData) {
  console.log('🔄 Analyzing revenue data by individual weeks...');
  console.log(`Processing ${csvData.length} rows of data`);
  
  // Group data by week boundaries
  const weekGroups = new Map();
  let globalMinDate = null;
  let globalMaxDate = null;
  
  // First pass: group data by week and find date range
  csvData.forEach((row, index) => {
    let date = parseRowDate(row);
    if (!date) return;
    
    // Track global date range
    if (!globalMinDate || date < globalMinDate) globalMinDate = date;
    if (!globalMaxDate || date > globalMaxDate) globalMaxDate = date;
    
    // Calculate Monday of this week (week start)
    const dayOfWeek = date.getDay();
    const monday = new Date(date);

    // Convert to Monday-based week (Monday = 0, Sunday = 6)
    // If today is Sunday (0), go back 6 days to Monday
    // If today is Monday (1), stay on same day
    // If today is Tuesday (2), go back 1 day to Monday
    // etc.
    if (dayOfWeek === 0) {
      monday.setDate(date.getDate() - 6); // Sunday -> Previous Monday
    } else {
      monday.setDate(date.getDate() - (dayOfWeek - 1)); // Any other day -> That Monday
    }
    
    // Calculate Sunday of this week (week end)
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6); // Monday + 6 days = Sunday
    
    const weekKey = weekStart.toISOString().split('T')[0]; // Use Monday as key
    
    if (!weekGroups.has(weekKey)) {
      weekGroups.set(weekKey, {
        weekStart: weekStart,
        weekEnd: weekEnd,
        rows: [],
        metrics: initializeWeekMetrics()
      });
    }
    
    weekGroups.get(weekKey).rows.push(row);
  });
  
  console.log(`📅 Found ${weekGroups.size} week(s) in data:`);
  
  // Second pass: analyze each week separately
  const weeklyResults = [];
  
  for (const [weekKey, weekData] of weekGroups.entries()) {
    console.log(`\n🗓️  Processing week ${weekData.weekStart.toDateString()} to ${weekData.weekEnd.toDateString()} (${weekData.rows.length} rows)`);
    
    // Initialize metrics for this week
    const metrics = weekData.metrics;
    metrics.weekStartDate = weekData.weekStart;
    metrics.weekEndDate = weekData.weekEnd;
    
    // Process each row in this week
    weekData.rows.forEach(row => {
      const date = parseRowDate(row);
      const patient = (row['Patient'] || '').trim();
      const chargeDesc = row['Charge Desc'] || '';
      const chargeAmount = parseFloat(
        row['Calculated Payment (Line)'] || 
        row['Total'] || 
        row['Paid'] || 
        0
      );
      
      if (!chargeAmount || chargeAmount <= 0) return;
      
      // Add to weekly totals
      metrics.actual_weekly_revenue += chargeAmount;
      
      // Categorize service
      const serviceCategory = getServiceCategory(chargeDesc);
      
      if (serviceCategory === 'drip_iv') {
        metrics.drip_iv_revenue_weekly += chargeAmount;
        
        // Count service instances
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
        if (chargeDesc.toLowerCase().includes('infusion')) {
          if (isWeekend) {
            metrics.iv_infusions_weekend_weekly++;
          } else {
            metrics.iv_infusions_weekday_weekly++;
          }
        } else if (chargeDesc.toLowerCase().includes('injection')) {
          if (isWeekend) {
            metrics.injections_weekend_weekly++;
          } else {
            metrics.injections_weekday_weekly++;
          }
        }
      } else if (serviceCategory === 'semaglutide') {
        metrics.semaglutide_revenue_weekly += chargeAmount;
        
        if (chargeDesc.toLowerCase().includes('semaglutide') || 
            chargeDesc.toLowerCase().includes('tirzepatide')) {
          metrics.semaglutide_injections_weekly++;
        }
      } else if (serviceCategory === 'membership') {
        metrics.membership_revenue_weekly += chargeAmount;

        // Track new membership signups - ONLY count those marked with "NEW" flag
        // Use regex with word boundaries for reliable detection (case-insensitive)
        const isNewMembership = /\bnew\b/i.test(chargeDesc);

        if (isNewMembership) {
          const lowerChargeDesc = chargeDesc.toLowerCase();
          if (lowerChargeDesc.includes('individual')) {
            metrics.new_individual_members_weekly++;
          } else if (lowerChargeDesc.includes('family')) {
            metrics.new_family_members_weekly++;
          } else if (lowerChargeDesc.includes('concierge')) {
            metrics.new_concierge_members_weekly++;
          } else if (lowerChargeDesc.includes('corporate')) {
            metrics.new_corporate_members_weekly++;
          }
        }
      }

      // Track unique customers for this week
      if (patient) {
        metrics.unique_customers_weekly.add(patient);
        
        const isMember = chargeDesc.toLowerCase().includes('(member)') || 
                        chargeDesc.toLowerCase().includes('member');
        if (isMember) {
          metrics.member_customers_weekly.add(patient);
        } else {
          metrics.non_member_customers_weekly.add(patient);
        }
      }
    });
    
    // Convert Sets to counts
    metrics.unique_customers_weekly = metrics.unique_customers_weekly.size;
    metrics.member_customers_weekly = metrics.member_customers_weekly.size;  
    metrics.non_member_customers_weekly = metrics.non_member_customers_weekly.size;
    
    console.log(`   📈 Week totals: $${metrics.actual_weekly_revenue.toFixed(2)} (${weekData.rows.length} transactions)`);
    console.log(`   💉 IV Therapy: $${metrics.drip_iv_revenue_weekly.toFixed(2)}`);
    console.log(`   🏋️  Weight Loss: $${metrics.semaglutide_revenue_weekly.toFixed(2)}`);
    console.log(`   👥 Unique customers: ${metrics.unique_customers_weekly}`);
    
    weeklyResults.push(metrics);
  }
  
  console.log(`\n✅ Successfully processed ${weeklyResults.length} weeks`);
  
  return weeklyResults; // Return array of weekly metrics instead of single aggregate
}

// Save individual week to database
async function saveWeekToDatabase(weekData) {
  const client = await pool.connect();
  
  try {
    // Check if data already exists for this week
    console.log(`📅 Checking for existing data: ${weekData.week_start_date} to ${weekData.week_end_date}`);
    const existingCheck = await client.query(
      'SELECT id FROM analytics_data WHERE week_start_date = $1 AND week_end_date = $2',
      [weekData.week_start_date, weekData.week_end_date]
    );
    
    if (existingCheck.rows.length > 0) {
      console.log(`📝 Found existing record (ID: ${existingCheck.rows[0].id}), updating...`);
      
      // Update existing record with only essential fields
      const updateQuery = `
        UPDATE analytics_data SET
          actual_weekly_revenue = $3,
          drip_iv_revenue_weekly = $4,
          semaglutide_revenue_weekly = $5,
          membership_revenue_weekly = $6,
          unique_customers_weekly = $7,
          member_customers_weekly = $8,
          iv_infusions_weekday_weekly = $9,
          iv_infusions_weekend_weekly = $10,
          injections_weekday_weekly = $11,
          injections_weekend_weekly = $12,
          semaglutide_injections_weekly = $13,
          new_individual_members_weekly = $14,
          new_family_members_weekly = $15,
          new_concierge_members_weekly = $16,
          new_corporate_members_weekly = $17,
          upload_date = CURRENT_DATE,
          updated_at = NOW()
        WHERE week_start_date = $1 AND week_end_date = $2
        RETURNING *
      `;
      
      const result = await client.query(updateQuery, [
        weekData.week_start_date,
        weekData.week_end_date,
        weekData.actual_weekly_revenue,
        weekData.drip_iv_revenue_weekly,
        weekData.semaglutide_revenue_weekly, 
        weekData.membership_revenue_weekly || 0,
        weekData.unique_customers_weekly,
        weekData.member_customers_weekly,
        weekData.iv_infusions_weekday_weekly,
        weekData.iv_infusions_weekend_weekly,
        weekData.injections_weekday_weekly,
        weekData.injections_weekend_weekly,
        weekData.semaglutide_injections_weekly,
        weekData.new_individual_members_weekly || 0,
        weekData.new_family_members_weekly || 0,
        weekData.new_concierge_members_weekly || 0,
        weekData.new_corporate_members_weekly || 0
      ]);
      
      return result.rows[0];
      
    } else {
      console.log('📝 No existing record found, inserting new data...');
      
      // Insert new record with essential fields
      const insertQuery = `
        INSERT INTO analytics_data (
          week_start_date, week_end_date,
          actual_weekly_revenue, drip_iv_revenue_weekly, semaglutide_revenue_weekly,
          membership_revenue_weekly, unique_customers_weekly, member_customers_weekly,
          iv_infusions_weekday_weekly, iv_infusions_weekend_weekly,
          injections_weekday_weekly, injections_weekend_weekly,
          semaglutide_injections_weekly,
          new_individual_members_weekly, new_family_members_weekly,
          new_concierge_members_weekly, new_corporate_members_weekly,
          weekly_revenue_goal, monthly_revenue_goal,
          upload_date, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
          CURRENT_DATE, NOW()
        ) RETURNING *
      `;
      
      const result = await client.query(insertQuery, [
        weekData.week_start_date,
        weekData.week_end_date,
        weekData.actual_weekly_revenue,
        weekData.drip_iv_revenue_weekly,
        weekData.semaglutide_revenue_weekly,
        weekData.membership_revenue_weekly || 0,
        weekData.unique_customers_weekly,
        weekData.member_customers_weekly,
        weekData.iv_infusions_weekday_weekly,
        weekData.iv_infusions_weekend_weekly,
        weekData.injections_weekday_weekly,
        weekData.injections_weekend_weekly,
        weekData.semaglutide_injections_weekly,
        weekData.new_individual_members_weekly || 0,
        weekData.new_family_members_weekly || 0,
        weekData.new_concierge_members_weekly || 0,
        weekData.new_corporate_members_weekly || 0,
        weekData.weekly_revenue_goal || 32125,
        weekData.monthly_revenue_goal || 128500
      ]);
      
      return result.rows[0];
    }
    
  } finally {
    client.release();
  }
}

// MULTI-WEEK: Save multiple week records instead of single aggregate
async function importMultiWeekData(revenueFilePath, membershipFilePath) {
  if (!pool) {
    throw new Error('Database pool not configured for multi-week import.');
  }

  try {
    console.log('🔄 Starting multi-week data import...');
    console.log('Revenue file:', revenueFilePath || 'Not provided');
    console.log('Membership file:', membershipFilePath || 'Not provided');

    // Process revenue data if file is provided
    let weeklyMetricsArray = [];
    if (revenueFilePath) {
      const result = await processRevenueData(revenueFilePath);
      // Use new multi-week analysis instead of single aggregate
      weeklyMetricsArray = analyzeRevenueDataByWeeks(result.rawRows);
    } else {
      console.log('No revenue file provided');
      return null;
    }

    // Process membership data if file is provided  
    let membershipMetrics = {};
    if (membershipFilePath) {
      const result = await processMembershipData(membershipFilePath);
      membershipMetrics = result.metrics;
    }

    // Save each week as separate database record
    const savedRecords = [];
    
    for (let i = 0; i < weeklyMetricsArray.length; i++) {
      const weekMetrics = weeklyMetricsArray[i];
      
      console.log(`\n📅 Saving week ${i + 1} of ${weeklyMetricsArray.length}: ${weekMetrics.weekStartDate.toDateString()} to ${weekMetrics.weekEndDate.toDateString()}`);
      
      // Combine with membership data (use totals for each week)
      const combinedData = {
        ...weekMetrics,
        ...membershipMetrics, // Membership totals apply to each week
        
        // Set default values
        weekly_revenue_goal: 32125,
        monthly_revenue_goal: 128500,
        days_left_in_month: 30,
        upload_date: new Date()
      };
      
      // Convert dates to ISO strings
      combinedData.week_start_date = weekMetrics.weekStartDate.toISOString().split('T')[0];
      combinedData.week_end_date = weekMetrics.weekEndDate.toISOString().split('T')[0];
      
      // Clean up temporary fields
      delete combinedData.weekStartDate;
      delete combinedData.weekEndDate;
      
      // Save to database
      const savedRecord = await saveWeekToDatabase(combinedData);
      savedRecords.push(savedRecord);
      
      console.log(`   ✅ Saved: $${savedRecord.actual_weekly_revenue} revenue, ${savedRecord.unique_customers_weekly} customers`);
    }
    
    console.log(`\n🎉 Successfully imported ${savedRecords.length} weeks to database!`);
    
    // Return summary
    const totalRevenue = savedRecords.reduce((sum, record) => sum + parseFloat(record.actual_weekly_revenue || 0), 0);
    console.log(`💰 Total monthly revenue: $${totalRevenue.toFixed(2)}`);
    
    // Return the most recent week for compatibility
    return savedRecords[savedRecords.length - 1];
    
  } catch (error) {
    console.error('❌ ERROR IMPORTING MULTI-WEEK DATA:');
    console.error('Error details:', error.message);
    console.error('Stack trace:', error.stack);
    throw error;
  }
}

module.exports = {
  setMultiWeekDatabasePool,
  importMultiWeekData,
  analyzeRevenueDataByWeeks,
  saveWeekToDatabase
};