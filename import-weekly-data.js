const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const csvParser = require('csv-parser');
const XLSX = require('xlsx');
const iconv = require('iconv-lite');
const { parse } = require('csv-parse/sync');
require('dotenv').config();

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Service categorization functions (matching server.js logic)
function isBaseInfusionService(chargeDesc) {
  const lowerDesc = chargeDesc.toLowerCase();
  
  // Exclude non-medical services first
  const exclusions = ['membership', 'lab', 'cbc', 'cmp', 'draw fee', 'office visit', 'consultation', 'total_tips'];
  if (exclusions.some(excl => lowerDesc.includes(excl))) {
    return false;
  }
  
  // IV Base Services (count as visits)
  const baseInfusionServices = [
    'saline 1l', 'hydration', 'performance & recovery', 'energy', 'immunity', 
    'alleviate', 'all inclusive', 'lux beauty', 'methylene blue infusion'
  ];
  
  return baseInfusionServices.some(service => lowerDesc.includes(service));
}

function isInfusionAddon(chargeDesc) {
  const lowerDesc = chargeDesc.toLowerCase();
  
  // IV Add-ons (don't count as separate visits)
  const addonServices = [
    'vitamin d3', 'glutathione', 'nad', 'toradol', 'magnesium', 'vitamin b12',
    'zofran', 'biotin', 'vitamin c', 'zinc', 'mineral blend', 'vita-complex', 'taurine'
  ];
  
  return addonServices.some(service => lowerDesc.includes(service));
}

function isStandaloneInjection(chargeDesc) {
  const lowerDesc = chargeDesc.toLowerCase();
  
  // Standalone Injections (count separately)
  const standaloneInjections = [
    'semaglutide', 'tirzepatide', 'b12 injection', 'metabolism boost injection'
  ];
  
  return standaloneInjections.some(service => lowerDesc.includes(service)) ||
         (lowerDesc.includes('b12') && lowerDesc.includes('injection') && !lowerDesc.includes('vitamin'));
}

function isMembershipService(chargeDesc) {
  const lowerDesc = chargeDesc.toLowerCase();
  return lowerDesc.includes('membership') || lowerDesc.includes('concierge');
}

function getServiceCategory(chargeDesc) {
  if (isMembershipService(chargeDesc)) return 'membership';
  if (isStandaloneInjection(chargeDesc)) return 'injection';
  if (isBaseInfusionService(chargeDesc)) return 'base_infusion';
  if (isInfusionAddon(chargeDesc)) return 'infusion_addon';
  return 'other';
}

// Currency cleaning function
function cleanCurrency(value) {
  if (!value || value === null || value === undefined) return 0.0;
  
  const valueStr = value.toString();
  // Remove $ and commas
  let cleaned = valueStr.replace(/[$,]/g, '');
  
  // Handle parentheses as negative numbers
  if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    cleaned = '-' + cleaned.slice(1, -1);
  }
  
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0.0 : parsed;
}

// Date parsing function
function parseDate(dateStr) {
  if (!dateStr || dateStr === 'Total') return null;
  
  // Handle format like "8/9/25" for August 9, 2025
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const month = parseInt(parts[0]);
    const day = parseInt(parts[1]);
    // Fix: All 2-digit years should be 2000s (e.g., 25 = 2025, not 1925)
    const year = parseInt(parts[2]) + 2000;
    return new Date(year, month - 1, day);
  }
  
  return new Date(dateStr);
}

// Check if date is weekend
function isWeekend(date) {
  const dayOfWeek = date.getDay();
  return dayOfWeek === 0 || dayOfWeek === 6; // Sunday = 0, Saturday = 6
}

