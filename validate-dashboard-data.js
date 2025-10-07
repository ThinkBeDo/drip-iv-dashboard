/**
 * COMPREHENSIVE DASHBOARD DATA VALIDATION SCRIPT
 *
 * This script performs a complete audit by:
 * 1. Reading source Excel files directly
 * 2. Querying the database for imported records
 * 3. Comparing actual vs expected values
 * 4. Identifying discrepancies and root causes
 */

const XLSX = require('xlsx');
const { Pool } = require('pg');
require('dotenv').config();

// Import the actual service categorization functions
const { getServiceCategory } = require('./import-weekly-data');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// ============================================================================
// HELPER FUNCTIONS - Match the actual parsing logic
// ============================================================================

function parseRowDate(row) {
  let dateStr = row['Date Of Payment'] || row['Date'] || '';
  if (!dateStr) return null;

  // Handle Excel serial numbers
  if (typeof dateStr === 'number') {
    const excelEpoch = new Date(1899, 11, 30);
    return new Date(excelEpoch.getTime() + dateStr * 86400000);
  }

  // Handle date strings
  let date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    const parts = String(dateStr).split('/');
    if (parts.length === 3) {
      let [month, day, year] = parts.map(p => parseInt(p));
      if (year < 100) year += 2000;
      date = new Date(year, month - 1, day);
    }
  }

  return isNaN(date.getTime()) ? null : date;
}

function cleanCurrency(value) {
  if (!value || value === null || value === undefined) return 0;
  const valueStr = value.toString();
  let cleaned = valueStr.replace(/[$,]/g, '').trim();
  const amount = parseFloat(cleaned) || 0;
  return amount;
}

function isBaseInfusionService(chargeDesc) {
  const lowerDesc = chargeDesc.toLowerCase();
  const exclusions = ['membership', 'lab', 'cbc', 'cmp', 'draw fee', 'office visit', 'consultation', 'total_tips'];
  if (exclusions.some(excl => lowerDesc.includes(excl))) return false;

  const baseInfusionServices = [
    'saline 1l', 'hydration', 'performance & recovery', 'performance &amp; recovery',
    'energy', 'immunity', 'alleviate', 'all inclusive', 'lux beauty',
    'methylene blue infusion'
  ];
  return baseInfusionServices.some(service => lowerDesc.includes(service));
}

function isStandaloneInjection(chargeDesc) {
  const lowerDesc = chargeDesc.toLowerCase();
  const standaloneInjections = [
    'semaglutide', 'tirzepatide', 'metabolism boost injection', 'biotin', 'taurine'
  ];

  // B12 injections
  if ((lowerDesc.includes('b12') && lowerDesc.includes('injection')) ||
      (lowerDesc.includes('vitamin b12') && lowerDesc.includes('injection'))) {
    return true;
  }

  return standaloneInjections.some(service => lowerDesc.includes(service));
}

// ============================================================================
// ANALYSIS FUNCTIONS
// ============================================================================

async function analyzeMembershipFile(filepath) {
  console.log('\n📋 ANALYZING MEMBERSHIP FILE');
  console.log('=' .repeat(80));

  const wb = XLSX.readFile(filepath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws);

  console.log(`Total rows: ${data.length}`);

  // Count by membership type
  const counts = { INDIVIDUAL: 0, FAMILY: 0, CONCIERGE: 0, CORPORATE: 0, OTHER: 0 };
  const details = { INDIVIDUAL: [], FAMILY: [], CONCIERGE: [], CORPORATE: [], OTHER: [] };

  data.forEach((row, index) => {
    const title = (row.Title || '').toUpperCase();
    const patient = row.Patient || 'Unknown';

    if (title.includes('INDIVIDUAL')) {
      counts.INDIVIDUAL++;
      details.INDIVIDUAL.push({ row: index + 2, patient, title: row.Title });
    } else if (title.includes('FAMILY')) {
      counts.FAMILY++;
      details.FAMILY.push({ row: index + 2, patient, title: row.Title });
    } else if (title.includes('CONCIERGE')) {
      counts.CONCIERGE++;
      details.CONCIERGE.push({ row: index + 2, patient, title: row.Title });
    } else if (title.includes('CORPORATE')) {
      counts.CORPORATE++;
      details.CORPORATE.push({ row: index + 2, patient, title: row.Title });
    } else {
      counts.OTHER++;
      details.OTHER.push({ row: index + 2, patient, title: row.Title });
    }
  });

  console.log('\n📊 Membership Breakdown:');
  Object.entries(counts).forEach(([key, val]) => {
    console.log(`  ${key}: ${val}`);
  });
  console.log(`  TOTAL: ${Object.values(counts).reduce((a, b) => a + b, 0)}`);

  return { counts, details, totalRows: data.length };
}

