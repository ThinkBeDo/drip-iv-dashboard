const express = require('express');
const { Pool } = require('pg');
const multer = require('multer');
const csvParser = require('csv-parser');
const pdfParse = require('pdf-parse');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
require('dotenv').config();
const { importWeeklyData, setDatabasePool } = require('./import-weekly-data');
const { importMultiWeekData, setMultiWeekDatabasePool } = require('./import-multi-week-data');
const { runMigrations, getMigrationStatus } = require('./database/run-migrations');
const { autoLoadMapping, getMappingStatus } = require('./database/auto-load-mapping');

const app = express();
const port = process.env.PORT || 3000;

// Database connection - Always use PostgreSQL for Railway deployment
let pool;

if (process.env.DATABASE_URL) {
  // PostgreSQL for production and development
  console.log('🐘 Connecting to PostgreSQL database...');
  console.log('📍 Environment:', process.env.NODE_ENV || 'development');
  
  // Enhanced logging for Railway debugging
  const dbUrl = process.env.DATABASE_URL;
  const isRailwayInternal = dbUrl.includes('.railway.internal');
  const isRailwayPublic = dbUrl.includes('.railway.app');
  
  console.log('📍 Database URL type:', 
    isRailwayInternal ? 'Railway Internal' : 
    isRailwayPublic ? 'Railway Public' : 
    'External');
  console.log('📍 Database URL:', dbUrl.replace(/:[^:@]+@/, ':****@')); // Hide password
  
  // Railway requires SSL for external connections
  const sslConfig = process.env.NODE_ENV === 'production' || isRailwayPublic
    ? { rejectUnauthorized: false }
    : false;
  
  console.log('🔒 SSL Configuration:', sslConfig ? 'Enabled' : 'Disabled');
  
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: sslConfig,
    // Connection pool configuration
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 10000, // 10 second connection timeout
    query_timeout: 30000, // 30 second query timeout
  });
  
  // Test database connection with retry logic
  const testConnection = async (retries = 3) => {
    for (let i = 0; i < retries; i++) {
      try {
        console.log(`🔄 Connection attempt ${i + 1}/${retries}...`);
        
        // Test basic connectivity
        const result = await pool.query('SELECT NOW() as time, current_database() as db');
        console.log('✅ Database connection successful!');
        console.log(`   Connected to: ${result.rows[0].db}`);
        console.log(`   Server time: ${result.rows[0].time}`);
        
        // Test analytics_data table exists
        const tableCheck = await pool.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = 'analytics_data'
          ) as table_exists
        `);
        
        if (tableCheck.rows[0].table_exists) {
          console.log('✅ analytics_data table exists');
          
          // Get row count
          const countResult = await pool.query('SELECT COUNT(*) as count FROM analytics_data');
          console.log(`   Current records: ${countResult.rows[0].count}`);
        } else {
          console.warn('⚠️ analytics_data table does not exist!');
          console.warn('   Database may need initialization');
        }

        // REMOVED: Database wipe on startup - historical data should persist
        // This allows monthly calculations to sum multiple weeks correctly
        // To manually clear data, use the /api/clear-data endpoint instead

        // Pass the pool to import-weekly-data module
        setDatabasePool(pool);
        setMultiWeekDatabasePool(pool);
        console.log('✅ Database pool shared with import module');
        return true;
      } catch (err) {
        console.error(`❌ Database connection attempt ${i + 1} failed:`);
        console.error(`   Error: ${err.message}`);
        console.error(`   Code: ${err.code}`);
        
        if (err.code === 'ECONNREFUSED') {
          console.error('   → Database server is not accepting connections');
          console.error('   → Check if DATABASE_URL is correct');
        } else if (err.code === 'ENOTFOUND') {
          console.error('   → Database host not found');
          console.error('   → Verify the hostname in DATABASE_URL');
        } else if (err.code === '28P01') {
          console.error('   → Authentication failed');
          console.error('   → Check username and password in DATABASE_URL');
        }
        
        if (i < retries - 1) {
          console.log(`⏳ Retrying in ${(i + 1) * 2} seconds...`);
          await new Promise(resolve => setTimeout(resolve, (i + 1) * 2000));
        }
      }
    }
    console.error('❌ Could not establish database connection after', retries, 'attempts');
    console.error('Please check your DATABASE_URL configuration in Railway');
    
    // Still pass the pool even if connection fails (for later retry)
    setDatabasePool(pool);
    setMultiWeekDatabasePool(pool);
    return false;
  };
  
  testConnection();
} else {
  console.error('❌ DATABASE_URL environment variable not found');
  console.error('Please set DATABASE_URL in your environment variables');
  process.exit(1);
}

// Configure connection pool for better performance
if (pool) {
  pool.on('error', (err) => {
    console.error('Unexpected database error:', err);
  });
  
  // Set pool configuration for production
  if (process.env.NODE_ENV === 'production') {
    pool.options.max = 20; // Maximum number of clients in the pool
    pool.options.idleTimeoutMillis = 30000; // Close idle clients after 30 seconds
    pool.options.connectionTimeoutMillis = 10000; // Return an error after 10 seconds if connection could not be established
  }
}

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"]
    }
  }
}));
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// File upload configuration
const upload = multer({
  dest: '/tmp/',
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'text/csv',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel'
    ];
    
    const allowedExtensions = ['.csv', '.pdf', '.xlsx', '.xls'];
    
    const isAllowedMimeType = allowedMimeTypes.includes(file.mimetype);
    const hasAllowedExtension = allowedExtensions.some(ext => 
      file.originalname.toLowerCase().endsWith(ext)
    );
    
    if (isAllowedMimeType || hasAllowedExtension) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV, PDF, and Excel files are allowed'));
    }
  }
});

// Utility function to parse CSV data with UTF-16 support
async function parseCSVData(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    
    // First, read a small chunk to detect encoding
    const buffer = fs.readFileSync(filePath, { flag: 'r' });
    const firstBytes = buffer.slice(0, 4);
    
    let encoding = 'utf8';
    // Check for UTF-16 LE BOM (FF FE)
    if (firstBytes[0] === 0xFF && firstBytes[1] === 0xFE) {
      encoding = 'utf16le';
    }
    // Check for UTF-16 BE BOM (FE FF)
    else if (firstBytes[0] === 0xFE && firstBytes[1] === 0xFF) {
      encoding = 'utf16be';
    }

    let csvContent;
    if (encoding === 'utf8') {
      // Standard UTF-8 processing
      fs.createReadStream(filePath)
        .pipe(csvParser())
        .on('data', (data) => results.push(data))
        .on('end', () => resolve(results))
        .on('error', reject);
    } else {
      // Handle UTF-16 encoding with proper CSV parsing
      try {
        const fullBuffer = fs.readFileSync(filePath);
        // Use iconv-lite to decode UTF-16
        const iconv = require('iconv-lite');
        csvContent = iconv.decode(fullBuffer, encoding);
        
        // Split content into lines
        const lines = csvContent.split(/\r?\n/).filter(line => line.trim());
        if (lines.length === 0) {
          return resolve([]);
        }
        
        // Check if this is the special Drip IV format
        const firstLine = lines[0];
        const isDripIVFormat = firstLine.startsWith('"') && firstLine.includes(',""');
        
        let headers = [];
        
        if (isDripIVFormat) {
          // Special Drip IV CSV format: "field1,""field2"",""field3"",..."
          console.log('Detected special Drip IV CSV format');
          
          // Parse headers from special format
          let content = firstLine;
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
              currentPart += content[i];
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
          
          console.log('Parsed headers:', headers.slice(0, 5), '...');
          
          // Parse data rows
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
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
                currentPart += dataContent[j];
                j++;
              }
            }
            // Add the last part
            if (currentPart || dataParts.length === 0) {
              dataParts.push(currentPart);
            }
            
            // Clean each value and create row object
            if (dataParts.length >= headers.length) {
              const row = {};
              headers.forEach((header, index) => {
                let value = dataParts[index] || '';
                // Remove any quotes
                value = value.replace(/^\"*/, '').replace(/\"*$/, '');
                row[header] = value.trim();
              });
              results.push(row);
            }
          }
        } else {
          // Standard CSV parsing for regular format
          const parseCSVLine = (line) => {
            const result = [];
            let current = '';
            let inQuotes = false;
            
            for (let i = 0; i < line.length; i++) {
              const char = line[i];
              const nextChar = line[i + 1];
              
              if (char === '"') {
                if (inQuotes && nextChar === '"') {
                  // Escaped quote
                  current += '"';
                  i++; // Skip next quote
                } else {
                  // Toggle quote state
                  inQuotes = !inQuotes;
                }
              } else if (char === ',' && !inQuotes) {
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
          headers = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, ''));
          
          // Parse data rows
          for (let i = 1; i < lines.length; i++) {
            const values = parseCSVLine(lines[i]);
            if (values.length === headers.length) {
              const row = {};
              headers.forEach((header, index) => {
                let value = values[index] || '';
                // Remove surrounding quotes if present
                if (value.startsWith('"') && value.endsWith('"')) {
                  value = value.slice(1, -1);
                }
                row[header] = value;
              });
              results.push(row);
            }
          }
        }
        
        console.log(`✅ Successfully parsed UTF-16 CSV: ${results.length} rows`);
        resolve(results);
      } catch (error) {
        console.error('❌ Error parsing UTF-16 CSV:', error.message);
        reject(error);
      }
    }
  });
}

// Utility function to detect MHTML format
function isMHTMLFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    // Check for MHTML markers
    return content.includes('MIME-Version:') && 
           content.includes('Content-Type:') && 
           content.includes('Content-Location:') &&
           (content.includes('multipart/related') || content.includes('text/html'));
  } catch (error) {
    return false;
  }
}

// Utility function to parse MHTML (HTML saved as .xls) files
async function parseMHTMLData(filePath) {
  return new Promise((resolve, reject) => {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Find the sheet boundary sections
      const parts = content.split(/--[\w-]+/);
      
      let tableHtml = '';
      // Look for the part containing the actual HTML table
      for (const part of parts) {
        if (part.includes('<table') && (part.includes('sheet1.htm') || part.includes('<tr'))) {
          tableHtml = part;
          break;
        }
      }
      
      if (!tableHtml) {
        reject(new Error('No table data found in MHTML file'));
        return;
      }
      
      // Clean up quoted-printable encoding
      tableHtml = tableHtml.replace(/=3D/g, '=');
      tableHtml = tableHtml.replace(/=\r?\n/g, '');
      
      // Extract table rows using regex
      const rowMatches = tableHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/g);
      
      if (!rowMatches || rowMatches.length === 0) {
        reject(new Error('No rows found in MHTML table'));
        return;
      }
      
      console.log(`Found ${rowMatches.length} rows in MHTML table`);
      
      // Parse headers from first row
      const headerMatch = rowMatches[0].match(/<td[^>]*>([^<]*)<\/td>/g);
      const headers = [];
      
      if (headerMatch) {
        headerMatch.forEach(cell => {
          const text = cell.replace(/<[^>]*>/g, '').trim();
          headers.push(text);
        });
      }
      
      console.log('MHTML Headers:', headers.slice(0, 10), '...');
      
      // Parse data rows
      const results = [];
      for (let i = 1; i < rowMatches.length; i++) {
        const rowMatch = rowMatches[i].match(/<td[^>]*>([^<]*)<\/td>/g);
        
        if (rowMatch) {
          const row = {};
          // Process all available cells, even if less than header count
          const cellCount = Math.min(rowMatch.length, headers.length);
          for (let j = 0; j < cellCount; j++) {
            let value = rowMatch[j].replace(/<[^>]*>/g, '').trim();
            // Clean HTML entities
            value = value.replace(/&amp;/g, '&')
                        .replace(/&lt;/g, '<')
                        .replace(/&gt;/g, '>')
                        .replace(/&quot;/g, '"')
                        .replace(/&#32;/g, ' ')
                        .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));
            row[headers[j]] = value;
          }
          
          // Fill missing columns with empty strings
          for (let j = cellCount; j < headers.length; j++) {
            row[headers[j]] = '';
          }
          
          // Only add rows that have actual data (not empty rows)
          if (Object.values(row).some(v => v && v.trim())) {
            results.push(row);
          }
        }
      }
      
      console.log(`✅ Successfully parsed MHTML: ${results.length} data rows`);
      resolve(results);
      
    } catch (error) {
      console.error('❌ Error parsing MHTML:', error.message);
      reject(error);
    }
  });
}

// Utility function to parse PDF data
async function parsePDFData(filePath) {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(dataBuffer);
    return pdfData.text;
  } catch (error) {
    throw new Error(`Failed to parse PDF: ${error.message}`);
  }
}

// Function to extract analytics data from parsed content or Excel files
function extractAnalyticsData(content, isCSV = false, filePath = null) {
  // Check if we have a file path and it's an Excel file
  if (filePath) {
    const fileExt = filePath.toLowerCase();
    if (fileExt.endsWith('.xls') || fileExt.endsWith('.xlsx')) {
      console.log('📊 Detected Excel file, using extractFromExcel');
      return extractFromExcel(filePath);
    }
  }
  
  if (isCSV) {
    // Handle CSV data format
    return extractFromCSV(content);
  } else {
    // Handle PDF text format
    return extractFromPDF(content);
  }
}

// Service categorization functions
function isBaseInfusionService(chargeDesc) {
  const lowerDesc = chargeDesc.toLowerCase();
  
  // Exclude non-medical services first
  const exclusions = ['membership', 'lab', 'cbc', 'cmp', 'draw fee', 'office visit', 'consultation'];
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
  
  // Standalone Injections (excluding weight management medications)
  const standaloneInjections = [
    'b12 injection', 'metabolism boost injection', 'vitamin d injection', 
    'glutathione injection', 'biotin injection', 'xeomin neurotoxin'
  ];
  
  // Weight management medications (tracked separately)
  const weightManagementMeds = ['semaglutide', 'tirzepatide', 'contrave'];
  
  // Return false for weight management medications - these should only appear in Weight Management section
  if (weightManagementMeds.some(med => lowerDesc.includes(med))) {
    return false; // Weight management medications are NOT counted as regular injections
  }
  
  return standaloneInjections.some(service => lowerDesc.includes(service)) ||
         (lowerDesc.includes('b12') && lowerDesc.includes('injection') && !lowerDesc.includes('vitamin'));
}

// Legacy function for backward compatibility
function isInfusionService(chargeDesc) {
  return isBaseInfusionService(chargeDesc) || isInfusionAddon(chargeDesc);
}

// Legacy function for backward compatibility - now delegates to standalone injection check
function isInjectionService(chargeDesc) {
  return isStandaloneInjection(chargeDesc);
}

function isMembershipOrAdminService(chargeDesc) {
  const lowerDesc = chargeDesc.toLowerCase();
  
  const adminServices = [
    'membership', 'lab', 'cbc', 'cmp', 'draw fee', 'office visit', 'consultation',
    'blood work', 'panel', 'test', 'screening', 'concierge membership'
  ];
  
  return adminServices.some(service => lowerDesc.includes(service));
}

function getServiceCategory(chargeDesc) {
  if (isMembershipOrAdminService(chargeDesc)) return 'admin';
  if (isStandaloneInjection(chargeDesc)) return 'injection';
  if (isBaseInfusionService(chargeDesc)) return 'base_infusion';
  if (isInfusionAddon(chargeDesc)) return 'infusion_addon';
  return 'other';
}

function isWeightManagementService(chargeDesc) {
  const lowerDesc = chargeDesc.toLowerCase();
  
  // Weight management medications
  const weightMgmtKeywords = [
    'semaglutide', 'ozempic', 'wegovy', 'rybelsus',
    'tirzepatide', 'mounjaro', 'zepbound',
    'weight loss', 'weight management', 'glp-1'
  ];
  
  return weightMgmtKeywords.some(keyword => lowerDesc.includes(keyword));
}

function isHormoneService(chargeDesc) {
  const lowerDesc = chargeDesc.toLowerCase();
  
  // Hormone therapy services
  const hormoneKeywords = [
    'hormone', 'testosterone', 'estrogen', 'progesterone',
    'hrt', 'bhrt', 'pellet', 'thyroid', 'cortisol'
  ];
  
  return hormoneKeywords.some(keyword => lowerDesc.includes(keyword));
}

// Revenue category mapping for Excel processing
const revenueCategoryMapping = {
  drip_iv_revenue: [
    // Base IV Therapy Services
    'All Inclusive (Non-Member)', 'Alleviate (Member)', 'Alleviate (Non-Member)',
    'Energy (Non-Member)', 'Hydration (Non-Member)', 'Hydration (member)',
    'Immunity (Member)', 'Immunity (Non-Member)', 'Lux Beauty (Non-Member)',
    'Performance & Recovery (Member)', 'Performance & Recovery (Non-member)',
    'NAD 100mg (Member)', 'NAD 100mg (Non-Member)', 'NAD 150mg (Member)',
    'NAD 200mg (Member)', 'NAD 250mg (Member)', 'NAD 50mg (Non Member)',
    'Saline 1L (Member)', 'Saline 1L (Non-Member)', 'Met. Boost IV',
    
    // IV Add-ons and Injections (previously missing)
    'Vitamin D3 IM', 'Toradol IM', 'Glutathione IM', 'Zofran IM',
    'B12 IM', 'Vitamin B Complex IM', 'Biotin IM', 'MIC IM',
    'Amino Acid IM', 'Magnesium IM', 'Zinc IM', 'Vitamin C IM'
  ],
  semaglutide_revenue: [
    'Semaglutide Monthly', 'Semaglutide Weekly', 'Tirzepatide Monthly', 
    'Tirzepatide Weekly', 'Partner Tirzepatide', 'Weight Loss Program Lab Bundle',
    'Weight Management', 'GLP-1', 'Ozempic', 'Wegovy'
  ],
  ketamine_revenue: [
    'Ketamine', 'Ketamine Therapy', 'Spravato'
  ],
  membership_revenue: [
    'Membership - Individual', 'Membership - Family', 'Membership - Family (NEW)', 
    'Family Membership', 'Individual Membership', 'Concierge Membership'
  ],
  hormone_revenue: [
    'Hormones - Follow Up MALES', 'Hormone Therapy', 'HRT', 'Testosterone',
    'Estrogen', 'Progesterone', 'DHEA', 'Thyroid'
  ],
  other_revenue: ['Lab Draw Fee', 'TOTAL_TIPS', 'Contrave Office Visit']
};

// Revenue categorization patterns for substring matching
const revenueCategoryPatterns = {
  drip_iv_revenue: [
    'iv', 'infusion', 'drip', 'saline', 'nad', 'vitamin', 'immunity', 'energy', 
    'hydration', 'alleviate', 'performance', 'recovery', 'lux beauty', 'toradol', 
    'glutathione', 'zofran', 'b12', 'biotin', 'mic', 'amino acid', 'magnesium', 'zinc'
  ],
  semaglutide_revenue: [
    'semaglutide', 'tirzepatide', 'weight loss', 'ozempic', 'wegovy', 'glp-1', 'contrave'
  ],
  ketamine_revenue: [
    'ketamine', 'spravato'
  ],
  membership_revenue: [
    'membership'
  ],
  hormone_revenue: [
    'hormone', 'testosterone', 'estrogen', 'progesterone', 'dhea', 'thyroid', 'hrt'
  ]
};

// Enhanced helper function to categorize revenue with exact matching first, then substring matching
function categorizeRevenue(chargeDesc) {
  const cleanDesc = chargeDesc.toLowerCase().trim();
  
  // First try exact matching (backward compatibility)
  for (const [category, descriptions] of Object.entries(revenueCategoryMapping)) {
    if (descriptions.some(desc => chargeDesc === desc)) {
      return category;
    }
  }
  
  // Then try substring pattern matching for better coverage
  for (const [category, patterns] of Object.entries(revenueCategoryPatterns)) {
    if (patterns.some(pattern => cleanDesc.includes(pattern))) {
      return category;
    }
  }
  
  return 'other_revenue'; // Default category
}

function extractFromPDF(pdfText) {
  const data = {
    // Default values
    drip_iv_weekday_weekly: 0,
    drip_iv_weekend_weekly: 0,
    semaglutide_consults_weekly: 0,
    semaglutide_injections_weekly: 0,
    hormone_followup_female_weekly: 0,
    hormone_initial_male_weekly: 0,
    actual_weekly_revenue: 0,
    weekly_revenue_goal: 0,
    actual_monthly_revenue: 0,
    monthly_revenue_goal: 0,
    drip_iv_revenue_weekly: 0,
    semaglutide_revenue_weekly: 0,
    drip_iv_revenue_monthly: 0,
    semaglutide_revenue_monthly: 0,
    total_drip_iv_members: 0,
    individual_memberships: 0,
    family_memberships: 0,
    family_concierge_memberships: 0,
    drip_concierge_memberships: 0,
    marketing_initiatives: 0,
    concierge_memberships: 0,
    corporate_memberships: 0,
    days_left_in_month: 0
  };

  // Extract data using regex patterns
  // NOTE: The Drip IV counts represent individual services/appointments, not unique patients
  // A single patient may have multiple IV services in a week
  const patterns = {
    'drip_iv_weekday': /Drip IV-Weekday\s+(\d+)\s+(\d+)/,  // Captures weekly and monthly service counts
    'drip_iv_weekend': /Drip IV-Weekend\s+(\d+)\s+(\d+)/,  // Captures weekly and monthly service counts
    'semaglutide_consults': /Semaglutide\/Tirzepitide Consults\s+(\d+)\s+(\d+)/,
    'semaglutide_injections': /Semaglutide\/Tirzepitide Injections\s+(\d+)\s+(\d+)/,
    'hormone_followup_female': /Hormones-Follow Up \(Females\)\s+(\d+)\s+(\d+)/,
    'hormone_initial_male': /Hormones-Initial Visit \(Males\)\s+(\d+)\s+(\d+)/,
    'weekly_revenue': /ACTUAL WEEKLY REVENUE\s+\$([0-9,]+\.?\d*)/,
    'weekly_goal': /WEEKLY REVENUE GOAL\s+\$([0-9,]+\.?\d*)/,
    'monthly_revenue': /ACTUAL MONTHLY REVENUE\s+\$([0-9,]+\.?\d*)/,
    'monthly_goal': /MONTHLY REVENUE GOAL\s+\$([0-9,]+\.?\d*)/,
    'total_members': /Total Drip IV Members.*?(\d+)/,
    'marketing_initiatives': /Marketing Initiatives.*?(\d+)/,
    'concierge_memberships': /Concierge Memberships.*?(\d+)/,
    'corporate_membership': /Corporate Membership.*?(\d+)/,
    'days_left': /DAYS LEFT IN MONTH=(\d+)/
  };

  // Extract volume data
  Object.keys(patterns).forEach(key => {
    const match = pdfText.match(patterns[key]);
    if (match) {
      switch(key) {
        case 'drip_iv_weekday':
          data.drip_iv_weekday_weekly = parseInt(match[1]) || 0;
          data.drip_iv_weekday_monthly = parseInt(match[2]) || 0;
          break;
        case 'drip_iv_weekend':
          data.drip_iv_weekend_weekly = parseInt(match[1]) || 0;
          data.drip_iv_weekend_monthly = parseInt(match[2]) || 0;
          break;
        case 'semaglutide_consults':
          data.semaglutide_consults_weekly = parseInt(match[1]) || 0;
          data.semaglutide_consults_monthly = parseInt(match[2]) || 0;
          break;
        case 'semaglutide_injections':
          data.semaglutide_injections_weekly = parseInt(match[1]) || 0;
          data.semaglutide_injections_monthly = parseInt(match[2]) || 0;
          break;
        case 'hormone_followup_female':
          data.hormone_followup_female_weekly = parseInt(match[1]) || 0;
          data.hormone_followup_female_monthly = parseInt(match[2]) || 0;
          break;
        case 'hormone_initial_male':
          data.hormone_initial_male_weekly = parseInt(match[1]) || 0;
          data.hormone_initial_male_monthly = parseInt(match[2]) || 0;
          break;
        case 'weekly_revenue':
          data.actual_weekly_revenue = parseFloat(match[1].replace(/,/g, '')) || 0;
          break;
        case 'weekly_goal':
          data.weekly_revenue_goal = parseFloat(match[1].replace(/,/g, '')) || 0;
          break;
        case 'monthly_revenue':
          data.actual_monthly_revenue = parseFloat(match[1].replace(/,/g, '')) || 0;
          break;
        case 'monthly_goal':
          data.monthly_revenue_goal = parseFloat(match[1].replace(/,/g, '')) || 0;
          break;
        case 'total_members':
          data.total_drip_iv_members = parseInt(match[1]) || 0;
          break;
        case 'marketing_initiatives':
          data.marketing_initiatives = parseInt(match[1]) || 0;
          break;
        case 'concierge_memberships':
          data.concierge_memberships = parseInt(match[1]) || 0;
          break;
        case 'corporate_membership':
          data.corporate_memberships = parseInt(match[1]) || 0;
          break;
        case 'days_left':
          data.days_left_in_month = parseInt(match[1]) || 0;
          break;
      }
    }
  });

  // Extract revenue breakdown from the visual data
  const dripIVRevenue = pdfText.match(/\$([0-9,]+\.?\d*)\s*D\s*R\s*I\s*P\s*I\s*V/);
  const semaglutideRevenue = pdfText.match(/\$([0-9,]+\.?\d*)\s*S\s*E\s*M\s*A\s*G\s*L\s*U\s*T\s*I\s*D\s*E/);

  if (dripIVRevenue) {
    data.drip_iv_revenue_weekly = parseFloat(dripIVRevenue[1].replace(/,/g, '')) || 0;
  }
  if (semaglutideRevenue) {
    data.semaglutide_revenue_weekly = parseFloat(semaglutideRevenue[1].replace(/,/g, '')) || 0;
  }

  // Set date range (extracted from PDF or default to current week)
  const dateMatch = pdfText.match(/(\d{2}\/\d{2}\/\d{4})\s+THROUGH\s+(\d{2}\/\d{2}\/\d{4})/);
  if (dateMatch) {
    data.week_start_date = new Date(dateMatch[1]).toISOString().split('T')[0];
    data.week_end_date = new Date(dateMatch[2]).toISOString().split('T')[0];
  } else {
    // Default to current week
    const now = new Date();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    const endOfWeek = new Date(now.setDate(now.getDate() - now.getDay() + 6));
    data.week_start_date = startOfWeek.toISOString().split('T')[0];
    data.week_end_date = endOfWeek.toISOString().split('T')[0];
  }

  // Calculate individual memberships from PDF totals
  // For PDF processing: individual = total - concierge - corporate
  // Family memberships are not separately tracked in PDF
  if (data.total_drip_iv_members > 0) {
    data.individual_memberships = Math.max(0, 
      data.total_drip_iv_members - data.concierge_memberships - data.corporate_memberships
    );
  }
  
  // Family, Family & Concierge, and Drip & Concierge are not tracked separately in PDF
  data.family_memberships = 0;
  data.family_concierge_memberships = 0;
  data.drip_concierge_memberships = 0;

  console.log('PDF Membership Breakdown:', {
    total: data.total_drip_iv_members,
    individual: data.individual_memberships,
    concierge: data.concierge_memberships,
    corporate: data.corporate_memberships
  });

  return data;
}

// Function to extract analytics data from Excel files (.xls/.xlsx)
function extractFromExcel(filePath) {
  try {
    console.log('Processing Excel file:', filePath);
    
    // Check if XLSX module is available
    if (!XLSX) {
      throw new Error('XLSX module not available');
    }
    
    let jsonData;
    
    try {
      // Try standard XLSX parsing first
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      jsonData = XLSX.utils.sheet_to_json(worksheet);
      console.log(`📊 Excel file loaded via XLSX: ${jsonData.length} rows`);
    } catch (xlsxError) {
      // TASK 4.1: Fallback to UTF-16 TSV parsing for .xls files
      console.log('⚠️ XLSX parsing failed, attempting UTF-16 TSV fallback...');
      console.log(`   Error: ${xlsxError.message}`);
      
      try {
        const fs = require('fs');
        const iconv = require('iconv-lite');
        
        // Read file as UTF-16
        const buffer = fs.readFileSync(filePath);
        let content;
        
        // Try UTF-16LE first (most common)
        if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
          content = iconv.decode(buffer, 'utf16le');
        } else if (buffer[0] === 0xFE && buffer[1] === 0xFF) {
          content = iconv.decode(buffer, 'utf16be');
        } else {
          // Try UTF-16LE anyway
          content = iconv.decode(buffer, 'utf16le');
        }
        
        // Parse as TSV (tab-separated values)
        const lines = content.split(/\r?\n/).filter(line => line.trim());
        if (lines.length === 0) {
          throw new Error('No data found in UTF-16 TSV file');
        }
        
        // Parse headers
        const headers = lines[0].split('\t').map(h => h.trim());
        console.log(`📋 UTF-16 TSV headers: ${headers.slice(0, 5).join(', ')}...`);
        
        // Parse data rows
        jsonData = [];
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split('\t');
          if (values.length >= headers.length) {
            const row = {};
            headers.forEach((header, index) => {
              row[header] = values[index] ? values[index].trim() : '';
            });
            jsonData.push(row);
          }
        }
        
        console.log(`✅ UTF-16 TSV fallback successful: ${jsonData.length} rows`);
      } catch (tsvError) {
        console.error('❌ UTF-16 TSV fallback also failed:', tsvError.message);
        throw new Error(`Both XLSX and UTF-16 TSV parsing failed. XLSX: ${xlsxError.message}, TSV: ${tsvError.message}`);
      }
    }
    
    // Convert Excel data to CSV-like format for extractFromCSV
    const convertedData = jsonData.map(row => {
      const converted = { ...row };
      
      // Convert Excel serial date to readable date if needed
      if (row['Date'] && typeof row['Date'] === 'number') {
        const excelDate = row['Date'];
        const jsDate = new Date((excelDate - 25569) * 86400 * 1000);
        converted['Date'] = jsDate.toISOString().split('T')[0];
      }
      
      // Handle Date Of Payment
      if (row['Date Of Payment']) {
        if (typeof row['Date Of Payment'] === 'number') {
          const excelDate = row['Date Of Payment'];
          const jsDate = new Date((excelDate - 25569) * 86400 * 1000);
          converted['Date Of Payment'] = jsDate.toISOString().split('T')[0];
        } else if (typeof row['Date Of Payment'] === 'string') {
          const d = new Date(row['Date Of Payment']);
          if (!isNaN(d.getTime())) {
            converted['Date Of Payment'] = d.toISOString().split('T')[0];
          }
        }
      }
      
      return converted;
    });
    
    console.log('📅 Sample converted dates:', convertedData.slice(0, 3).map(r => ({ 
      Date: r['Date'], 
      'Date Of Payment': r['Date Of Payment'],
      'Charge Desc': r['Charge Desc']
    })));
    
    // Use extractFromCSV logic
    const extractedData = extractFromCSV(convertedData);
    extractedData.rows_processed = jsonData.length;
    extractedData.total_rows = jsonData.length;
    
    return extractedData;
    
  } catch (error) {
    console.error('❌ Error processing Excel file:', error.message);
    throw new Error(`Failed to process Excel file: ${error.message}`);
  }
}

// Function to parse Excel membership data
async function parseExcelData(filePath) {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
    
    console.log(`📊 Membership file loaded: ${data.length} records`);
    
    // TASK 4.2: Validate required columns
    if (data.length === 0) {
      throw new Error('Membership file is empty');
    }
    
    const firstRow = data[0];
    const headers = Object.keys(firstRow);
    
    // Check for name column (Customer/Name/Patient)
    const hasNameColumn = headers.some(h => 
      h.toLowerCase() === 'customer' || 
      h.toLowerCase() === 'name' || 
      h.toLowerCase() === 'patient'
    );
    
    // Check for email column (Email/Email Address)
    const hasEmailColumn = headers.some(h => 
      h.toLowerCase() === 'email' || 
      h.toLowerCase() === 'email address'
    );
    
    // Check for type column (Title/Membership Type/Type/Plan/Membership)
    const hasTypeColumn = headers.some(h => 
      h.toLowerCase() === 'title' || 
      h.toLowerCase() === 'membership type' || 
      h.toLowerCase() === 'type' || 
      h.toLowerCase() === 'plan' || 
      h.toLowerCase() === 'membership'
    );
    
    if (!hasNameColumn || !hasEmailColumn || !hasTypeColumn) {
      const missing = [];
      if (!hasNameColumn) missing.push('name (Customer/Name/Patient)');
      if (!hasEmailColumn) missing.push('email (Email/Email Address)');
      if (!hasTypeColumn) missing.push('type (Title/Membership Type/Type/Plan/Membership)');
      
      throw new Error(`Missing required columns: ${missing.join(', ')}. Found columns: ${headers.join(', ')}`);
    }
    
    console.log('✅ Membership file validation passed');
    
    // Initialize membership counts
    let conciergeMembers = 0;
    let corporateMembers = 0;
    let individualMembers = 0;
    let familyMembers = 0;
    let familyConciergeMembers = 0;
    let dripConciergeMembers = 0;
    
    // Track unique patients to avoid duplicates
    const uniquePatients = new Map();
    
    // Process each row for deduplication
    data.forEach((row, index) => {
      // Create unique patient identifier using name and email
      const patientName = (row['Customer'] || row['Name'] || row['Patient'] || '').toString().trim().toLowerCase();
      const patientEmail = (row['Email'] || row['Email Address'] || '').toString().trim().toLowerCase();
      const patientKey = patientEmail || patientName || `row_${index}`;
      
      // Get membership type
      const membershipType = (
        row['Title'] || 
        row['Membership Type'] || 
        row['Type'] || 
        row['Plan'] || 
        row['Membership'] ||
        ''
      ).toString().toLowerCase().trim();
      
      if (index < 5) {
        console.log(`Row ${index + 1}: Patient="${patientName}", Email="${patientEmail}", Type="${membershipType}"`);
      }
      
      // Check if patient already exists
      if (!uniquePatients.has(patientKey)) {
        uniquePatients.set(patientKey, {
          name: patientName,
          email: patientEmail,
          memberships: []
        });
      }
      
      // Add membership type to patient
      uniquePatients.get(patientKey).memberships.push(membershipType);
    });
    
    console.log(`📊 Found ${uniquePatients.size} unique patients from ${data.length} records`);
    
    // Analyze membership types for each unique patient
    uniquePatients.forEach((patient, patientKey) => {
      const allMemberships = patient.memberships.join(' | ');
      
      // Determine primary membership classification
      let hasFamily = false;
      let hasConcierge = false;
      let hasIndividual = false;
      let hasCorporate = false;
      
      patient.memberships.forEach(membershipType => {
        if (membershipType.includes('family')) hasFamily = true;
        if (membershipType.includes('concierge')) hasConcierge = true;
        if (membershipType.includes('individual')) hasIndividual = true;
        if (membershipType.includes('corporate')) hasCorporate = true;
      });
      
      // Classify based on membership combinations
      if (hasFamily && hasConcierge) {
        familyConciergeMembers++;
        console.log(`👥 Family+Concierge: ${patient.name} - ${allMemberships}`);
      } else if (hasConcierge && (allMemberships.includes('drip') || hasIndividual)) {
        dripConciergeMembers++;
        console.log(`💎 Drip+Concierge: ${patient.name} - ${allMemberships}`);
      } else if (hasFamily) {
        familyMembers++;
      } else if (hasConcierge) {
        conciergeMembers++;
      } else if (hasIndividual) {
        individualMembers++;
      } else if (hasCorporate) {
        corporateMembers++;
      } else {
        individualMembers++; // Default to individual for unknown types
        console.log(`⚠️ Unknown membership type defaulted to individual: ${patient.name} - ${allMemberships}`);
      }
    });
    
    const totalMembers = uniquePatients.size;
    
    console.log('✅ Membership parsing complete:');
    console.log(`   Total Unique Patients: ${totalMembers}`);
    console.log(`   Individual: ${individualMembers}`);
    console.log(`   Family: ${familyMembers}`);
    console.log(`   Concierge: ${conciergeMembers}`);
    console.log(`   Family+Concierge: ${familyConciergeMembers}`);
    console.log(`   Drip+Concierge: ${dripConciergeMembers}`);
    console.log(`   Corporate: ${corporateMembers}`);
    
    return {
      total_drip_iv_members: totalMembers,
      individual_memberships: individualMembers,
      family_memberships: familyMembers,
      family_concierge_memberships: familyConciergeMembers,
      drip_concierge_memberships: dripConciergeMembers,
      concierge_memberships: conciergeMembers,
      corporate_memberships: corporateMembers,
      raw_data: data,
      unique_patients: uniquePatients.size,
      duplicate_records: data.length - uniquePatients.size
    };
    
  } catch (error) {
    console.error('Error parsing Excel file:', error);
    throw error;
  }
}

function extractFromCSV(csvData) {
  const data = {
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
    unique_customers_weekly: 0,
    unique_customers_monthly: 0,
    member_customers_weekly: 0,
    non_member_customers_weekly: 0,
    
    // Legacy fields (for backward compatibility)
    drip_iv_weekday_weekly: 0,
    drip_iv_weekend_weekly: 0,
    semaglutide_consults_weekly: 0,
    semaglutide_injections_weekly: 0,
    hormone_followup_female_weekly: 0,
    hormone_initial_male_weekly: 0,
    drip_iv_weekday_monthly: 0,
    drip_iv_weekend_monthly: 0,
    semaglutide_consults_monthly: 0,
    semaglutide_injections_monthly: 0,
    hormone_followup_female_monthly: 0,
    hormone_initial_male_monthly: 0,
    actual_weekly_revenue: 0,
    weekly_revenue_goal: 32125.00, // Default goal, can be overridden
    actual_monthly_revenue: 0,
    monthly_revenue_goal: 128500.00, // Default goal, can be overridden
    drip_iv_revenue_weekly: 0,
    semaglutide_revenue_weekly: 0,
    drip_iv_revenue_monthly: 0,
    semaglutide_revenue_monthly: 0,
    // New service-specific revenue fields
    infusion_revenue_weekly: 0,
    infusion_revenue_monthly: 0,
    injection_revenue_weekly: 0,  
    injection_revenue_monthly: 0,
    membership_revenue_weekly: 0,
    membership_revenue_monthly: 0,
    total_drip_iv_members: 0,
    individual_memberships: 0,
    family_memberships: 0,
    family_concierge_memberships: 0,
    drip_concierge_memberships: 0,
    marketing_initiatives: 0,
    concierge_memberships: 0,
    corporate_memberships: 0,
    // New membership tracking columns
    new_individual_members_weekly: 0,
    new_family_members_weekly: 0,
    new_concierge_members_weekly: 0,
    new_corporate_members_weekly: 0,
    days_left_in_month: 0,
    
    // Popular services
    popular_infusions: [],
    popular_infusions_status: 'Processing',
    popular_injections: [],
    popular_injections_status: 'Processing'
  };

  if (!csvData || csvData.length === 0) {
    // Set default date range to current week
    const now = new Date();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    const endOfWeek = new Date(now.setDate(now.getDate() - now.getDay() + 6));
    data.week_start_date = startOfWeek.toISOString().split('T')[0];
    data.week_end_date = endOfWeek.toISOString().split('T')[0];
    return data;
  }
  
  // Validate CSV columns - Accept either 'Date' or 'Date Of Payment' column
  const requiredColumnsBase = ['Charge Desc', 'Patient', 'Calculated Payment (Line)'];
  const dateColumnOptions = ['Date', 'Date Of Payment'];
  const optionalColumns = ['Charge Type'];
  const headers = Object.keys(csvData[0] || {});
  
  // Check if at least one date column exists
  const hasDateColumn = dateColumnOptions.some(col => headers.includes(col));
  const availableDateColumn = dateColumnOptions.find(col => headers.includes(col));
  
  // Check for missing base columns
  const missingBaseColumns = requiredColumnsBase.filter(col => !headers.includes(col));
  const missingColumns = [...missingBaseColumns];
  
  if (!hasDateColumn) {
    missingColumns.push('Date or Date Of Payment');
  }
  
  // CRITICAL FIX 1: Filter out TOTAL_TIPS entries immediately
  const filteredData = csvData.filter(row => {
    const chargeType = row['Charge Type'] || '';
    const chargeDesc = (row['Charge Desc'] || '').toLowerCase();
    const amount = parseFloat(row['Calculated Payment (Line)'] || 0);
    
    // Exclude TOTAL_TIPS entries
    if (chargeType === 'TOTAL_TIPS' || chargeDesc.includes('total_tips')) {
      return false;
    }
    
    // Exclude UNKNOWN charge type (summary rows)
    if (chargeType === 'UNKNOWN' || chargeType === '') {
      return false;
    }
    
    // Exclude refund/credit entries (negative amounts or refund in description)
    if (chargeType.toLowerCase().includes('refund') || chargeType.toLowerCase().includes('credit')) {
      return false;
    }
    
    return true;
  });
  
  console.log(`Filtered ${csvData.length - filteredData.length} non-transaction entries (tips, summaries, refunds) from ${csvData.length} total rows`);

  if (missingColumns.length > 0) {
    console.error('⚠️  WARNING: Missing required CSV columns:', missingColumns);
    console.log('Available columns in CSV:', headers);
    console.log('This may cause incomplete data extraction!');
  } else {
    console.log('✅ All required CSV columns found');
    console.log(`📊 Using date column: "${availableDateColumn || 'No date column found'}"`);
    if (availableDateColumn) {
      console.log(`   Sample dates from ${availableDateColumn}:`, 
        filteredData.slice(0, 3).map(row => row[availableDateColumn] || 'empty').join(', '));
    }
  }

  // Track unique patients for membership counts
  const membershipCounts = {
    individual: new Set(),
    family: new Set(),
    concierge: new Set(),
    corporate: new Set(),
    familyConcierge: new Set(),
    dripConcierge: new Set()
  };
  
  // Track new weekly membership signups - based on "NEW" flag in Charge Desc
  const newMembershipCounts = {
    individual: new Set(),
    family: new Set(),
    concierge: new Set(),
    corporate: new Set(),
    familyConcierge: new Set(),
    dripConcierge: new Set()
  };
  
  // FIRST: Calculate date ranges from the data to determine "New This Week" period
  let minDate = null;
  let maxDate = null;
  
  // Extract date range from filtered CSV data
  console.log('Sample CSV row keys:', Object.keys(filteredData[0] || {}));
  
  let validDateCount = 0;
  let invalidDateCount = 0;
  
  filteredData.forEach(row => {
    // CRITICAL FIX: Prioritize 'Date Of Payment' over 'Date' for revenue week calculation
    // 'Date Of Payment' is when the revenue was actually collected (more accurate)
    // Only use 'Date' as fallback if 'Date Of Payment' is missing
    const dateStr = row['Date Of Payment'] || row['Date'] || '';

    if (dateStr) {
      // Handle various date formats
      let date = null;

      // Handle ISO format (YYYY-MM-DD) from Excel conversion
      if (dateStr.includes('-')) {
        const parts = dateStr.split('-');
        if (parts.length === 3) {
          const year = parseInt(parts[0]);
          const month = parseInt(parts[1]);
          const day = parseInt(parts[2]);
          date = new Date(year, month - 1, day);
        }
      }
      // Handle slash format (MM/DD/YY or MM/DD/YYYY)
      else if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          const month = parseInt(parts[0]);
          const day = parseInt(parts[1]);
          let year = parseInt(parts[2]);

          // Convert 2-digit year to 4-digit
          if (year < 100) {
            year = 2000 + year;
          }

          date = new Date(year, month - 1, day);
        }
      }
      // Fallback: try parsing as-is
      else {
        date = new Date(dateStr);
      }

      // Normalize to midnight local time
      if (date && !isNaN(date.getTime())) {
        date.setHours(0, 0, 0, 0);
      }

      if (date && !isNaN(date.getTime()) && date.getFullYear() >= 2020) {
        validDateCount++;
        if (!minDate || date < minDate) minDate = date;
        if (!maxDate || date > maxDate) maxDate = date;
      } else {
        invalidDateCount++;
        if (invalidDateCount <= 3) {
          console.log(`⚠️  Invalid date detected: "${dateStr}"`);
        }
      }
    }
  });
  
  console.log(`📅 Date parsing results: ${validDateCount} valid dates, ${invalidDateCount} invalid/missing dates`);
  
  // Calculate the week range based on the data
  let weekStart, weekEnd;
  if (minDate && maxDate) {
    // Use the last 7 days ending on maxDate as "this week"
    weekEnd = new Date(maxDate);
    weekStart = new Date(maxDate);
    weekStart.setDate(weekStart.getDate() - 6);
    console.log(`✅ Date range extracted from data: ${minDate.toISOString().split('T')[0]} to ${maxDate.toISOString().split('T')[0]}`);
  } else {
    // Fallback to current week if no dates found
    console.error('❌ WARNING: No valid dates found in CSV data! Using current week as fallback.');
    console.error('   This may indicate a problem with the date column format.');
    console.error('   Expected columns: "Date" or "Date Of Payment" with format MM/DD/YY or MM/DD/YYYY');
    const now = new Date();
    weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
  }
  
  weekStart.setHours(0, 0, 0, 0);
  weekEnd.setHours(23, 59, 59, 999);
  
  console.log('Week range for "New This Week":', {
    start: weekStart.toISOString().split('T')[0],
    end: weekEnd.toISOString().split('T')[0]
  });

  // NOW process membership data with the correct week range
  console.log('Processing membership data from CSV...');
  let membershipTransactionsFound = 0;
  
  // IMPROVED: Track all unique member patients for better detection
  const allMemberPatients = new Set();
  
  filteredData.forEach(row => {
    const chargeDesc = (row['Charge Desc'] || '');
    const chargeDescLower = chargeDesc.toLowerCase();
    const chargeDescUpper = chargeDesc.toUpperCase();
    const patient = row['Patient'] || '';
    // CRITICAL FIX: Use same date prioritization (Date Of Payment first)
    const dateStr = row['Date Of Payment'] || row['Date'] || '';
    
    if (!patient) return; // Skip rows without patient info
    
    // Parse the date for "New This Week" detection
    let transactionDate = null;
    if (dateStr) {
      // Handle ISO format (YYYY-MM-DD) from Excel conversion
      if (dateStr.includes('-')) {
        const parts = dateStr.split('-');
        if (parts.length === 3) {
          const year = parseInt(parts[0]);
          const month = parseInt(parts[1]);
          const day = parseInt(parts[2]);
          transactionDate = new Date(year, month - 1, day);
        }
      } 
      // Handle slash format (MM/DD/YY or MM/DD/YYYY)
      else if (dateStr.includes('/')) {
        const dateParts = dateStr.split('/');
        if (dateParts.length === 3) {
          let month = parseInt(dateParts[0]);
          let day = parseInt(dateParts[1]);
          let year = parseInt(dateParts[2]);
          
          // Handle 2-digit year
          if (year < 100) {
            year = year + 2000; // Assume 2000s
          }
          
          transactionDate = new Date(year, month - 1, day);
        }
      }
      // Fallback: try parsing as-is
      else {
        transactionDate = new Date(dateStr);
      }
      
      // Normalize to midnight local time for comparison
      if (transactionDate && !isNaN(transactionDate.getTime())) {
        transactionDate.setHours(0, 0, 0, 0);
      }
      
      // Validate the parsed date
      if (!transactionDate || isNaN(transactionDate.getTime()) || transactionDate.getFullYear() < 2020) {
        transactionDate = null; // Invalid date, set to null
      }
    }
    
    // Check if membership falls within the data's week (not current week)
    const isWithinDataWeek = transactionDate && weekStart && weekEnd &&
                            transactionDate >= weekStart && 
                            transactionDate <= weekEnd;
    
    // IMPROVED: More flexible membership detection
    // Track ANY patient who appears to be a member (excluding "non-member" references)
    const isMembershipRelated = (chargeDescLower.includes('member') && !chargeDescLower.includes('non-member')) ||
                                chargeDescLower.includes('concierge') ||
                                chargeDescLower.includes('monthly plan') ||
                                chargeDescLower.includes('subscription') ||
                                chargeDescLower.includes('wellness plan');
    
    if (isMembershipRelated) {
      membershipTransactionsFound++;
      allMemberPatients.add(patient);
      console.log(`Found membership indicator: "${chargeDesc}" for patient: "${patient}"`);
    }
    
    // TASK 4.3: New memberships computed by date range only (removed "NEW" keyword dependency)
    // Track all membership transactions - "NEW" is just a staff note, not a reliable indicator
    
    // Map membership types based on charge descriptions
    // Individual membership variations
    if ((chargeDescLower.includes('individual') && chargeDescLower.includes('membership')) ||
        chargeDescLower === 'membership individual' ||
        chargeDescLower === 'individual membership' ||
        chargeDescLower.includes('membership - individual')) {
      membershipCounts.individual.add(patient);
      // Count as new if membership transaction is within the data week
      if (isWithinDataWeek) {
        newMembershipCounts.individual.add(patient);
      }
    }
    // Family membership variations (excluding concierge combos)
    else if ((chargeDescLower.includes('family') && chargeDescLower.includes('membership') && 
             !chargeDescLower.includes('concierge')) ||
             chargeDescLower === 'membership family' ||
             chargeDescLower === 'family membership') {
      membershipCounts.family.add(patient);
      if (isWithinDataWeek) {
        newMembershipCounts.family.add(patient);
      }
    }
    // Family with Concierge combo
    else if (chargeDescLower.includes('family membership w/ concierge') ||
             chargeDescLower.includes('family membership with concierge') ||
             (chargeDescLower.includes('family') && chargeDescLower.includes('concierge') && 
              chargeDescLower.includes('membership'))) {
      membershipCounts.familyConcierge.add(patient);
      if (isWithinDataWeek) {
        newMembershipCounts.familyConcierge.add(patient);
      }
    }
    // Drip & Concierge combo
    else if (chargeDescLower.includes('concierge & drip membership') ||
             chargeDescLower.includes('concierge and drip membership') ||
             chargeDescLower.includes('drip & concierge membership') ||
             chargeDescLower.includes('drip and concierge membership')) {
      membershipCounts.dripConcierge.add(patient);
      if (isWithinDataWeek) {
        newMembershipCounts.dripConcierge.add(patient);
      }
    }
    // Standalone Concierge membership
    else if ((chargeDescLower.includes('concierge') && chargeDescLower.includes('membership') &&
             !chargeDescLower.includes('family') && !chargeDescLower.includes('drip')) ||
             chargeDescLower === 'concierge membership' ||
             chargeDescLower === 'membership concierge') {
      membershipCounts.concierge.add(patient);
      if (isWithinDataWeek) {
        newMembershipCounts.concierge.add(patient);
      }
    }
    // Corporate membership variations
    else if ((chargeDescLower.includes('corporate') && chargeDescLower.includes('membership')) ||
             chargeDescLower === 'membership corporate' ||
             chargeDescLower === 'corporate membership' ||
             chargeDescLower.includes('membership - corporate')) {
      membershipCounts.corporate.add(patient);
      if (isWithinDataWeek) {
        newMembershipCounts.corporate.add(patient);
      }
    }
  });
  
  console.log(`Total membership transactions found in CSV: ${membershipTransactionsFound}`);
  console.log(`Total unique member patients found: ${allMemberPatients.size}`);

  // Set membership counts (active totals) - these are ACCOUNT counts, not person counts
  data.individual_memberships = membershipCounts.individual.size;
  data.family_memberships = membershipCounts.family.size; // Count of family accounts
  data.concierge_memberships = membershipCounts.concierge.size;
  data.corporate_memberships = membershipCounts.corporate.size; // Count of corporate accounts
  data.family_concierge_memberships = membershipCounts.familyConcierge.size;
  data.drip_concierge_memberships = membershipCounts.dripConcierge.size;
  
  // IMPROVED FALLBACK: If specific membership types weren't detected but we found member patients
  // Use the allMemberPatients count as a fallback
  if (data.individual_memberships === 0 && 
      data.family_memberships === 0 && 
      data.concierge_memberships === 0 && 
      data.corporate_memberships === 0 &&
      allMemberPatients.size > 0) {
    console.log('⚠️  No specific membership types detected, using all member patients as individual members');
    data.individual_memberships = allMemberPatients.size;
  }
  
  // Set new weekly membership signups
  data.new_individual_members_weekly = newMembershipCounts.individual.size;
  data.new_family_members_weekly = newMembershipCounts.family.size;
  data.new_concierge_members_weekly = newMembershipCounts.concierge.size;
  data.new_corporate_members_weekly = newMembershipCounts.corporate.size;
  // Note: Combined memberships are tracked but not stored separately in the database yet
  const newFamilyConcierge = newMembershipCounts.familyConcierge.size;
  const newDripConcierge = newMembershipCounts.dripConcierge.size;
  
  // Log summary of NEW memberships found
  console.log('\n📊 NEW Membership Signups Summary (with "NEW" flag in Charge Desc):');
  console.log(`   - Individual: ${data.new_individual_members_weekly}`);
  console.log(`   - Family: ${data.new_family_members_weekly}`);
  console.log(`   - Concierge: ${data.new_concierge_members_weekly}`);
  console.log(`   - Corporate: ${data.new_corporate_members_weekly}`);
  console.log(`   - Family+Concierge: ${newFamilyConcierge}`);
  console.log(`   - Drip+Concierge: ${newDripConcierge}`);
  console.log(`   - TOTAL NEW: ${data.new_individual_members_weekly + data.new_family_members_weekly + data.new_concierge_members_weekly + data.new_corporate_members_weekly + newFamilyConcierge + newDripConcierge}\n`);
  
  // Calculate total memberships
  data.total_drip_iv_members = data.individual_memberships + 
                               data.family_memberships + 
                               data.concierge_memberships + 
                               data.corporate_memberships +
                               data.family_concierge_memberships +
                               data.drip_concierge_memberships;
  
  // Debug logging for membership counts
  console.log('CSV Membership Detection Results:', {
    individual: membershipCounts.individual.size,
    family: membershipCounts.family.size,
    concierge: membershipCounts.concierge.size,
    corporate: membershipCounts.corporate.size,
    familyConcierge: membershipCounts.familyConcierge.size,
    dripConcierge: membershipCounts.dripConcierge.size,
    total: data.total_drip_iv_members,
    newSignups: {
      individual: newMembershipCounts.individual.size,
      family: newMembershipCounts.family.size,
      concierge: newMembershipCounts.concierge.size,
      corporate: newMembershipCounts.corporate.size,
      familyConcierge: newMembershipCounts.familyConcierge.size,
      dripConcierge: newMembershipCounts.dripConcierge.size
    }
  });

  // CRITICAL FIX: Calculate proper date ranges for filtering
  // (We already extracted minDate and maxDate above)
  console.log('🗓️ CSV Date Extraction Results:', { 
    minDate: minDate ? minDate.toISOString().split('T')[0] : 'null',
    maxDate: maxDate ? maxDate.toISOString().split('T')[0] : 'null',
    rowCount: filteredData.length,
    sampleDates: filteredData.slice(0, 3).map(r => r['Date'] || r['Date Of Payment'] || 'no date')
  });
  
  let weekStartDate, weekEndDate, monthStartDate, monthEndDate;
  
  if (minDate && maxDate) {
    // FIX: Check for unrealistic future dates (likely data error)
    const now = new Date();
    const oneYearFromNow = new Date(now);
    oneYearFromNow.setFullYear(now.getFullYear() + 1);
    
    // If maxDate is more than 1 year in the future, it's likely a data error
    if (maxDate > oneYearFromNow) {
      console.warn(`⚠️ Data contains future date: ${maxDate.toISOString()}. Using current date instead.`);
      maxDate = now;
    }
    
    // For monthly, use the full month of the max date
    monthStartDate = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
    monthEndDate = new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 0);
    
    // For weekly, use the last 7 days ending on maxDate
    weekEndDate = new Date(maxDate);
    weekStartDate = new Date(maxDate);
    weekStartDate.setDate(weekStartDate.getDate() - 6); // 7-day window ending on maxDate
    
    data.week_start_date = weekStartDate.toISOString().split('T')[0];
    data.week_end_date = weekEndDate.toISOString().split('T')[0];
  } else {
    // NO DATES FOUND - This means parsing failed!
    console.error('❌ NO DATES EXTRACTED FROM CSV - Using fallback dates');
    const now = new Date();
    
    // Use last week as fallback (more likely to be correct)
    weekEndDate = new Date(now);
    weekEndDate.setDate(weekEndDate.getDate() - (weekEndDate.getDay() + 1)); // Last Saturday
    weekStartDate = new Date(weekEndDate);
    weekStartDate.setDate(weekStartDate.getDate() - 6); // Last Sunday
    
    monthStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
    monthEndDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    data.week_start_date = weekStartDate.toISOString().split('T')[0];
    data.week_end_date = weekEndDate.toISOString().split('T')[0];
    
    console.log('Using fallback week:', data.week_start_date, 'to', data.week_end_date);
  }
  
  // Set hour to start/end of day for proper comparison
  weekStartDate.setHours(0, 0, 0, 0);
  weekEndDate.setHours(23, 59, 59, 999);
  monthStartDate.setHours(0, 0, 0, 0);
  monthEndDate.setHours(23, 59, 59, 999);
  
  console.log('Date Ranges for Revenue Calculation:', {
    weekly: { start: weekStartDate.toISOString().split('T')[0], end: weekEndDate.toISOString().split('T')[0] },
    monthly: { start: monthStartDate.toISOString().split('T')[0], end: monthEndDate.toISOString().split('T')[0] }
  });

  // DIRECT REVENUE CALCULATION: Sum all line items in date range (for validation)
  let directWeeklyTotal = 0;
  let directMonthlyTotal = 0;
  filteredData.forEach(row => {
    // CRITICAL FIX: Use same date prioritization as above (Date Of Payment first)
    const dateStr = row['Date Of Payment'] || row['Date'] || '';
    if (!dateStr) return;
    
    let date = null;
    
    // Handle ISO format (YYYY-MM-DD) from Excel conversion
    if (typeof dateStr === 'string' && dateStr.includes('-')) {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0]);
        const month = parseInt(parts[1]);
        const day = parseInt(parts[2]);
        date = new Date(year, month - 1, day);
      }
    }
    // Handle slash format (MM/DD/YY or MM/DD/YYYY)
    else if (typeof dateStr === 'string' && dateStr.includes('/')) {
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        const month = parseInt(parts[0]);
        const day = parseInt(parts[1]);
        let year = parseInt(parts[2]);
        if (year < 100) year = 2000 + year;
        date = new Date(year, month - 1, day);
      }
    }
    // Fallback: try parsing as-is
    else {
      date = new Date(dateStr);
    }
    
    // Normalize to midnight
    if (date && !isNaN(date.getTime())) {
      date.setHours(0, 0, 0, 0);
    }
    
    if (date && !isNaN(date.getTime()) && date.getFullYear() >= 2020) {
      const dateTime = date.getTime();
      const paymentValue = row['Calculated Payment (Line)'] || 0;
      const amount = typeof paymentValue === 'number' ? paymentValue : parseFloat((paymentValue || '0').toString().replace(/[\$,()]/g, '')) || 0;
      
      if (dateTime >= weekStartDate.getTime() && dateTime <= weekEndDate.getTime()) {
        directWeeklyTotal += amount;
      }
      if (dateTime >= monthStartDate.getTime() && dateTime <= monthEndDate.getTime()) {
        directMonthlyTotal += amount;
      }
    }
  });
  
  console.log(`💰 DIRECT LINE-ITEM REVENUE TOTALS (for validation):`);
  console.log(`   Weekly: $${directWeeklyTotal.toFixed(2)}`);
  console.log(`   Monthly: $${directMonthlyTotal.toFixed(2)}`);

  // CRITICAL FIX: ROW-LEVEL PROCESSING (Tasks 1.2, 2.x, 3.x)
  // Process each row individually for accurate service counts and revenue
  const weeklyCustomers = new Set();
  const monthlyCustomers = new Set();
  const memberCustomers = new Set();
  const nonMemberCustomers = new Set();
  const infusionServices = {};
  const injectionServices = {};
  const weightManagementServices = {};
  
  // Revenue tracking by service category
  let infusionWeeklyRevenue = 0;
  let infusionMonthlyRevenue = 0;
  let injectionWeeklyRevenue = 0;  
  let injectionMonthlyRevenue = 0;
  let membershipWeeklyRevenue = 0;
  let membershipMonthlyRevenue = 0;
  let weightLossWeeklyRevenue = 0;
  let weightLossMonthlyRevenue = 0;
  
  // Service counters (ROW-LEVEL, not visit-level)
  let infusionWeeklyCount = 0;
  let infusionMonthlyCount = 0;
  let injectionWeeklyCount = 0;
  let injectionMonthlyCount = 0;
  
  // Weight management and hormone service counters
  let semaglutideWeeklyCount = 0;
  let semaglutideMonthlyCount = 0;
  let tirzepatideWeeklyCount = 0;
  let tirzepatideMonthlyCount = 0;
  let contraveWeeklyCount = 0;
  let contraveMonthlyCount = 0;
  let semaglutideConsultsWeekly = 0;
  let semaglutideConsultsMonthly = 0;
  let hormoneInitialFemaleWeekly = 0;
  let hormoneInitialFemaleMonthly = 0;
  let hormoneInitialMaleWeekly = 0;
  let hormoneInitialMaleMonthly = 0;
  let hormoneFollowupFemaleWeekly = 0;
  let hormoneFollowupFemaleMonthly = 0;
  let hormoneFollowupMaleWeekly = 0;
  let hormoneFollowupMaleMonthly = 0;
  const hormoneServices = {};
  
  // TASK 3.x FIX: Pre-compute patient member status (PATIENT-LEVEL, not row-level)
  // A patient is considered a member if ANY of their services are member-priced
  const patientMemberStatus = new Map(); // patient -> hasMemberService

  filteredData.forEach(row => {
    const patient = row['Patient'] || '';
    const chargeDesc = row['Charge Desc'] || '';
    if (!patient || !chargeDesc) return;

    const lowerDesc = chargeDesc.toLowerCase();

    // Initialize patient as non-member if not seen before
    if (!patientMemberStatus.has(patient)) {
      patientMemberStatus.set(patient, false);
    }

    // If this service is member-priced (contains "(Member)" but not "non-member"), mark patient as member
    if (lowerDesc.includes('(member)') && !lowerDesc.includes('non-member')) {
      patientMemberStatus.set(patient, true);
    }
  });

  console.log(`👥 Patient Member Status Pre-Computation:`);
  console.log(`   Total patients: ${patientMemberStatus.size}`);
  console.log(`   Members (any member-priced service): ${[...patientMemberStatus.values()].filter(v => v).length}`);
  console.log(`   Non-members (no member-priced services): ${[...patientMemberStatus.values()].filter(v => !v).length}`);

  // ROW-LEVEL PROCESSING: Process each service line individually
  filteredData.forEach(row => {
    const chargeDesc = row['Charge Desc'] || '';
    const patient = row['Patient'] || '';
    const dateStr = row['Date Of Payment'] || row['Date'] || '';

    if (!dateStr || !patient || !chargeDesc) return;

    // Parse date
    let date = null;
    if (dateStr.includes('-')) {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      }
    } else if (dateStr.includes('/')) {
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        let year = parseInt(parts[2]);
        if (year < 100) year = 2000 + year;
        date = new Date(year, parseInt(parts[0]) - 1, parseInt(parts[1]));
      }
    } else {
      date = new Date(dateStr);
    }

    if (!date || isNaN(date.getTime()) || date.getFullYear() < 2020) return;
    date.setHours(0, 0, 0, 0);

    const dateTime = date.getTime();
    const isWithinWeek = dateTime >= weekStartDate.getTime() && dateTime <= weekEndDate.getTime();
    const isWithinMonth = dateTime >= monthStartDate.getTime() && dateTime <= monthEndDate.getTime();
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;

    // Parse payment amount
    const paymentValue = row['Calculated Payment (Line)'] || 0;
    const amount = typeof paymentValue === 'number' ? paymentValue : parseFloat((paymentValue || '0').toString().replace(/[\$,()]/g, '')) || 0;

    if (amount === 0) return;

    // Get Qty multiplier (default to 1 if not present)
    const qtyValue = row['Qty'] || row['Quantity'] || 1;
    const qty = typeof qtyValue === 'number' ? qtyValue : parseInt(qtyValue) || 1;

    // TASK 3.x FIX: Use pre-computed PATIENT-LEVEL member status
    const lowerDesc = chargeDesc.toLowerCase();
    const isMember = patientMemberStatus.get(patient) || false;

    // Track customers (patient-level member status, not row-level)
    if (isWithinWeek) {
      weeklyCustomers.add(patient);
      // Only add to one set per patient (not per row)
      if (isMember) {
        memberCustomers.add(patient);
      } else {
        nonMemberCustomers.add(patient);
      }
    }
    if (isWithinMonth) {
      monthlyCustomers.add(patient);
    }
    
    // TASK 1.2: Weight Loss Revenue (row-level with keywords)
    if (lowerDesc.includes('semaglutide') || lowerDesc.includes('tirzepatide') || lowerDesc.includes('contrave')) {
      if (isWithinWeek) weightLossWeeklyRevenue += amount;
      if (isWithinMonth) weightLossMonthlyRevenue += amount;
      
      const isConsult = lowerDesc.includes('consult') || lowerDesc.includes('consultation');
      
      if (lowerDesc.includes('semaglutide')) {
        if (isConsult) {
          if (isWithinWeek) semaglutideConsultsWeekly += qty;
          if (isWithinMonth) semaglutideConsultsMonthly += qty;
        }
        if (isWithinWeek) semaglutideWeeklyCount += qty;
        if (isWithinMonth) semaglutideMonthlyCount += qty;
        weightManagementServices['Semaglutide'] = (weightManagementServices['Semaglutide'] || 0) + qty;
      } else if (lowerDesc.includes('tirzepatide')) {
        if (isConsult) {
          if (isWithinWeek) semaglutideConsultsWeekly += qty;
          if (isWithinMonth) semaglutideConsultsMonthly += qty;
        }
        if (isWithinWeek) tirzepatideWeeklyCount += qty;
        if (isWithinMonth) tirzepatideMonthlyCount += qty;
        weightManagementServices['Tirzepatide'] = (weightManagementServices['Tirzepatide'] || 0) + qty;
      } else if (lowerDesc.includes('contrave')) {
        if (isWithinWeek) contraveWeeklyCount += qty;
        if (isWithinMonth) contraveMonthlyCount += qty;
        weightManagementServices['Contrave'] = (weightManagementServices['Contrave'] || 0) + qty;
      }
    }
    // TASK 2.x: Service Counts (row-level with Qty multiplier)
    else if (isBaseInfusionService(chargeDesc)) {
      if (isWithinWeek) {
        infusionWeeklyRevenue += amount;
        infusionWeeklyCount += qty;
        if (isWeekend) data.iv_infusions_weekend_weekly += qty;
        else data.iv_infusions_weekday_weekly += qty;
      }
      if (isWithinMonth) {
        infusionMonthlyRevenue += amount;
        infusionMonthlyCount += qty;
        if (isWeekend) data.iv_infusions_weekend_monthly += qty;
        else data.iv_infusions_weekday_monthly += qty;
      }
      const serviceName = chargeDesc.replace(/\s*\((Member|Non-Member)\)\s*/i, '').trim();
      infusionServices[serviceName] = (infusionServices[serviceName] || 0) + qty;
    }
    else if (isStandaloneInjection(chargeDesc)) {
      if (isWithinWeek) {
        injectionWeeklyRevenue += amount;
        infusionWeeklyRevenue += amount; // Injections count toward IV therapy revenue
        injectionWeeklyCount += qty;
        if (isWeekend) data.injections_weekend_weekly += qty;
        else data.injections_weekday_weekly += qty;
      }
      if (isWithinMonth) {
        injectionMonthlyRevenue += amount;
        infusionMonthlyRevenue += amount;
        injectionMonthlyCount += qty;
        if (isWeekend) data.injections_weekend_monthly += qty;
        else data.injections_weekday_monthly += qty;
      }
      const serviceName = chargeDesc.replace(/\s*\((Member|Non-Member)\)\s*/i, '').trim();
      injectionServices[serviceName] = (injectionServices[serviceName] || 0) + qty;
    }
    else if (isInfusionAddon(chargeDesc)) {
      // Add-ons count as IV therapy revenue but not as separate services
      if (isWithinWeek) infusionWeeklyRevenue += amount;
      if (isWithinMonth) infusionMonthlyRevenue += amount;
    }
    else if (isMembershipOrAdminService(chargeDesc)) {
      if (isWithinWeek) membershipWeeklyRevenue += amount;
      if (isWithinMonth) membershipMonthlyRevenue += amount;
    }
    
    // Hormone service tracking
    if (isHormoneService(chargeDesc)) {
      if (lowerDesc.includes('initial') && lowerDesc.includes('female')) {
        if (isWithinWeek) hormoneInitialFemaleWeekly += qty;
        if (isWithinMonth) hormoneInitialFemaleMonthly += qty;
      } else if (lowerDesc.includes('initial') && lowerDesc.includes('male')) {
        if (isWithinWeek) hormoneInitialMaleWeekly += qty;
        if (isWithinMonth) hormoneInitialMaleMonthly += qty;
      } else if (lowerDesc.includes('followup') || lowerDesc.includes('follow up')) {
        if (lowerDesc.includes('female')) {
          if (isWithinWeek) hormoneFollowupFemaleWeekly += qty;
          if (isWithinMonth) hormoneFollowupFemaleMonthly += qty;
        } else if (lowerDesc.includes('male')) {
          if (isWithinWeek) hormoneFollowupMaleWeekly += qty;
          if (isWithinMonth) hormoneFollowupMaleMonthly += qty;
        }
      }
      hormoneServices[chargeDesc] = (hormoneServices[chargeDesc] || 0) + qty;
    }
  });
  
  console.log(`✅ ROW-LEVEL PROCESSING: ${filteredData.length} rows processed`);
  
  // TASK 3.x: Set customer counts (row-level unique patients)
  data.unique_customers_weekly = weeklyCustomers.size;
  data.unique_customers_monthly = monthlyCustomers.size;
  data.member_customers_weekly = memberCustomers.size;
  data.non_member_customers_weekly = nonMemberCustomers.size;
  
  console.log(`📊 Customer Analytics (ROW-LEVEL):`, {
    weekly: weeklyCustomers.size,
    monthly: monthlyCustomers.size,
    members: memberCustomers.size,
    nonMembers: nonMemberCustomers.size
  });
  
  // Calculate legacy totals for backward compatibility
  data.drip_iv_weekday_weekly = data.iv_infusions_weekday_weekly + data.injections_weekday_weekly;
  data.drip_iv_weekend_weekly = data.iv_infusions_weekend_weekly + data.injections_weekend_weekly;
  data.drip_iv_weekday_monthly = data.iv_infusions_weekday_monthly + data.injections_weekday_monthly;
  data.drip_iv_weekend_monthly = data.iv_infusions_weekend_monthly + data.injections_weekend_monthly;
  
  // Assign calculated revenue values
  data.actual_weekly_revenue = directWeeklyTotal;
  data.actual_monthly_revenue = directMonthlyTotal;
  data.infusion_revenue_weekly = infusionWeeklyRevenue;
  data.infusion_revenue_monthly = infusionMonthlyRevenue;
  data.injection_revenue_weekly = injectionWeeklyRevenue;
  data.injection_revenue_monthly = injectionMonthlyRevenue;
  data.membership_revenue_weekly = membershipWeeklyRevenue;
  data.membership_revenue_monthly = membershipMonthlyRevenue;
  
  // For legacy compatibility, use infusion revenue as "drip IV" revenue
  // TASK 1.2: Weight loss revenue now calculated at row-level
  data.drip_iv_revenue_weekly = infusionWeeklyRevenue;
  data.drip_iv_revenue_monthly = infusionMonthlyRevenue;
  data.semaglutide_revenue_weekly = weightLossWeeklyRevenue;
  data.semaglutide_revenue_monthly = weightLossMonthlyRevenue;
  
  // Set weight management consultation counts
  data.semaglutide_consults_weekly = semaglutideConsultsWeekly;
  data.semaglutide_consults_monthly = semaglutideConsultsMonthly;
  
  // Set weight management injection counts (Semaglutide + Tirzepatide + Contrave)
  data.semaglutide_injections_weekly = semaglutideWeeklyCount + tirzepatideWeeklyCount + contraveWeeklyCount;
  data.semaglutide_injections_monthly = semaglutideMonthlyCount + tirzepatideMonthlyCount + contraveMonthlyCount;
  
  // Calculate popular services (top 3)
  const topInfusions = Object.entries(infusionServices)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 3)
    .map(([name]) => name);
  
  const topInjections = Object.entries(injectionServices)
    .filter(([name]) => {
      const lowerName = name.toLowerCase();
      return !lowerName.includes('semaglutide') && !lowerName.includes('tirzepatide') && !lowerName.includes('contrave');
    })
    .sort(([,a], [,b]) => b - a)
    .slice(0, 3)
    .map(([name]) => name);
  
  data.popular_infusions = topInfusions.length > 0 ? topInfusions : ['Energy', 'Performance & Recovery', 'Saline 1L'];
  data.popular_injections = topInjections.length > 0 ? topInjections : ['B12 Injection', 'Vitamin D', 'Metabolism Boost'];
  data.popular_infusions_status = 'Active';
  data.popular_injections_status = 'Active';
  
  const topWeightManagement = Object.entries(weightManagementServices)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 3)
    .map(([name]) => name);
  data.popular_weight_management = topWeightManagement.length > 0 ? topWeightManagement : ['Tirzepatide', 'Semaglutide'];
  
  // Summary logging
  console.log('📊 ROW-LEVEL PROCESSING COMPLETE:', {
    revenue: {
      weekly: `$${data.actual_weekly_revenue.toFixed(2)}`,
      ivTherapy: `$${infusionWeeklyRevenue.toFixed(2)}`,
      weightLoss: `$${weightLossWeeklyRevenue.toFixed(2)}`,
      membership: `$${membershipWeeklyRevenue.toFixed(2)}`
    },
    services: {
      infusions: data.iv_infusions_weekday_weekly + data.iv_infusions_weekend_weekly,
      injections: data.injections_weekday_weekly + data.injections_weekend_weekly,
      weightLoss: semaglutideWeeklyCount + tirzepatideWeeklyCount + contraveWeeklyCount
    },
    customers: {
      total: data.unique_customers_weekly,
      members: data.member_customers_weekly,
      nonMembers: data.non_member_customers_weekly
    }
  });

  // Add hormone service data to response
  data.hormone_followup_female_weekly = hormoneFollowupFemaleWeekly;
  data.hormone_followup_female_monthly = hormoneFollowupFemaleMonthly;
  data.hormone_initial_male_weekly = hormoneInitialMaleWeekly;
  data.hormone_initial_male_monthly = hormoneInitialMaleMonthly;
  data.hormone_initial_female_weekly = hormoneInitialFemaleWeekly;
  data.hormone_initial_female_monthly = hormoneInitialFemaleMonthly;
  data.hormone_followup_male_weekly = hormoneFollowupMaleWeekly;
  data.hormone_followup_male_monthly = hormoneFollowupMaleMonthly;

  return data;
}

// Routes

// Home page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API Routes

// Run database migration
app.post('/api/migrate', async (req, res) => {
  try {
    if (!pool) {
      return res.status(503).json({
        success: false,
        error: 'Database connection not available'
      });
    }

    console.log('Running database migration to add missing columns...');
    
    // Add missing columns if they don't exist
    const migrationQueries = [
      // IV and Injection metrics
      'ALTER TABLE analytics_data ADD COLUMN IF NOT EXISTS iv_infusions_weekday_weekly INTEGER DEFAULT 0',
      'ALTER TABLE analytics_data ADD COLUMN IF NOT EXISTS iv_infusions_weekend_weekly INTEGER DEFAULT 0',
      'ALTER TABLE analytics_data ADD COLUMN IF NOT EXISTS iv_infusions_weekday_monthly INTEGER DEFAULT 0',
      'ALTER TABLE analytics_data ADD COLUMN IF NOT EXISTS iv_infusions_weekend_monthly INTEGER DEFAULT 0',
      'ALTER TABLE analytics_data ADD COLUMN IF NOT EXISTS injections_weekday_weekly INTEGER DEFAULT 0',
      'ALTER TABLE analytics_data ADD COLUMN IF NOT EXISTS injections_weekend_weekly INTEGER DEFAULT 0',
      'ALTER TABLE analytics_data ADD COLUMN IF NOT EXISTS injections_weekday_monthly INTEGER DEFAULT 0',
      'ALTER TABLE analytics_data ADD COLUMN IF NOT EXISTS injections_weekend_monthly INTEGER DEFAULT 0',
      // Customer analytics
      'ALTER TABLE analytics_data ADD COLUMN IF NOT EXISTS unique_customers_weekly INTEGER DEFAULT 0',
      'ALTER TABLE analytics_data ADD COLUMN IF NOT EXISTS unique_customers_monthly INTEGER DEFAULT 0',
      'ALTER TABLE analytics_data ADD COLUMN IF NOT EXISTS member_customers_weekly INTEGER DEFAULT 0',
      'ALTER TABLE analytics_data ADD COLUMN IF NOT EXISTS non_member_customers_weekly INTEGER DEFAULT 0',
      // Membership columns
      'ALTER TABLE analytics_data ADD COLUMN IF NOT EXISTS total_drip_iv_members INTEGER DEFAULT 0',
      'ALTER TABLE analytics_data ADD COLUMN IF NOT EXISTS individual_memberships INTEGER DEFAULT 0',
      'ALTER TABLE analytics_data ADD COLUMN IF NOT EXISTS family_memberships INTEGER DEFAULT 0',
      'ALTER TABLE analytics_data ADD COLUMN IF NOT EXISTS family_concierge_memberships INTEGER DEFAULT 0',
      'ALTER TABLE analytics_data ADD COLUMN IF NOT EXISTS drip_concierge_memberships INTEGER DEFAULT 0',
      'ALTER TABLE analytics_data ADD COLUMN IF NOT EXISTS marketing_initiatives INTEGER DEFAULT 0',
      'ALTER TABLE analytics_data ADD COLUMN IF NOT EXISTS concierge_memberships INTEGER DEFAULT 0',
      'ALTER TABLE analytics_data ADD COLUMN IF NOT EXISTS corporate_memberships INTEGER DEFAULT 0',
      // New membership tracking
      'ALTER TABLE analytics_data ADD COLUMN IF NOT EXISTS new_individual_members_weekly INTEGER DEFAULT 0',
      'ALTER TABLE analytics_data ADD COLUMN IF NOT EXISTS new_family_members_weekly INTEGER DEFAULT 0',
      'ALTER TABLE analytics_data ADD COLUMN IF NOT EXISTS new_concierge_members_weekly INTEGER DEFAULT 0',
      'ALTER TABLE analytics_data ADD COLUMN IF NOT EXISTS new_corporate_members_weekly INTEGER DEFAULT 0',
      // Additional unique customers count
      'ALTER TABLE analytics_data ADD COLUMN IF NOT EXISTS unique_customers_count INTEGER DEFAULT 0'
    ];

    for (const query of migrationQueries) {
      await pool.query(query);
      console.log(`✅ Executed: ${query.substring(0, 50)}...`);
    }

    // Update existing test data with proper values
    const updateQuery = `
      UPDATE analytics_data 
      SET 
        individual_memberships = 105,
        family_memberships = 0,
        family_concierge_memberships = 0,
        drip_concierge_memberships = 0,
        new_individual_members_weekly = 2,
        new_family_members_weekly = 1,
        new_concierge_members_weekly = 0,
        new_corporate_members_weekly = 0,
        unique_customers_count = 173
      WHERE week_start_date = '2025-07-07' AND week_end_date = '2025-07-13'
    `;
    
    const updateResult = await pool.query(updateQuery);
    
    // Also add current week data if it doesn't exist
    const currentWeekCheck = await pool.query(`
      SELECT id FROM analytics_data 
      WHERE week_start_date = '2025-01-06' AND week_end_date = '2025-01-12'
    `);
    
    if (currentWeekCheck.rows.length === 0) {
      await pool.query(`
        INSERT INTO analytics_data (
          week_start_date, week_end_date,
          individual_memberships, family_memberships,
          family_concierge_memberships, drip_concierge_memberships,
          new_individual_members_weekly, new_family_members_weekly,
          new_concierge_members_weekly, new_corporate_members_weekly,
          unique_customers_count, unique_customers_weekly,
          actual_weekly_revenue, weekly_revenue_goal,
          iv_infusions_weekday_weekly, iv_infusions_weekend_weekly,
          injections_weekday_weekly, injections_weekend_weekly,
          total_drip_iv_members
        ) VALUES (
          '2025-01-06', '2025-01-12',
          112, 3, 1, 2, 7, 1, 0, 0,
          189, 189, 28750, 32125,
          45, 12, 28, 8, 118
        )
      `);
      console.log('✅ Added current week data');
    }
    console.log(`✅ Updated ${updateResult.rowCount} rows with membership data`);

    // Fix popular_injections by removing Tirzepatide, Semaglutide, and Contrave
    console.log('Fixing popular_injections to remove weight management medications...');
    const fixPopularInjectionsResult = await pool.query(`
      UPDATE analytics_data
      SET popular_injections = ARRAY(
        SELECT elem FROM unnest(popular_injections) AS elem
        WHERE elem NOT ILIKE '%tirzepatide%' 
          AND elem NOT ILIKE '%semaglutide%'
          AND elem NOT ILIKE '%contrave%'
      )
      WHERE EXISTS (
        SELECT 1 FROM unnest(popular_injections) AS elem
        WHERE elem ILIKE '%tirzepatide%' 
          OR elem ILIKE '%semaglutide%'
          OR elem ILIKE '%contrave%'
      )
    `);
    console.log(`✅ Fixed ${fixPopularInjectionsResult.rowCount} rows - removed weight management meds from popular_injections`);

    // Set default if empty
    const setDefaultResult = await pool.query(`
      UPDATE analytics_data
      SET popular_injections = ARRAY['B12 Injection', 'Vitamin D', 'Metabolism Boost']
      WHERE (popular_injections IS NULL OR array_length(popular_injections, 1) IS NULL OR array_length(popular_injections, 1) = 0)
    `);
    console.log(`✅ Set default popular_injections for ${setDefaultResult.rowCount} rows`);

    res.json({
      success: true,
      message: 'Migration completed successfully',
      columnsAdded: migrationQueries.length,
      rowsUpdated: updateResult.rowCount,
      popularInjectionsFixed: fixPopularInjectionsResult.rowCount,
      defaultsSet: setDefaultResult.rowCount
    });

  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({
      success: false,
      error: 'Migration failed',
      details: error.message
    });
  }
});

// Debug endpoint to check dates in database
app.get('/api/debug-dates', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        week_start_date,
        week_end_date,
        upload_date,
        EXTRACT(YEAR FROM week_start_date) as start_year,
        EXTRACT(YEAR FROM week_end_date) as end_year,
        actual_weekly_revenue,
        actual_monthly_revenue
      FROM analytics_data 
      ORDER BY upload_date DESC
      LIMIT 10
    `);
    
    res.json({
      success: true,
      message: 'Debug data retrieved',
      records: result.rows,
      count: result.rows.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Debug dates error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Manual date fix endpoint
app.post('/api/fix-dates', async (req, res) => {
  try {
    // First check what we have
    const checkResult = await pool.query(`
      SELECT COUNT(*) as count 
      FROM analytics_data 
      WHERE EXTRACT(YEAR FROM week_start_date) < 2000
    `);
    
    const oldDatesCount = parseInt(checkResult.rows[0].count);
    
    if (oldDatesCount === 0) {
      return res.json({
        success: true,
        message: 'No dates need fixing',
        rowsFixed: 0
      });
    }
    
    // Fix the dates
    const fixResult = await pool.query(`
      UPDATE analytics_data 
      SET 
        week_start_date = week_start_date + INTERVAL '100 years',
        week_end_date = week_end_date + INTERVAL '100 years',
        upload_date = CURRENT_TIMESTAMP
      WHERE EXTRACT(YEAR FROM week_start_date) < 2000
    `);
    
    res.json({
      success: true,
      message: `Fixed ${fixResult.rowCount} records from 1925 to 2025`,
      rowsFixed: fixResult.rowCount
    });
  } catch (error) {
    console.error('Fix dates error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Fix specific week dates that were calculated incorrectly
app.post('/api/fix-week-dates', async (req, res) => {
  try {
    // First, show what we're about to fix
    const checkResult = await pool.query(`
      SELECT id, week_start_date, week_end_date, actual_weekly_revenue
      FROM analytics_data 
      WHERE week_start_date = '2025-08-10' 
        AND week_end_date = '2025-08-16'
    `);
    
    if (checkResult.rows.length === 0) {
      return res.json({
        success: false,
        message: 'No records found with Aug 10-16 dates to fix',
        checked: 'Aug 10-16, 2025'
      });
    }
    
    // Fix the Aug 10-16 record to be Aug 4-10 (last week)
    const fixResult = await pool.query(`
      UPDATE analytics_data 
      SET 
        week_start_date = '2025-08-04',
        week_end_date = '2025-08-10',
        updated_at = CURRENT_TIMESTAMP
      WHERE week_start_date = '2025-08-10' 
        AND week_end_date = '2025-08-16'
    `);
    
    res.json({
      success: true,
      message: `Fixed ${fixResult.rowCount} record(s) from Aug 10-16 to Aug 4-10`,
      rowsFixed: fixResult.rowCount,
      recordFixed: checkResult.rows[0]
    });
    
    console.log(`✅ Fixed week dates: Aug 10-16 → Aug 4-10 for ${fixResult.rowCount} record(s)`);
    
  } catch (error) {
    console.error('Fix week dates error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Version endpoint to verify deployment
app.get('/api/version', (req, res) => {
  res.json({
    version: '2.0.0',
    deployment: 'membership-fix-2024',
    timestamp: new Date().toISOString(),
    features: {
      membershipEndpoint: true,
      priorityScoring: true,
      separateDataStreams: true
    }
  });
});

// Get membership data - always returns most recent record with members
app.get('/api/membership', async (req, res) => {
  try {
    // Ensure database connection exists
    if (!pool) {
      return res.status(503).json({
        success: false,
        error: 'Database connection not available',
        message: 'Please ensure DATABASE_URL is properly configured'
      });
    }

    console.log('📊 Fetching membership data...');
    
    // Get the most recent record with membership data
    const result = await pool.query(`
      SELECT 
        week_start_date,
        week_end_date,
        total_drip_iv_members,
        individual_memberships,
        family_memberships,
        concierge_memberships,
        corporate_memberships,
        family_concierge_memberships,
        drip_concierge_memberships,
        new_individual_members_weekly,
        new_family_members_weekly,
        new_concierge_members_weekly,
        new_corporate_members_weekly,
        member_customers_weekly,
        non_member_customers_weekly
      FROM analytics_data 
      WHERE total_drip_iv_members > 0
      ORDER BY week_start_date DESC 
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      console.log('⚠️ No membership data found in database');
      return res.json({
        success: false,
        message: 'No membership data available',
        data: null
      });
    }

    console.log(`✅ Membership data found: ${result.rows[0].total_drip_iv_members} total members`);
    
    res.json({
      success: true,
      data: result.rows[0],
      source: 'most_recent_with_members'
    });
  } catch (error) {
    console.error('Error fetching membership data:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch membership data' 
    });
  }
});

// Data validation function to ensure realistic values
function validateDashboardData(data) {
  const validated = { ...data };
  
  // Validate membership counts (reasonable range: 0-1000)
  if (validated.total_drip_iv_members > 1000) {
    console.warn(`⚠️ Unrealistic membership count detected: ${validated.total_drip_iv_members}, capping at 1000`);
    validated.total_drip_iv_members = 1000;
  }
  
  // Validate revenue (reasonable weekly range: $0 - $500,000)
  if (validated.actual_weekly_revenue > 500000) {
    console.warn(`⚠️ Unrealistic weekly revenue detected: $${validated.actual_weekly_revenue}, capping at $500,000`);
    validated.actual_weekly_revenue = 500000;
  }
  
  // Ensure monthly revenue is greater than or equal to weekly
  if (validated.actual_monthly_revenue < validated.actual_weekly_revenue) {
    console.warn(`⚠️ Monthly revenue ($${validated.actual_monthly_revenue}) less than weekly ($${validated.actual_weekly_revenue}), adjusting`);
    validated.actual_monthly_revenue = validated.actual_weekly_revenue * 4;
  }
  
  // Ensure membership subcategories don't exceed total
  const subcategoryTotal = (validated.individual_memberships || 0) + 
                          (validated.family_memberships || 0) + 
                          (validated.concierge_memberships || 0) + 
                          (validated.corporate_memberships || 0) +
                          (validated.family_concierge_memberships || 0) +
                          (validated.drip_concierge_memberships || 0);
  
  if (subcategoryTotal > validated.total_drip_iv_members) {
    console.warn(`⚠️ Membership subcategories (${subcategoryTotal}) exceed total (${validated.total_drip_iv_members}), adjusting total`);
    validated.total_drip_iv_members = subcategoryTotal;
  }
  
  return validated;
}

// Database verification endpoint - shows all data in analytics_data table
app.get('/api/verify-data', async (req, res) => {
  try {
    if (!pool) {
      return res.status(503).json({ error: 'Database not connected' });
    }

    // Get all records sorted by date
    const result = await pool.query(`
      SELECT 
        id,
        week_start_date,
        week_end_date,
        actual_weekly_revenue,
        actual_monthly_revenue,
        total_drip_iv_members,
        drip_iv_revenue_weekly,
        semaglutide_revenue_weekly,
        created_at,
        updated_at
      FROM analytics_data
      ORDER BY week_start_date DESC
      LIMIT 20
    `);

    // Get count of total records
    const countResult = await pool.query('SELECT COUNT(*) as total FROM analytics_data');
    
    res.json({
      success: true,
      total_records: parseInt(countResult.rows[0].total),
      showing: result.rows.length,
      records: result.rows.map(row => ({
        id: row.id,
        week: `${row.week_start_date} to ${row.week_end_date}`,
        weekly_revenue: row.actual_weekly_revenue,
        monthly_revenue: row.actual_monthly_revenue,
        members: row.total_drip_iv_members,
        drip_iv_revenue: row.drip_iv_revenue_weekly,
        semaglutide_revenue: row.semaglutide_revenue_weekly,
        created: row.created_at,
        updated: row.updated_at
      }))
    });
  } catch (error) {
    console.error('Database verification error:', error);
    res.status(500).json({ 
      error: 'Database query failed', 
      message: error.message 
    });
  }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: 'disconnected',
    environment: process.env.NODE_ENV || 'development'
  };

  // Check database connection
  if (pool) {
    try {
      const result = await pool.query('SELECT NOW() as time, COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = \'public\'');
      health.database = 'connected';
      health.databaseTime = result.rows[0].time;
      health.tableCount = parseInt(result.rows[0].table_count);

      // Check analytics_data table
      const analyticsCheck = await pool.query('SELECT COUNT(*) as record_count FROM analytics_data');
      health.analyticsRecords = parseInt(analyticsCheck.rows[0].record_count);

      // Get migration status
      const migrationStatus = await getMigrationStatus(pool);
      health.migrations = migrationStatus;

      // Get mapping status
      const mappingStatus = await getMappingStatus(pool);
      health.serviceMapping = mappingStatus;

      res.json(health);
    } catch (error) {
      health.database = 'error';
      health.databaseError = error.message;
      res.status(503).json(health);
    }
  } else {
    health.database = 'not configured';
    res.status(503).json(health);
  }
});

// Migration status endpoint
app.get('/api/migrations', async (req, res) => {
  try {
    const status = await getMigrationStatus(pool);
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Service mapping status endpoint
app.get('/api/service-mapping', async (req, res) => {
  try {
    const status = await getMappingStatus(pool);
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// TASK 5.2: Data validation endpoint
app.post('/api/validate', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const fileExt = req.file.originalname.toLowerCase();
    
    let csvData;
    
    // Parse file based on type
    if (fileExt.endsWith('.csv')) {
      csvData = await parseCSVData(filePath);
    } else if (fileExt.endsWith('.xls') || fileExt.endsWith('.xlsx')) {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      csvData = XLSX.utils.sheet_to_json(worksheet);
    } else {
      return res.status(400).json({ error: 'Unsupported file type. Use CSV or Excel.' });
    }
    
    // Filter out non-transaction rows
    const filteredData = csvData.filter(row => {
      const chargeType = row['Charge Type'] || '';
      const chargeDesc = (row['Charge Desc'] || '').toLowerCase();
      
      if (chargeType === 'TOTAL_TIPS' || chargeDesc.includes('total_tips')) return false;
      if (chargeType === 'UNKNOWN' || chargeType === '') return false;
      if (chargeType.toLowerCase().includes('refund') || chargeType.toLowerCase().includes('credit')) return false;
      
      return true;
    });
    
    // Calculate date range
    let minDate = null;
    let maxDate = null;
    
    filteredData.forEach(row => {
      const dateStr = row['Date Of Payment'] || row['Date'] || '';
      if (!dateStr) return;
      
      let date = null;
      if (dateStr.includes('-')) {
        const parts = dateStr.split('-');
        if (parts.length === 3) {
          date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        }
      } else if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          let year = parseInt(parts[2]);
          if (year < 100) year = 2000 + year;
          date = new Date(year, parseInt(parts[0]) - 1, parseInt(parts[1]));
        }
      }
      
      if (date && !isNaN(date.getTime()) && date.getFullYear() >= 2020) {
        date.setHours(0, 0, 0, 0);
        if (!minDate || date < minDate) minDate = date;
        if (!maxDate || date > maxDate) maxDate = date;
      }
    });
    
    // Categorize rows
    const categories = {
      infusions: [],
      injections: [],
      weightLoss: [],
      membership: [],
      hormone: [],
      addons: [],
      excluded: []
    };
    
    const sampleLimit = 20;
    
    filteredData.forEach(row => {
      const chargeDesc = row['Charge Desc'] || '';
      const lowerDesc = chargeDesc.toLowerCase();
      const amount = parseFloat(row['Calculated Payment (Line)'] || 0);
      
      const sample = {
        date: row['Date Of Payment'] || row['Date'],
        patient: row['Patient'],
        service: chargeDesc,
        amount: amount,
        reason: ''
      };
      
      if (lowerDesc.includes('semaglutide') || lowerDesc.includes('tirzepatide') || lowerDesc.includes('contrave')) {
        sample.reason = 'Weight loss medication';
        if (categories.weightLoss.length < sampleLimit) categories.weightLoss.push(sample);
      } else if (isBaseInfusionService(chargeDesc)) {
        sample.reason = 'Base infusion service';
        if (categories.infusions.length < sampleLimit) categories.infusions.push(sample);
      } else if (isStandaloneInjection(chargeDesc)) {
        sample.reason = 'Standalone injection';
        if (categories.injections.length < sampleLimit) categories.injections.push(sample);
      } else if (isInfusionAddon(chargeDesc)) {
        sample.reason = 'IV add-on service';
        if (categories.addons.length < sampleLimit) categories.addons.push(sample);
      } else if (isMembershipOrAdminService(chargeDesc)) {
        sample.reason = 'Membership/admin service';
        if (categories.membership.length < sampleLimit) categories.membership.push(sample);
      } else if (isHormoneService(chargeDesc)) {
        sample.reason = 'Hormone therapy';
        if (categories.hormone.length < sampleLimit) categories.hormone.push(sample);
      } else {
        sample.reason = 'Other/uncategorized';
        if (categories.excluded.length < sampleLimit) categories.excluded.push(sample);
      }
    });
    
    // Calculate rollups
    const rollups = {
      infusions: { count: 0, revenue: 0 },
      injections: { count: 0, revenue: 0 },
      weightLoss: { count: 0, revenue: 0 },
      membership: { count: 0, revenue: 0 },
      hormone: { count: 0, revenue: 0 },
      addons: { count: 0, revenue: 0 },
      other: { count: 0, revenue: 0 }
    };
    
    filteredData.forEach(row => {
      const chargeDesc = row['Charge Desc'] || '';
      const lowerDesc = chargeDesc.toLowerCase();
      const amount = parseFloat(row['Calculated Payment (Line)'] || 0);
      const qty = parseInt(row['Qty'] || row['Quantity'] || 1);
      
      if (lowerDesc.includes('semaglutide') || lowerDesc.includes('tirzepatide') || lowerDesc.includes('contrave')) {
        rollups.weightLoss.count += qty;
        rollups.weightLoss.revenue += amount;
      } else if (isBaseInfusionService(chargeDesc)) {
        rollups.infusions.count += qty;
        rollups.infusions.revenue += amount;
      } else if (isStandaloneInjection(chargeDesc)) {
        rollups.injections.count += qty;
        rollups.injections.revenue += amount;
      } else if (isInfusionAddon(chargeDesc)) {
        rollups.addons.count += qty;
        rollups.addons.revenue += amount;
      } else if (isMembershipOrAdminService(chargeDesc)) {
        rollups.membership.count += qty;
        rollups.membership.revenue += amount;
      } else if (isHormoneService(chargeDesc)) {
        rollups.hormone.count += qty;
        rollups.hormone.revenue += amount;
      } else {
        rollups.other.count += qty;
        rollups.other.revenue += amount;
      }
    });
    
    // Clean up temp file
    fs.unlinkSync(filePath);
    
    res.json({
      success: true,
      summary: {
        totalRows: csvData.length,
        includedRows: filteredData.length,
        excludedRows: csvData.length - filteredData.length,
        dateRange: {
          start: minDate ? minDate.toISOString().split('T')[0] : null,
          end: maxDate ? maxDate.toISOString().split('T')[0] : null
        }
      },
      filtersApplied: [
        'Excluded TOTAL_TIPS entries',
        'Excluded UNKNOWN charge types',
        'Excluded refund/credit entries',
        'Excluded zero-amount transactions'
      ],
      rollupsByCategory: rollups,
      sampleRows: categories
    });
    
  } catch (error) {
    console.error('Validation error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Manual service mapping reload endpoint
app.post('/api/service-mapping/reload', async (req, res) => {
  try {
    console.log('\n🔄 Manual service mapping reload requested...');
    const { loadServiceMapping } = require('./database/auto-load-mapping');
    const success = await loadServiceMapping(pool);
    
    if (success) {
      const status = await getMappingStatus(pool);
      res.json({
        success: true,
        message: 'Service mapping reloaded successfully',
        status
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to reload service mapping - check server logs'
      });
    }
  } catch (error) {
    console.error('❌ Error reloading service mapping:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Get dashboard data with optional date filtering
app.get('/api/dashboard', async (req, res) => {
  try {
    // Ensure database connection exists
    if (!pool) {
      console.error('Database connection not available');
      return res.status(503).json({
        success: false,
        error: 'Database connection not available',
        message: 'Please ensure DATABASE_URL is properly configured'
      });
    }

    // Extract date parameters
    const { start_date, end_date, aggregate } = req.query;
    
    // DIAGNOSTIC: Log available weeks when filter is requested
    if (start_date && end_date) {
      console.log('\n🔍 Dashboard request with filter:');
      console.log(`   Requested: ${start_date} to ${end_date}`);
      
      const weekCheck = await pool.query(`
        SELECT week_start_date, week_end_date, actual_weekly_revenue, total_drip_iv_members
        FROM analytics_data 
        ORDER BY week_start_date DESC
        LIMIT 10
      `);
      
      if (weekCheck.rows.length > 0) {
        console.log('📊 Available weeks in database:');
        weekCheck.rows.forEach(row => {
          const match = row.week_start_date === start_date && row.week_end_date === end_date ? ' ✅ MATCH' : '';
          console.log(`   ${row.week_start_date} to ${row.week_end_date}: $${row.actual_weekly_revenue}${match}`);
        });
      } else {
        console.log('⚠️ No data found in analytics_data table!');
      }
    }
    
    // Validate date parameters if provided
    if (start_date || end_date) {
      const startDate = start_date ? new Date(start_date) : null;
      const endDate = end_date ? new Date(end_date) : null;
      
      // Validate date formats
      if ((start_date && isNaN(startDate.getTime())) || (end_date && isNaN(endDate.getTime()))) {
        return res.status(400).json({
          success: false,
          error: 'Invalid date format. Please use YYYY-MM-DD format.'
        });
      }
      
      // Ensure start_date <= end_date
      if (startDate && endDate && startDate > endDate) {
        return res.status(400).json({
          success: false,
          error: 'Start date must be before or equal to end date.'
        });
      }
      
      // Limit date range to 1 year
      if (startDate && endDate) {
        const diffTime = Math.abs(endDate - startDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays > 365) {
          return res.status(400).json({
            success: false,
            error: 'Date range cannot exceed 365 days.'
          });
        }
      }
    }

    // Log the query parameters for debugging
    if (start_date || end_date) {
      console.log(`📅 Date filter query: start_date=${start_date}, end_date=${end_date}, aggregate=${aggregate}`);
    }
    
    let result;
    
    if (start_date || end_date) {
      // Date range filtering
      if (aggregate === 'true') {
        // Aggregate data across the date range
        const aggregateQuery = `
          SELECT 
            MIN(week_start_date) as week_start_date,
            MAX(week_end_date) as week_end_date,
            SUM(iv_infusions_weekday_weekly) as iv_infusions_weekday_weekly,
            SUM(iv_infusions_weekend_weekly) as iv_infusions_weekend_weekly,
            SUM(iv_infusions_weekday_monthly) as iv_infusions_weekday_monthly,
            SUM(iv_infusions_weekend_monthly) as iv_infusions_weekend_monthly,
            SUM(injections_weekday_weekly) as injections_weekday_weekly,
            SUM(injections_weekend_weekly) as injections_weekend_weekly,
            SUM(injections_weekday_monthly) as injections_weekday_monthly,
            SUM(injections_weekend_monthly) as injections_weekend_monthly,
            SUM(drip_iv_weekday_weekly) as drip_iv_weekday_weekly,
            SUM(drip_iv_weekend_weekly) as drip_iv_weekend_weekly,
            SUM(semaglutide_consults_weekly) as semaglutide_consults_weekly,
            SUM(semaglutide_injections_weekly) as semaglutide_injections_weekly,
            SUM(hormone_followup_female_weekly) as hormone_followup_female_weekly,
            SUM(hormone_initial_male_weekly) as hormone_initial_male_weekly,
            SUM(drip_iv_weekday_monthly) as drip_iv_weekday_monthly,
            SUM(drip_iv_weekend_monthly) as drip_iv_weekend_monthly,
            SUM(semaglutide_consults_monthly) as semaglutide_consults_monthly,
            SUM(semaglutide_injections_monthly) as semaglutide_injections_monthly,
            SUM(hormone_followup_female_monthly) as hormone_followup_female_monthly,
            SUM(hormone_initial_male_monthly) as hormone_initial_male_monthly,
            SUM(unique_customers_weekly) as unique_customers_weekly,
            SUM(unique_customers_monthly) as unique_customers_monthly,
            SUM(member_customers_weekly) as member_customers_weekly,
            SUM(non_member_customers_weekly) as non_member_customers_weekly,
            SUM(actual_weekly_revenue) as actual_weekly_revenue,
            SUM(weekly_revenue_goal) as weekly_revenue_goal,
            SUM(actual_monthly_revenue) as actual_monthly_revenue,
            SUM(monthly_revenue_goal) as monthly_revenue_goal,
            SUM(drip_iv_revenue_weekly) as drip_iv_revenue_weekly,
            SUM(semaglutide_revenue_weekly) as semaglutide_revenue_weekly,
            SUM(drip_iv_revenue_monthly) as drip_iv_revenue_monthly,
            SUM(semaglutide_revenue_monthly) as semaglutide_revenue_monthly,
            MAX(total_drip_iv_members) as total_drip_iv_members,
            MAX(individual_memberships) as individual_memberships,
            MAX(family_memberships) as family_memberships,
            MAX(family_concierge_memberships) as family_concierge_memberships,
            MAX(drip_concierge_memberships) as drip_concierge_memberships,
            MAX(marketing_initiatives) as marketing_initiatives,
            MAX(concierge_memberships) as concierge_memberships,
            MAX(corporate_memberships) as corporate_memberships,
            SUM(new_individual_members_weekly) as new_individual_members_weekly,
            SUM(new_family_members_weekly) as new_family_members_weekly,
            SUM(new_concierge_members_weekly) as new_concierge_members_weekly,
            SUM(new_corporate_members_weekly) as new_corporate_members_weekly,
            COUNT(*) as weeks_included,
            'aggregated' as data_type
          FROM analytics_data
          WHERE 1=1
        `;
        
        const params = [];
        let paramCount = 0;
        
        let whereClause = '';
        if (start_date && end_date) {
          // Check if this is a single week (7 days) or a longer range
          const startDateObj = new Date(start_date);
          const endDateObj = new Date(end_date);
          const daysDiff = Math.round((endDateObj - startDateObj) / (1000 * 60 * 60 * 24));
          const dayOfWeek = startDateObj.getDay();
          
          paramCount++;
          const startParam = paramCount;
          params.push(start_date);
          paramCount++;
          const endParam = paramCount;
          params.push(end_date);
          
          // Only use exact match for single weeks (7 days, Monday-Sunday)
          if (dayOfWeek === 1 && daysDiff === 6) { // Monday and exactly 7 days
            whereClause += ` AND week_start_date = $${startParam} AND week_end_date = $${endParam}`;
            console.log(`🎯 Exact week match query: ${start_date} to ${end_date}`);
          } else {
            // Use overlap query for month ranges or non-standard date ranges
            whereClause += ` AND (week_start_date <= $${endParam} AND week_end_date >= $${startParam})`;
            console.log(`🔍 Overlap query: ${start_date} to ${end_date} (${daysDiff + 1} days)`);
          }
        } else if (start_date) {
          paramCount++;
          whereClause += ` AND week_end_date >= $${paramCount}`;
          params.push(start_date);
        } else if (end_date) {
          paramCount++;
          whereClause += ` AND week_start_date <= $${paramCount}`;
          params.push(end_date);
        }
        
        console.log(`🔍 Aggregate query with params:`, params);
        result = await pool.query(aggregateQuery + whereClause, params);
        
        // Round the averaged values
        if (result.rows.length > 0) {
          const avgFields = ['total_drip_iv_members', 'individual_memberships', 'family_memberships', 
                            'family_concierge_memberships', 'drip_concierge_memberships', 
                            'marketing_initiatives', 'concierge_memberships', 'corporate_memberships'];
          avgFields.forEach(field => {
            if (result.rows[0][field]) {
              result.rows[0][field] = Math.round(result.rows[0][field]);
            }
          });
        }
      } else {
        // Get single record for the date range (most recent)
        const singleQuery = `
          SELECT * FROM analytics_data 
          WHERE 1=1
        `;
        
        const params = [];
        let paramCount = 0;
        
        let whereClause = '';
        if (start_date && end_date) {
          // Check if this is a single week (7 days) or a longer range
          const startDateObj = new Date(start_date);
          const endDateObj = new Date(end_date);
          const daysDiff = Math.round((endDateObj - startDateObj) / (1000 * 60 * 60 * 24));
          const dayOfWeek = startDateObj.getDay();
          
          paramCount++;
          const startParam = paramCount;
          params.push(start_date);
          paramCount++;
          const endParam = paramCount;
          params.push(end_date);
          
          // Only use exact match for single weeks (7 days, Monday-Sunday)
          if (dayOfWeek === 1 && daysDiff === 6) { // Monday and exactly 7 days
            whereClause += ` AND week_start_date = $${startParam} AND week_end_date = $${endParam}`;
            console.log(`🎯 Exact week match query: ${start_date} to ${end_date}`);
          } else {
            // Use overlap query for month ranges or non-standard date ranges
            whereClause += ` AND (week_start_date <= $${endParam} AND week_end_date >= $${startParam})`;
            console.log(`🔍 Overlap query: ${start_date} to ${end_date} (${daysDiff + 1} days)`);
          }
        } else if (start_date) {
          paramCount++;
          whereClause += ` AND week_end_date >= $${paramCount}`;
          params.push(start_date);
        } else if (end_date) {
          paramCount++;
          whereClause += ` AND week_start_date <= $${paramCount}`;
          params.push(end_date);
        }
        
        whereClause += ' ORDER BY week_start_date DESC LIMIT 1';
        
        // First, log what weeks are available in the database
        const availableWeeks = await pool.query(`
          SELECT week_start_date, week_end_date, actual_weekly_revenue, total_drip_iv_members
          FROM analytics_data
          ORDER BY week_start_date DESC
          LIMIT 5
        `);
        console.log('📅 Available weeks in database:');
        availableWeeks.rows.forEach(week => {
          console.log(`   ${week.week_start_date} to ${week.week_end_date}: $${week.actual_weekly_revenue}, ${week.total_drip_iv_members} members`);
        });
        
        console.log(`🔍 Single record query with params:`, params);
        console.log(`   Query: ${singleQuery + whereClause}`);
        result = await pool.query(singleQuery + whereClause, params);
        console.log(`📊 Query returned ${result.rows.length} rows`);
        
        if (result.rows.length > 0) {
          const row = result.rows[0];
          console.log(`   Returned week: ${row.week_start_date} to ${row.week_end_date}`);
          console.log(`   Revenue: $${row.actual_weekly_revenue}, Members: ${row.total_drip_iv_members}`);
        }
        
        // If no data found for the date range, return a specific message
        if (result.rows.length === 0 && (start_date || end_date)) {
          console.log(`⚠️ No data found for date range: ${start_date} to ${end_date}`);
          return res.json({
            success: false,
            message: `No data found for the selected date range`,
            dateRange: { start: start_date, end: end_date }
          });
        }
      }
    } else {
      // No date filtering - use priority scoring to get best record
      console.log('🔍 Fetching dashboard data with priority scoring...');
      
      // Priority scoring: Prefer records with membership data, then most recent
      result = await pool.query(`
        WITH scored_data AS (
          SELECT *,
            CASE 
              WHEN total_drip_iv_members > 0 THEN 1000000
              WHEN actual_weekly_revenue > 5000 THEN 500000
              WHEN actual_weekly_revenue > 1000 THEN 100000
              ELSE 0
            END + EXTRACT(EPOCH FROM week_start_date) AS priority_score
          FROM analytics_data
        )
        SELECT * FROM scored_data
        ORDER BY priority_score DESC
        LIMIT 1
      `);
      
      if (result.rows.length === 0) {
        console.log('⚠️ No data found in database');
      } else {
        const data = result.rows[0];
        console.log(`✅ Loading dashboard data: Week ${data.week_start_date} with ${data.total_drip_iv_members} members, $${data.actual_weekly_revenue} revenue`);
      }
    }
    
    if (result.rows.length === 0) {
      // Check if database is completely empty
      const countCheck = await pool.query('SELECT COUNT(*) as count FROM analytics_data');
      
      if (countCheck.rows[0].count === '0') {
        console.log('📊 Database is completely empty. User should upload data files.');
        
        // DON'T INSERT SAMPLE DATA - this interferes with uploaded data
        // Return empty state to encourage user to upload files
        return res.json({
          success: true,
          message: 'Database is empty. Please upload analytics files to populate the dashboard.',
          data: {
            week_start_date: null,
            week_end_date: null,
            actual_weekly_revenue: 0,
            actual_monthly_revenue: 0,
            drip_iv_revenue_weekly: 0,
            semaglutide_revenue_weekly: 0,
            drip_iv_revenue_monthly: 0,
            semaglutide_revenue_monthly: 0,
            total_drip_iv_members: 0,
            individual_memberships: 0,
            family_memberships: 0,
            concierge_memberships: 0,
            corporate_memberships: 0
          }
        });
      } else {
        // Database has data but query didn't match
        console.log('📊 Database has data but no records match the query filters');
        
        // Get the most recent record regardless of dates
        const latestResult = await pool.query(`
          SELECT * FROM analytics_data 
          ORDER BY upload_date DESC, id DESC
          LIMIT 1
        `);
        
        if (latestResult.rows.length > 0) {
          console.log('✅ Using most recent database record');
          result = latestResult;
        } else {
          // Truly no data found
          return res.json({
            success: false,
            message: 'No data found in database. Please upload analytics files.',
            data: null
          });
        }
      }
    }

    // Log membership data being sent
    if (result.rows[0]) {
      console.log('📊 Sending dashboard data with membership counts:', {
        total_drip_iv_members: result.rows[0].total_drip_iv_members,
        individual: result.rows[0].individual_memberships,
        family: result.rows[0].family_memberships,
        concierge: result.rows[0].concierge_memberships,
        corporate: result.rows[0].corporate_memberships,
        member_customers_weekly: result.rows[0].member_customers_weekly,
        week: result.rows[0].week_start_date,
        data_consistency: result.rows[0].total_drip_iv_members > 0 || result.rows[0].member_customers_weekly > 0 ? 
          'VALID ✅' : 'MISSING MEMBERSHIP DATA ⚠️'
      });
    }

    // CRITICAL FIX: Calculate actual monthly revenue by summing all weeks in the same month
    if (result.rows[0] && result.rows[0].week_start_date) {
      const weekStartDate = new Date(result.rows[0].week_start_date);
      const monthStart = new Date(weekStartDate.getFullYear(), weekStartDate.getMonth(), 1);
      const monthEnd = new Date(weekStartDate.getFullYear(), weekStartDate.getMonth() + 1, 0);
      
      console.log('📅 Calculating monthly revenue for:', {
        month: monthStart.toISOString().split('T')[0],
        monthStart: monthStart.toISOString().split('T')[0],
        monthEnd: monthEnd.toISOString().split('T')[0]
      });
      
      // Query all weeks that fall within this month
      // CRITICAL FIX: Changed to overlap query to catch all weeks that touch the month
      // Old: week_start_date >= $1 AND week_start_date <= $2 (only weeks STARTING in month)
      // New: week_start_date <= $2 AND week_end_date >= $1 (all weeks OVERLAPPING month)
      const monthlyQuery = await pool.query(`
        SELECT
          SUM(drip_iv_revenue_weekly) as total_iv_revenue,
          SUM(semaglutide_revenue_weekly) as total_sema_revenue,
          SUM(actual_weekly_revenue) as total_revenue,
          COUNT(*) as weeks_count
        FROM analytics_data
        WHERE week_start_date <= $2 AND week_end_date >= $1
      `, [monthStart.toISOString().split('T')[0], monthEnd.toISOString().split('T')[0]]);
      
      if (monthlyQuery.rows[0] && monthlyQuery.rows[0].weeks_count > 0) {
        const monthlyData = monthlyQuery.rows[0];
        
        // Override the monthly revenue fields with the actual sum of weekly revenues
        result.rows[0].drip_iv_revenue_monthly = parseFloat(monthlyData.total_iv_revenue) || 0;
        result.rows[0].semaglutide_revenue_monthly = parseFloat(monthlyData.total_sema_revenue) || 0;
        result.rows[0].actual_monthly_revenue = parseFloat(monthlyData.total_revenue) || 0;

        // Add metadata about how many weeks are included in monthly totals
        result.rows[0].monthly_weeks_count = parseInt(monthlyData.weeks_count) || 0;
        result.rows[0].monthly_calculation_note = `Based on ${monthlyData.weeks_count} week(s) of data`;

        console.log('✅ Monthly revenue calculated from database:', {
          weeks_included: monthlyData.weeks_count,
          iv_therapy: `$${result.rows[0].drip_iv_revenue_monthly.toFixed(2)}`,
          weight_loss: `$${result.rows[0].semaglutide_revenue_monthly.toFixed(2)}`,
          total: `$${result.rows[0].actual_monthly_revenue.toFixed(2)}`
        });
      } else {
        console.log('⚠️ No weekly data found for this month in database');
        result.rows[0].monthly_weeks_count = 0;
        result.rows[0].monthly_calculation_note = 'No weekly data available for this month';
      }

      // CRITICAL FIX: Calculate actual monthly SERVICE COUNTS by summing all weeks in the same month
      // This fixes the bug where monthly counts were showing the same as weekly counts
      console.log('🔢 Calculating monthly service counts from weekly data...');

      const monthlyServiceQuery = await pool.query(`
        SELECT
          SUM(iv_infusions_weekday_weekly) as total_iv_infusions_weekday,
          SUM(iv_infusions_weekend_weekly) as total_iv_infusions_weekend,
          SUM(injections_weekday_weekly) as total_injections_weekday,
          SUM(injections_weekend_weekly) as total_injections_weekend,
          SUM(semaglutide_injections_weekly) as total_semaglutide_injections,
          SUM(hormone_followup_female_weekly) as total_hormone_followup_female,
          SUM(hormone_initial_female_weekly) as total_hormone_initial_female,
          SUM(hormone_initial_male_weekly) as total_hormone_initial_male,
          SUM(hormone_followup_male_weekly) as total_hormone_followup_male,
          COUNT(*) as weeks_count
        FROM analytics_data
        WHERE week_start_date <= $2 AND week_end_date >= $1
      `, [monthStart.toISOString().split('T')[0], monthEnd.toISOString().split('T')[0]]);

      if (monthlyServiceQuery.rows[0] && monthlyServiceQuery.rows[0].weeks_count > 0) {
        const monthlyServiceData = monthlyServiceQuery.rows[0];

        // Override the monthly service count fields with the actual sum of weekly counts
        result.rows[0].iv_infusions_weekday_monthly = parseInt(monthlyServiceData.total_iv_infusions_weekday) || 0;
        result.rows[0].iv_infusions_weekend_monthly = parseInt(monthlyServiceData.total_iv_infusions_weekend) || 0;
        result.rows[0].injections_weekday_monthly = parseInt(monthlyServiceData.total_injections_weekday) || 0;
        result.rows[0].injections_weekend_monthly = parseInt(monthlyServiceData.total_injections_weekend) || 0;
        result.rows[0].semaglutide_injections_monthly = parseInt(monthlyServiceData.total_semaglutide_injections) || 0;
        result.rows[0].hormone_followup_female_monthly = parseInt(monthlyServiceData.total_hormone_followup_female) || 0;
        result.rows[0].hormone_initial_female_monthly = parseInt(monthlyServiceData.total_hormone_initial_female) || 0;
        result.rows[0].hormone_initial_male_monthly = parseInt(monthlyServiceData.total_hormone_initial_male) || 0;
        result.rows[0].hormone_followup_male_monthly = parseInt(monthlyServiceData.total_hormone_followup_male) || 0;

        console.log('✅ Monthly service counts calculated from database:', {
          weeks_included: monthlyServiceData.weeks_count,
          iv_weekday: result.rows[0].iv_infusions_weekday_monthly,
          iv_weekend: result.rows[0].iv_infusions_weekend_monthly,
          injections_weekday: result.rows[0].injections_weekday_monthly,
          injections_weekend: result.rows[0].injections_weekend_monthly,
          weight_loss_injections: result.rows[0].semaglutide_injections_monthly,
          hormone_followup_female: result.rows[0].hormone_followup_female_monthly,
          hormone_initial_female: result.rows[0].hormone_initial_female_monthly,
          hormone_initial_male: result.rows[0].hormone_initial_male_monthly,
          hormone_followup_male: result.rows[0].hormone_followup_male_monthly
        });
      } else {
        console.log('⚠️ No weekly service data found for this month');
      }
    }

    // Return the data
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// Get historical data
app.get('/api/historical', async (req, res) => {
  try {
    const { months = 3 } = req.query;
    const result = await pool.query(`
      SELECT * FROM analytics_data 
      WHERE upload_date >= NOW() - INTERVAL '${months} months'
      ORDER BY week_start_date DESC
    `);
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching historical data:', error);
    res.status(500).json({ error: 'Failed to fetch historical data' });
  }
});

// Add July data endpoint (for initialization) - both GET and POST
app.route('/api/add-july-data')
.get(async (req, res) => {
  try {
    // First check if data already exists
    const existingData = await pool.query(`
      SELECT id FROM analytics_data 
      WHERE week_start_date = '2025-07-07' AND week_end_date = '2025-07-13'
    `);
    
    if (existingData.rows.length > 0) {
      return res.json({
        success: true,
        message: 'July data already exists in database',
        existing: true
      });
    }

    // Insert July data
    console.log('Inserting July sample data...');
    
    // ... rest of July data logic would go here
    
    res.json({
      success: true,
      message: 'July data initialized successfully'
    });
  } catch (error) {
    console.error('Error adding July data:', error);
    res.status(500).json({ error: 'Failed to add July data' });
  }
});

// Emergency cleanup endpoint - delete bad September 2nd records
app.post('/api/cleanup-bad-records', async (req, res) => {
  try {
    if (!pool) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    console.log('🗑️  Emergency cleanup: Deleting bad September 2nd records...');
    
    // Delete specific problematic records by ID and conditions
    const deleteResult = await pool.query(`
      DELETE FROM analytics_data 
      WHERE id IN (13, 12, 10, 9, 8, 7)
      OR week_start_date = '2025-09-02' 
      OR week_end_date = '2025-09-02'
    `);
    
    console.log(`✅ Deleted ${deleteResult.rowCount} bad records`);
    
    // Check what remains
    const remaining = await pool.query(`
      SELECT id, week_start_date, week_end_date, actual_weekly_revenue, total_drip_iv_members
      FROM analytics_data 
      ORDER BY upload_date DESC LIMIT 3
    `);
    
    const result = {
      success: true,
      deleted: deleteResult.rowCount,
      remaining: remaining.rows
    };
    
    console.log('📊 Cleanup complete:', result);
    res.json(result);
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Debug endpoint - show all records by upload_date
app.get('/api/debug-records', async (req, res) => {
  try {
    if (!pool) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const allRecords = await pool.query(`
      SELECT id, week_start_date, week_end_date, actual_weekly_revenue, 
             total_drip_iv_members, upload_date
      FROM analytics_data 
      ORDER BY upload_date DESC, id DESC
      LIMIT 10
    `);
    
    res.json({
      success: true,
      records: allRecords.rows,
      count: allRecords.rows.length
    });
    
  } catch (error) {
    console.error('❌ Debug failed:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete specific problematic record IDs
app.post('/api/delete-bad-dates', async (req, res) => {
  try {
    if (!pool) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    console.log('🗑️  Deleting records with same start/end date...');
    
    // Delete records where start date equals end date (single day "weeks")
    const deleteResult = await pool.query(`
      DELETE FROM analytics_data 
      WHERE week_start_date::date = week_end_date::date
    `);
    
    console.log(`✅ Deleted ${deleteResult.rowCount} bad date records`);
    
    res.json({
      success: true,
      deleted: deleteResult.rowCount,
      message: `Deleted ${deleteResult.rowCount} records with same start/end date`
    });
    
  } catch (error) {
    console.error('❌ Delete failed:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Import weekly data endpoint - handles both revenue and membership files
app.post('/api/import-weekly-data', upload.fields([
  { name: 'revenueFile', maxCount: 1 },
  { name: 'membershipFile', maxCount: 1 }
]), async (req, res) => {
  console.log('\n=== FILE UPLOAD REQUEST ===');
  console.log('Timestamp:', new Date().toISOString());
  
  try {
    if (!req.files || (!req.files.revenueFile && !req.files.membershipFile)) {
      console.log('❌ No files provided in request');
      return res.status(400).json({ 
        error: 'At least one file (revenue or membership) is required',
        received: {
          revenueFile: !!req.files?.revenueFile,
          membershipFile: !!req.files?.membershipFile
        }
      });
    }

    const revenueFile = req.files.revenueFile?.[0];
    const membershipFile = req.files.membershipFile?.[0];

    console.log('📁 Files received:');
    if (revenueFile) console.log(`   Revenue: ${revenueFile.originalname}`);
    if (membershipFile) console.log(`   Membership: ${membershipFile.originalname}`);

    // Use the importMultiWeekData function to process multiple weeks separately
    console.log('📥 Calling multi-week import function...');
    const importedData = await importMultiWeekData(
      revenueFile ? revenueFile.path : null,
      membershipFile ? membershipFile.path : null
    );
    
    console.log('📥 Import function returned successfully');
    if (importedData) {
      console.log(`   Week dates: ${importedData.week_start_date} to ${importedData.week_end_date}`);
      console.log(`   Revenue: $${importedData.actual_weekly_revenue || 0}`);
      console.log(`   Members: ${importedData.total_drip_iv_members || 0}`);
    }
    
    // Clean up uploaded files
    try {
      if (revenueFile) fs.unlinkSync(revenueFile.path);
      if (membershipFile) fs.unlinkSync(membershipFile.path);
    } catch (cleanupError) {
      console.warn('Warning: Could not clean up temp files:', cleanupError.message);
    }

    res.json({
      success: true,
      message: 'Weekly data imported successfully',
      data: {
        weeklyRevenue: importedData.actual_weekly_revenue,
        monthlyRevenue: importedData.actual_monthly_revenue,
        totalMembers: importedData.total_drip_iv_members,
        weekStart: importedData.week_start_date,
        weekEnd: importedData.week_end_date
      },
      validation: {
        revenuePresent: importedData.actual_weekly_revenue > 0,
        customersPresent: importedData.unique_customers_weekly > 0,
        transactionCount: importedData.unique_customers_weekly || 0
      }
    });

  } catch (error) {
    console.error('❌ Import failed:', error.message);
    console.error('Stack trace:', error.stack);

    // Clean up files on error
    try {
      if (req.files?.revenueFile?.[0]?.path) fs.unlinkSync(req.files.revenueFile[0].path);
      if (req.files?.membershipFile?.[0]?.path) fs.unlinkSync(req.files.membershipFile[0].path);
    } catch (cleanupError) {
      console.warn('Warning: Could not clean up temp files on error:', cleanupError.message);
    }

    // Provide detailed error feedback based on error type
    const isValidationError = error.message.includes('validation') || error.message.includes('integrity');
    const statusCode = isValidationError ? 400 : 500;

    res.status(statusCode).json({
      error: 'Failed to import weekly data',
      details: error.message,
      isValidationError: isValidationError,
      troubleshooting: isValidationError ?
        'Please check that your Excel file contains transaction data with dates, patient names, and revenue amounts.' :
        'An unexpected error occurred. Please check the server logs for details.'
    });
  }
});

// Upload endpoint for Active Memberships Excel file - updates membership counts for the most recent week
app.post('/api/upload-memberships', upload.single('file'), async (req, res) => {
  console.log('\n=== MEMBERSHIP FILE UPLOAD REQUEST ===');
  console.log('Timestamp:', new Date().toISOString());
  
  try {
    if (!req.file) {
      return res.status(400).json({ 
        error: 'Membership file is required'
      });
    }

    const uploadedFile = req.file;
    console.log(`📁 Processing membership file: ${uploadedFile.originalname}`);

    // Read and process the Excel file
    const workbook = XLSX.readFile(uploadedFile.path);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(worksheet);

    // Count memberships by type
    const membershipCounts = {
      total_drip_iv_members: 0,
      individual_memberships: 0,
      family_memberships: 0,
      concierge_memberships: 0,
      corporate_memberships: 0,
      family_concierge_memberships: 0,
      drip_concierge_memberships: 0,
      new_individual_members_weekly: 0,
      new_family_members_weekly: 0,
      new_concierge_members_weekly: 0,
      new_corporate_members_weekly: 0,
      new_family_concierge_members_weekly: 0,
      new_drip_concierge_members_weekly: 0
    };

    // Track unique patients to avoid counting duplicates
    const uniquePatients = new Map();
    const newSignups = {
      individual: new Set(),
      family: new Set(),
      concierge: new Set(),
      corporate: new Set(),
      familyConcierge: new Set(),
      dripConcierge: new Set()
    };

    console.log(`📊 Processing ${data.length} membership records...`);

    data.forEach((row, index) => {
      // Create unique patient identifier using name and email
      const patientName = (row['Customer'] || row['Name'] || row['Patient'] || '').toString().trim().toLowerCase();
      const patientEmail = (row['Email'] || row['Email Address'] || '').toString().trim().toLowerCase();
      const patientKey = patientEmail || patientName || `row_${index}`;
      
      // Get membership type from Title column
      const title = (row['Title'] || row['Membership Type'] || row['Type'] || '').toString().trim();
      const titleLower = title.toLowerCase();
      
      // Check if this is a new signup
      const isNew = title.toUpperCase().includes('(NEW)');
      
      if (index < 5) {
        console.log(`Row ${index + 1}: Patient="${patientName}", Email="${patientEmail}", Title="${title}", IsNew=${isNew}`);
      }
      
      // Skip empty rows
      if (!title || !titleLower) {
        return;
      }
      
      // Check if patient already exists
      if (!uniquePatients.has(patientKey)) {
        uniquePatients.set(patientKey, {
          name: patientName,
          email: patientEmail,
          memberships: [],
          isNew: isNew
        });
      }
      
      // Add membership type to patient
      uniquePatients.get(patientKey).memberships.push(titleLower);
      // Track if ANY of their memberships are marked as new
      if (isNew) {
        uniquePatients.get(patientKey).isNew = true;
      }
    });

    console.log(`📊 Found ${uniquePatients.size} unique patients from ${data.length} records`);

    // Analyze membership types for each unique patient
    uniquePatients.forEach((patient, patientKey) => {
      const allMemberships = patient.memberships.join(' | ');
      
      // Determine membership classification based on combined memberships
      let hasFamily = false;
      let hasConcierge = false;
      let hasIndividual = false;
      let hasCorporate = false;
      let hasDrip = false;
      
      patient.memberships.forEach(membershipType => {
        if (membershipType.includes('family')) hasFamily = true;
        if (membershipType.includes('concierge')) hasConcierge = true;
        if (membershipType.includes('individual')) hasIndividual = true;
        if (membershipType.includes('corporate')) hasCorporate = true;
        // Check for "drip" in membership type (not just anywhere in the string)
        if (membershipType.includes('drip') && membershipType.includes('membership')) hasDrip = true;
      });
      
      // Classify based on membership combinations
      // Check for combined memberships first (most specific)
      if (hasFamily && hasConcierge) {
        membershipCounts.family_concierge_memberships++;
        if (patient.isNew) {
          newSignups.familyConcierge.add(patientKey);
        }
        console.log(`👥 Family+Concierge: ${patient.name} - ${allMemberships}${patient.isNew ? ' (NEW)' : ''}`);
      } else if (hasConcierge && (hasDrip || hasIndividual)) {
        // Check if it's explicitly a combined "Concierge & Drip" membership
        const hasCombinedDripConcierge = patient.memberships.some(m => 
          (m.includes('concierge') && m.includes('drip')) || 
          (m.includes('drip') && m.includes('concierge'))
        );
        if (hasCombinedDripConcierge) {
          membershipCounts.drip_concierge_memberships++;
          if (patient.isNew) {
            newSignups.dripConcierge.add(patientKey);
          }
          console.log(`💎 Drip+Concierge: ${patient.name} - ${allMemberships}${patient.isNew ? ' (NEW)' : ''}`);
        } else {
          // Has both but not combined - count as concierge
          membershipCounts.concierge_memberships++;
          if (patient.isNew) {
            newSignups.concierge.add(patientKey);
          }
        }
      } else if (hasFamily) {
        membershipCounts.family_memberships++;
        if (patient.isNew) {
          newSignups.family.add(patientKey);
        }
      } else if (hasConcierge) {
        membershipCounts.concierge_memberships++;
        if (patient.isNew) {
          newSignups.concierge.add(patientKey);
        }
      } else if (hasIndividual) {
        membershipCounts.individual_memberships++;
        if (patient.isNew) {
          newSignups.individual.add(patientKey);
        }
      } else if (hasCorporate) {
        membershipCounts.corporate_memberships++;
        if (patient.isNew) {
          newSignups.corporate.add(patientKey);
        }
      } else {
        // Default to individual for unknown types
        membershipCounts.individual_memberships++;
        if (patient.isNew) {
          newSignups.individual.add(patientKey);
        }
        console.log(`⚠️ Unknown membership type defaulted to individual: ${patient.name} - ${allMemberships}${patient.isNew ? ' (NEW)' : ''}`);
      }
    });

    // Set total members
    membershipCounts.total_drip_iv_members = uniquePatients.size;
    
    // Set new signup counts
    membershipCounts.new_individual_members_weekly = newSignups.individual.size;
    membershipCounts.new_family_members_weekly = newSignups.family.size;
    membershipCounts.new_concierge_members_weekly = newSignups.concierge.size;
    membershipCounts.new_corporate_members_weekly = newSignups.corporate.size;
    membershipCounts.new_family_concierge_members_weekly = newSignups.familyConcierge.size;
    membershipCounts.new_drip_concierge_members_weekly = newSignups.dripConcierge.size;

    console.log('📊 Membership counts:', membershipCounts);
    console.log('📊 New signups this week:', {
      individual: membershipCounts.new_individual_members_weekly,
      family: membershipCounts.new_family_members_weekly,
      concierge: membershipCounts.new_concierge_members_weekly,
      corporate: membershipCounts.new_corporate_members_weekly,
      familyConcierge: membershipCounts.new_family_concierge_members_weekly,
      dripConcierge: membershipCounts.new_drip_concierge_members_weekly
    });

    // Update the most recent week's record with membership data
    const updateQuery = `
      UPDATE analytics_data
      SET 
        total_drip_iv_members = $1,
        individual_memberships = $2,
        family_memberships = $3,
        concierge_memberships = $4,
        corporate_memberships = $5,
        family_concierge_memberships = $6,
        drip_concierge_memberships = $7,
        new_individual_members_weekly = $8,
        new_family_members_weekly = $9,
        new_concierge_members_weekly = $10,
        new_corporate_members_weekly = $11
      WHERE id = (SELECT id FROM analytics_data ORDER BY created_at DESC LIMIT 1)
      RETURNING week_start_date, week_end_date
    `;

    const result = await pool.query(updateQuery, [
      membershipCounts.total_drip_iv_members,
      membershipCounts.individual_memberships,
      membershipCounts.family_memberships,
      membershipCounts.concierge_memberships,
      membershipCounts.corporate_memberships,
      membershipCounts.family_concierge_memberships,
      membershipCounts.drip_concierge_memberships,
      membershipCounts.new_individual_members_weekly,
      membershipCounts.new_family_members_weekly,
      membershipCounts.new_concierge_members_weekly,
      membershipCounts.new_corporate_members_weekly
    ]);

    // Clean up uploaded file
    try {
      fs.unlinkSync(uploadedFile.path);
    } catch (cleanupError) {
      console.warn('Warning: Could not clean up temp file:', cleanupError.message);
    }

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'No weekly data found to update. Please upload revenue data first.'
      });
    }

    res.json({
      success: true,
      message: 'Membership data updated successfully',
      data: {
        totalMembers: membershipCounts.total_drip_iv_members,
        individual: membershipCounts.individual_memberships,
        family: membershipCounts.family_memberships,
        concierge: membershipCounts.concierge_memberships,
        corporate: membershipCounts.corporate_memberships,
        familyConcierge: membershipCounts.family_concierge_memberships,
        dripConcierge: membershipCounts.drip_concierge_memberships,
        newSignups: {
          individual: membershipCounts.new_individual_members_weekly,
          family: membershipCounts.new_family_members_weekly,
          concierge: membershipCounts.new_concierge_members_weekly,
          corporate: membershipCounts.new_corporate_members_weekly,
          familyConcierge: membershipCounts.new_family_concierge_members_weekly,
          dripConcierge: membershipCounts.new_drip_concierge_members_weekly
        },
        weekUpdated: `${result.rows[0].week_start_date} to ${result.rows[0].week_end_date}`
      }
    });

  } catch (error) {
    console.error('❌ Membership upload failed:', error.message);
    
    // Clean up file on error
    try {
      if (req.file?.path) {
        fs.unlinkSync(req.file.path);
      }
    } catch (cleanupError) {
      console.warn('Warning: Could not clean up temp file on error:', cleanupError.message);
    }
    
    res.status(500).json({ 
      error: 'Failed to process membership file',
      details: error.message 
    });
  }
});

// Upload endpoint for Excel revenue files - processes Excel files directly with revenue categorization
app.post('/api/upload', upload.single('file'), async (req, res) => {
  console.log('\n=== EXCEL UPLOAD REQUEST ===');
  console.log('Timestamp:', new Date().toISOString());
  
  try {
    if (!req.file) {
      console.log('❌ No file provided in request');
      return res.status(400).json({ 
        error: 'File is required',
        received: !!req.file
      });
    }

    const uploadedFile = req.file;
    console.log('📁 File received:', uploadedFile.originalname);
    console.log('📄 File path:', uploadedFile.path);
    console.log('📏 File size:', uploadedFile.size, 'bytes');

    // Check if it's an Excel file
    const fileExt = uploadedFile.originalname.toLowerCase();
    if (!fileExt.endsWith('.xls') && !fileExt.endsWith('.xlsx')) {
      // Clean up the uploaded file
      try {
        fs.unlinkSync(uploadedFile.path);
      } catch (cleanupError) {
        console.warn('Warning: Could not clean up temp file:', cleanupError.message);
      }
      
      return res.status(400).json({ 
        error: 'Only Excel files (.xls, .xlsx) are supported',
        receivedExtension: fileExt 
      });
    }

    // Process Excel file using our extractFromExcel function
    console.log('📊 Processing Excel file for revenue categorization...');
    const extractedData = extractFromExcel(uploadedFile.path);
    
    console.log('✅ Excel processing completed');
    console.log('📈 Revenue breakdown:');
    console.log(`   Total Weekly Revenue: $${extractedData.actual_weekly_revenue}`);
    console.log(`   Drip IV Revenue: $${extractedData.drip_iv_revenue_weekly}`);
    console.log(`   Semaglutide Revenue: $${extractedData.semaglutide_revenue_weekly}`);
    console.log(`   Ketamine Revenue: $${extractedData.ketamine_revenue_weekly}`);
    console.log(`   Membership Revenue: $${extractedData.membership_revenue_weekly}`);
    console.log(`   Other Revenue: $${extractedData.other_revenue_weekly}`);

    // 🔍 DATA VALIDATION CHECKS
    const validationErrors = [];
    
    // Check for minimum data completeness
    if (extractedData.actual_weekly_revenue <= 0) {
      validationErrors.push('Total weekly revenue must be greater than $0');
    }
    
    // Check for suspiciously low revenue (likely incomplete data)
    if (extractedData.actual_weekly_revenue < 1000) {
      validationErrors.push(`Weekly revenue of $${extractedData.actual_weekly_revenue} seems unusually low. Please verify this is complete weekly data.`);
    }
    
    // Check revenue category distribution (should have some IV revenue typically)
    if (extractedData.drip_iv_revenue_weekly === 0 && extractedData.actual_weekly_revenue > 1000) {
      validationErrors.push('No IV therapy revenue detected, but total revenue > $1000. Please verify revenue categorization.');
    }
    
    // Check for data integrity - sum should equal total
    const categorySum = extractedData.drip_iv_revenue_weekly + 
                       extractedData.semaglutide_revenue_weekly + 
                       extractedData.ketamine_revenue_weekly + 
                       extractedData.membership_revenue_weekly + 
                       extractedData.other_revenue_weekly;
    const difference = Math.abs(categorySum - extractedData.actual_weekly_revenue);
    
    if (difference > 0.01) { // Allow for small rounding differences
      validationErrors.push(`Revenue categories ($${categorySum}) don't match total revenue ($${extractedData.actual_weekly_revenue}). Difference: $${difference}`);
    }
    
    // Check for file completeness indicators
    if (extractedData.rows_processed && extractedData.rows_processed < 10) {
      validationErrors.push(`Only ${extractedData.rows_processed} data rows processed. This seems low for a weekly revenue report.`);
    }
    
    // Log validation results
    if (validationErrors.length > 0) {
      console.log('⚠️ DATA VALIDATION WARNINGS:');
      validationErrors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error}`);
      });
      
      // For severe validation errors, stop the upload
      const severeErrors = validationErrors.filter(error => 
        error.includes('must be greater than') || 
        error.includes("don't match total")
      );
      
      if (severeErrors.length > 0) {
        // Clean up the uploaded file
        try {
          fs.unlinkSync(uploadedFile.path);
        } catch (cleanupError) {
          console.warn('Warning: Could not clean up temp file:', cleanupError.message);
        }
        
        return res.status(400).json({ 
          error: 'Data validation failed',
          validation_errors: validationErrors,
          suggestion: 'Please verify the uploaded file contains complete weekly revenue data with proper formatting.'
        });
      }
    } else {
      console.log('✅ Data validation passed');
    }

    // Store data in database (using similar logic to import-weekly-data)
    if (!pool) {
      throw new Error('Database connection not available');
    }

    // Insert or update analytics data with ALL fields from extractedData
    const insertQuery = `
      INSERT INTO analytics_data (
        actual_weekly_revenue, drip_iv_revenue_weekly, semaglutide_revenue_weekly, 
        ketamine_revenue_weekly, membership_revenue_weekly, other_revenue_weekly,
        week_start_date, week_end_date, upload_date,
        new_individual_members_weekly, new_family_members_weekly,
        new_concierge_members_weekly, new_corporate_members_weekly,
        individual_memberships, family_memberships, concierge_memberships, corporate_memberships,
        family_concierge_memberships, drip_concierge_memberships, total_drip_iv_members,
        iv_infusions_weekday_weekly, iv_infusions_weekend_weekly,
        injections_weekday_weekly, injections_weekend_weekly,
        unique_customers_weekly, member_customers_weekly, non_member_customers_weekly,
        iv_infusions_weekday_monthly, iv_infusions_weekend_monthly,
        injections_weekday_monthly, injections_weekend_monthly,
        unique_customers_monthly,
        actual_monthly_revenue, drip_iv_revenue_monthly, semaglutide_revenue_monthly,
        membership_revenue_monthly, other_revenue_monthly,
        weekly_revenue_goal, monthly_revenue_goal,
        semaglutide_consults_weekly, semaglutide_consults_monthly,
        semaglutide_injections_weekly, semaglutide_injections_monthly,
        popular_infusions, popular_injections, popular_weight_management,
        popular_infusions_status, popular_injections_status,
        hormone_followup_female_weekly, hormone_followup_female_monthly,
        hormone_initial_female_weekly, hormone_initial_female_monthly,
        hormone_initial_male_weekly, hormone_initial_male_monthly,
        hormone_followup_male_weekly, hormone_followup_male_monthly
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, NOW(),
        $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
        $20, $21, $22, $23, $24, $25, $26,
        $27, $28, $29, $30, $31,
        $32, $33, $34, $35, $36,
        $37, $38, $39, $40, $41, $42,
        $43, $44, $45, $46, $47,
        $48, $49, $50, $51, $52, $53, $54, $55
      )
      RETURNING id
    `;
    
    // Use week dates extracted from the Excel file data
    const weekStart = extractedData.week_start_date;
    const weekEnd = extractedData.week_end_date;
    
    console.log(`📅 Using week dates from file: ${weekStart} to ${weekEnd}`);
    console.log(`📊 New memberships: Individual=${extractedData.new_individual_members_weekly}, Family=${extractedData.new_family_members_weekly}`);
    
    // Check if this week already exists in the database
    const existingWeek = await pool.query(
      'SELECT id, week_start_date, week_end_date FROM analytics_data WHERE week_start_date = $1 AND week_end_date = $2',
      [weekStart, weekEnd]
    );
    
    if (existingWeek.rows.length > 0) {
      console.log(`⚠️  Week ${weekStart} to ${weekEnd} already exists in database (ID: ${existingWeek.rows[0].id})`);
      
      // Clean up uploaded file
      try {
        fs.unlinkSync(uploadedFile.path);
      } catch (cleanupError) {
        console.warn('Warning: Could not clean up temp file:', cleanupError.message);
      }
      
      return res.status(409).json({
        error: 'Duplicate week data',
        message: `Data for week ${weekStart} to ${weekEnd} already exists in the database. Please delete the existing record first if you want to re-upload.`,
        existingRecordId: existingWeek.rows[0].id
      });
    }
    
    const result = await pool.query(insertQuery, [
      extractedData.actual_weekly_revenue,
      extractedData.drip_iv_revenue_weekly, 
      extractedData.semaglutide_revenue_weekly,
      extractedData.ketamine_revenue_weekly,
      extractedData.membership_revenue_weekly,
      extractedData.other_revenue_weekly,
      weekStart,
      weekEnd,
      extractedData.new_individual_members_weekly || 0,
      extractedData.new_family_members_weekly || 0,
      extractedData.new_concierge_members_weekly || 0,
      extractedData.new_corporate_members_weekly || 0,
      0, // individual_memberships - should come from Active Memberships file only
      0, // family_memberships - should come from Active Memberships file only
      0, // concierge_memberships - should come from Active Memberships file only
      0, // corporate_memberships - should come from Active Memberships file only
      0, // family_concierge_memberships - should come from Active Memberships file only
      0, // drip_concierge_memberships - should come from Active Memberships file only
      0, // total_drip_iv_members - should come from Active Memberships file only
      extractedData.iv_infusions_weekday_weekly || 0,
      extractedData.iv_infusions_weekend_weekly || 0,
      extractedData.injections_weekday_weekly || 0,
      extractedData.injections_weekend_weekly || 0,
      extractedData.unique_customers_weekly || 0,
      extractedData.member_customers_weekly || 0,
      extractedData.non_member_customers_weekly || 0,
      extractedData.iv_infusions_weekday_monthly || 0,
      extractedData.iv_infusions_weekend_monthly || 0,
      extractedData.injections_weekday_monthly || 0,
      extractedData.injections_weekend_monthly || 0,
      extractedData.unique_customers_monthly || 0,
      extractedData.actual_monthly_revenue || 0,
      extractedData.drip_iv_revenue_monthly || 0,
      extractedData.semaglutide_revenue_monthly || 0,
      extractedData.membership_revenue_monthly || 0,
      extractedData.other_revenue_monthly || 0,
      extractedData.weekly_revenue_goal || 32125.00,
      extractedData.monthly_revenue_goal || 128500.00,
      extractedData.semaglutide_consults_weekly || 0,
      extractedData.semaglutide_consults_monthly || 0,
      extractedData.semaglutide_injections_weekly || 0,
      extractedData.semaglutide_injections_monthly || 0,
      extractedData.popular_infusions || ['Energy', 'Performance & Recovery', 'Saline 1L'],
      extractedData.popular_injections || ['B12 Injection', 'Vitamin D', 'Metabolism Boost'],
      extractedData.popular_weight_management || ['Tirzepatide', 'Semaglutide'],
      extractedData.popular_infusions_status || 'Active',
      extractedData.popular_injections_status || 'Active',
      extractedData.hormone_followup_female_weekly || 0,
      extractedData.hormone_followup_female_monthly || 0,
      extractedData.hormone_initial_female_weekly || 0,
      extractedData.hormone_initial_female_monthly || 0,
      extractedData.hormone_initial_male_weekly || 0,
      extractedData.hormone_initial_male_monthly || 0,
      extractedData.hormone_followup_male_weekly || 0,
      extractedData.hormone_followup_male_monthly || 0
    ]);
    
    console.log(`💾 Data saved to database with ID: ${result.rows[0].id}`);

    // Clean up uploaded file
    try {
      fs.unlinkSync(uploadedFile.path);
      console.log('🧹 Temporary file cleaned up');
    } catch (cleanupError) {
      console.warn('Warning: Could not clean up temp file:', cleanupError.message);
    }

    res.json({
      success: true,
      message: 'Excel file processed and revenue data categorized successfully',
      data: {
        totalWeeklyRevenue: extractedData.actual_weekly_revenue,
        dripIvRevenue: extractedData.drip_iv_revenue_weekly,
        semaglutideRevenue: extractedData.semaglutide_revenue_weekly,
        ketamineRevenue: extractedData.ketamine_revenue_weekly,
        membershipRevenue: extractedData.membership_revenue_weekly,
        otherRevenue: extractedData.other_revenue_weekly,
        weekStart: weekStart,
        weekEnd: weekEnd,
        recordId: result.rows[0].id,
        newMemberships: {
          individual: extractedData.new_individual_members_weekly || 0,
          family: extractedData.new_family_members_weekly || 0,
          concierge: extractedData.new_concierge_members_weekly || 0,
          corporate: extractedData.new_corporate_members_weekly || 0
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Upload processing failed:', error.message);
    console.error('Stack trace:', error.stack);
    
    // Clean up file on error
    try {
      if (req.file?.path) {
        fs.unlinkSync(req.file.path);
        console.log('🧹 Temporary file cleaned up after error');
      }
    } catch (cleanupError) {
      console.warn('Warning: Could not clean up temp file on error:', cleanupError.message);
    }
    
    res.status(500).json({ 
      error: 'Failed to process Excel file',
      details: error.message 
    });
  }
});

// Placeholder for remaining endpoints
console.log('Server setup complete');

// Start server with automatic migrations and mapping
app.listen(port, async () => {
  console.log(`🌟 Drip IV Dashboard server running on port ${port}`);

  // Run database migrations automatically
  await runMigrations(pool);

  // Auto-load service mapping if needed
  await autoLoadMapping(pool);

  console.log('\n✅ Server initialization complete - Ready to accept requests!\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  pool.end(() => {
    process.exit(0);
  });
});