// Process revenue data from CSV
async function processRevenueData(csvFilePath) {
  console.log('Processing revenue data from:', csvFilePath);
  
  // Validate input
  if (!csvFilePath) {
    throw new Error('Revenue CSV file path is required');
  }
  
  // Check if file exists
  if (!fs.existsSync(csvFilePath)) {
    throw new Error(`Revenue CSV file not found: ${csvFilePath}`);
  }
  
  return new Promise((resolve, reject) => {
    try {
      // Read the file as a buffer
      const buffer = fs.readFileSync(csvFilePath);
      const firstBytes = buffer.slice(0, 4);
      
      let csvContent;
      
      // Check for UTF-16 LE BOM (FF FE)
      if (firstBytes[0] === 0xFF && firstBytes[1] === 0xFE) {
        console.log('Detected UTF-16 LE encoding with BOM');
        // Use iconv-lite to decode UTF-16 LE to UTF-8
        // BOM is automatically stripped by iconv-lite
        csvContent = iconv.decode(buffer, 'utf-16le');
      } else {
        // Standard UTF-8 processing
        console.log('Processing as UTF-8 encoding');
        csvContent = buffer.toString('utf8');
      }
      
      // Use csv-parse to properly parse the CSV content
      // This handles embedded quotes, commas in fields, and complex CSV formatting
      const records = parse(csvContent, {
        columns: true, // Use first row as column headers
        skip_empty_lines: true, // Skip empty lines
        trim: true, // Trim whitespace from fields
        relax_quotes: true, // Be lenient with quotes
        relax_column_count: true, // Allow variable column counts
        on_record: (record) => {
          // Clean up any remaining quotes from field values
          const cleanedRecord = {};
          for (const [key, value] of Object.entries(record)) {
            cleanedRecord[key] = value ? value.toString() : '';
          }
          return cleanedRecord;
        }
      });
      
      console.log(`Successfully parsed ${records.length} rows from CSV`);
      resolve(records);
      
    } catch (error) {
      console.error('Error parsing CSV file:', error);
      reject(new Error(`Failed to parse CSV file: ${error.message}`));
    }
  });
}

