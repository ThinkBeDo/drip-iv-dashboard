#!/usr/bin/env node

/**
 * Analyze Latest Data File for Dashboard Validation
 *
 * This script uses the EXACT same categorization logic as production code
 * (import-weekly-data.js and import-multi-week-data.js) to calculate expected
 * dashboard values from the latest XLS file.
 *
 * Usage: node analyze-latest-data.js
 */

const XLSX = require('xlsx');
const path = require('path');

// ============================================================================
// Service Categorization Functions - EXACT COPY from import-weekly-data.js
// ============================================================================

function isBaseInfusionService(chargeDesc) {
  const lowerDesc = chargeDesc.toLowerCase();

  // Exclude non-medical services first
  const exclusions = ['membership', 'lab', 'cbc', 'cmp', 'draw fee', 'office visit', 'consultation', 'total_tips'];
  if (exclusions.some(excl => lowerDesc.includes(excl))) {
    return false;
  }

  // IV Base Services (count as visits)
  const baseInfusionServices = [
    'saline 1l', 'normal saline 500', 'hydration', 'performance & recovery', 'energy', 'immunity',
    'alleviate', 'all inclusive', 'lux beauty', 'methylene blue infusion'
  ];

  return baseInfusionServices.some(service => lowerDesc.includes(service));
}

function isInfusionAddon(chargeDesc) {
  const lowerDesc = chargeDesc.toLowerCase();

  // IV Add-ons (don't count as separate visits)
  const addonServices = [
    'vitamin d3', 'glutathione', 'nad', 'toradol', 'magnesium', 'vitamin b12',
    'zofran', 'biotin', 'vitamin c', 'zinc', 'mineral blend', 'vita-complex', 'taurine',
    'pepcid', 'amino acid'
  ];

  return addonServices.some(service => lowerDesc.includes(service));
}

function isStandaloneInjection(chargeDesc) {
  const lowerDesc = chargeDesc.toLowerCase();

  // Standalone Injections (count separately)
  const standaloneInjections = [
    'semaglutide', 'tirzepatide', 'b12', 'metabolism boost injection', 'biotin', 'taurine', 'xeomin neurotoxin',
    'steroid shot', 'tri-immune', 'tri immune'
  ];

  return standaloneInjections.some(service => lowerDesc.includes(service)) ||
    (lowerDesc.includes('b12') && lowerDesc.includes('injection') && !lowerDesc.includes('vitamin'));
}

function isMembershipService(chargeDesc) {
  const lowerDesc = chargeDesc.toLowerCase();

  // Don't match services that just have "(member)" as a pricing suffix
  if (lowerDesc.match(/\(member\)$/)) {
    return false;
  }

  return lowerDesc.includes('membership') ||
    lowerDesc.includes('concierge') ||
    (lowerDesc.includes('member') && !lowerDesc.includes('(member)')) ||
    (lowerDesc.includes('individual') && lowerDesc.includes('memb')) ||
    (lowerDesc.includes('family') && lowerDesc.includes('memb')) ||
    (lowerDesc.includes('corporate') && lowerDesc.includes('memb'));
}

function isConsultationService(chargeDesc) {
  const lowerDesc = chargeDesc.toLowerCase();
  return lowerDesc.includes('consultation') ||
    lowerDesc.includes('consult') ||
    lowerDesc.includes('follow-up') ||
    lowerDesc.includes('follow up') ||
    lowerDesc.includes('hormone') ||
    lowerDesc.includes('initial visit');
}

