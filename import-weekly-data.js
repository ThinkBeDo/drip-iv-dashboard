const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const csvParser = require('csv-parser');
const XLSX = require('xlsx');
const iconv = require('iconv-lite');
const { parse } = require('csv-parse/sync');
const { Console } = require('console');
const { normalizeServiceName, normalizeServiceType } = require('./parse-drip-csv');
require('dotenv').config();

// Database pool will be passed from server.js to avoid multiple connections
let pool = null;

// Function to set the database pool
function setDatabasePool(dbPool) {
  pool = dbPool;
  console.log('📊 Database pool configured for import-weekly-data');
}

// Create pool for CLI usage
function createStandalonePool() {
  if (!pool && process.env.DATABASE_URL) {
    console.log('📊 Creating standalone database pool for CLI usage');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
  }
  return pool;
}

// ============================================================================
// Service Mapping Functions - Deterministic Categorization
// ============================================================================

/**
 * Query service mapping for a given service
 * Returns bins or null if not found
 */
async function lookupServiceMapping(normalizedName, normalizedType, client) {
  if (!normalizedName) return null;

  try {
    // Try exact match first (name + type)
    let result = await client.query(
      `SELECT revenue_perf_bin, service_volume_bin, customer_bin
       FROM service_mapping
       WHERE normalized_service_name = $1
         AND normalized_service_type = $2
       LIMIT 1`,
      [normalizedName, normalizedType || '']
    );

    if (result.rows.length > 0) {
      return result.rows[0];
    }

    // Fallback: try name-only match if unique
    result = await client.query(
      `SELECT revenue_perf_bin, service_volume_bin, customer_bin, COUNT(*) OVER() as total_matches
       FROM service_mapping
       WHERE normalized_service_name = $1
       LIMIT 2`,
      [normalizedName]
    );

    // Only return if exactly one match found (avoids ambiguity)
    if (result.rows.length === 1 && result.rows[0].total_matches === 1) {
      return result.rows[0];
    }

    return null;
  } catch (err) {
    console.error(`Error looking up service mapping for "${normalizedName}":`, err.message);
    return null;
  }
}

/**
 * Track unmapped service for operational review
 */
async function trackUnmappedService(weekStart, row, normalizedName, normalizedType, client) {
  try {
    await client.query(
      `INSERT INTO unmapped_services (week_start, file_row, normalized_service_name, normalized_service_type)
       VALUES ($1, $2, $3, $4)`,
      [weekStart, JSON.stringify(row), normalizedName, normalizedType]
    );
  } catch (err) {
    // Silent fail to avoid breaking import
    console.warn(`Warning: Could not track unmapped service: ${err.message}`);
  }
}

/**
 * Process a single row with service mapping
 * Augments the row with mapping bins and returns enriched row
 */
async function processRowWithMapping(row, client) {
  const normalizedName = row.normalized_service_name;
  const normalizedType = row.normalized_service_type;

  if (!normalizedName) {
    return { ...row, mapping: null };
  }

  if (!client || typeof client.query !== 'function') {
    return {
      ...row,
      mapping: null,
      revenue_perf_bin: null,
      service_volume_bin: null,
      customer_bin: null
    };
  }

  const mapping = await lookupServiceMapping(normalizedName, normalizedType, client);

  return {
    ...row,
    mapping: mapping || null,
    revenue_perf_bin: mapping?.revenue_perf_bin || null,
    service_volume_bin: mapping?.service_volume_bin || null,
    customer_bin: mapping?.customer_bin || null
  };
}

// Service categorization functions (matching server.js logic)
function isBaseInfusionService(chargeDesc) {
  const lowerDesc = chargeDesc.toLowerCase();

  // Exclude non-medical services first
  const exclusions = [ 'membership', 'lab', 'cbc', 'cmp', 'draw fee', 'office visit', 'consultation', 'total_tips' ];
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
    'semaglutide', 'tirzepatide', 'b12', 'metabolism boost injection', 'biotin', 'taurine'
  ];

  return standaloneInjections.some(service => lowerDesc.includes(service)) ||
    (lowerDesc.includes('b12') && lowerDesc.includes('injection') && !lowerDesc.includes('vitamin'));
}

function isMembershipService(chargeDesc) {
  const lowerDesc = chargeDesc.toLowerCase();

  // Don't match services that just have "(member)" as a pricing suffix
  // These are IV services at member pricing, not membership fees
  if (lowerDesc.match(/\(member\)$/)) {
    return false;
  }

  // Expanded membership detection patterns
  return lowerDesc.includes('membership') ||
    lowerDesc.includes('concierge') ||
    (lowerDesc.includes('member') && !lowerDesc.includes('(member)')) || // Exclude pricing suffix
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
    return 'consultation';
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

  // Check for infusion services FIRST (before membership)
  // This prevents "(Member)" pricing suffixes from triggering membership category
  if (isBaseInfusionService(chargeDesc)) return 'base_infusion';
  if (isInfusionAddon(chargeDesc)) return 'infusion_addon';
  if (isStandaloneInjection(chargeDesc)) return 'injection';
  if (isConsultationService(chargeDesc)) return 'consultation';
  if (isMembershipService(chargeDesc)) return 'membership';
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

// Date parsing function - Enhanced to handle various formats
function parseDate(rawDate) {
  if (rawDate === null || rawDate === undefined || rawDate === '' || rawDate === 'Total') {
    return null;
  }

  // Handle native Excel serial numbers (e.g., 45925 → 2025-09-25)
  if (typeof rawDate === 'number') {
    const excelDate = excelSerialToDate(rawDate);
    if (!Number.isNaN(excelDate?.getTime()) && excelDate.getFullYear() >= 2020) {
      return excelDate;
    }
  }

  // Handle numeric strings that represent Excel serial numbers
  if (typeof rawDate === 'string' && /^\d+(?:\.\d+)?$/.test(rawDate.trim())) {
    const serial = parseFloat(rawDate.trim());
    const excelDate = excelSerialToDate(serial);
    if (!Number.isNaN(excelDate?.getTime()) && excelDate.getFullYear() >= 2020) {
      return excelDate;
    }
  }

  let dateStr = String(rawDate).trim();

  // Handle format like "8/22/25" or "8/22/2025"
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const month = parseInt(parts[ 0 ], 10);
    const day = parseInt(parts[ 1 ], 10);
    let year = parseInt(parts[ 2 ], 10);

    // Handle 2-digit year (25 = 2025, not 1925)
    if (year < 100) {
      year = 2000 + year;
    }

    const date = new Date(year, month - 1, day);

    // Validate the date
    if (!isNaN(date.getTime()) && date.getFullYear() >= 2020) {
      return date;
    }
  }

  // Try parsing as ISO date or other formats
  const fallbackDate = new Date(dateStr);
  if (!isNaN(fallbackDate.getTime()) && fallbackDate.getFullYear() >= 2020) {
    return fallbackDate;
  }

  console.warn(`Unable to parse date: "${dateStr}"`);
  return null;
}

const DATE_FIELD_CANDIDATES = [
  'Date',
  'Date Of Payment',
  'Date of Payment',
  'Payment Date',
  'Service Date',
  'Date of payment'
];

function resolveRowDate(row) {
  if (!row || typeof row !== 'object') {
    return { date: null, rawValue: null, sourceField: null };
  }

  if (row.__resolved_date instanceof Date && !isNaN(row.__resolved_date.getTime())) {
    return {
      date: row.__resolved_date,
      rawValue: row.__resolved_date_raw || null,
      sourceField: row.__resolved_date_source || null
    };
  }

  let lastCandidate = null;

  for (const field of DATE_FIELD_CANDIDATES) {
    const value = row[ field ];
    if (!value || value === 'Total') {
      continue;
    }

    lastCandidate = { field, value };
    const parsed = parseDate(value);

    if (parsed) {
      row.__resolved_date = parsed;
      row.__resolved_date_raw = value;
      row.__resolved_date_source = field;

      if ((!row.Date || row.Date === '') && field !== 'Date') {
        row.Date = value;
      }

      return { date: parsed, rawValue: value, sourceField: field };
    }
  }

  if (lastCandidate) {
    return { date: null, rawValue: lastCandidate.value, sourceField: lastCandidate.field };
  }

  return { date: null, rawValue: null, sourceField: null };
}

// Check if date is weekend
function isWeekend(date) {
  const dayOfWeek = date.getDay();
  return dayOfWeek === 0 || dayOfWeek === 6; // Sunday = 0, Saturday = 6
}

// Week window calculation helper
function getWeekWindow(now = new Date(), weekStartsOn = 1 /* Mon */) {
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const todayDow = (d.getUTCDay() + 7 - weekStartsOn) % 7;
  const startThis = new Date(d); startThis.setUTCDate(d.getUTCDate() - todayDow);
  const startPrev = new Date(startThis); startPrev.setUTCDate(startThis.getUTCDate() - 7);
  const endPrev = new Date(startThis); endPrev.setUTCDate(startThis.getUTCDate() - 1);
  endPrev.setUTCHours(23,59,59,999);
  return { startPrev, endPrev };
}

// Add an datetime serializer converting to date figure
function excelSerialToDate(serial) {
  const utc_days = serial - 25569;
  const utc_value = utc_days * 86400;
  return new Date(utc_value * 1000);
}