// Analyze revenue data and calculate metrics
function analyzeRevenueData(csvData) {
  console.log('Analyzing revenue data...');
  
  // Initialize metrics
  const metrics = {
    // New categorized service counts
    iv_infusions_weekday_weekly: 0,
    iv_infusions_weekend_weekly: 0,
    iv_infusions_weekday_monthly: 0,
    iv_infusions_weekend_monthly: 0,
    injections_weekday_weekly: 0,
    injections_weekend_weekly: 0,
    injections_weekday_monthly: 0,
    injections_weekend_monthly: 0,
    
    // Customer analytics
    unique_customers_weekly: new Set(),
    unique_customers_monthly: new Set(),
    member_customers_weekly: new Set(),
    non_member_customers_weekly: new Set(),
    
    // Revenue data
    actual_weekly_revenue: 0,
    actual_monthly_revenue: 0,
    drip_iv_revenue_weekly: 0,
    semaglutide_revenue_weekly: 0,
    drip_iv_revenue_monthly: 0,
    semaglutide_revenue_monthly: 0,
    
    // Additional revenue categories
    infusion_revenue_weekly: 0,
    infusion_revenue_monthly: 0,
    injection_revenue_weekly: 0,
    injection_revenue_monthly: 0,
    membership_revenue_weekly: 0,
    membership_revenue_monthly: 0,
    
    // Date tracking for weekly/monthly determination
    weekStartDate: null,
    weekEndDate: null,
    monthStartDate: null,
    monthEndDate: null
  };
  
  // Process each row
  for (const row of csvData) {
    if (!row.Date || row.Date === 'Total') continue;
    
    const date = parseDate(row.Date);
    if (!date || isNaN(date)) continue;
    
    const chargeDesc = row['Charge Desc'] || '';
    const patient = row.Patient || '';
    const chargeAmount = cleanCurrency(row['Calculated Payment (Line)']); // Use actual payment, not charge amount
    const isWeekendDay = isWeekend(date);
    
    // Determine if this is a member service (based on charge description)
    const isMemberService = chargeDesc.toLowerCase().includes('(member)') || 
                           chargeDesc.toLowerCase().includes('member');
    const isNonMemberService = chargeDesc.toLowerCase().includes('(non-member)') || 
                              chargeDesc.toLowerCase().includes('non member');
    
    // Track date ranges for the entire dataset
    if (!metrics.monthStartDate || date < metrics.monthStartDate) {
      metrics.monthStartDate = date;
    }
    if (!metrics.monthEndDate || date > metrics.monthEndDate) {
      metrics.monthEndDate = date;
    }
  }
  
  // After processing all dates, determine the most recent week in the data
  if (metrics.monthEndDate && metrics.monthStartDate) {
    // Find the most recent complete week (Sunday to Saturday)
    const endDate = new Date(metrics.monthEndDate);
    
    // Find the most recent Sunday (start of week)
    const dayOfWeek = endDate.getDay(); // 0 = Sunday, 6 = Saturday
    const weekStart = new Date(endDate);
    weekStart.setDate(endDate.getDate() - dayOfWeek);
    
    // Week end is the following Saturday
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    
    metrics.weekStartDate = weekStart;
    metrics.weekEndDate = weekEnd;
    
    console.log(`Determined week range: ${weekStart.toDateString()} to ${weekEnd.toDateString()}`);
  }
  
  // Second pass: Process service counts and revenue with proper week detection
  for (const row of csvData) {
    if (!row.Date || row.Date === 'Total') continue;
    
    const date = parseDate(row.Date);
    if (!date || isNaN(date)) continue;
    
    const chargeDesc = row['Charge Desc'] || '';
    const patient = row.Patient || '';
    const chargeAmount = cleanCurrency(row['Calculated Payment (Line)']);
    const isWeekendDay = isWeekend(date);
    
    // Skip non-service charges and administrative entries
    const lowerChargeDesc = chargeDesc.toLowerCase();
    if (lowerChargeDesc.includes('total_tips') || 
        lowerChargeDesc.includes('tip') ||
        lowerChargeDesc === 'total' ||
        chargeDesc === '' ||
        !chargeAmount) continue;
        
    // Determine if this is a member service (based on charge description)
    const isMemberService = chargeDesc.toLowerCase().includes('(member)') || 
                           chargeDesc.toLowerCase().includes('member');
    const isNonMemberService = chargeDesc.toLowerCase().includes('(non-member)') || 
                              chargeDesc.toLowerCase().includes('non member');
    
    // Determine if this row is from the current week vs the full month
    const isCurrentWeek = metrics.weekStartDate && metrics.weekEndDate && 
                         date >= metrics.weekStartDate && date <= metrics.weekEndDate;
    
    // Get service category
    const serviceCategory = getServiceCategory(chargeDesc);
    
    // Track unique customers
    if (patient) {
      metrics.unique_customers_monthly.add(patient);
      if (isCurrentWeek) {
        metrics.unique_customers_weekly.add(patient);
        
        if (isMemberService) {
          metrics.member_customers_weekly.add(patient);
        } else if (isNonMemberService) {
          metrics.non_member_customers_weekly.add(patient);
        }
      }
    }
    
    // Count services by category
    if (serviceCategory === 'base_infusion') {
      if (isCurrentWeek) {
        if (isWeekendDay) {
          metrics.iv_infusions_weekend_weekly++;
        } else {
          metrics.iv_infusions_weekday_weekly++;
        }
      }
      
      if (isWeekendDay) {
        metrics.iv_infusions_weekend_monthly++;
      } else {
        metrics.iv_infusions_weekday_monthly++;
      }
    } else if (serviceCategory === 'injection') {
      if (isCurrentWeek) {
        if (isWeekendDay) {
          metrics.injections_weekend_weekly++;
        } else {
          metrics.injections_weekday_weekly++;
        }
      }
      
      if (isWeekendDay) {
        metrics.injections_weekend_monthly++;
      } else {
        metrics.injections_weekday_monthly++;
      }
    }
    
    // Track revenue
    if (chargeAmount > 0) {
      if (isCurrentWeek) {
        metrics.actual_weekly_revenue += chargeAmount;
        
        if (serviceCategory === 'base_infusion' || serviceCategory === 'infusion_addon') {
          metrics.infusion_revenue_weekly += chargeAmount;
          metrics.drip_iv_revenue_weekly += chargeAmount;
        } else if (serviceCategory === 'injection') {
          metrics.injection_revenue_weekly += chargeAmount;
          if (chargeDesc.toLowerCase().includes('semaglutide') || chargeDesc.toLowerCase().includes('tirzepatide')) {
            metrics.semaglutide_revenue_weekly += chargeAmount;
          }
        } else if (serviceCategory === 'membership') {
          metrics.membership_revenue_weekly += chargeAmount;
        }
      }
      
      // Monthly revenue
      metrics.actual_monthly_revenue += chargeAmount;
      
      if (serviceCategory === 'base_infusion' || serviceCategory === 'infusion_addon') {
        metrics.infusion_revenue_monthly += chargeAmount;
        metrics.drip_iv_revenue_monthly += chargeAmount;
      } else if (serviceCategory === 'injection') {
        metrics.injection_revenue_monthly += chargeAmount;
        if (chargeDesc.toLowerCase().includes('semaglutide') || chargeDesc.toLowerCase().includes('tirzepatide')) {
          metrics.semaglutide_revenue_monthly += chargeAmount;
        }
      } else if (serviceCategory === 'membership') {
        metrics.membership_revenue_monthly += chargeAmount;
      }
    }
  }
  
  // Convert Sets to counts
  metrics.unique_customers_weekly = metrics.unique_customers_weekly.size;
  metrics.unique_customers_monthly = metrics.unique_customers_monthly.size;
  metrics.member_customers_weekly = metrics.member_customers_weekly.size;
  metrics.non_member_customers_weekly = metrics.non_member_customers_weekly.size;
  
  // Calculate legacy totals for backward compatibility
  metrics.drip_iv_weekday_weekly = metrics.iv_infusions_weekday_weekly + metrics.injections_weekday_weekly;
  metrics.drip_iv_weekend_weekly = metrics.iv_infusions_weekend_weekly + metrics.injections_weekend_weekly;
  metrics.drip_iv_weekday_monthly = metrics.iv_infusions_weekday_monthly + metrics.injections_weekday_monthly;
  metrics.drip_iv_weekend_monthly = metrics.iv_infusions_weekend_monthly + metrics.injections_weekend_monthly;
  
  console.log('Revenue analysis complete:', {
    weeklyRevenue: metrics.actual_weekly_revenue,
    monthlyRevenue: metrics.actual_monthly_revenue,
    uniqueCustomersWeekly: metrics.unique_customers_weekly,
    uniqueCustomersMonthly: metrics.unique_customers_monthly
  });
  
  return metrics;
}