async function analyzeRevenueFile(filepath, weekStart, weekEnd) {
  console.log('\n💰 ANALYZING REVENUE FILE');
  console.log('=' .repeat(80));
  console.log(`Target week: ${weekStart.toISOString().split('T')[0]} to ${weekEnd.toISOString().split('T')[0]}`);

  const wb = XLSX.readFile(filepath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws);

  console.log(`Total rows in file: ${data.length}`);

  // Filter for target week
  const weekRows = data.filter(row => {
    const date = parseRowDate(row);
    if (!date) return false;
    return date >= weekStart && date <= weekEnd;
  });

  console.log(`Rows in target week: ${weekRows.length}`);

  // Initialize metrics
  const metrics = {
    totalRevenue: 0,
    ivRevenue: 0,
    weightLossRevenue: 0,
    membershipRevenue: 0,
    otherRevenue: 0,

    weekdayInfusions: 0,
    weekendInfusions: 0,
    weekdayInjections: 0,
    weekendInjections: 0,

    newIndividual: 0,
    newFamily: 0,
    newConcierge: 0,
    newCorporate: 0,

    uniqueCustomers: new Set(),

    serviceBreakdown: {},
    categoryBreakdown: {}
  };

  const detailedTransactions = [];

  weekRows.forEach((row, index) => {
    const date = parseRowDate(row);
    const chargeDesc = row['Charge Desc'] || '';
    const patient = (row['Patient'] || '').trim();
    const paymentValue = row['Calculated Payment (Line)'] || row['Total'] || row['Paid'] || '0';
    const amount = cleanCurrency(paymentValue);

    if (amount <= 0) return;

    // Track customer
    if (patient) {
      metrics.uniqueCustomers.add(patient);
    }

    // Categorize service
    const category = getServiceCategory(chargeDesc);

    // Track by category
    metrics.categoryBreakdown[category] = (metrics.categoryBreakdown[category] || 0) + amount;

    // Track by service name
    const serviceName = chargeDesc.substring(0, 50);
    metrics.serviceBreakdown[serviceName] = (metrics.serviceBreakdown[serviceName] || 0) + amount;

    // Categorize revenue
    if (category === 'base_infusion' || category === 'infusion_addon') {
      metrics.ivRevenue += amount;

      if (category === 'base_infusion') {
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
        if (isWeekend) {
          metrics.weekendInfusions++;
        } else {
          metrics.weekdayInfusions++;
        }
      }
    } else if (category === 'injection') {
      metrics.ivRevenue += amount;
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
      if (isWeekend) {
        metrics.weekendInjections++;
      } else {
        metrics.weekdayInjections++;
      }
    } else if (category === 'weight_management') {
      metrics.weightLossRevenue += amount;
    } else if (category === 'consultation') {
      metrics.otherRevenue += amount;
    } else if (category === 'membership') {
      metrics.membershipRevenue += amount;

      // Check for NEW memberships
      if (/\bnew\b/i.test(chargeDesc)) {
        const lowerDesc = chargeDesc.toLowerCase();
        if (lowerDesc.includes('individual')) metrics.newIndividual++;
        else if (lowerDesc.includes('family')) metrics.newFamily++;
        else if (lowerDesc.includes('concierge')) metrics.newConcierge++;
        else if (lowerDesc.includes('corporate')) metrics.newCorporate++;
      }
    } else {
      metrics.otherRevenue += amount;
    }

    metrics.totalRevenue += amount;

    // Store detailed transaction
    detailedTransactions.push({
      row: index + 1,
      date: date.toISOString().split('T')[0],
      patient,
      chargeDesc,
      amount,
      category
    });
  });

  metrics.uniqueCustomers = metrics.uniqueCustomers.size;

  console.log('\n📈 Revenue Breakdown:');
  console.log(`  Total Revenue: $${metrics.totalRevenue.toFixed(2)}`);
  console.log(`  IV Therapy: $${metrics.ivRevenue.toFixed(2)}`);
  console.log(`  Weight Loss: $${metrics.weightLossRevenue.toFixed(2)}`);
  console.log(`  Membership: $${metrics.membershipRevenue.toFixed(2)}`);
  console.log(`  Other: $${metrics.otherRevenue.toFixed(2)}`);

  console.log('\n📊 Service Volume:');
  console.log(`  Infusions: ${metrics.weekdayInfusions + metrics.weekendInfusions} (${metrics.weekdayInfusions} weekday, ${metrics.weekendInfusions} weekend)`);
  console.log(`  Injections: ${metrics.weekdayInjections + metrics.weekendInjections} (${metrics.weekdayInjections} weekday, ${metrics.weekendInjections} weekend)`);

  console.log('\n🆕 New Memberships:');
  console.log(`  Individual: ${metrics.newIndividual}`);
  console.log(`  Family: ${metrics.newFamily}`);
  console.log(`  Concierge: ${metrics.newConcierge}`);
  console.log(`  Corporate: ${metrics.newCorporate}`);

  console.log('\n👥 Customers:');
  console.log(`  Unique: ${metrics.uniqueCustomers}`);

  return { metrics, detailedTransactions, totalRows: data.length, weekRows: weekRows.length };
}