// Compute new memberships from Active Memberships upload
async function computeNewMembershipsFromUpload(rows, db, now = new Date()) {
  const { startPrev, endPrev } = getWeekWindow(now, 1);
  const startPrevDate = new Date(startPrev);
  const endPrevDate = new Date(endPrev);

  const counters = {
    new_individual_members_weekly: 0,
    new_family_members_weekly: 0,
    new_concierge_members_weekly: 0,
    new_corporate_members_weekly: 0,
  };

  console.log(`🔍 Processing ${rows.length} membership rows for new signups`);
  console.log(`   Week window: ${startPrevDate.toISOString().split('T')[0]} to ${endPrevDate.toISOString().split('T')[0]}`);

  // Insert or update membership_registry
  const client = await pool.connect();

  for (const r of rows) {
    const patient = String(r.Patient || '').trim();
    const titleRaw = String(r.Title || '').trim();
    const startDate = parseDate(r['Start Date']);

    // Debug: Show raw values
    console.log('Row:', { patient, titleRaw, rawStartDate: r['Start Date'], startDate });

    // Skip invalid entries
    if (!patient || !titleRaw || !startDate || Number.isNaN(startDate.getTime())) {
      console.log('Skipping: missing required fields or invalid date');
      continue;
    }

    // CRITICAL FIX: Only count memberships with Start Date within the reporting week
    // This prevents future memberships (e.g., Oct 5-26) from being counted as "new this week"
    if (startDate < startPrevDate || startDate > endPrevDate) {
      const reason = startDate < startPrevDate ? 'too old' : 'in the future';
      console.log(`Skipping (${reason}): Start Date ${startDate.toISOString().split('T')[0]} outside week window ${startPrevDate.toISOString().split('T')[0]} to ${endPrevDate.toISOString().split('T')[0]}`);
      continue;
    }

    // Normalize membership type from Title
    const t = titleRaw.toLowerCase();
    let membershipType = null;
    if (t.includes('individual')) membershipType = 'individual';
    else if (t.includes('family')) membershipType = 'family';
    else if (t.includes('concierge')) membershipType = 'concierge';
    else if (t.includes('corporate')) membershipType = 'corporate';
    
    if (!membershipType) {
      console.log(`Skipping: Unrecognized membership type for patient "${patient}" with title "${titleRaw}"`);
      continue; // Skip if not a recognized membership type
    }

    // Build unique member key
    const memberKey = `${patient.toLowerCase()}|${membershipType}`;

    // Check if this membership already exists in registry
    const exists = await client.query(
      'SELECT 1 FROM membership_registry WHERE member_key = $1',
      [memberKey]
    );
    
    if (exists.rows.length > 0) {
      console.log(`Skipping: Already counted membership for "${patient}" (${memberKey})`);
      continue; // Already counted this membership
    }

    // Insert into registry and increment counter
    // Calculate first_seen_week as the week boundary of startDate
    const { startPrev: startDateWeekBoundary } = getWeekWindow(startDate, 1);
    const firstSeenWeek = new Date(startDateWeekBoundary);
    await client.query(
      `INSERT INTO membership_registry (member_key, patient, membership_type, title_raw, start_date, first_seen_week)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [memberKey, patient, membershipType, titleRaw, startDate, firstSeenWeek]
    );

    // Increment appropriate counter
    switch (membershipType) {
      case 'individual':
        counters.new_individual_members_weekly++;
        console.log(`   ✓ Counted: ${patient} - ${membershipType} (starts ${startDate.toISOString().split('T')[0]})`);
        break;
      case 'family':
        counters.new_family_members_weekly++;
        console.log(`   ✓ Counted: ${patient} - ${membershipType} (starts ${startDate.toISOString().split('T')[0]})`);
        break;
      case 'concierge':
        counters.new_concierge_members_weekly++;
        console.log(`   ✓ Counted: ${patient} - ${membershipType} (starts ${startDate.toISOString().split('T')[0]})`);
        break;
      case 'corporate':
        counters.new_corporate_members_weekly++;
        console.log(`   ✓ Counted: ${patient} - ${membershipType} (starts ${startDate.toISOString().split('T')[0]})`);
        break;
    }
  }

  const totalNew = counters.new_individual_members_weekly + counters.new_family_members_weekly +
                   counters.new_concierge_members_weekly + counters.new_corporate_members_weekly;

  console.log('\n📊 NEW MEMBERSHIP SUMMARY:');
  console.log(`   Week window: ${startPrevDate.toISOString().split('T')[0]} to ${endPrevDate.toISOString().split('T')[0]}`);
  console.log(`   Individual: ${counters.new_individual_members_weekly}`);
  console.log(`   Family: ${counters.new_family_members_weekly}`);
  console.log(`   Concierge: ${counters.new_concierge_members_weekly}`);
  console.log(`   Corporate: ${counters.new_corporate_members_weekly}`);
  console.log(`   TOTAL NEW: ${totalNew}`);

  return counters;
}

// Process revenue data from CSV or MHTML
async function processRevenueData(csvFilePath, client) {
  console.log('Processing revenue data from:', csvFilePath);

  // Validate input
  if (!csvFilePath) {
    throw new Error('Revenue file path is required');
  }

  // Check if file exists
  if (!fs.existsSync(csvFilePath)) {
    throw new Error(`Revenue file not found: ${csvFilePath}`);
  }

  try {
      // Read file content for detection
      const fileContent = fs.readFileSync(csvFilePath, 'utf8');
      const fileExt = path.extname(csvFilePath).toLowerCase();

      // Enhanced logging for debugging
      console.log('📁 File detection:');
      console.log('   Extension:', fileExt);
      console.log('   Size:', fileContent.length, 'bytes');
      console.log('   First 500 chars:', fileContent.substring(0, 500).replace(/[\r\n]+/g, ' '));

      // Check for MHTML markers - more flexible detection
      // MHTML files can have .xls extension but contain HTML/MIME content
      const hasMimeMarkers = fileContent.includes('MIME-Version:') ||
        fileContent.includes('Content-Type:') ||
        fileContent.includes('Content-Location:');
      const hasHtmlMarkers = fileContent.includes('<!DOCTYPE') ||
        fileContent.includes('<html') ||
        fileContent.includes('<table');
      const hasTableContent = fileContent.includes('</tr>') ||
        fileContent.includes('</td>');

      const isMHTML = (hasMimeMarkers || hasHtmlMarkers) && hasTableContent;

      console.log('   MHTML detection:');
      console.log('     Has MIME markers:', hasMimeMarkers);
      console.log('     Has HTML markers:', hasHtmlMarkers);
      console.log('     Has table content:', hasTableContent);
      console.log('     Is MHTML:', isMHTML);

      if (isMHTML) {

        console.log('✅ Detected MHTML format (HTML saved as .xls)');

        // Parse MHTML file - handle both multipart and direct HTML
        let tableHtml = '';

        // First try multipart MIME format
        if (fileContent.includes('--')) {
          const parts = fileContent.split(/--[\w-]+/);
          console.log(`   Found ${parts.length} MIME parts`);

          // Look for the part containing the actual HTML table
          for (const part of parts) {
            if (part.includes('<table') || part.includes('<tr')) {
              tableHtml = part;
              console.log('   ✅ Found table in MIME part');
              break;
            }
          }
        }

        // If no multipart found or no table in parts, try direct HTML
        if (!tableHtml) {
          if (fileContent.includes('<table') || fileContent.includes('<tr')) {
            tableHtml = fileContent;
            console.log('   Using entire file content as HTML table');
          }
        }

        if (!tableHtml) {
          console.error('   ❌ No table data found in file');
          throw new Error('No table data found in MHTML/HTML file');
        }

        // Clean up quoted-printable encoding
        tableHtml = tableHtml.replace(/=3D/g, '=');
        tableHtml = tableHtml.replace(/=\r?\n/g, '');

        // Extract table rows using regex - more robust pattern
        let rowMatches = tableHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi);

        if (!rowMatches || rowMatches.length === 0) {
          // Try alternative row extraction for malformed HTML
          console.log('   First extraction failed, trying alternative method...');
          const trSplits = tableHtml.split(/<tr/i);
          rowMatches = [];
          for (let i = 1; i < trSplits.length; i++) {
            const endIndex = trSplits[ i ].indexOf('</tr>');
            if (endIndex > -1) {
              rowMatches.push('<tr' + trSplits[ i ].substring(0, endIndex + 5));
            }
          }
        }

        if (!rowMatches || rowMatches.length === 0) {
          console.error('   ❌ No rows found in table');
          throw new Error('No rows found in MHTML table');
        }

        console.log(`   ✅ Found ${rowMatches.length} rows in MHTML table`);

        // Parse headers - simplified approach for this specific MHTML format
        // The table has a complex colspan structure that differs between header and data rows
        // We'll use a fixed mapping based on the known structure
        const headers = [
          'Practitioner',
          'Date',
          'Date Of Payment',
          'Patient',
          'Patient_ID',  // This is part of the Patient colspan
          'Patient State',
          'Super Bill',
          'Charge Type',
          'Charge Desc',  // This spans 2 columns in data rows
          'Charges',
          'Total Discount',
          'Tax',
          'Charges - Discount',
          'Calculated Payment (Line)',
          'COGS',
          'Qty'
        ];

        console.log('MHTML Headers (fixed mapping):', headers.slice(0, 10), '...');
        console.log(`Total expected columns: ${headers.length}`);

        // Parse data rows with rowspan tracking
        const records = [];
        const rowspanTracker = {}; // Track active rowspans by column index
        let previousRow = {}; // Track previous row for date inheritance

        console.log('   Starting MHTML row parsing with rowspan handling...');

        for (let i = 1; i < rowMatches.length; i++) {
          // Extract all cells including their attributes for rowspan detection
          const cellMatches = rowMatches[ i ].match(/<td[^>]*>([\s\S]*?)<\/td>/gi);

          if (cellMatches && cellMatches.length > 0) {
            const row = {};

            // Process cells with rowspan tracking
            const processedCells = [];
            let cellIndex = 0;

            // Process each column position, accounting for rowspans
            for (let colIndex = 0; colIndex < 16; colIndex++) {
              // Check if this column has an active rowspan from a previous row
              if (rowspanTracker[ colIndex ] && rowspanTracker[ colIndex ].count > 0) {
                // Use inherited value from rowspan
                processedCells[ colIndex ] = rowspanTracker[ colIndex ].value;
                rowspanTracker[ colIndex ].count--;

                // Clean up expired rowspans
                if (rowspanTracker[ colIndex ].count === 0) {
                  delete rowspanTracker[ colIndex ];
                }
              } else if (cellIndex < cellMatches.length) {
                // Process actual cell from current row
                const cell = cellMatches[ cellIndex ];

                // Check for rowspan attribute
                const rowspanMatch = cell.match(/rowspan\s*=\s*["']?(\d+)/i);
                const rowspan = rowspanMatch ? parseInt(rowspanMatch[ 1 ]) : 1;

                // Extract cell value
                let value = cell.replace(/<td[^>]*>/gi, '').replace(/<\/td>/gi, '');
                // Remove any remaining HTML tags
                value = value.replace(/<[^>]*>/g, '').trim();
                // Clean HTML entities and MIME encoding
                value = value.replace(/&amp;/g, '&')
                  .replace(/&lt;/g, '<')
                  .replace(/&gt;/g, '>')
                  .replace(/&quot;/g, '"')
                  .replace(/&nbsp;/g, ' ')
                  .replace(/&#32;/g, ' ')
                  .replace(/&#36;/g, '$')
                  .replace(/=3D/g, '=')
                  .replace(/=\r?\n/g, '') // Remove MIME line breaks
                  .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));

                processedCells[ colIndex ] = value;

                // Track rowspan for future rows if needed
                if (rowspan > 1) {
                  rowspanTracker[ colIndex ] = {
                    value: value,
                    count: rowspan - 1
                  };
                }

                cellIndex++;
              } else {
                // No more cells in this row, use empty value
                processedCells[ colIndex ] = '';
              }
            }

            // DEBUG: Log row parsing for first few rows
            if (i < 4) {  // First 3 data rows (i starts at 1)
              console.log(`   Row ${i}: ${cellMatches.length} actual cells, 16 processed`);
              if (i === 1) {
                console.log('     First 5 values:', processedCells.slice(0, 5));
                console.log('     Payment cell [13]:', processedCells[ 13 ]);
              }
            }

            // Map processed cells to expected columns
            // Now all rows have exactly 16 processed cells due to rowspan handling
            row[ 'Practitioner' ] = processedCells[ 0 ] || previousRow[ 'Practitioner' ] || '';
            row[ 'Date' ] = processedCells[ 1 ] || previousRow[ 'Date' ] || '';
            row[ 'Date Of Payment' ] = processedCells[ 2 ] || previousRow[ 'Date Of Payment' ] || '';
            row[ 'Patient' ] = processedCells[ 3 ] || '';
            row[ 'Patient_ID' ] = processedCells[ 4 ] || '';
            row[ 'Patient State' ] = processedCells[ 5 ] || '';
            row[ 'Super Bill' ] = processedCells[ 6 ] || '';
            row[ 'Charge Type' ] = processedCells[ 7 ] || '';
            row[ 'Charge Desc' ] = processedCells[ 8 ] || '';
            row[ 'Charges' ] = processedCells[ 9 ] || '';
            row[ 'Total Discount' ] = processedCells[ 10 ] || '';
            row[ 'Tax' ] = processedCells[ 11 ] || '';
            row[ 'Charges - Discount' ] = processedCells[ 12 ] || '';
            row[ 'Calculated Payment (Line)' ] = processedCells[ 13 ] || '';
            row[ 'COGS' ] = processedCells[ 14 ] || '';
            row[ 'Qty' ] = processedCells[ 15 ] || '';

            // Store current row data for next iteration (for rowspan inheritance)
            if (row[ 'Date' ] && row[ 'Date' ].trim()) {
              previousRow = {
                'Date': row[ 'Date' ],
                'Practitioner': row[ 'Practitioner' ] || '',
                'Date Of Payment': row[ 'Date Of Payment' ] || ''
              };
            }

            // Only add rows that have payment data
            if (row[ 'Calculated Payment (Line)' ] && row[ 'Calculated Payment (Line)' ].trim()) {
              records.push(row);
            }
          }
        }

        console.log(`Successfully parsed ${records.length} rows from MHTML`);

        // DEBUG: Log date extraction details
        if (records.length > 0) {
          console.log('DEBUG: First 3 parsed records:');
          records.slice(0, 3).forEach((record, idx) => {
            console.log(`  Record ${idx}:`, {
              Date: record[ 'Date' ] || 'NO DATE',
              Payment: record[ 'Calculated Payment (Line)' ] || 'NO PAYMENT',
              ChargeDesc: record[ 'Charge Desc' ] || 'NO DESC',
              Patient: record[ 'Patient' ] || 'NO PATIENT'
            });
          });

          // Log all dates found
          const allDates = records.map(r => r[ 'Date' ]).filter(d => d && d.trim());
          console.log(`DEBUG: Found ${allDates.length} dates out of ${records.length} records`);
          if (allDates.length > 0) {
            console.log('  Sample dates:', allDates.slice(0, 5));
          }
        } else {
          console.log('⚠️ WARNING: No records were parsed from MHTML!');
          console.log('   File may have unexpected format or structure');
        }

        // DIAGNOSTIC LOGGING: Show what was actually parsed
        console.log(`\n📊 PARSING DIAGNOSTICS:`);
        console.log(`   Total records parsed: ${records.length}`);
        if (records.length > 0) {
          console.log(`   First record keys:`, Object.keys(records[0]));
          console.log(`   First record sample:`, JSON.stringify(records[0]).substring(0, 200));

          // Check for revenue fields
          const hasCalculatedPayment = records[0].hasOwnProperty('Calculated Payment (Line)');
          const hasTotal = records[0].hasOwnProperty('Total');
          const hasPaid = records[0].hasOwnProperty('Paid');
          console.log(`   Revenue field detection:`);
          console.log(`     'Calculated Payment (Line)': ${hasCalculatedPayment}`);
          console.log(`     'Total': ${hasTotal}`);
          console.log(`     'Paid': ${hasPaid}`);

          // Count records with revenue
          let revenueCount = 0;
          let totalRevenue = 0;
          records.forEach(record => {
            const amount = parseFloat(
              record['Calculated Payment (Line)'] ||
              record['Total'] ||
              record['Paid'] ||
              0
            );
            if (amount > 0) {
              revenueCount++;
              totalRevenue += amount;
            }
          });
          console.log(`   Records with revenue > 0: ${revenueCount} / ${records.length}`);
          console.log(`   Total revenue in file: $${totalRevenue.toFixed(2)}`);
        }

        // Analyze the parsed data
        const analyzedData = await analyzeRevenueData(records, client);
        analyzedData.rawRows = records;
        return analyzedData;
      }

      // If not MHTML, process as regular CSV
      console.log('📄 Not detected as MHTML, processing as CSV...');

      const buffer = fs.readFileSync(csvFilePath);
      const firstBytes = buffer.slice(0, 4);

      let csvContent;

      // Check for UTF-16 LE BOM (FF FE)
      if (firstBytes[ 0 ] === 0xFF && firstBytes[ 1 ] === 0xFE) {
        console.log('   Detected UTF-16 LE encoding with BOM');
        // Use iconv-lite to decode UTF-16 LE to UTF-8
        // BOM is automatically stripped by iconv-lite
        csvContent = iconv.decode(buffer, 'utf-16le');
      } else {
        // Standard UTF-8 processing
        console.log('   Processing as UTF-8 encoding');
        csvContent = buffer.toString('utf8');
      }

      // Split content into lines
      const lines = csvContent.split(/\r?\n/);

      if (lines.length === 0) {
        const analyzedData = await analyzeRevenueData([], client);
        analyzedData.rawRows = [];
        return analyzedData;
      }

      // Check if this is the special Drip IV format
      const firstLine = lines[ 0 ];
      const isDripIVFormat = firstLine.startsWith('"') && firstLine.includes(',""');

      let headers = [];
      const records = [];

      if (isDripIVFormat) {
        // Special Drip IV CSV format: "field1,""field2"",""field3"",..."
        console.log('Detected special Drip IV CSV format');

        // Parse headers from special format
        // Format is: "field1,""field2"",""field3"",,""field5"",..."
        const headerLine = firstLine;

        // First check if entire line is wrapped in quotes
        let content = headerLine;
        if (content.startsWith('"') && content.endsWith('"')) {
          content = content.slice(1, -1); // Remove outer quotes
        }

        // Split by ,"" pattern but preserve structure
        const parts = [];
        let currentPart = '';
        let i = 0;

        while (i < content.length) {
          if (i < content.length - 2 && content.substring(i, i + 3) === ',""') {
            // Found delimiter
            parts.push(currentPart);
            currentPart = '';
            i += 3; // Skip ,""
          } else if (i < content.length - 1 && content.substring(i, i + 2) === ',,') {
            // Found empty field
            parts.push(currentPart);
            parts.push(''); // Empty field
            currentPart = '';
            i += 2; // Skip ,,
          } else {
            currentPart += content[ i ];
            i++;
          }
        }
        // Add the last part
        if (currentPart || parts.length === 0) {
          parts.push(currentPart);
        }

        // Clean up each header
        parts.forEach((part) => {
          let header = part;
          // Remove any quotes
          header = header.replace(/^\"*/, '').replace(/\"*$/, '');
          headers.push(header.trim());
        });

        console.log(`   Parsed ${headers.length} headers:`, headers.slice(0, 5), '...');
        if (headers.length < 10) {
          console.log('   ⚠️ WARNING: Fewer headers than expected. All headers:', headers);
        }

        // Parse data rows
        for (let i = 1; i < lines.length; i++) {
          const line = lines[ i ];
          if (!line.trim()) continue;

          // Parse data using same logic as headers
          let dataContent = line;
          if (dataContent.startsWith('"') && dataContent.endsWith('"')) {
            dataContent = dataContent.slice(1, -1); // Remove outer quotes
          }

          // Split by ,"" pattern but preserve structure
          const dataParts = [];
          let currentPart = '';
          let j = 0;

          while (j < dataContent.length) {
            if (j < dataContent.length - 2 && dataContent.substring(j, j + 3) === ',""') {
              // Found delimiter
              dataParts.push(currentPart);
              currentPart = '';
              j += 3; // Skip ,""
            } else if (j < dataContent.length - 1 && dataContent.substring(j, j + 2) === ',,') {
              // Found empty field
              dataParts.push(currentPart);
              dataParts.push(''); // Empty field
              currentPart = '';
              j += 2; // Skip ,,
            } else {
              currentPart += dataContent[ j ];
              j++;
            }
          }
          // Add the last part
          if (currentPart || dataParts.length === 0) {
            dataParts.push(currentPart);
          }

          // Clean up each value
          const values = [];
          dataParts.forEach((part) => {
            let value = part;
            // Remove any quotes
            value = value.replace(/^\"*/, '').replace(/\"*$/, '');
            values.push(value.trim());
          });

          // Create row object
          if (values.length === headers.length) {
            const row = {};
            headers.forEach((header, index) => {
              row[ header ] = values[ index ] || '';
            });
            records.push(row);
          }
        }
      } else {
        // Standard CSV/TSV format with proper quote handling
        // Detect delimiter type (comma vs tab)
        const firstLine = lines[ 0 ] || '';
        const tabCount = (firstLine.match(/\t/g) || []).length;
        const commaCount = (firstLine.match(/,/g) || []).length;
        const delimiter = tabCount > commaCount ? '\t' : ',';

        console.log(`📊 Processing ${delimiter === '\t' ? 'TSV (Tab-Separated)' : 'CSV (Comma-Separated)'} format`);
        console.log(`   Detected: ${tabCount} tabs, ${commaCount} commas`);
        console.log(`   Using delimiter: ${delimiter === '\t' ? 'TAB' : 'COMMA'}`);

        const parseCSVLine = (line, delimiterChar) => {
          const result = [];
          let current = '';
          let inQuotes = false;

          for (let i = 0; i < line.length; i++) {
            const char = line[ i ];
            const nextChar = line[ i + 1 ];

            if (char === '"') {
              if (inQuotes && nextChar === '"') {
                // Escaped quote
                current += '"';
                i++; // Skip next quote
              } else {
                // Toggle quote state
                inQuotes = !inQuotes;
              }
            } else if (char === delimiterChar && !inQuotes) {
              // Field separator
              result.push(current.trim());
              current = '';
            } else {
              current += char;
            }
          }

          // Add last field
          result.push(current.trim());
          return result;
        };

        // Parse headers
        headers = parseCSVLine(lines[ 0 ], delimiter).map(h => {
          // Remove surrounding quotes if present
          if (h.startsWith('"') && h.endsWith('"')) {
            return h.slice(1, -1);
          }
          return h;
        });

        // Fix for empty header columns - if we find an empty header between valid headers,
        // give it a name based on context
        headers = headers.map((header, index) => {
          if (!header && index > 0 && index < headers.length - 1) {
            // Empty header found - likely patient ID column based on data analysis
            if (index > 0 && headers[ index - 1 ] === 'Patient') {
              return 'Patient_ID';
            }
            if (index > 0 && headers[ index - 1 ] === 'Charge Desc') {
              return 'Metrics';  // This is usually an empty column
            }
            return `Column_${index}`;
          }
          return header;
        });

        console.log(`   Parsed ${headers.length} headers:`, headers.slice(0, 5), '...');
        if (headers.length < 10) {
          console.log('   ⚠️ WARNING: Fewer headers than expected. All headers:', headers);
        }

        // Parse data rows
        for (let i = 1; i < lines.length; i++) {
          const line = lines[ i ];
          if (!line.trim()) continue;

          const values = parseCSVLine(line, delimiter);

          // Debug first few rows
          if (i <= 3) {
            console.log(`   Row ${i}: ${values.length} values found`);
            if (values.length !== headers.length) {
              console.log(`     ⚠️ Column mismatch: expected ${headers.length}, got ${values.length}`);
            }
          }

          // Add row even if column count is slightly off (common with TSV/CSV issues)
          // Map available values to headers
          if (values.length >= headers.length - 2 && values.length <= headers.length + 2) {
            const row = {};

            // Handle column mismatch - data may have extra columns due to empty headers
            // If we have 18 values and 17 headers, and column 5 is empty header but has data,
            // we need to shift the mapping
            let valueOffset = 0;
            if (values.length > headers.length && headers[ 4 ] === 'Patient_ID' && values[ 5 ] === '') {
              // This is the specific case where data has an extra empty column after Patient_ID
              valueOffset = 1;
            }

            headers.forEach((header, index) => {
              let valueIndex = index;
              // After the Patient_ID column, shift by one if we detected the offset
              if (valueOffset && index > 5) {
                valueIndex = index + valueOffset;
              }

              let value = values[ valueIndex ] || '';
              // Remove surrounding quotes if present
              if (value.startsWith('"') && value.endsWith('"')) {
                value = value.slice(1, -1);
              }
              row[ header ] = value;
            });
            records.push(row);
          }
        }
      }

      console.log(`Successfully parsed ${records.length} rows from CSV`);

      // DIAGNOSTIC LOGGING: Show what was actually parsed from CSV
      console.log(`\n📊 CSV PARSING DIAGNOSTICS:`);
      console.log(`   Total records parsed: ${records.length}`);
      if (records.length > 0) {
        console.log(`   First record keys:`, Object.keys(records[0]));
        console.log(`   First record sample:`, JSON.stringify(records[0]).substring(0, 200));

        // Check for revenue fields
        const hasCalculatedPayment = records[0].hasOwnProperty('Calculated Payment (Line)');
        const hasTotal = records[0].hasOwnProperty('Total');
        const hasPaid = records[0].hasOwnProperty('Paid');
        console.log(`   Revenue field detection:`);
        console.log(`     'Calculated Payment (Line)': ${hasCalculatedPayment}`);
        console.log(`     'Total': ${hasTotal}`);
        console.log(`     'Paid': ${hasPaid}`);

        // Count records with revenue
        let revenueCount = 0;
        let totalRevenue = 0;
        records.forEach(record => {
          const amount = parseFloat(
            record['Calculated Payment (Line)'] ||
            record['Total'] ||
            record['Paid'] ||
            0
          );
          if (amount > 0) {
            revenueCount++;
            totalRevenue += amount;
          }
        });
        console.log(`   Records with revenue > 0: ${revenueCount} / ${records.length}`);
        console.log(`   Total revenue in file: $${totalRevenue.toFixed(2)}`);
      }

      // Analyze the parsed data
      const analyzedData = await analyzeRevenueData(records, client);
      analyzedData.rawRows = records;
      return analyzedData;
  } catch (error) {
    console.error('❌ Error parsing CSV file:', error);
    console.error('   Error details:', error.message);
    throw new Error(`Failed to parse CSV file: ${error.message}`);
  }
}

// Analyze revenue data and calculate metrics
async function analyzeRevenueData(csvData, client) {
  console.log('Analyzing revenue data...');
  console.log(`Processing ${csvData.length} rows of data`);

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

    // Hormone services tracking
    hormone_followup_female_weekly: 0,
    hormone_followup_female_monthly: 0,
    hormone_initial_male_weekly: 0,
    hormone_initial_male_monthly: 0,
    hormone_followup_male_weekly: 0,
    hormone_followup_male_monthly: 0,

    // Weight management consultations
    semaglutide_consults_weekly: 0,
    semaglutide_consults_monthly: 0,
    weight_loss_injections_weekly: 0,
    weight_loss_injections_monthly: 0,

    // Semaglutide/Tirzepatide injection counts
    semaglutide_injections_weekly: 0,
    semaglutide_injections_monthly: 0,

    // New membership tracking
    new_individual_members_weekly: 0,
    new_family_members_weekly: 0,
    new_concierge_members_weekly: 0,

    // Service-to-Bin mapping accumulators (from service_mapping table)
    unmapped_services: [],
    bin_revenue_perf: new Map(), // Track revenue by revenue_perf_bin
    bin_service_volume: new Map(), // Track counts by service_volume_bin
    bin_customer: new Map(), // Track customers by customer_bin
    new_corporate_members_weekly: 0,
    new_individual_members_monthly: 0,
    new_family_members_monthly: 0,
    new_concierge_members_monthly: 0,
    new_corporate_members_monthly: 0,

    // Date tracking for weekly/monthly determination
    weekStartDate: null,
    weekEndDate: null,
    monthStartDate: null,
    monthEndDate: null
  };

  const mappingCache = new Map();
  const unmappedTracker = new Set();
  const canQueryMapping = client && typeof client.query === 'function';

  // Log available columns from first row
  if (csvData.length > 0) {
    console.log('📊 Available columns in revenue data:');
    const firstRow = csvData[ 0 ];
    const columns = Object.keys(firstRow);
    console.log(`   Total columns: ${columns.length}`);

    // Show first 5 rows with key columns for debugging
    console.log('\n📋 Sample data (first 3 rows):');
    for (let i = 0; i < Math.min(3, csvData.length); i++) {
      const row = csvData[ i ];
      console.log(`   Row ${i + 1}:`);
      console.log(`     Date: ${row[ 'Date' ] || row[ 'Date Of Payment' ] || 'N/A'}`);
      console.log(`     Patient: ${row[ 'Patient' ]} (ID: ${row[ 'Patient_ID' ] || 'N/A'})`);
      console.log(`     Charge Desc: ${row[ 'Charge Desc' ]}`);
      console.log(`     Calculated Payment: ${row[ 'Calculated Payment (Line)' ]}`);
    }

    // Look for payment/amount columns
    const paymentColumns = columns.filter(col =>
      col.toLowerCase().includes('payment') ||
      col.toLowerCase().includes('amount') ||
      col.toLowerCase().includes('charge') ||
      col.toLowerCase().includes('paid') ||
      col.toLowerCase().includes('revenue') ||
      col.toLowerCase().includes('total')
    );
    console.log('\n💰 Payment-related columns found:', paymentColumns);

    // Verify the critical column exists
    if (!columns.includes('Calculated Payment (Line)')) {
      console.log('⚠️ WARNING: "Calculated Payment (Line)" column not found!');
      console.log('   Available columns:', columns);
    } else {
      console.log('✅ "Calculated Payment (Line)" column found at index:', columns.indexOf('Calculated Payment (Line)'));
    }
  }

  // Debug: Log data structure
  if (csvData.length > 0) {
    console.log('\n📊 ANALYZING REVENUE DATA:');
    console.log(`   Total rows: ${csvData.length}`);
    console.log('   Available columns:', Object.keys(csvData[ 0 ]).slice(0, 10));
    console.log('   Sample row:', {
      Date: csvData[ 0 ].Date,
      'Calculated Payment (Line)': csvData[ 0 ][ 'Calculated Payment (Line)' ],
      'Charge Desc': csvData[ 0 ][ 'Charge Desc' ]
    });
  }

  let rowsWithDates = 0;
  let rowsWithPayments = 0;
  let totalRevenueTracked = 0;

  // Process each row
  for (const row of csvData) {
    const { date, rawValue, sourceField } = resolveRowDate(row);

    if (!date) {
      const rawText = rawValue ? rawValue.toString().trim().toLowerCase() : '';

      if (rawText && rawText !== 'total') {
        console.warn(`Skipping row with invalid date${sourceField ? ` (${sourceField})` : ''}: ${rawValue}`);
      }

      continue;
    }

    rowsWithDates++;

    const chargeDesc = row[ 'Charge Desc' ] || '';
    const patient = row.Patient || '';

    const normalizedName = row.normalized_service_name || normalizeServiceName(chargeDesc || row[ 'Service Name' ]);
    const normalizedType = row.normalized_service_type || normalizeServiceType(row[ 'Charge Type' ] || row[ 'Service Type' ]);

    row.normalized_service_name = normalizedName;
    row.normalized_service_type = normalizedType;

    let mappingDetails = null;
    let cacheKey = null;

    if (normalizedName) {
      cacheKey = `${normalizedName}|${normalizedType || ''}`;

      if (mappingCache.has(cacheKey)) {
        mappingDetails = mappingCache.get(cacheKey);
      } else if (canQueryMapping) {
        const lookedUp = await processRowWithMapping(row, client);
        mappingDetails = lookedUp.mapping;
        Object.assign(row, lookedUp);
        mappingCache.set(cacheKey, mappingDetails || null);
      } else {
        mappingCache.set(cacheKey, null);
      }

      if (mappingDetails === null && mappingCache.has(cacheKey)) {
        mappingDetails = mappingCache.get(cacheKey);
      }
    }

    if (mappingDetails) {
      row.mapping = mappingDetails;
      row.revenue_perf_bin = mappingDetails.revenue_perf_bin || null;
      row.service_volume_bin = mappingDetails.service_volume_bin || null;
      row.customer_bin = mappingDetails.customer_bin || null;
    } else {
      row.mapping = row.mapping || null;
      row.revenue_perf_bin = row.revenue_perf_bin || null;
      row.service_volume_bin = row.service_volume_bin || null;
      row.customer_bin = row.customer_bin || null;
    }

    // Try multiple possible payment columns
    let chargeAmount = cleanCurrency(row[ 'Calculated Payment (Line)' ]) ||
      cleanCurrency(row[ 'Charge Amount' ]) ||
      cleanCurrency(row[ 'Payment Amount' ]) ||
      cleanCurrency(row[ 'Amount' ]) ||
      cleanCurrency(row[ 'Total' ]) ||
      cleanCurrency(row[ 'Paid' ]) ||
      0;

    if (chargeAmount > 0) {
      rowsWithPayments++;
      totalRevenueTracked += chargeAmount;
    }

    // Log if no payment found for debugging
    if (chargeAmount === 0 && csvData.indexOf(row) < 5) {
      console.log(`⚠️ No payment amount found in row ${csvData.indexOf(row)}:`, {
        'Calculated Payment (Line)': row[ 'Calculated Payment (Line)' ],
        'Charge Amount': row[ 'Charge Amount' ],
        'Payment Amount': row[ 'Payment Amount' ],
        'Amount': row[ 'Amount' ],
        'Total': row[ 'Total' ],
        'Paid': row[ 'Paid' ]
      });
    }

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

  // After processing all dates, determine the week based on the data
  console.log('\n🔍 DATA PROCESSING SUMMARY:');
  console.log(`   Rows with valid dates: ${rowsWithDates}/${csvData.length}`);
  console.log(`   Rows with payments: ${rowsWithPayments}`);
  console.log(`   Total revenue found: $${totalRevenueTracked.toFixed(2)}`);
  console.log(`   Date range found: ${metrics.monthStartDate || 'NO START'} to ${metrics.monthEndDate || 'NO END'}`);

  if (metrics.monthEndDate && metrics.monthStartDate) {
    const startDate = new Date(metrics.monthStartDate);
    const endDate = new Date(metrics.monthEndDate);

    console.log(`Date range in data: ${startDate.toDateString()} to ${endDate.toDateString()}`);

    // SMART WEEK DETECTION: 
    // If data spans 7 days or less, use those dates' week
    // If data spans multiple weeks, use the most recent complete week
    const daySpan = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
    console.log(`   Data spans ${daySpan} days`);

    let weekStart, weekEnd;

    if (daySpan <= 7) {
      // Data is for a single week or less - use the Monday of that week
      console.log(`   Using single week logic (data <= 7 days)`);

      // Check if data starts on Monday and spans to Sunday
      const startDay = startDate.getDay();
      const endDay = endDate.getDay();

      if (startDay === 1 && endDay === 0 && daySpan === 7) {
        // Perfect Monday-Sunday week
        weekStart = new Date(startDate);
        weekEnd = new Date(endDate);
        console.log(`   Perfect Monday-Sunday week detected`);
      } else if (startDay === 0 && daySpan <= 7) {
        // Starts on Sunday - use previous Monday
        weekStart = new Date(startDate);
        weekStart.setDate(startDate.getDate() - 6);
        weekEnd = new Date(startDate);
      } else {
        // Use Monday of the start date's week
        weekStart = new Date(startDate);
        const startDayOfWeek = startDate.getDay();

        if (startDayOfWeek === 0) {
          weekStart.setDate(startDate.getDate() - 6);
        } else if (startDayOfWeek > 1) {
          weekStart.setDate(startDate.getDate() - (startDayOfWeek - 1));
        }

        weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
      }
    } else {
      // Data spans multiple weeks - use the most recent complete week
      console.log(`   Using multi-week logic (data > 7 days)`);
      console.log(`   Calculating most recent Monday-Sunday week in the data`);

      // Find the last Sunday in the data or use end date
      weekEnd = new Date(endDate);
      const endDayOfWeek = endDate.getDay();

      if (endDayOfWeek !== 0) {
        // End date is not Sunday, find the previous Sunday
        weekEnd.setDate(endDate.getDate() - endDayOfWeek);
      }

      // Calculate Monday (start of that week)
      weekStart = new Date(weekEnd);
      weekStart.setDate(weekEnd.getDate() - 6);
    }

    metrics.weekStartDate = weekStart;
    metrics.weekEndDate = weekEnd;

    // VALIDATION: Ensure week is exactly 7 days (Monday to Sunday)
    const daysDiff = Math.round((weekEnd - weekStart) / (1000 * 60 * 60 * 24));
    if (daysDiff !== 6) {
      console.error(`⚠️ ERROR: Week calculation resulted in ${daysDiff + 1} days instead of 7!`);
      console.error(`   Week start: ${weekStart.toDateString()} (day ${weekStart.getDay()})`);
      console.error(`   Week end: ${weekEnd.toDateString()} (day ${weekEnd.getDay()})`);
      throw new Error(`Invalid week calculation: ${daysDiff + 1} days instead of 7`);
    }

    // Ensure Monday-Sunday format
    if (weekStart.getDay() !== 1 || weekEnd.getDay() !== 0) {
      console.error('⚠️ ERROR: Week is not Monday-Sunday format!');
      console.error(`   Week start day: ${weekStart.getDay()} (should be 1 for Monday)`);
      console.error(`   Week end day: ${weekEnd.getDay()} (should be 0 for Sunday)`);
      throw new Error('Week must be Monday-Sunday format');
    }

    console.log('📅 DATE EXTRACTION RESULTS:');
    console.log(`   Calculated week start: ${weekStart.toDateString()} (${weekStart.toISOString().split('T')[ 0 ]})`);
    console.log(`   Calculated week end: ${weekEnd.toDateString()} (${weekEnd.toISOString().split('T')[ 0 ]})`);
    console.log(`   ✅ Week validation passed: 7-day Monday-Sunday week`);
    console.log(`   📊 This data will be saved as week: ${weekStart.toISOString().split('T')[ 0 ]} to ${weekEnd.toISOString().split('T')[ 0 ]}`);
  } else {
    // NO DATES FOUND - This is a critical error
    console.error('❌ CRITICAL ERROR: No valid dates found in revenue data!');
    console.error('   Cannot determine week range without dates');
    console.error('   Check if the Date column exists and has valid dates');

    // Don't default to today - this causes wrong data saves
    metrics.weekStartDate = null;
    metrics.weekEndDate = null;
  }

  // CRITICAL FIX: Calculate proper month boundaries for filtering
  let monthStart = null;
  let monthEnd = null;

  if (metrics.monthEndDate) {
    // Use the month of the most recent date in the data
    monthStart = new Date(metrics.monthEndDate.getFullYear(), metrics.monthEndDate.getMonth(), 1);
    monthEnd = new Date(metrics.monthEndDate.getFullYear(), metrics.monthEndDate.getMonth() + 1, 0);
    monthEnd.setHours(23, 59, 59, 999);

    console.log(`Month range for revenue calculation: ${monthStart.toISOString().split('T')[ 0 ]} to ${monthEnd.toISOString().split('T')[ 0 ]}`);
  }

  // Debugging: Track exclusions and totals
  const debugInfo = {
    totalRows: csvData.length,
    processedRows: 0,
    excludedRows: 0,
    excludedReasons: {
      tips: { count: 0, amount: 0 },
      invalidDate: { count: 0, amount: 0 },
      noAmount: { count: 0, amount: 0 },
      emptyDesc: { count: 0, amount: 0 },
      outOfRange: { count: 0, amount: 0 }
    },
    fileTotal: 0,
    includedTotal: 0,
    categoryTotals: {
      iv_therapy: 0,
      weight_loss: 0,
      memberships: 0,
      other: 0
    }
  };

  // Second pass: Process service counts and revenue with proper week detection
  for (const row of csvData) {
    const { date, rawValue } = resolveRowDate(row);

    if (!date) {
      const rawText = rawValue ? rawValue.toString().trim().toLowerCase() : '';

      if (rawText && rawText !== 'total') {
        debugInfo.excludedRows++;
        debugInfo.excludedReasons.invalidDate.count++;
      }

      continue;
    }

    const chargeDesc = row[ 'Charge Desc' ] || '';
    const patient = row.Patient || '';

    const normalizedName = row.normalized_service_name || normalizeServiceName(chargeDesc || row[ 'Service Name' ]);
    const normalizedType = row.normalized_service_type || normalizeServiceType(row[ 'Charge Type' ] || row[ 'Service Type' ]);

    row.normalized_service_name = normalizedName;
    row.normalized_service_type = normalizedType;

    let mappingDetails = null;
    let cacheKey = null;

    if (normalizedName) {
      cacheKey = `${normalizedName}|${normalizedType || ''}`;

      if (mappingCache.has(cacheKey)) {
        mappingDetails = mappingCache.get(cacheKey);
      } else if (canQueryMapping) {
        const lookedUp = await processRowWithMapping(row, client);
        mappingDetails = lookedUp.mapping;
        Object.assign(row, lookedUp);
        mappingCache.set(cacheKey, mappingDetails || null);
      } else {
        mappingCache.set(cacheKey, null);
      }

      if (mappingDetails === null && mappingCache.has(cacheKey)) {
        mappingDetails = mappingCache.get(cacheKey);
      }
    }

    if (mappingDetails) {
      row.mapping = mappingDetails;
      row.revenue_perf_bin = mappingDetails.revenue_perf_bin || null;
      row.service_volume_bin = mappingDetails.service_volume_bin || null;
      row.customer_bin = mappingDetails.customer_bin || null;
    } else {
      row.mapping = row.mapping || null;
      row.revenue_perf_bin = row.revenue_perf_bin || null;
      row.service_volume_bin = row.service_volume_bin || null;
      row.customer_bin = row.customer_bin || null;
    }

    // Try multiple possible payment columns
    const chargeAmount = cleanCurrency(row[ 'Calculated Payment (Line)' ]) ||
      cleanCurrency(row[ 'Charge Amount' ]) ||
      cleanCurrency(row[ 'Payment Amount' ]) ||
      cleanCurrency(row[ 'Amount' ]) ||
      cleanCurrency(row[ 'Total' ]) ||
      cleanCurrency(row[ 'Paid' ]) ||
      0;

    // Track file total for all items in date range
    if (date >= metrics.weekStartDate && date <= metrics.weekEndDate) {
      debugInfo.fileTotal += chargeAmount;
      debugInfo.processedRows++;
    }

    const isWeekendDay = isWeekend(date);

    // Skip non-service charges and administrative entries
    const lowerChargeDesc = chargeDesc.toLowerCase();
    if (lowerChargeDesc.includes('total_tips') ||
      lowerChargeDesc.includes('tip')) {
      if (date >= metrics.weekStartDate && date <= metrics.weekEndDate) {
        debugInfo.excludedRows++;
        debugInfo.excludedReasons.tips.count++;
        debugInfo.excludedReasons.tips.amount += chargeAmount;
      }
      continue;
    }

    if (lowerChargeDesc === 'total' || chargeDesc === '') {
      if (date >= metrics.weekStartDate && date <= metrics.weekEndDate) {
        debugInfo.excludedRows++;
        debugInfo.excludedReasons.emptyDesc.count++;
        debugInfo.excludedReasons.emptyDesc.amount += chargeAmount;
      }
      continue;
    }

    if (!chargeAmount) {
      if (date >= metrics.weekStartDate && date <= metrics.weekEndDate) {
        debugInfo.excludedRows++;
        debugInfo.excludedReasons.noAmount.count++;
      }
      continue;
    }

    // Determine if this is a member service (based on charge description)
    const isMemberService = chargeDesc.toLowerCase().includes('(member)') ||
      chargeDesc.toLowerCase().includes('member');
    const isNonMemberService = chargeDesc.toLowerCase().includes('(non-member)') ||
      chargeDesc.toLowerCase().includes('non member');

    // CRITICAL FIX: Properly check if transaction is within week AND month ranges
    const isCurrentWeek = metrics.weekStartDate && metrics.weekEndDate &&
      date >= metrics.weekStartDate && date <= metrics.weekEndDate;
    const isCurrentMonth = monthStart && monthEnd &&
      date >= monthStart && date <= monthEnd;

    const currentMapping = mappingDetails || row.mapping || null;

    if (isCurrentWeek && chargeAmount > 0 && currentMapping) {
      if (currentMapping.revenue_perf_bin) {
        const prev = metrics.bin_revenue_perf.get(currentMapping.revenue_perf_bin) || 0;
        metrics.bin_revenue_perf.set(currentMapping.revenue_perf_bin, prev + chargeAmount);
      }

      if (currentMapping.service_volume_bin) {
        const prevCount = metrics.bin_service_volume.get(currentMapping.service_volume_bin) || 0;
        metrics.bin_service_volume.set(currentMapping.service_volume_bin, prevCount + 1);
      }

      if (currentMapping.customer_bin && patient) {
        const customerSet = metrics.bin_customer.get(currentMapping.customer_bin) || new Set();
        customerSet.add(patient);
        metrics.bin_customer.set(currentMapping.customer_bin, customerSet);
      }
    } else if (isCurrentWeek && canQueryMapping && normalizedName && !currentMapping) {
      const unmappedKey = `${normalizedName}|${normalizedType || ''}`;

      if (!unmappedTracker.has(unmappedKey)) {
        const weekStartIso = metrics.weekStartDate ? metrics.weekStartDate.toISOString().split('T')[ 0 ] : null;

        if (weekStartIso) {
          try {
            await trackUnmappedService(weekStartIso, row, normalizedName, normalizedType, client);
          } catch (err) {
            console.warn(`Warning: Could not track unmapped service ${normalizedName}: ${err.message}`);
          }
        }

        metrics.unmapped_services.push({
          normalized_service_name: normalizedName,
          normalized_service_type: normalizedType || null,
          charge_desc: chargeDesc,
          amount: chargeAmount,
          date: row[ 'Date' ] || row[ 'Date Of Payment' ] || null
        });

        unmappedTracker.add(unmappedKey);
      }
    }

    // Get service category
    const serviceCategory = getServiceCategory(chargeDesc);

    // Track unique customers
    if (patient) {
      // CRITICAL FIX: Only count monthly customers if within month range
      if (isCurrentMonth) {
        metrics.unique_customers_monthly.add(patient);
      }
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

      // CRITICAL FIX: Only count monthly services if within month range
      if (isCurrentMonth) {
        if (isWeekendDay) {
          metrics.iv_infusions_weekend_monthly++;
        } else {
          metrics.iv_infusions_weekday_monthly++;
        }
      }
    } else if (serviceCategory === 'injection') {
      // IMPORTANT FIX: Exclude Tirzepatide/Semaglutide from general injection counts
      // These should ONLY appear in Weight Management, not in Injections tile
      const isWeightLossInjection = chargeDesc.toLowerCase().includes('semaglutide') || chargeDesc.toLowerCase().includes('tirzepatide') || chargeDesc.toLowerCase().includes('contrave');

      if (isCurrentWeek) {
        if (!isWeightLossInjection) {
          // Only count non-weight-loss injections in general injection totals
          if (isWeekendDay) {
            metrics.injections_weekend_weekly++;
          } else {
            metrics.injections_weekday_weekly++;
          }
        }

        // Count weight loss injections separately for Weight Management tile
        if (isWeightLossInjection) {
          metrics.weight_loss_injections_weekly++;
          metrics.semaglutide_injections_weekly++;
        }
      }

      // CRITICAL FIX: Only count monthly services if within month range
      if (isCurrentMonth) {
        if (!isWeightLossInjection) {
          // Only count non-weight-loss injections in general injection totals
          if (isWeekendDay) {
            metrics.injections_weekend_monthly++;
          } else {
            metrics.injections_weekday_monthly++;
          }
        }

        // Count weight loss injections separately for Weight Management tile
        if (isWeightLossInjection) {
          metrics.weight_loss_injections_monthly++;
          metrics.semaglutide_injections_monthly++;
        }
      }
      // IMPORTANT: Check for weight loss services that might not be categorized as injections
    } else if (serviceCategory === 'weight_management') {
      // Count ALL semaglutide/tirzepatide services in Weight Management ONLY - don't add to injection totals
      if (isCurrentWeek) {
        metrics.semaglutide_injections_weekly++;
        metrics.weight_loss_injections_weekly++;
        // FIX: Add missing revenue tracking for weight management services
        metrics.semaglutide_revenue_weekly += chargeAmount;
        debugInfo.categoryTotals.weight_loss += chargeAmount;
      }
      if (isCurrentMonth) {
        metrics.semaglutide_injections_monthly++;
        metrics.weight_loss_injections_monthly++;
        // FIX: Add missing revenue tracking for weight management services
        metrics.semaglutide_revenue_monthly += chargeAmount;
      }
    } else if (serviceCategory === 'consultation') {
      // Track consultations
      const lowerDesc = chargeDesc.toLowerCase();

      if (isCurrentWeek) {
        if (lowerDesc.includes('semaglutide') || lowerDesc.includes('tirzepatide') ||
          lowerDesc.includes('weight loss') || lowerDesc.includes('contrave')) {
          metrics.semaglutide_consults_weekly++;
        }
      }

      if (isCurrentMonth) {
        if (lowerDesc.includes('semaglutide') || lowerDesc.includes('tirzepatide') ||
          lowerDesc.includes('weight loss') || lowerDesc.includes('contrave')) {
          metrics.semaglutide_consults_monthly++;
        }
      }
    }

    // IMPORTANT FIX: Add comprehensive hormone service detection
    // Check for ALL hormone-related services, not just consultations
    const isHormoneService = (chargeDesc) => {
      const lowerDesc = chargeDesc.toLowerCase();
      const hormoneKeywords = [
        'hormone', 'testosterone', 'estrogen', 'progesterone',
        'hrt', 'bhrt', 'pellet', 'thyroid', 'cortisol'
      ];
      return hormoneKeywords.some(keyword => lowerDesc.includes(keyword));
    };

    if (isHormoneService(chargeDesc)) {
      const lowerDesc = chargeDesc.toLowerCase();

      // WEEKLY
      if (isCurrentWeek) {
        if (lowerDesc.includes('male')) {
          if (lowerDesc.includes('initial')) {
            metrics.hormone_initial_male_weekly++;
          } else {
            metrics.hormone_followup_male_weekly++;
          }
        } else if (lowerDesc.includes('female')) {
          if (lowerDesc.includes('initial')) {
            metrics.hormone_initial_female_weekly++;
          } else {
            metrics.hormone_followup_female_weekly++;
          }
        }
      }

      // MONTHLY
      if (isCurrentMonth) {
        if (lowerDesc.includes('male')) {
          if (lowerDesc.includes('initial')) {
            metrics.hormone_initial_male_monthly++;
          } else {
            metrics.hormone_followup_male_monthly++;
          }
        } else if (lowerDesc.includes('female')) {
          if (lowerDesc.includes('initial')) {
            metrics.hormone_initial_female_monthly++;
          } else {
            metrics.hormone_followup_female_monthly++;
          }
        }
      }
    }

    // Track revenue
    if (chargeAmount > 0) {
      // DEBUG: Log successful revenue parsing
      if (csvData.indexOf(row) < 3) {
        console.log(`   Row ${csvData.indexOf(row) + 1} revenue: $${chargeAmount}, Date: ${row[ 'Date' ]}, In week: ${isCurrentWeek}`);
      }

      if (isCurrentWeek) {
        metrics.actual_weekly_revenue += chargeAmount;
        debugInfo.includedTotal += chargeAmount;

        if (serviceCategory === 'base_infusion' || serviceCategory === 'infusion_addon') {
          metrics.infusion_revenue_weekly += chargeAmount;
          // IV Therapy revenue is ONLY infusions, not injections
          metrics.drip_iv_revenue_weekly += chargeAmount;
          debugInfo.categoryTotals.iv_therapy += chargeAmount;
        } else if (serviceCategory === 'injection') {
          // IMPORTANT FIX: Don't count Tirzepatide/Semaglutide revenue in general injection revenue
          const isWeightLossInjection = chargeDesc.toLowerCase().includes('semaglutide') || chargeDesc.toLowerCase().includes('tirzepatide') || chargeDesc.toLowerCase().includes('contrave');

          if (!isWeightLossInjection) {
            // Only add to general injection revenue if it's NOT a weight loss injection
            metrics.injection_revenue_weekly += chargeAmount;
          }

          // Weight Loss (Semaglutide/Tirzepatide) revenue goes to Weight Management only
          if (isWeightLossInjection) {
            metrics.semaglutide_revenue_weekly += chargeAmount;
            debugInfo.categoryTotals.weight_loss += chargeAmount;
          }
        } else if (serviceCategory === 'membership') {
          metrics.membership_revenue_weekly += chargeAmount;
          debugInfo.categoryTotals.memberships += chargeAmount;

          // Track new membership signups - ONLY count those marked with a "NEW" flag
          const lowerDesc = chargeDesc.toLowerCase();
          const isNewMembership = /\bnew\b/.test(lowerDesc);
          
          if (isNewMembership) {
            if (lowerDesc.includes('individual')) {
              metrics.new_individual_members_weekly++;
            } else if (lowerDesc.includes('family')) {
              metrics.new_family_members_weekly++;
            } else if (lowerDesc.includes('concierge')) {
              metrics.new_concierge_members_weekly++;
            } else if (lowerDesc.includes('corporate')) {
              metrics.new_corporate_members_weekly++;
            }
          }
        } else if (serviceCategory === 'consultation') {
          // Track consultation revenue separately
          if (chargeDesc.toLowerCase().includes('semaglutide') || chargeDesc.toLowerCase().includes('tirzepatide') ||
            chargeDesc.toLowerCase().includes('weight loss')) {
            metrics.semaglutide_revenue_weekly += chargeAmount;
            debugInfo.categoryTotals.weight_loss += chargeAmount;
          }
        } else {
          debugInfo.categoryTotals.other += chargeAmount;
        }
      }

      // CRITICAL FIX: Only add to monthly revenue if within month range
      if (isCurrentMonth) {
        metrics.actual_monthly_revenue += chargeAmount;

        if (serviceCategory === 'base_infusion' || serviceCategory === 'infusion_addon') {
          metrics.infusion_revenue_monthly += chargeAmount;
          // IV Therapy revenue is ONLY infusions, not injections
          metrics.drip_iv_revenue_monthly += chargeAmount;
        } else if (serviceCategory === 'injection') {
          // IMPORTANT FIX: Don't count Tirzepatide/Semaglutide revenue in general injection revenue
          const isWeightLossInjection = chargeDesc.toLowerCase().includes('semaglutide') || chargeDesc.toLowerCase().includes('tirzepatide') || chargeDesc.toLowerCase().includes('contrave');

          if (!isWeightLossInjection) {
            // Only add to general injection revenue if it's NOT a weight loss injection
            metrics.injection_revenue_monthly += chargeAmount;
          }

          // Weight Loss (Semaglutide/Tirzepatide) revenue goes to Weight Management only
          if (isWeightLossInjection) {
            metrics.semaglutide_revenue_monthly += chargeAmount;
          }
        } else if (serviceCategory === 'membership') {
          metrics.membership_revenue_monthly += chargeAmount;

          // Track new membership signups (monthly) - ONLY count those marked with a "NEW" flag
          const lowerDesc = chargeDesc.toLowerCase();
          const isNewMembership = /\bnew\b/.test(lowerDesc);
          
          if (isNewMembership) {
            if (lowerDesc.includes('individual')) {
              metrics.new_individual_members_monthly++;
            } else if (lowerDesc.includes('family')) {
              metrics.new_family_members_monthly++;
            } else if (lowerDesc.includes('concierge')) {
              metrics.new_concierge_members_monthly++;
            } else if (lowerDesc.includes('corporate')) {
              metrics.new_corporate_members_monthly++;
            }
          }
        } else if (serviceCategory === 'consultation') {
          // Track consultation revenue separately
          if (chargeDesc.toLowerCase().includes('semaglutide') || chargeDesc.toLowerCase().includes('tirzepatide') ||
            chargeDesc.toLowerCase().includes('weight loss')) {
            metrics.semaglutide_revenue_monthly += chargeAmount;
          }
        }
      }
    }
  }

  // Convert Sets to counts
  metrics.unique_customers_weekly = metrics.unique_customers_weekly.size;
  metrics.unique_customers_monthly = metrics.unique_customers_monthly.size;
  metrics.member_customers_weekly = metrics.member_customers_weekly.size;
  metrics.non_member_customers_weekly = metrics.non_member_customers_weekly.size;

  const revenuePerfSummary = Object.fromEntries(Array.from(metrics.bin_revenue_perf.entries()).map(([ bin, amount ]) => [ bin, Number(amount.toFixed(2)) ]));
  const serviceVolumeSummary = Object.fromEntries(Array.from(metrics.bin_service_volume.entries()).map(([ bin, count ]) => [ bin, count ]));
  const customerSummary = Object.fromEntries(Array.from(metrics.bin_customer.entries()).map(([ bin, customerSet ]) => [ bin, customerSet instanceof Set ? customerSet.size : customerSet ]));

  metrics.bin_revenue_perf = revenuePerfSummary;
  metrics.bin_service_volume = serviceVolumeSummary;
  metrics.bin_customer = customerSummary;
  metrics.revenue_perf_bin_summary = revenuePerfSummary;
  metrics.service_volume_bin_summary = serviceVolumeSummary;
  metrics.customer_bin_summary = customerSummary;
  metrics.revenue_perf_bin = JSON.stringify(revenuePerfSummary);
  metrics.service_volume_bin = JSON.stringify(serviceVolumeSummary);
  metrics.customer_bin = JSON.stringify(customerSummary);

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

  // Output debug information
  console.log('\n📊 REVENUE PROCESSING DEBUG INFO:');
  console.log('═'.repeat(60));
  console.log(`Total rows in file: ${debugInfo.totalRows}`);
  console.log(`Rows in week range: ${debugInfo.processedRows}`);
  console.log(`File total (week): $${debugInfo.fileTotal.toFixed(2)}`);
  console.log(`Included total: $${debugInfo.includedTotal.toFixed(2)}`);
  console.log(`\nEXCLUSIONS:`);
  console.log(`  Tips: ${debugInfo.excludedReasons.tips.count} items = $${debugInfo.excludedReasons.tips.amount.toFixed(2)}`);
  console.log(`  Empty/Total: ${debugInfo.excludedReasons.emptyDesc.count} items = $${debugInfo.excludedReasons.emptyDesc.amount.toFixed(2)}`);
  console.log(`  No Amount: ${debugInfo.excludedReasons.noAmount.count} items`);
  console.log(`  Invalid Date: ${debugInfo.excludedReasons.invalidDate.count} items`);
  console.log(`\nCATEGORY BREAKDOWN:`);
  console.log(`  IV Therapy: $${debugInfo.categoryTotals.iv_therapy.toFixed(2)}`);
  console.log(`  Weight Loss: $${debugInfo.categoryTotals.weight_loss.toFixed(2)}`);
  console.log(`  Memberships: $${debugInfo.categoryTotals.memberships.toFixed(2)}`);
  console.log(`  Other: $${debugInfo.categoryTotals.other.toFixed(2)}`);
  console.log(`\nSERVICE COUNTS (WEEKLY):`);
  console.log(`  💉 Weight Loss Injections: ${metrics.weight_loss_injections_weekly} (Semaglutide/Tirzepatide/Contrave)`);
  console.log(`  📋 Weight Loss Consults: ${metrics.semaglutide_consults_weekly}`);
  console.log(`  🩺 Hormone Services Total: ${metrics.hormone_initial_male_weekly + metrics.hormone_followup_male_weekly + metrics.hormone_initial_female_weekly + metrics.hormone_followup_female_weekly}`);
  console.log(`     - Male Initial: ${metrics.hormone_initial_male_weekly}`);
  console.log(`     - Male Followup: ${metrics.hormone_followup_male_weekly}`);
  console.log(`     - Female Initial: ${metrics.hormone_initial_female_weekly}`);
  console.log(`     - Female Followup: ${metrics.hormone_followup_female_weekly}`);
  console.log(`\nDISCREPANCY CHECK:`);
  console.log(`  File total - Tips - Empty = $${(debugInfo.fileTotal - debugInfo.excludedReasons.tips.amount - debugInfo.excludedReasons.emptyDesc.amount).toFixed(2)}`);
  console.log(`  Database storing: $${metrics.actual_weekly_revenue.toFixed(2)}`);
  console.log(`  Difference: $${(debugInfo.fileTotal - debugInfo.excludedReasons.tips.amount - debugInfo.excludedReasons.emptyDesc.amount - metrics.actual_weekly_revenue).toFixed(2)}`);
  console.log('═'.repeat(60));

  // CRITICAL DEBUG: Log if revenue is suspiciously low
  if (metrics.actual_weekly_revenue === 0 && csvData.length > 10) {
    console.log('⚠️ WARNING: Revenue is $0 despite having', csvData.length, 'rows of data');
    console.log('   Week range:', metrics.weekStartDate, 'to', metrics.weekEndDate);
    console.log('   First 3 rows payment amounts:');
    for (let i = 0; i < Math.min(3, csvData.length); i++) {
      console.log(`   Row ${i + 1}:`, {
        'Calculated Payment': csvData[ i ][ 'Calculated Payment (Line)' ],
        'Charge Amount': csvData[ i ][ 'Charge Amount' ],
        'Date': csvData[ i ][ 'Date' ],
        'Is in week range?': csvData[ i ][ 'Date' ] &&
          new Date(csvData[ i ][ 'Date' ]) >= metrics.weekStartDate &&
          new Date(csvData[ i ][ 'Date' ]) <= metrics.weekEndDate
      });
    }
  }

  metrics.rawRows = csvData;

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
  const sheetName = workbook.SheetNames[ 0 ];
  const worksheet = workbook.Sheets[ sheetName ];
  //const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  // Use header row for keys
  const data = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

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

  // // Process membership data (column 4 contains membership types)
  // for (let i = 0; i < data.length; i++) {
  //   const row = data[ i ];
  //   if (row && row[ 4 ]) { // Column 4 contains membership type
  //     const membershipType = row[ 4 ].toString().toLowerCase();
  //     membershipTotals.total_drip_iv_members++;

  //     if (membershipType.includes('individual')) {
  //       membershipTotals.individual_memberships++;
  //     } else if (membershipType.includes('family') && membershipType.includes('concierge')) {
  //       membershipTotals.family_concierge_memberships++;
  //     } else if (membershipType.includes('family')) {
  //       membershipTotals.family_memberships++;
  //     } else if (membershipType.includes('concierge') && membershipType.includes('drip')) {
  //       membershipTotals.drip_concierge_memberships++;
  //     } else if (membershipType.includes('concierge')) {
  //       membershipTotals.concierge_memberships++;
  //     } else if (membershipType.includes('corporate')) {
  //       membershipTotals.corporate_memberships++;
  //     }
  //   }
  // }

  // Process membership data using column names
  for (const row of data) {
    const membershipType = (row['Title'] || '').toLowerCase();
    if (membershipType) {
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

  // NOTE: Dashboard has separate tiles for combined memberships
  // Do NOT aggregate - keep family_concierge and drip_concierge separate
  // The dashboard will display them in their own tiles

  console.log('Membership analysis complete:', membershipTotals);
  console.log('  Breakdown:');
  console.log(`    Individual: ${membershipTotals.individual_memberships}`);
  console.log(`    Family: ${membershipTotals.family_memberships}`);
  console.log(`    Concierge: ${membershipTotals.concierge_memberships}`);
  console.log(`    Family & Concierge: ${membershipTotals.family_concierge_memberships}`);
  console.log(`    Drip & Concierge: ${membershipTotals.drip_concierge_memberships}`);
  console.log(`    Corporate: ${membershipTotals.corporate_memberships}`);
  console.log(`    Total: ${membershipTotals.total_drip_iv_members}`);

  // Return both metrics and raw rows
  return { metrics: membershipTotals, rawRows: data };
}

// Main import function
async function importWeeklyData(revenueFilePath, membershipFilePath) {
  // Check if database pool is configured, create one for CLI if needed
  if (!pool) {
    console.log('⚠️ No database pool configured, attempting to create standalone pool...');
    createStandalonePool();
    if (!pool) {
      throw new Error('Database pool not configured and DATABASE_URL not found.');
    }
  }

  let client = null;

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

    console.log('\n📊 DATABASE OPERATION:');

    try {
      client = await pool.connect();
      console.log('✅ Database client acquired from pool');
      await client.query('SELECT 1 as test');
      console.log('✅ Database connection verified');
    } catch (connError) {
      if (client) {
        client.release();
        client = null;
      }
      console.error('❌ Database connection test failed:', connError.message);
      console.error('   Cannot proceed with data import');
      throw new Error(`Database not accessible: ${connError.message}`);
    }

    // Process revenue data if file is provided
    let revenueRows = [];
    if (revenueFilePath) {
      const result = await processRevenueData(revenueFilePath, client);
      revenueMetrics = result;
      revenueRows = result.rawRows || [];
    } else {
      console.log('No revenue file provided, using default revenue metrics');
    }

    // Process membership data if file is provided
    let membershipRows = [];
    if (membershipFilePath) {
      const result = await processMembershipData(membershipFilePath);
      membershipMetrics = result.metrics;
      membershipRows = result.rawRows;
    } else {
      console.log('No membership file provided, using default membership metrics');
    }

    // VALIDATION: Check if revenue data is suspiciously missing
    if (revenueMetrics.actual_weekly_revenue === 0 && revenueFilePath) {
      console.log('⚠️ CRITICAL WARNING: Revenue is $0 after processing revenue file');
      console.log('   This likely indicates a parsing error in the MHTML/CSV file');
      console.log('   Please check the column mapping for "Calculated Payment (Line)"');

      // Don't save data with $0 revenue unless it's genuinely empty
      if (revenueMetrics.uniqueCustomersWeekly > 0) {
        throw new Error('Revenue parsing failed - found customers but $0 revenue. Check column mapping.');
      }
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
      popular_infusions: [ 'Energy', 'NAD+', 'Performance & Recovery' ],
      popular_infusions_status: 'Active',
      popular_injections: ['B12', 'Vitamin D', 'Metabolism Boost'],
      popular_injections_status: 'Active'
    };

    combinedData.revenue_perf_bin = revenueMetrics.revenue_perf_bin || JSON.stringify(revenueMetrics.bin_revenue_perf_summary || revenueMetrics.bin_revenue_perf || {});
    combinedData.service_volume_bin = revenueMetrics.service_volume_bin || JSON.stringify(revenueMetrics.service_volume_bin_summary || revenueMetrics.bin_service_volume || {});
    combinedData.customer_bin = revenueMetrics.customer_bin || JSON.stringify(revenueMetrics.customer_bin_summary || revenueMetrics.bin_customer || {});

    // Set week start and end dates - Convert to ISO string format for PostgreSQL
    // CRITICAL: Ensure dates are converted to strings to prevent PostgreSQL type errors
    if (combinedData.weekStartDate) {
      if (combinedData.weekStartDate instanceof Date) {
        combinedData.week_start_date = combinedData.weekStartDate.toISOString().split('T')[ 0 ];
      } else {
        // If it's already a string, validate it
        combinedData.week_start_date = combinedData.weekStartDate;
      }
    } else {
      // NO WEEK START DATE - This is an error
      console.error('❌ ERROR: No week start date found!');
      throw new Error('Cannot save data without valid week dates. Check if revenue file contains valid dates.');
    }

    if (combinedData.weekEndDate) {
      if (combinedData.weekEndDate instanceof Date) {
        combinedData.week_end_date = combinedData.weekEndDate.toISOString().split('T')[ 0 ];
      } else {
        // If it's already a string, validate it
        combinedData.week_end_date = combinedData.weekEndDate;
      }
    } else {
      // NO WEEK END DATE - This is an error
      console.error('❌ ERROR: No week end date found!');
      throw new Error('Cannot save data without valid week dates. Check if revenue file contains valid dates.');
    }

    // Validate date formats before database operations
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(combinedData.week_start_date)) {
      throw new Error(`Invalid week_start_date format: ${combinedData.week_start_date}. Expected YYYY-MM-DD`);
    }
    if (!dateRegex.test(combinedData.week_end_date)) {
      throw new Error(`Invalid week_end_date format: ${combinedData.week_end_date}. Expected YYYY-MM-DD`);
    }

    // CRITICAL VALIDATION: Prevent saving bad data
    if (combinedData.week_start_date === combinedData.week_end_date) {
      console.error('❌ ERROR: Week start and end dates are the same!');
      console.error(`   Both dates: ${combinedData.week_start_date}`);
      throw new Error('Invalid week range - start and end dates cannot be the same');
    }

    // Validate week is exactly 7 days
    const weekStart = new Date(combinedData.week_start_date);
    const weekEnd = new Date(combinedData.week_end_date);
    const daysDiff = Math.round((weekEnd - weekStart) / (1000 * 60 * 60 * 24));

    if (daysDiff !== 6) {
      console.error('❌ ERROR: Week range is not 7 days!');
      console.error(`   Start: ${combinedData.week_start_date}`);
      console.error(`   End: ${combinedData.week_end_date}`);
      console.error(`   Days: ${daysDiff + 1} (should be 7)`);
      throw new Error(`Invalid week range - must be exactly 7 days, got ${daysDiff + 1}`);
    }

    // Warn if revenue is suspiciously low
    if (combinedData.actual_weekly_revenue === 0 && revenueFilePath) {
      console.warn('⚠️ WARNING: Weekly revenue is $0 despite processing revenue file');
      console.warn('   This may indicate a parsing error');
      // Don't throw error - $0 might be legitimate for some weeks
    }

    // Clean up temporary date fields
    delete combinedData.weekStartDate;
    delete combinedData.weekEndDate;
    delete combinedData.monthStartDate;
    delete combinedData.monthEndDate;

    // Validate numeric fields before database operations
    const numericFields = [
      'iv_infusions_weekday_weekly', 'iv_infusions_weekend_weekly',
      'injections_weekday_weekly', 'injections_weekend_weekly',
      'unique_customers_weekly', 'unique_customers_monthly',
      'actual_weekly_revenue', 'actual_monthly_revenue',
      'total_drip_iv_members', 'individual_memberships',
      'family_memberships', 'corporate_memberships'
    ];

    for (const field of numericFields) {
      if (combinedData[ field ] !== undefined) {
        // Convert to number and ensure it's not NaN
        const value = Number(combinedData[ field ]);
        if (isNaN(value)) {
          console.warn(`⚠️  Invalid numeric value for ${field}: ${combinedData[ field ]}, defaulting to 0`);
          combinedData[ field ] = 0;
        } else {
          combinedData[ field ] = value;
        }
      }
    }

    if (!client) {
      throw new Error('Database client not initialized - cannot save data');
    }

      // NEW REGISTRY-BASED MEMBERSHIP TRACKING
      // Process membership data using the new registry to prevent double counting
      let newMembershipCounts = {
        new_individual_members_weekly: 0,
        new_family_members_weekly: 0,
        new_concierge_members_weekly: 0,
        new_corporate_members_weekly: 0,
      };

      if (membershipRows && membershipRows.length > 0) {
        console.log('🔄 Processing memberships using registry-based tracking...');
        
        // Ensure membership_registry table exists
        await client.query(`
          CREATE TABLE IF NOT EXISTS membership_registry (
            member_key TEXT PRIMARY KEY,
            patient TEXT NOT NULL,
            membership_type TEXT NOT NULL,
            title_raw TEXT NOT NULL,
            start_date DATE NOT NULL,
            first_seen_week DATE NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `);
        
        // Create indexes if they don't exist
        await client.query('CREATE INDEX IF NOT EXISTS idx_membership_registry_type ON membership_registry (membership_type)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_membership_registry_first_seen ON membership_registry (first_seen_week)');
        
        // Use the new registry-based counting function
        newMembershipCounts = await computeNewMembershipsFromUpload(membershipRows, client);
        
        // Update combined data with registry-based counts (only when membership file is provided)
        combinedData.new_individual_members_weekly = newMembershipCounts.new_individual_members_weekly;
        combinedData.new_family_members_weekly = newMembershipCounts.new_family_members_weekly;
        combinedData.new_concierge_members_weekly = newMembershipCounts.new_concierge_members_weekly;
        combinedData.new_corporate_members_weekly = newMembershipCounts.new_corporate_members_weekly;
      } else {
        console.log('📝 No membership rows provided, using revenue-based "(NEW)" detection from Patient Analysis file');
        // Keep the revenue-based counts that were calculated from the Patient Analysis file
        // These are already in combinedData from the revenue processing
      }

      // Check if data already exists for this week
      console.log(`📅 Checking for existing data: ${combinedData.week_start_date} to ${combinedData.week_end_date}`);

      const existingCheck = await client.query(
        'SELECT id FROM analytics_data WHERE week_start_date = $1 AND week_end_date = $2',
        [ combinedData.week_start_date, combinedData.week_end_date ]
      );

      if (existingCheck.rows.length > 0) {
        console.log(`📝 Found existing record (ID: ${existingCheck.rows[ 0 ].id}), updating...`);

        // Update existing record - Fixed parameter numbering with new columns
        const updateQuery = `
          UPDATE analytics_data SET
            iv_infusions_weekday_weekly = $1,
            iv_infusions_weekend_weekly = $2,
            iv_infusions_weekday_monthly = $3,
            iv_infusions_weekend_monthly = $4,
            injections_weekday_weekly = $5,
            injections_weekend_weekly = $6,
            injections_weekday_monthly = $7,
            injections_weekend_monthly = $8,
            unique_customers_weekly = $9,
            unique_customers_monthly = $10,
            member_customers_weekly = $11,
            non_member_customers_weekly = $12,
            actual_weekly_revenue = $13,
            actual_monthly_revenue = $14,
            drip_iv_revenue_weekly = $15,
            semaglutide_revenue_weekly = $16,
            drip_iv_revenue_monthly = $17,
            semaglutide_revenue_monthly = $18,
            total_drip_iv_members = $19,
            individual_memberships = $20,
            family_memberships = $21,
            family_concierge_memberships = $22,
            drip_concierge_memberships = $23,
            concierge_memberships = $24,
            corporate_memberships = $25,
            semaglutide_injections_weekly = $26,
            semaglutide_injections_monthly = $27,
            new_individual_members_weekly = $28,
            new_family_members_weekly = $29,
            new_concierge_members_weekly = $30,
            new_corporate_members_weekly = $31,
            hormone_followup_female_weekly = $32,
            hormone_followup_female_monthly = $33,
            hormone_initial_female_weekly = $34,
            hormone_initial_female_monthly = $35,
            hormone_initial_male_weekly = $36,
            hormone_initial_male_monthly = $37,
            hormone_followup_male_weekly = $38,
            hormone_followup_male_monthly = $39,
            revenue_perf_bin = $40,
            service_volume_bin = $41,
            customer_bin = $42,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $43
        `;

        await client.query(updateQuery, [
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
          combinedData.semaglutide_injections_weekly || 0,
          combinedData.semaglutide_injections_monthly || 0,
          combinedData.new_individual_members_weekly || 0,
          combinedData.new_family_members_weekly || 0,
          combinedData.new_concierge_members_weekly || 0,
          combinedData.new_corporate_members_weekly || 0,
          combinedData.hormone_followup_female_weekly || 0,
          combinedData.hormone_followup_female_monthly || 0,
          combinedData.hormone_initial_female_weekly || 0,
          combinedData.hormone_initial_female_monthly || 0,
          combinedData.hormone_initial_male_weekly || 0,
          combinedData.hormone_initial_male_monthly || 0,
          combinedData.hormone_followup_male_weekly || 0,
          combinedData.hormone_followup_male_monthly || 0,
          combinedData.revenue_perf_bin || JSON.stringify({}),
          combinedData.service_volume_bin || JSON.stringify({}),
          combinedData.customer_bin || JSON.stringify({}),
          existingCheck.rows[ 0 ].id
        ]);

        console.log('✅ Data updated successfully!');
      } else {
        console.log('📝 No existing record found, inserting new data...');
        console.log(`   Week: ${combinedData.week_start_date} to ${combinedData.week_end_date}`);
        console.log(`   Revenue: $${combinedData.actual_weekly_revenue}`);
        console.log(`   Members: ${combinedData.total_drip_iv_members}`);

        // Insert new record with new columns
        const insertQuery = `
  INSERT INTO analytics_data (
    week_start_date, week_end_date,
    iv_infusions_weekday_weekly, iv_infusions_weekend_weekly,
    iv_infusions_weekday_monthly, iv_infusions_weekend_monthly,
    injections_weekday_weekly, injections_weekend_weekly,
    injections_weekday_monthly, injections_weekend_monthly,
    unique_customers_weekly, unique_customers_monthly,
    member_customers_weekly, non_member_customers_weekly,
    revenue_perf_bin, service_volume_bin, customer_bin,
    actual_weekly_revenue, weekly_revenue_goal,
    actual_monthly_revenue, monthly_revenue_goal,
    drip_iv_revenue_weekly, semaglutide_revenue_weekly,
    drip_iv_revenue_monthly, semaglutide_revenue_monthly,
    total_drip_iv_members, individual_memberships,
    family_memberships, family_concierge_memberships,
    drip_concierge_memberships, concierge_memberships,
    corporate_memberships, days_left_in_month,
    popular_infusions, popular_infusions_status,
    popular_injections, popular_injections_status,
    semaglutide_injections_weekly, semaglutide_injections_monthly,
    new_individual_members_weekly, new_family_members_weekly,
    new_concierge_members_weekly, new_corporate_members_weekly,
    hormone_followup_female_weekly, hormone_followup_female_monthly,
    hormone_initial_female_weekly, hormone_initial_female_monthly,
    hormone_initial_male_weekly, hormone_initial_male_monthly,
    hormone_followup_male_weekly, hormone_followup_male_monthly
  ) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
    $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
    $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
    $31, $32, $33, $34, $35, $36, $37, $38, $39, $40,
    $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51
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
          combinedData.revenue_perf_bin || JSON.stringify({}),
          combinedData.service_volume_bin || JSON.stringify({}),
          combinedData.customer_bin || JSON.stringify({}),
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
          combinedData.popular_injections_status,
          combinedData.semaglutide_injections_weekly || 0,
          combinedData.semaglutide_injections_monthly || 0,
          combinedData.new_individual_members_weekly || 0,
          combinedData.new_family_members_weekly || 0,
          combinedData.new_concierge_members_weekly || 0,
          combinedData.new_corporate_members_weekly || 0,
          combinedData.hormone_followup_female_weekly || 0,
          combinedData.hormone_followup_female_monthly || 0,
          combinedData.hormone_initial_female_weekly || 0,
          combinedData.hormone_initial_female_monthly || 0,
          combinedData.hormone_initial_male_weekly || 0,
          combinedData.hormone_initial_male_monthly || 0,
          combinedData.hormone_followup_male_weekly || 0,
          combinedData.hormone_followup_male_monthly || 0
        ]);
        console.log('✅ Data inserted successfully into database!');
      }

      // VERIFICATION: Query the database to confirm what was saved
      console.log('\n📊 VERIFICATION: Checking what was saved to database...');
      const verifyQuery = await client.query(
        `SELECT week_start_date, week_end_date, actual_weekly_revenue, 
                total_drip_iv_members, unique_customers_weekly
         FROM analytics_data 
         WHERE week_start_date = $1 AND week_end_date = $2`,
        [ combinedData.week_start_date, combinedData.week_end_date ]
      );

      if (verifyQuery.rows.length > 0) {
        const saved = verifyQuery.rows[ 0 ];
        console.log('✅ Data confirmed in database:');
        console.log(`   Week: ${saved.week_start_date} to ${saved.week_end_date}`);
        console.log(`   Revenue: $${saved.actual_weekly_revenue}`);
        console.log(`   Members: ${saved.total_drip_iv_members}`);
        console.log(`   Unique Customers: ${saved.unique_customers_weekly}`);
      } else {
        console.log('⚠️ WARNING: Could not verify saved data!');
      }
    console.log('Import completed successfully!');
    return combinedData;

  } catch (error) {
    console.error('❌ ERROR IMPORTING WEEKLY DATA:');
    console.error(`   Message: ${error.message}`);

    if (error.code) {
      console.error(`   Error Code: ${error.code}`);

      // Database-specific error codes
      if (error.code === '23505') {
        console.error('   → Duplicate key violation');
      } else if (error.code === '42P01') {
        console.error('   → Table does not exist');
      } else if (error.code === '42703') {
        console.error('   → Column does not exist');
      } else if (error.code === '08P01') {
        console.error('   → Protocol violation');
      } else if (error.code === 'ECONNREFUSED') {
        console.error('   → Database connection refused');
        console.error('   → Check DATABASE_URL in Railway environment variables');
      }
    }

    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }

    throw error;
  } finally {
    if (client) {
      client.release();
    }
  }
}

// Export functions for use in other modules
module.exports = {
  setDatabasePool,
  importWeeklyData,
  processRevenueData,
  processMembershipData,
  analyzeRevenueData,
  getServiceCategory,
  getWeekWindow,
  computeNewMembershipsFromUpload,
  cleanCurrency
};

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 2) {
    console.log('Usage: node import-weekly-data.js <revenue-csv-path> <membership-excel-path>');
    process.exit(1);
  }

  const [ revenueFilePath, membershipFilePath ] = args;

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