// Process membership data from Excel
async function processMembershipData(excelFilePath) {
  console.log('Processing membership data from:', excelFilePath);
  
  // Validate input
  if (!excelFilePath) {
    throw new Error('Membership Excel file path is required');
  }
  
  // Check if file exists
  if (!fs.existsSync(excelFilePath)) {
    throw new Error(`Membership Excel file not found: ${excelFilePath}`);
  }
  
  const workbook = XLSX.readFile(excelFilePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  
  // Initialize membership counts
  const membershipTotals = {
    total_drip_iv_members: 0,
    individual_memberships: 0,
    family_memberships: 0,
    family_concierge_memberships: 0,
    drip_concierge_memberships: 0,
    concierge_memberships: 0,
    corporate_memberships: 0,
    marketing_initiatives: 0
  };
  
  // Process membership data (column 4 contains membership types)
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (row && row[4]) { // Column 4 contains membership type
      const membershipType = row[4].toString().toLowerCase();
      membershipTotals.total_drip_iv_members++;
      
      if (membershipType.includes('individual')) {
        membershipTotals.individual_memberships++;
      } else if (membershipType.includes('family') && membershipType.includes('concierge')) {
        membershipTotals.family_concierge_memberships++;
      } else if (membershipType.includes('family')) {
        membershipTotals.family_memberships++;
      } else if (membershipType.includes('concierge') && membershipType.includes('drip')) {
        membershipTotals.drip_concierge_memberships++;
      } else if (membershipType.includes('concierge')) {
        membershipTotals.concierge_memberships++;
      } else if (membershipType.includes('corporate')) {
        membershipTotals.corporate_memberships++;
      }
    }
  }
  
  console.log('Membership analysis complete:', membershipTotals);
  return membershipTotals;
}