function getServiceCategory(chargeDesc) {
  const lowerDesc = chargeDesc.toLowerCase();

  // Weight Management
  if (lowerDesc.includes('contrave')) {
    return 'weight_management';
  }

  if (
    lowerDesc.includes('semaglutide') ||
    lowerDesc.includes('tirzepatide') ||
    lowerDesc.includes('weight loss')
  ) {
    return 'weight_management';
  }

  // NAD Categorization
  if (lowerDesc.includes('nad')) {
    if (lowerDesc.includes('250mg') || lowerDesc.includes('500mg')) {
      return 'base_infusion';
    }
    if (
      lowerDesc.includes('50mg') ||
      lowerDesc.includes('100mg') ||
      lowerDesc.includes('150mg') ||
      lowerDesc.includes('200mg')
    ) {
      return 'injection';
    }
  }

  // Amino Acids - injection vs addon distinction
  if (lowerDesc.includes('amino acid')) {
    if (lowerDesc.includes('injection')) {
      return 'injection';
    }
    // Default to addon for IV add-on or unspecified
    return 'infusion_addon';
  }

  // Check for infusion services FIRST (before membership)
  if (isBaseInfusionService(chargeDesc)) return 'base_infusion';
  if (isInfusionAddon(chargeDesc)) return 'infusion_addon';
  if (isStandaloneInjection(chargeDesc)) return 'injection';
  if (isConsultationService(chargeDesc)) return 'consultation';
  if (isMembershipService(chargeDesc)) return 'membership';
  return 'other';
}

// ============================================================================
// Date Parsing - EXACT COPY from import-multi-week-data.js
// ============================================================================

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

// ============================================================================
// Main Analysis Logic - Based on analyzeRevenueDataByWeeks()
// ============================================================================

function analyzeFile(filePath) {
  console.log('='.repeat(80));
  console.log('DRIP IV DASHBOARD - DATA FILE ANALYSIS');
  console.log('='.repeat(80));
  console.log(`\nFile: ${filePath}\n`);

  // Read the XLS file
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawData = XLSX.utils.sheet_to_json(sheet);

  console.log(`Parsed ${rawData.length} rows from file\n`);

  // Group data by week boundaries (Mon-Sun)
  const weekGroups = new Map();
  let globalMinDate = null;
  let globalMaxDate = null;

  rawData.forEach((row) => {
    const date = parseRowDate(row);
    if (!date) return;

    // Track global date range
    if (!globalMinDate || date < globalMinDate) globalMinDate = date;
    if (!globalMaxDate || date > globalMaxDate) globalMaxDate = date;

    // Calculate Monday of this week
    const dayOfWeek = date.getDay();
    const monday = new Date(date);
    if (dayOfWeek === 0) {
      monday.setDate(date.getDate() - 6); // Sunday -> Previous Monday
    } else {
      monday.setDate(date.getDate() - (dayOfWeek - 1));
    }

    // Calculate Sunday of this week
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const weekKey = monday.toISOString().split('T')[0];

    if (!weekGroups.has(weekKey)) {
      weekGroups.set(weekKey, {
        weekStart: monday,
        weekEnd: sunday,
        rows: [],
        metrics: initializeWeekMetrics()
      });
    }

    weekGroups.get(weekKey).rows.push(row);
  });

  console.log(`Date range: ${globalMinDate?.toDateString()} to ${globalMaxDate?.toDateString()}`);
  console.log(`Found ${weekGroups.size} week(s) in data\n`);

  // Process each week
  const weeklyResults = [];

  for (const [weekKey, weekData] of weekGroups.entries()) {
    const metrics = processWeekData(weekData);
    weeklyResults.push({
      weekStart: weekData.weekStart,
      weekEnd: weekData.weekEnd,
      metrics
    });
  }

  // Sort chronologically
  weeklyResults.sort((a, b) => a.weekStart - b.weekStart);

  // Output results
  outputResults(weeklyResults);
}

function initializeWeekMetrics() {
  return {
    actual_weekly_revenue: 0,
    drip_iv_revenue_weekly: 0,
    semaglutide_revenue_weekly: 0,
    membership_revenue_weekly: 0,
    other_revenue_weekly: 0,
    iv_infusions_weekday_weekly: 0,
    iv_infusions_weekend_weekly: 0,
    injections_weekday_weekly: 0,
    injections_weekend_weekly: 0,
    semaglutide_injections_weekly: 0,
    weight_loss_injections_weekly: 0,
    unique_customers_weekly: new Set(),
    member_customers_weekly: new Set(),
    non_member_customers_weekly: new Set(),
    new_individual_members_weekly: 0,
    new_family_members_weekly: 0,
    new_concierge_members_weekly: 0,
    new_corporate_members_weekly: 0
  };
}