async function queryDatabaseForWeek(weekStart, weekEnd) {
  console.log('\n🗄️  QUERYING DATABASE');
  console.log('=' .repeat(80));

  const weekStartStr = weekStart.toISOString().split('T')[0];
  const weekEndStr = weekEnd.toISOString().split('T')[0];

  console.log(`Looking for week: ${weekStartStr} to ${weekEndStr}`);

  const result = await pool.query(
    `SELECT * FROM analytics_data
     WHERE week_start_date = $1 AND week_end_date = $2`,
    [weekStartStr, weekEndStr]
  );

  if (result.rows.length === 0) {
    console.log('❌ No records found in database for this week');
    return null;
  }

  const record = result.rows[0];

  console.log('\n📊 Database Record Found:');
  console.log(`  ID: ${record.id}`);
  console.log(`  Upload Date: ${record.upload_date}`);
  console.log(`  Total Revenue: $${record.actual_weekly_revenue}`);
  console.log(`  IV Revenue: $${record.drip_iv_revenue_weekly}`);
  console.log(`  Weight Loss Revenue: $${record.semaglutide_revenue_weekly}`);
  console.log(`  Membership Revenue: $${record.membership_revenue_weekly || 0}`);

  console.log('\n📊 Memberships:');
  console.log(`  Total: ${record.total_drip_iv_members}`);
  console.log(`  Individual: ${record.individual_memberships}`);
  console.log(`  Family: ${record.family_memberships}`);
  console.log(`  Concierge: ${record.concierge_memberships}`);
  console.log(`  Corporate: ${record.corporate_memberships}`);

  console.log('\n🆕 New Memberships:');
  console.log(`  Individual: ${record.new_individual_members_weekly || 0}`);
  console.log(`  Family: ${record.new_family_members_weekly || 0}`);
  console.log(`  Concierge: ${record.new_concierge_members_weekly || 0}`);
  console.log(`  Corporate: ${record.new_corporate_members_weekly || 0}`);

  console.log('\n📊 Service Volume:');
  console.log(`  Infusions: ${(record.iv_infusions_weekday_weekly || 0) + (record.iv_infusions_weekend_weekly || 0)} (${record.iv_infusions_weekday_weekly || 0} weekday, ${record.iv_infusions_weekend_weekly || 0} weekend)`);
  console.log(`  Injections: ${(record.injections_weekday_weekly || 0) + (record.injections_weekend_weekly || 0)} (${record.injections_weekday_weekly || 0} weekday, ${record.injections_weekend_weekly || 0} weekend)`);

  console.log('\n👥 Customers:');
  console.log(`  Unique: ${record.unique_customers_weekly}`);

  return record;
}