// Main import function
async function importWeeklyData(revenueFilePath, membershipFilePath) {
  try {
    console.log('Starting weekly data import...');
    console.log('Revenue file:', revenueFilePath || 'Not provided');
    console.log('Membership file:', membershipFilePath || 'Not provided');
    
    // Initialize default metrics
    let revenueMetrics = {
      // Service counts - default to 0
      iv_infusions_weekday_weekly: 0,
      iv_infusions_weekend_weekly: 0,
      iv_infusions_weekday_monthly: 0,
      iv_infusions_weekend_monthly: 0,
      injections_weekday_weekly: 0,
      injections_weekend_weekly: 0,
      injections_weekday_monthly: 0,
      injections_weekend_monthly: 0,
      
      // Customer analytics - default to 0
      unique_customers_weekly: 0,
      unique_customers_monthly: 0,
      member_customers_weekly: 0,
      non_member_customers_weekly: 0,
      
      // Revenue data - default to 0
      actual_weekly_revenue: 0,
      actual_monthly_revenue: 0,
      drip_iv_revenue_weekly: 0,
      semaglutide_revenue_weekly: 0,
      drip_iv_revenue_monthly: 0,
      semaglutide_revenue_monthly: 0,
      
      // Additional revenue categories
      infusion_revenue_weekly: 0,
      infusion_revenue_monthly: 0,
      injection_revenue_weekly: 0,
      injection_revenue_monthly: 0,
      membership_revenue_weekly: 0,
      membership_revenue_monthly: 0,
      
      // Legacy fields for backward compatibility
      drip_iv_weekday_weekly: 0,
      drip_iv_weekend_weekly: 0,
      drip_iv_weekday_monthly: 0,
      drip_iv_weekend_monthly: 0,
      
      // Date tracking
      weekStartDate: null,
      weekEndDate: null
    };
    
    let membershipMetrics = {
      // Membership counts - default to 0
      total_drip_iv_members: 0,
      individual_memberships: 0,
      family_memberships: 0,
      family_concierge_memberships: 0,
      drip_concierge_memberships: 0,
      concierge_memberships: 0,
      corporate_memberships: 0,
      marketing_initiatives: 0
    };
    
    // Process revenue data if file is provided
    if (revenueFilePath) {
      const csvData = await processRevenueData(revenueFilePath);
      revenueMetrics = analyzeRevenueData(csvData);
    } else {
      console.log('No revenue file provided, using default revenue metrics');
    }
    
    // Process membership data if file is provided
    if (membershipFilePath) {
      membershipMetrics = await processMembershipData(membershipFilePath);
    } else {
      console.log('No membership file provided, using default membership metrics');
    }
    
    // Combine metrics
    const combinedData = {
      ...revenueMetrics,
      ...membershipMetrics,
      
      // Set default goals
      weekly_revenue_goal: 32125.00,
      monthly_revenue_goal: 128500.00,
      
      // Calculate days left in month (approximate)
      days_left_in_month: Math.max(0, 30 - new Date().getDate()),
      
      // Popular services
      popular_infusions: ['Energy', 'NAD+', 'Performance & Recovery'],
      popular_infusions_status: 'Active',
      popular_injections: ['Tirzepatide', 'Semaglutide', 'B12'],
      popular_injections_status: 'Active'
    };
    
    // Set week start and end dates
    combinedData.week_start_date = combinedData.weekStartDate || new Date();
    combinedData.week_end_date = combinedData.weekEndDate || new Date();
    
    // Clean up temporary date fields
    delete combinedData.weekStartDate;
    delete combinedData.weekEndDate;
    delete combinedData.monthStartDate;
    delete combinedData.monthEndDate;
    
    // Insert or update database
    const client = await pool.connect();
    try {
      // Check if data already exists for this week
      const existingCheck = await client.query(
        'SELECT id FROM analytics_data WHERE week_start_date = $1 AND week_end_date = $2',
        [combinedData.week_start_date, combinedData.week_end_date]
      );
      
      if (existingCheck.rows.length > 0) {
        console.log('Data already exists for this week, updating...');
        
        // Update existing record
        const updateQuery = `
          UPDATE analytics_data SET
            iv_infusions_weekday_weekly = $3,
            iv_infusions_weekend_weekly = $4,
            iv_infusions_weekday_monthly = $5,
            iv_infusions_weekend_monthly = $6,
            injections_weekday_weekly = $7,
            injections_weekend_weekly = $8,
            injections_weekday_monthly = $9,
            injections_weekend_monthly = $10,
            unique_customers_weekly = $11,
            unique_customers_monthly = $12,
            member_customers_weekly = $13,
            non_member_customers_weekly = $14,
            actual_weekly_revenue = $15,
            actual_monthly_revenue = $16,
            drip_iv_revenue_weekly = $17,
            semaglutide_revenue_weekly = $18,
            drip_iv_revenue_monthly = $19,
            semaglutide_revenue_monthly = $20,
            total_drip_iv_members = $21,
            individual_memberships = $22,
            family_memberships = $23,
            family_concierge_memberships = $24,
            drip_concierge_memberships = $25,
            concierge_memberships = $26,
            corporate_memberships = $27,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $28
        `;
        
        await client.query(updateQuery, [
          combinedData.week_start_date,
          combinedData.week_end_date,
          combinedData.iv_infusions_weekday_weekly,
          combinedData.iv_infusions_weekend_weekly,
          combinedData.iv_infusions_weekday_monthly,
          combinedData.iv_infusions_weekend_monthly,
          combinedData.injections_weekday_weekly,
          combinedData.injections_weekend_weekly,
          combinedData.injections_weekday_monthly,
          combinedData.injections_weekend_monthly,
          combinedData.unique_customers_weekly,
          combinedData.unique_customers_monthly,
          combinedData.member_customers_weekly,
          combinedData.non_member_customers_weekly,
          combinedData.actual_weekly_revenue,
          combinedData.actual_monthly_revenue,
          combinedData.drip_iv_revenue_weekly,
          combinedData.semaglutide_revenue_weekly,
          combinedData.drip_iv_revenue_monthly,
          combinedData.semaglutide_revenue_monthly,
          combinedData.total_drip_iv_members,
          combinedData.individual_memberships,
          combinedData.family_memberships,
          combinedData.family_concierge_memberships,
          combinedData.drip_concierge_memberships,
          combinedData.concierge_memberships,
          combinedData.corporate_memberships,
          existingCheck.rows[0].id
        ]);
        
        console.log('Data updated successfully!');
      } else {
        console.log('Inserting new weekly data...');
        
        // Insert new record
        const insertQuery = `
          INSERT INTO analytics_data (
            week_start_date, week_end_date,
            iv_infusions_weekday_weekly, iv_infusions_weekend_weekly,
            iv_infusions_weekday_monthly, iv_infusions_weekend_monthly,
            injections_weekday_weekly, injections_weekend_weekly,
            injections_weekday_monthly, injections_weekend_monthly,
            unique_customers_weekly, unique_customers_monthly,
            member_customers_weekly, non_member_customers_weekly,
            actual_weekly_revenue, weekly_revenue_goal,
            actual_monthly_revenue, monthly_revenue_goal,
            drip_iv_revenue_weekly, semaglutide_revenue_weekly,
            drip_iv_revenue_monthly, semaglutide_revenue_monthly,
            total_drip_iv_members, individual_memberships,
            family_memberships, family_concierge_memberships,
            drip_concierge_memberships, concierge_memberships,
            corporate_memberships, days_left_in_month,
            popular_infusions, popular_infusions_status,
            popular_injections, popular_injections_status
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
            $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
            $31, $32, $33, $34
          )
        `;
        
        await client.query(insertQuery, [
          combinedData.week_start_date,
          combinedData.week_end_date,
          combinedData.iv_infusions_weekday_weekly,
          combinedData.iv_infusions_weekend_weekly,
          combinedData.iv_infusions_weekday_monthly,
          combinedData.iv_infusions_weekend_monthly,
          combinedData.injections_weekday_weekly,
          combinedData.injections_weekend_weekly,
          combinedData.injections_weekday_monthly,
          combinedData.injections_weekend_monthly,
          combinedData.unique_customers_weekly,
          combinedData.unique_customers_monthly,
          combinedData.member_customers_weekly,
          combinedData.non_member_customers_weekly,
          combinedData.actual_weekly_revenue,
          combinedData.weekly_revenue_goal,
          combinedData.actual_monthly_revenue,
          combinedData.monthly_revenue_goal,
          combinedData.drip_iv_revenue_weekly,
          combinedData.semaglutide_revenue_weekly,
          combinedData.drip_iv_revenue_monthly,
          combinedData.semaglutide_revenue_monthly,
          combinedData.total_drip_iv_members,
          combinedData.individual_memberships,
          combinedData.family_memberships,
          combinedData.family_concierge_memberships,
          combinedData.drip_concierge_memberships,
          combinedData.concierge_memberships,
          combinedData.corporate_memberships,
          combinedData.days_left_in_month,
          combinedData.popular_infusions,
          combinedData.popular_infusions_status,
          combinedData.popular_injections,
          combinedData.popular_injections_status
        ]);
        
        console.log('Data inserted successfully!');
      }
    } finally {
      client.release();
    }
    
    console.log('Import completed successfully!');
    return combinedData;
    
  } catch (error) {
    console.error('Error importing weekly data:', error);
    throw error;
  }
}

// Export functions for use in other modules
module.exports = {
  importWeeklyData,
  processRevenueData,
  processMembershipData,
  analyzeRevenueData
};

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 2) {
    console.log('Usage: node import-weekly-data.js <revenue-csv-path> <membership-excel-path>');
    process.exit(1);
  }
  
  const [revenueFilePath, membershipFilePath] = args;
  
  importWeeklyData(revenueFilePath, membershipFilePath)
    .then(() => {
      console.log('Import completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('Import failed:', error);
      process.exit(1);
    });
}