function processWeekData(weekData) {
  const metrics = weekData.metrics;

  // Pre-compute patient member status (same as production)
  const patientMemberStatus = new Map();

  for (const row of weekData.rows) {
    const patient = (row['Patient'] || '').trim();
    const chargeDesc = row['Charge Desc'] || '';
    if (!patient || !chargeDesc) continue;

    const lowerDesc = chargeDesc.toLowerCase();
    if (!patientMemberStatus.has(patient)) {
      patientMemberStatus.set(patient, false);
    }
    if (lowerDesc.includes('(member)') && !lowerDesc.includes('non-member')) {
      patientMemberStatus.set(patient, true);
    }
  }

  // Process each row
  for (const row of weekData.rows) {
    const date = parseRowDate(row);
    const patient = (row['Patient'] || '').trim();
    const chargeDesc = row['Charge Desc'] || '';

    // Use Calculated Payment (Line) - same as production
    const paymentValue = row['Calculated Payment (Line)'] || row['Total'] || row['Paid'] || '0';
    const cleanedValue = typeof paymentValue === 'string'
      ? paymentValue.replace(/[$,]/g, '').trim()
      : String(paymentValue);
    const chargeAmount = parseFloat(cleanedValue) || 0;

    if (!chargeAmount || chargeAmount <= 0) continue;

    // Add to weekly totals
    metrics.actual_weekly_revenue += chargeAmount;

    // Categorize service
    const serviceCategory = getServiceCategory(chargeDesc);

    if (serviceCategory === 'base_infusion' || serviceCategory === 'infusion_addon') {
      metrics.drip_iv_revenue_weekly += chargeAmount;

      if (serviceCategory === 'base_infusion' && date) {
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
        if (isWeekend) {
          metrics.iv_infusions_weekend_weekly++;
        } else {
          metrics.iv_infusions_weekday_weekly++;
        }
      }
    } else if (serviceCategory === 'injection') {
      metrics.drip_iv_revenue_weekly += chargeAmount;

      if (date) {
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
        if (isWeekend) {
          metrics.injections_weekend_weekly++;
        } else {
          metrics.injections_weekday_weekly++;
        }
      }
    } else if (serviceCategory === 'weight_management') {
      metrics.semaglutide_revenue_weekly += chargeAmount;

      if (chargeDesc.toLowerCase().includes('semaglutide') ||
          chargeDesc.toLowerCase().includes('tirzepatide')) {
        metrics.semaglutide_injections_weekly++;
        metrics.weight_loss_injections_weekly++;
      }
    } else if (serviceCategory === 'consultation') {
      metrics.other_revenue_weekly += chargeAmount;
    } else if (serviceCategory === 'membership') {
      metrics.membership_revenue_weekly += chargeAmount;

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
    } else {
      metrics.other_revenue_weekly += chargeAmount;
    }

    // Track unique customers
    if (patient) {
      metrics.unique_customers_weekly.add(patient);
      const isMemberPatient = patientMemberStatus.get(patient) || false;
      if (isMemberPatient) {
        metrics.member_customers_weekly.add(patient);
      } else {
        metrics.non_member_customers_weekly.add(patient);
      }
    }
  }

  // Convert Sets to counts
  metrics.unique_customers_weekly = metrics.unique_customers_weekly.size;
  metrics.member_customers_weekly = metrics.member_customers_weekly.size;
  metrics.non_member_customers_weekly = metrics.non_member_customers_weekly.size;

  return metrics;
}