function compareResults(excelRevenue, excelMembership, dbRecord) {
  console.log('\n\n🔍 DISCREPANCY ANALYSIS');
  console.log('=' .repeat(80));

  const discrepancies = [];

  // Revenue comparison
  console.log('\n💰 REVENUE DISCREPANCIES:');

  const revenueDiff = (parseFloat(dbRecord.actual_weekly_revenue) - excelRevenue.metrics.totalRevenue).toFixed(2);
  const ivDiff = (parseFloat(dbRecord.drip_iv_revenue_weekly) - excelRevenue.metrics.ivRevenue).toFixed(2);
  const wlDiff = (parseFloat(dbRecord.semaglutide_revenue_weekly) - excelRevenue.metrics.weightLossRevenue).toFixed(2);

  console.log(`  Total Revenue: Excel $${excelRevenue.metrics.totalRevenue.toFixed(2)} vs DB $${dbRecord.actual_weekly_revenue}`);
  console.log(`    Difference: ${revenueDiff >= 0 ? '+' : ''}$${revenueDiff}`);
  if (Math.abs(revenueDiff) > 0.01) {
    discrepancies.push({
      metric: 'Total Revenue',
      expected: excelRevenue.metrics.totalRevenue.toFixed(2),
      actual: dbRecord.actual_weekly_revenue,
      difference: revenueDiff
    });
  }

  console.log(`  IV Therapy: Excel $${excelRevenue.metrics.ivRevenue.toFixed(2)} vs DB $${dbRecord.drip_iv_revenue_weekly}`);
  console.log(`    Difference: ${ivDiff >= 0 ? '+' : ''}$${ivDiff}`);
  if (Math.abs(ivDiff) > 0.01) {
    discrepancies.push({
      metric: 'IV Therapy Revenue',
      expected: excelRevenue.metrics.ivRevenue.toFixed(2),
      actual: dbRecord.drip_iv_revenue_weekly,
      difference: ivDiff
    });
  }

  console.log(`  Weight Loss: Excel $${excelRevenue.metrics.weightLossRevenue.toFixed(2)} vs DB $${dbRecord.semaglutide_revenue_weekly}`);
  console.log(`    Difference: ${wlDiff >= 0 ? '+' : ''}$${wlDiff}`);
  if (Math.abs(wlDiff) > 0.01) {
    discrepancies.push({
      metric: 'Weight Loss Revenue',
      expected: excelRevenue.metrics.weightLossRevenue.toFixed(2),
      actual: dbRecord.semaglutide_revenue_weekly,
      difference: wlDiff
    });
  }

  // Membership comparison
  console.log('\n👥 MEMBERSHIP COUNT DISCREPANCIES:');

  const totalDiff = (dbRecord.total_drip_iv_members || 0) - excelMembership.counts.INDIVIDUAL - excelMembership.counts.FAMILY - excelMembership.counts.CONCIERGE - excelMembership.counts.CORPORATE;
  const indDiff = (dbRecord.individual_memberships || 0) - excelMembership.counts.INDIVIDUAL;
  const famDiff = (dbRecord.family_memberships || 0) - excelMembership.counts.FAMILY;
  const conDiff = (dbRecord.concierge_memberships || 0) - excelMembership.counts.CONCIERGE;

  console.log(`  Total: Excel ${excelMembership.counts.INDIVIDUAL + excelMembership.counts.FAMILY + excelMembership.counts.CONCIERGE} vs DB ${dbRecord.total_drip_iv_members || 0}`);
  console.log(`    Difference: ${totalDiff >= 0 ? '+' : ''}${totalDiff}`);

  console.log(`  Individual: Excel ${excelMembership.counts.INDIVIDUAL} vs DB ${dbRecord.individual_memberships || 0}`);
  console.log(`    Difference: ${indDiff >= 0 ? '+' : ''}${indDiff}`);
  if (indDiff !== 0) {
    discrepancies.push({
      metric: 'Individual Memberships',
      expected: excelMembership.counts.INDIVIDUAL,
      actual: dbRecord.individual_memberships || 0,
      difference: indDiff
    });
  }

  console.log(`  Family: Excel ${excelMembership.counts.FAMILY} vs DB ${dbRecord.family_memberships || 0}`);
  console.log(`    Difference: ${famDiff >= 0 ? '+' : ''}${famDiff}`);
  if (famDiff !== 0) {
    discrepancies.push({
      metric: 'Family Memberships',
      expected: excelMembership.counts.FAMILY,
      actual: dbRecord.family_memberships || 0,
      difference: famDiff
    });
  }

  console.log(`  Concierge: Excel ${excelMembership.counts.CONCIERGE} vs DB ${dbRecord.concierge_memberships || 0}`);
  console.log(`    Difference: ${conDiff >= 0 ? '+' : ''}${conDiff}`);
  if (conDiff !== 0) {
    discrepancies.push({
      metric: 'Concierge Memberships',
      expected: excelMembership.counts.CONCIERGE,
      actual: dbRecord.concierge_memberships || 0,
      difference: conDiff
    });
  }

  // New membership comparison
  console.log('\n🆕 NEW MEMBERSHIP DISCREPANCIES:');

  const newIndDiff = (dbRecord.new_individual_members_weekly || 0) - excelRevenue.metrics.newIndividual;
  const newFamDiff = (dbRecord.new_family_members_weekly || 0) - excelRevenue.metrics.newFamily;
  const newConDiff = (dbRecord.new_concierge_members_weekly || 0) - excelRevenue.metrics.newConcierge;

  console.log(`  Individual: Excel ${excelRevenue.metrics.newIndividual} vs DB ${dbRecord.new_individual_members_weekly || 0}`);
  console.log(`    Difference: ${newIndDiff >= 0 ? '+' : ''}${newIndDiff}`);
  if (newIndDiff !== 0) {
    discrepancies.push({
      metric: 'New Individual Memberships',
      expected: excelRevenue.metrics.newIndividual,
      actual: dbRecord.new_individual_members_weekly || 0,
      difference: newIndDiff
    });
  }

  console.log(`  Family: Excel ${excelRevenue.metrics.newFamily} vs DB ${dbRecord.new_family_members_weekly || 0}`);
  console.log(`    Difference: ${newFamDiff >= 0 ? '+' : ''}${newFamDiff}`);
  if (newFamDiff !== 0) {
    discrepancies.push({
      metric: 'New Family Memberships',
      expected: excelRevenue.metrics.newFamily,
      actual: dbRecord.new_family_members_weekly || 0,
      difference: newFamDiff
    });
  }

  console.log(`  Concierge: Excel ${excelRevenue.metrics.newConcierge} vs DB ${dbRecord.new_concierge_members_weekly || 0}`);
  console.log(`    Difference: ${newConDiff >= 0 ? '+' : ''}${newConDiff}`);
  if (newConDiff !== 0) {
    discrepancies.push({
      metric: 'New Concierge Memberships',
      expected: excelRevenue.metrics.newConcierge,
      actual: dbRecord.new_concierge_members_weekly || 0,
      difference: newConDiff
    });
  }

  // Service volume comparison
  console.log('\n📊 SERVICE VOLUME DISCREPANCIES:');

  const excelInfusions = excelRevenue.metrics.weekdayInfusions + excelRevenue.metrics.weekendInfusions;
  const dbInfusions = (dbRecord.iv_infusions_weekday_weekly || 0) + (dbRecord.iv_infusions_weekend_weekly || 0);
  const infusionDiff = dbInfusions - excelInfusions;

  const excelInjections = excelRevenue.metrics.weekdayInjections + excelRevenue.metrics.weekendInjections;
  const dbInjections = (dbRecord.injections_weekday_weekly || 0) + (dbRecord.injections_weekend_weekly || 0);
  const injectionDiff = dbInjections - excelInjections;

  console.log(`  Total Infusions: Excel ${excelInfusions} vs DB ${dbInfusions}`);
  console.log(`    Difference: ${infusionDiff >= 0 ? '+' : ''}${infusionDiff}`);
  if (infusionDiff !== 0) {
    discrepancies.push({
      metric: 'Total Infusions',
      expected: excelInfusions,
      actual: dbInfusions,
      difference: infusionDiff
    });
  }

  console.log(`  Total Injections: Excel ${excelInjections} vs DB ${dbInjections}`);
  console.log(`    Difference: ${injectionDiff >= 0 ? '+' : ''}${injectionDiff}`);
  if (injectionDiff !== 0) {
    discrepancies.push({
      metric: 'Total Injections',
      expected: excelInjections,
      actual: dbInjections,
      difference: injectionDiff
    });
  }

  // Summary
  console.log('\n\n📋 SUMMARY');
  console.log('=' .repeat(80));

  if (discrepancies.length === 0) {
    console.log('✅ NO DISCREPANCIES FOUND - All data matches!');
  } else {
    console.log(`❌ FOUND ${discrepancies.length} DISCREPANCIES:\n`);
    discrepancies.forEach((d, i) => {
      console.log(`${i + 1}. ${d.metric}`);
      console.log(`   Expected: ${d.expected}`);
      console.log(`   Actual: ${d.actual}`);
      console.log(`   Difference: ${d.difference >= 0 ? '+' : ''}${d.difference}\n`);
    });
  }

  return discrepancies;
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  console.log('\n🔍 DASHBOARD DATA VALIDATION AUDIT');
  console.log('=' .repeat(80));
  console.log('Comparing Excel source files → Database → Dashboard display\n');

  try {
    // Define target week
    const weekStart = new Date('2025-09-29');
    const weekEnd = new Date('2025-10-05');

    // Analyze source files
    const membershipResults = await analyzeMembershipFile('Drip IV Active Memberships (4).xlsx');
    const revenueResults = await analyzeRevenueFile('Patient Analysis (Charge Details & Payments) - V3  - With COGS (5).xls', weekStart, weekEnd);

    // Query database
    const dbRecord = await queryDatabaseForWeek(weekStart, weekEnd);

    if (!dbRecord) {
      console.log('\n❌ Cannot perform comparison - no database record found for this week');
      console.log('Please upload the data files first.');
      return;
    }

    // Compare and identify discrepancies
    const discrepancies = compareResults(revenueResults, membershipResults, dbRecord);

    // Show category breakdown for debugging
    console.log('\n\n🔍 DETAILED CATEGORY BREAKDOWN (from Excel):');
    console.log('=' .repeat(80));
    Object.entries(revenueResults.metrics.categoryBreakdown).forEach(([category, amount]) => {
      console.log(`  ${category}: $${amount.toFixed(2)}`);
    });

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

main();
