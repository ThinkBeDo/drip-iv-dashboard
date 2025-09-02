#!/usr/bin/env node

const XLSX = require('xlsx');
const fs = require('fs');

// Service categorization functions from import-weekly-data.js
function isBaseInfusionService(chargeDesc) {
  const lowerDesc = chargeDesc.toLowerCase();
  
  const exclusions = ['membership', 'lab', 'cbc', 'cmp', 'draw fee', 'office visit', 'consultation', 'total_tips'];
  if (exclusions.some(excl => lowerDesc.includes(excl))) {
    return false;
  }
  
  const baseInfusionServices = [
    'saline 1l', 'hydration', 'performance & recovery', 'energy', 'immunity', 
    'alleviate', 'all inclusive', 'lux beauty', 'methylene blue infusion'
  ];
  
  return baseInfusionServices.some(service => lowerDesc.includes(service));
}

function isInfusionAddon(chargeDesc) {
  const lowerDesc = chargeDesc.toLowerCase();
  
  const infusionAddons = [
    'zofran', 'toradol', 'glutathione', 'biotin', 'vitamin c', 
    'nad', 'nad+', 'zinc', 'magnesium', 'pepcid'
  ];
  
  return infusionAddons.some(addon => lowerDesc.includes(addon)) && 
         !lowerDesc.includes('injection');
}

function isStandaloneInjection(chargeDesc) {
  const lowerDesc = chargeDesc.toLowerCase();
  
  const standaloneInjections = [
    'semaglutide', 'tirzepatide', 'b12 injection', 'metabolism boost injection'
  ];
  
  return standaloneInjections.some(service => lowerDesc.includes(service)) ||
         (lowerDesc.includes('b12') && lowerDesc.includes('injection') && !lowerDesc.includes('vitamin'));
}

function getServiceCategory(chargeDesc) {
  if (isBaseInfusionService(chargeDesc)) return 'base_infusion';
  if (isInfusionAddon(chargeDesc)) return 'infusion_addon';
  if (isStandaloneInjection(chargeDesc)) return 'injection';
  return 'other';
}

// Process the test file
const filePath = '/Users/tylerlafleur/Downloads/Patient Analysis (Charge Details & Payments) - V3  - With COGS (1).xls';
const workbook = XLSX.readFile(filePath);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

console.log('📊 Analyzing Revenue File');
console.log('=' .repeat(80));

// Find header row
let headerRow = -1;
for (let i = 0; i < Math.min(20, data.length); i++) {
  const row = data[i];
  if (row && row.some(cell => String(cell).toLowerCase().includes('practitioner'))) {
    headerRow = i;
    break;
  }
}

if (headerRow === -1) {
  console.error('Could not find header row');
  process.exit(1);
}

const headers = data[headerRow];
console.log(`Found headers at row ${headerRow + 1}:`, headers.slice(0, 10));

// Find column indices
const dateCol = headers.findIndex(h => h && String(h).toLowerCase().includes('date') && !String(h).toLowerCase().includes('payment'));
const chargeDescCol = headers.findIndex(h => h && String(h).toLowerCase().includes('charge desc'));
const chargesCol = headers.findIndex(h => h && String(h).toLowerCase() === 'charges');

console.log(`Column indices: Date=${dateCol}, ChargeDesc=${chargeDescCol}, Charges=${chargesCol}`);

// Track totals
const totals = {
  overall: 0,
  iv_therapy: 0,      // base_infusion + infusion_addon
  weight_loss: 0,     // semaglutide/tirzepatide injections
  memberships: 0,
  other: 0,
  byDate: {}
};

// Track individual items for debugging
const items = {
  iv_therapy: [],
  weight_loss: [],
  other: []
};

// Process data rows
for (let i = headerRow + 1; i < data.length; i++) {
  const row = data[i];
  if (!row || row.length === 0) continue;
  
  const dateValue = row[dateCol];
  const chargeDesc = String(row[chargeDescCol] || '');
  const chargeAmount = parseFloat(String(row[chargesCol] || '0').replace(/[$,]/g, ''));
  
  if (!dateValue || dateValue === 'Total' || !chargeDesc || chargeAmount === 0) continue;
  
  // Parse Excel date
  let date;
  if (typeof dateValue === 'number') {
    // Excel serial date
    const excelEpoch = new Date(1900, 0, 1);
    date = new Date(excelEpoch.getTime() + (dateValue - 2) * 24 * 60 * 60 * 1000);
  } else {
    // String date
    const parts = String(dateValue).split('/');
    if (parts.length === 3) {
      const month = parseInt(parts[0]);
      const day = parseInt(parts[1]);
      let year = parseInt(parts[2]);
      if (year < 100) year = 2000 + year;
      date = new Date(year, month - 1, day);
    }
  }
  
  if (!date || isNaN(date.getTime())) continue;
  
  const dateStr = date.toISOString().split('T')[0];
  
  // Check if in Aug 25-31 range
  if (date >= new Date(2025, 7, 25) && date <= new Date(2025, 7, 31)) {
    const category = getServiceCategory(chargeDesc);
    
    totals.overall += chargeAmount;
    
    if (!totals.byDate[dateStr]) {
      totals.byDate[dateStr] = { total: 0, count: 0 };
    }
    totals.byDate[dateStr].total += chargeAmount;
    totals.byDate[dateStr].count++;
    
    if (category === 'base_infusion' || category === 'infusion_addon') {
      totals.iv_therapy += chargeAmount;
      items.iv_therapy.push({ date: dateStr, desc: chargeDesc, amount: chargeAmount });
    } else if (category === 'injection' && (chargeDesc.toLowerCase().includes('semaglutide') || chargeDesc.toLowerCase().includes('tirzepatide'))) {
      totals.weight_loss += chargeAmount;
      items.weight_loss.push({ date: dateStr, desc: chargeDesc, amount: chargeAmount });
    } else {
      totals.other += chargeAmount;
      items.other.push({ date: dateStr, desc: chargeDesc, amount: chargeAmount });
    }
  }
}

console.log('\n📅 Date Breakdown:');
Object.keys(totals.byDate).sort().forEach(date => {
  console.log(`  ${date}: $${totals.byDate[date].total.toFixed(2)} (${totals.byDate[date].count} items)`);
});

console.log('\n💰 Revenue Categories (Aug 25-31):');
console.log(`  IV Therapy:    $${totals.iv_therapy.toFixed(2)}`);
console.log(`  Weight Loss:   $${totals.weight_loss.toFixed(2)}`);
console.log(`  Other:         $${totals.other.toFixed(2)}`);
console.log(`  ─────────────────────────`);
console.log(`  TOTAL:         $${totals.overall.toFixed(2)}`);

console.log('\n📋 Sample Items:');
console.log('\nIV Therapy items (first 5):');
items.iv_therapy.slice(0, 5).forEach(item => {
  console.log(`  ${item.date}: ${item.desc} - $${item.amount.toFixed(2)}`);
});

console.log('\nWeight Loss items (first 5):');
items.weight_loss.slice(0, 5).forEach(item => {
  console.log(`  ${item.date}: ${item.desc} - $${item.amount.toFixed(2)}`);
});

console.log('\nOther items (first 5):');
items.other.slice(0, 5).forEach(item => {
  console.log(`  ${item.date}: ${item.desc} - $${item.amount.toFixed(2)}`);
});

console.log('\n⚠️  DISCREPANCY ANALYSIS:');
console.log(`  File Total:      $${totals.overall.toFixed(2)}`);
console.log(`  Dashboard Shows: $25,142.40`);
console.log(`  Difference:      $${(25142.40 - totals.overall).toFixed(2)}`);