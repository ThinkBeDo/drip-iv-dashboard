const { Pool } = require('pg');
const csvParser = require('csv-parser');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Hardcoded membership data as specified
const MEMBERSHIP_DATA = {
  total_drip_iv_members: 139,
  individual_memberships: 103,
  family_memberships: 18,
  concierge_memberships: 21,
  corporate_memberships: 1
};

// Hardcoded weekly revenue
const WEEKLY_REVENUE = 32219.95;

// Date range for the data
const WEEK_START = '2025-07-27';
const WEEK_END = '2025-08-02';

// Parse CSV data
async function parseCSVData(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}

// Process the CSV data
function processPatientAnalysis(csvData) {
  // Define IV Base Services that count as visits
  const IV_BASE_SERVICES = [
    'Saline 1L', 'Hydration', 'Performance & Recovery', 'Energy', 
    'Immunity', 'Alleviate', 'All Inclusive', 'Lux Beauty', 'Methylene Blue'
  ];
  
  // Define standalone injections
  const STANDALONE_INJECTIONS = ['Semaglutide', 'Tirzepatide'];
  
  // Initialize data structure
  const data = {
    // Service counts
    ketamine_new_patient_weekly: 0,
    ketamine_initial_booster_weekly: 0,
    ketamine_booster_pain_weekly: 0,
    ketamine_booster_bh_weekly: 0,
    drip_iv_weekday_weekly: 0,
    drip_iv_weekend_weekly: 0,
    semaglutide_consults_weekly: 0,
    semaglutide_injections_weekly: 0,
    hormone_followup_female_weekly: 0,
    hormone_initial_male_weekly: 0,
    
    // Revenue data
    drip_iv_revenue_weekly: 0,
    semaglutide_revenue_weekly: 0,
    ketamine_revenue_weekly: 0,
    
    // Membership data (hardcoded)
    total_drip_iv_members: MEMBERSHIP_DATA.total_drip_iv_members,
    individual_memberships: MEMBERSHIP_DATA.individual_memberships,
    family_memberships: MEMBERSHIP_DATA.family_memberships,
    concierge_memberships: MEMBERSHIP_DATA.concierge_memberships,
    corporate_memberships: MEMBERSHIP_DATA.corporate_memberships,
    
    // Other metrics
    unique_customers: new Set(),
    hubspot_ketamine_conversions: 0,
    marketing_initiatives: 0,
    
    // Date range
    week_start_date: WEEK_START,
    week_end_date: WEEK_END
  };
  
  // Track unique visits by patient + date
  const visitTracker = new Set();
  
  // Process each row
  csvData.forEach(row => {
    // Skip tips
    if (row.Charge_Type === 'TOTAL_TIPS' || row.Description?.includes('Tips')) {
      return;
    }
    
    // Extract service and patient info
    const service = row.Service_Name || row.Service || row.Description || '';
    const patient = row.Patient_Name || row.Patient || '';
    const date = row.Service_Date || row.Date || '';
    const revenue = parseFloat(row.Amount || row.Revenue || 0);
    
    // Skip if no valid data
    if (!service || !date) return;
    
    // Track unique customers
    if (patient) {
      data.unique_customers.add(patient);
    }
    
    // Create unique visit key
    const visitKey = `${patient}_${date}`;
    
    // Check if this is an IV base service
    const isIVBaseService = IV_BASE_SERVICES.some(base => 
      service.toLowerCase().includes(base.toLowerCase())
    );
    
    // Count unique visits for IV services
    if (isIVBaseService && patient && !visitTracker.has(visitKey)) {
      visitTracker.add(visitKey);
      
      // Determine weekday or weekend
      const serviceDate = new Date(date);
      const dayOfWeek = serviceDate.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      
      if (isWeekend) {
        data.drip_iv_weekend_weekly++;
      } else {
        data.drip_iv_weekday_weekly++;
      }
      
      data.drip_iv_revenue_weekly += revenue;
    }
    
    // Process Semaglutide/Tirzepatide
    if (STANDALONE_INJECTIONS.some(inj => service.toLowerCase().includes(inj.toLowerCase()))) {
      if (service.toLowerCase().includes('consult')) {
        data.semaglutide_consults_weekly++;
      } else {
        data.semaglutide_injections_weekly++;
      }
      data.semaglutide_revenue_weekly += revenue;
    }
    
    // Process Ketamine
    if (service.toLowerCase().includes('ketamine')) {
      data.ketamine_revenue_weekly += revenue;
      
      if (service.toLowerCase().includes('new patient')) {
        data.ketamine_new_patient_weekly++;
      } else if (service.toLowerCase().includes('initial booster')) {
        data.ketamine_initial_booster_weekly++;
      } else if (service.toLowerCase().includes('booster') && service.toLowerCase().includes('pain')) {
        data.ketamine_booster_pain_weekly++;
      } else if (service.toLowerCase().includes('booster')) {
        data.ketamine_booster_bh_weekly++;
      }
    }
    
    // Process Hormone services
    if (service.toLowerCase().includes('hormone')) {
      if (service.toLowerCase().includes('female') && service.toLowerCase().includes('follow')) {
        data.hormone_followup_female_weekly++;
      } else if (service.toLowerCase().includes('male') && service.toLowerCase().includes('initial')) {
        data.hormone_initial_male_weekly++;
      }
    }
  });
  
  // Convert unique customers set to count
  data.unique_customers_count = data.unique_customers.size;
  delete data.unique_customers; // Remove the Set object
  
  // Calculate actual weekly revenue (use hardcoded value)
  data.actual_weekly_revenue = WEEKLY_REVENUE;
  data.weekly_revenue_goal = 32125.00;
  
  // Set monthly data to 0 (we only have weekly data)
  data.ketamine_new_patient_monthly = 0;
  data.ketamine_initial_booster_monthly = 0;
  data.ketamine_booster_pain_monthly = 0;
  data.ketamine_booster_bh_monthly = 0;
  data.drip_iv_weekday_monthly = 0;
  data.drip_iv_weekend_monthly = 0;
  data.semaglutide_consults_monthly = 0;
  data.semaglutide_injections_monthly = 0;
  data.hormone_followup_female_monthly = 0;
  data.hormone_initial_male_monthly = 0;
  data.actual_monthly_revenue = 0;
  data.monthly_revenue_goal = 128500.00;
  data.drip_iv_revenue_monthly = 0;
  data.semaglutide_revenue_monthly = 0;
  data.ketamine_revenue_monthly = 0;
  data.days_left_in_month = 0;
  
  return data;
}