function outputResults(weeklyResults) {
  console.log('\n' + '='.repeat(80));
  console.log('EXPECTED DASHBOARD VALUES');
  console.log('='.repeat(80));

  for (const week of weeklyResults) {
    const startStr = week.weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const endStr = week.weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const m = week.metrics;

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`WEEK: ${startStr} - ${endStr}`);
    console.log(`${'─'.repeat(60)}`);

    console.log('\n  REVENUE:');
    console.log(`    Total Weekly Revenue:    $${m.actual_weekly_revenue.toFixed(2)}`);
    console.log(`    IV Therapy Revenue:      $${m.drip_iv_revenue_weekly.toFixed(2)}`);
    console.log(`    Weight Loss Revenue:     $${m.semaglutide_revenue_weekly.toFixed(2)}`);
    console.log(`    Membership Revenue:      $${m.membership_revenue_weekly.toFixed(2)}`);
    console.log(`    Other Revenue:           $${m.other_revenue_weekly.toFixed(2)}`);

    console.log('\n  SERVICE COUNTS:');
    const totalInfusions = m.iv_infusions_weekday_weekly + m.iv_infusions_weekend_weekly;
    const totalInjections = m.injections_weekday_weekly + m.injections_weekend_weekly;
    console.log(`    IV Infusions:            ${totalInfusions} (${m.iv_infusions_weekday_weekly} weekday, ${m.iv_infusions_weekend_weekly} weekend)`);
    console.log(`    Regular Injections:      ${totalInjections} (${m.injections_weekday_weekly} weekday, ${m.injections_weekend_weekly} weekend)`);
    console.log(`    Weight Loss Injections:  ${m.weight_loss_injections_weekly}`);

    console.log('\n  CUSTOMERS:');
    console.log(`    Unique Customers:        ${m.unique_customers_weekly}`);
    console.log(`    Member Customers:        ${m.member_customers_weekly}`);
    console.log(`    Non-Member Customers:    ${m.non_member_customers_weekly}`);

    console.log('\n  NEW MEMBERSHIPS:');
    console.log(`    Individual:              ${m.new_individual_members_weekly}`);
    console.log(`    Family:                  ${m.new_family_members_weekly}`);
    console.log(`    Concierge:               ${m.new_concierge_members_weekly}`);
    console.log(`    Corporate:               ${m.new_corporate_members_weekly}`);
  }

  // Summary if multiple weeks
  if (weeklyResults.length > 1) {
    console.log(`\n${'='.repeat(60)}`);
    console.log('MONTHLY TOTALS (All Weeks Combined)');
    console.log(`${'='.repeat(60)}`);

    const totals = {
      revenue: 0,
      iv: 0,
      wl: 0,
      membership: 0,
      other: 0,
      infusions: 0,
      injections: 0,
      wlInjections: 0,
      customers: 0
    };

    for (const week of weeklyResults) {
      const m = week.metrics;
      totals.revenue += m.actual_weekly_revenue;
      totals.iv += m.drip_iv_revenue_weekly;
      totals.wl += m.semaglutide_revenue_weekly;
      totals.membership += m.membership_revenue_weekly;
      totals.other += m.other_revenue_weekly;
      totals.infusions += m.iv_infusions_weekday_weekly + m.iv_infusions_weekend_weekly;
      totals.injections += m.injections_weekday_weekly + m.injections_weekend_weekly;
      totals.wlInjections += m.weight_loss_injections_weekly;
      totals.customers += m.unique_customers_weekly;
    }

    console.log(`\n    Total Revenue:           $${totals.revenue.toFixed(2)}`);
    console.log(`    IV Therapy:              $${totals.iv.toFixed(2)}`);
    console.log(`    Weight Loss:             $${totals.wl.toFixed(2)}`);
    console.log(`    Membership:              $${totals.membership.toFixed(2)}`);
    console.log(`    Other:                   $${totals.other.toFixed(2)}`);
    console.log(`\n    Total Infusions:         ${totals.infusions}`);
    console.log(`    Total Regular Injections:${totals.injections}`);
    console.log(`    Total WL Injections:     ${totals.wlInjections}`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('Compare these values against your live dashboard!');
  console.log('='.repeat(80) + '\n');
}

// ============================================================================
// Run Analysis
// ============================================================================

const filePath = path.join(__dirname, 'public', '(Latest) Patient Analysis (Charge Details & Payments) - V3  - With COGS (1).xls');
analyzeFile(filePath);