// Main import function
async function importLatestData() {
  try {
    console.log('Starting data import...');
    
    // Path to the CSV file (update this to the actual path)
    const csvPath = path.join(__dirname, 'patient-analysis.csv');
    
    // Check if file exists
    if (!fs.existsSync(csvPath)) {
      throw new Error(`CSV file not found at ${csvPath}. Please ensure the patient-analysis.csv file is in the project directory.`);
    }
    
    // Parse CSV data
    console.log('Reading CSV file...');
    const csvData = await parseCSVData(csvPath);
    console.log(`Found ${csvData.length} rows in CSV`);
    
    // Process the data
    console.log('Processing patient analysis data...');
    const processedData = processPatientAnalysis(csvData);
    
    console.log('\n📊 Processed Data Summary:');
    console.log(`- Date Range: ${processedData.week_start_date} to ${processedData.week_end_date}`);
    console.log(`- Unique Customers: ${processedData.unique_customers_count}`);
    console.log(`- Drip IV Weekday Visits: ${processedData.drip_iv_weekday_weekly}`);
    console.log(`- Drip IV Weekend Visits: ${processedData.drip_iv_weekend_weekly}`);
    console.log(`- Total Drip IV Members: ${processedData.total_drip_iv_members}`);
    console.log(`  - Individual: ${processedData.individual_memberships}`);
    console.log(`  - Family: ${processedData.family_memberships}`);
    console.log(`  - Concierge: ${processedData.concierge_memberships}`);
    console.log(`  - Corporate: ${processedData.corporate_memberships}`);
    console.log(`- Weekly Revenue: $${processedData.actual_weekly_revenue.toFixed(2)}`);
    
    // Check if data already exists for this date range
    console.log('\nChecking for existing data...');
    const existingData = await pool.query(`
      SELECT id FROM analytics_data 
      WHERE week_start_date = $1 AND week_end_date = $2
    `, [processedData.week_start_date, processedData.week_end_date]);
    
    if (existingData.rows.length > 0) {
      // Update existing record
      console.log('Updating existing record...');
      
      const updateQuery = `
        UPDATE analytics_data SET
          ketamine_new_patient_weekly = $3,
          ketamine_initial_booster_weekly = $4,
          ketamine_booster_pain_weekly = $5,
          ketamine_booster_bh_weekly = $6,
          drip_iv_weekday_weekly = $7,
          drip_iv_weekend_weekly = $8,
          semaglutide_consults_weekly = $9,
          semaglutide_injections_weekly = $10,
          hormone_followup_female_weekly = $11,
          hormone_initial_male_weekly = $12,
          actual_weekly_revenue = $13,
          weekly_revenue_goal = $14,
          drip_iv_revenue_weekly = $15,
          semaglutide_revenue_weekly = $16,
          ketamine_revenue_weekly = $17,
          total_drip_iv_members = $18,
          individual_memberships = $19,
          family_memberships = $20,
          concierge_memberships = $21,
          corporate_memberships = $22,
          unique_customers_count = $23,
          hubspot_ketamine_conversions = $24,
          marketing_initiatives = $25,
          updated_at = CURRENT_TIMESTAMP
        WHERE week_start_date = $1 AND week_end_date = $2
        RETURNING id
      `;
      
      const updateValues = [
        processedData.week_start_date,
        processedData.week_end_date,
        processedData.ketamine_new_patient_weekly,
        processedData.ketamine_initial_booster_weekly,
        processedData.ketamine_booster_pain_weekly,
        processedData.ketamine_booster_bh_weekly,
        processedData.drip_iv_weekday_weekly,
        processedData.drip_iv_weekend_weekly,
        processedData.semaglutide_consults_weekly,
        processedData.semaglutide_injections_weekly,
        processedData.hormone_followup_female_weekly,
        processedData.hormone_initial_male_weekly,
        processedData.actual_weekly_revenue,
        processedData.weekly_revenue_goal,
        processedData.drip_iv_revenue_weekly,
        processedData.semaglutide_revenue_weekly,
        processedData.ketamine_revenue_weekly,
        processedData.total_drip_iv_members,
        processedData.individual_memberships,
        processedData.family_memberships,
        processedData.concierge_memberships,
        processedData.corporate_memberships,
        processedData.unique_customers_count,
        processedData.hubspot_ketamine_conversions,
        processedData.marketing_initiatives
      ];
      
      const result = await pool.query(updateQuery, updateValues);
      console.log(`✅ Successfully updated data for week ${processedData.week_start_date} to ${processedData.week_end_date}`);
      console.log(`   Record ID: ${result.rows[0].id}`);
      
    } else {
      // Insert new record
      console.log('Inserting new record...');
      
      const insertQuery = `
        INSERT INTO analytics_data (
          week_start_date, week_end_date,
          ketamine_new_patient_weekly, ketamine_initial_booster_weekly,
          ketamine_booster_pain_weekly, ketamine_booster_bh_weekly,
          drip_iv_weekday_weekly, drip_iv_weekend_weekly,
          semaglutide_consults_weekly, semaglutide_injections_weekly,
          hormone_followup_female_weekly, hormone_initial_male_weekly,
          ketamine_new_patient_monthly, ketamine_initial_booster_monthly,
          ketamine_booster_pain_monthly, ketamine_booster_bh_monthly,
          drip_iv_weekday_monthly, drip_iv_weekend_monthly,
          semaglutide_consults_monthly, semaglutide_injections_monthly,
          hormone_followup_female_monthly, hormone_initial_male_monthly,
          actual_weekly_revenue, weekly_revenue_goal,
          actual_monthly_revenue, monthly_revenue_goal,
          drip_iv_revenue_weekly, semaglutide_revenue_weekly, ketamine_revenue_weekly,
          drip_iv_revenue_monthly, semaglutide_revenue_monthly, ketamine_revenue_monthly,
          total_drip_iv_members, individual_memberships, family_memberships,
          concierge_memberships, corporate_memberships,
          unique_customers_count, hubspot_ketamine_conversions,
          marketing_initiatives, days_left_in_month
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
          $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
          $31, $32, $33, $34, $35, $36, $37, $38, $39, $40
        ) RETURNING id
      `;
      
      const values = [
        processedData.week_start_date,
        processedData.week_end_date,
        processedData.ketamine_new_patient_weekly,
        processedData.ketamine_initial_booster_weekly,
        processedData.ketamine_booster_pain_weekly,
        processedData.ketamine_booster_bh_weekly,
        processedData.drip_iv_weekday_weekly,
        processedData.drip_iv_weekend_weekly,
        processedData.semaglutide_consults_weekly,
        processedData.semaglutide_injections_weekly,
        processedData.hormone_followup_female_weekly,
        processedData.hormone_initial_male_weekly,
        processedData.ketamine_new_patient_monthly,
        processedData.ketamine_initial_booster_monthly,
        processedData.ketamine_booster_pain_monthly,
        processedData.ketamine_booster_bh_monthly,
        processedData.drip_iv_weekday_monthly,
        processedData.drip_iv_weekend_monthly,
        processedData.semaglutide_consults_monthly,
        processedData.semaglutide_injections_monthly,
        processedData.hormone_followup_female_monthly,
        processedData.hormone_initial_male_monthly,
        processedData.actual_weekly_revenue,
        processedData.weekly_revenue_goal,
        processedData.actual_monthly_revenue,
        processedData.monthly_revenue_goal,
        processedData.drip_iv_revenue_weekly,
        processedData.semaglutide_revenue_weekly,
        processedData.ketamine_revenue_weekly,
        processedData.drip_iv_revenue_monthly,
        processedData.semaglutide_revenue_monthly,
        processedData.ketamine_revenue_monthly,
        processedData.total_drip_iv_members,
        processedData.individual_memberships,
        processedData.family_memberships,
        processedData.concierge_memberships,
        processedData.corporate_memberships,
        processedData.unique_customers_count,
        processedData.hubspot_ketamine_conversions,
        processedData.marketing_initiatives,
        processedData.days_left_in_month
      ];
      
      const result = await pool.query(insertQuery, values);
      console.log(`✅ Successfully inserted data for week ${processedData.week_start_date} to ${processedData.week_end_date}`);
      console.log(`   Record ID: ${result.rows[0].id}`);
    }
    
    console.log('\n🎉 Data import completed successfully!');
    
  } catch (error) {
    console.error('❌ Error importing data:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the import
if (require.main === module) {
  importLatestData();
}

module.exports = { importLatestData };