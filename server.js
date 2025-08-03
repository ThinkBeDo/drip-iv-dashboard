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
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Database connection
let pool;
let inMemoryData = null; // Store for development

if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('sqlite:')) {
  // For development with SQLite - we'll use a simpler in-memory approach
  console.log('⚠️  Using in-memory data store for development');
  pool = null;
  
  // Initialize with sample July data
  inMemoryData = {
    id: 1,
    upload_date: "2025-07-29T19:34:55.944Z",
    week_start_date: "2025-07-07T00:00:00.000Z",
    week_end_date: "2025-07-13T00:00:00.000Z",
    // NEW: Separated IV Infusions (full IV drips) from Injections (quick shots)
    iv_infusions_weekday_weekly: 120,    // IV drips (NAD, Energy, Performance, etc.)
    iv_infusions_weekend_weekly: 35,     // IV drips on weekends
    iv_infusions_weekday_monthly: 680,   // Monthly IV drips on weekdays
    iv_infusions_weekend_monthly: 175,   // Monthly IV drips on weekends
    
    injections_weekday_weekly: 51,       // Injections (Tirzepatide, Semaglutide, B12, etc.)
    injections_weekend_weekly: 12,       // Injections on weekends  
    injections_weekday_monthly: 297,     // Monthly injections on weekdays
    injections_weekend_monthly: 57,      // Monthly injections on weekends
    
    // Customer analytics
    unique_customers_weekly: 145,        // Actual unique patients served this week
    unique_customers_monthly: 687,       // Actual unique patients served this month
    member_customers_weekly: 98,         // Members who received services this week
    non_member_customers_weekly: 47,     // Non-members who received services this week
    
    // Legacy fields (for backward compatibility) - will be calculated as totals
    drip_iv_weekday_weekly: 171,  // Total services (infusions + injections)
    drip_iv_weekend_weekly: 47,   // Total services (infusions + injections)
    semaglutide_consults_weekly: 3,
    semaglutide_injections_weekly: 39,
    hormone_followup_female_weekly: 1,
    hormone_initial_male_weekly: 1,
    drip_iv_weekday_monthly: 977,
    drip_iv_weekend_monthly: 232,
    semaglutide_consults_monthly: 17,
    semaglutide_injections_monthly: 208,
    hormone_followup_female_monthly: 4,
    hormone_initial_male_monthly: 3,
    actual_weekly_revenue: "29934.65",
    weekly_revenue_goal: "32125.00",
    actual_monthly_revenue: "50223.90",
    monthly_revenue_goal: "128500.00",
    drip_iv_revenue_weekly: "18337.40",
    semaglutide_revenue_weekly: "10422.25",
    drip_iv_revenue_monthly: "31090.15",
    semaglutide_revenue_monthly: "17143.75",
    total_drip_iv_members: 126,
    individual_memberships: 104,  // calculated as 126 - 21 - 1
    family_memberships: 0,
    family_concierge_memberships: 0,
    drip_concierge_memberships: 0,
    marketing_initiatives: 1,
    concierge_memberships: 21,
    corporate_memberships: 1,
    days_left_in_month: 18,
    created_at: "2025-07-29T19:34:55.944Z",
    updated_at: "2025-07-29T19:34:55.944Z",
    // Popular services - calculated from actual service data
    popular_infusions: ["Energy", "NAD+", "Performance & Recovery"],
    popular_infusions_status: "Active",
    popular_injections: ["Tirzepatide", "Semaglutide", "B12"],
    popular_injections_status: "Active"
  };
} else {
  // PostgreSQL for production
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
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
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || 
        file.mimetype === 'application/pdf' ||
        file.originalname.endsWith('.csv') ||
        file.originalname.endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and PDF files are allowed'));
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
      // Handle UTF-16 encoding
      try {
        const fullBuffer = fs.readFileSync(filePath);
        const decoder = new TextDecoder(encoding);
        csvContent = decoder.decode(fullBuffer);
        
        // Remove BOM if present
        if (csvContent.charCodeAt(0) === 0xFEFF) {
          csvContent = csvContent.substring(1);
        }
        
        // Parse CSV content manually
        const lines = csvContent.split('\n').filter(line => line.trim());
        if (lines.length === 0) {
          return resolve([]);
        }
        
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
          if (values.length === headers.length) {
            const row = {};
            headers.forEach((header, index) => {
              row[header] = values[index] || '';
            });
            results.push(row);
          }
        }
        
        resolve(results);
      } catch (error) {
        reject(error);
      }
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

// Function to extract analytics data from parsed content
function extractAnalyticsData(content, isCSV = false) {
  if (isCSV) {
    // Handle CSV data format
    return extractFromCSV(content);
  } else {
    // Handle PDF text format
    return extractFromPDF(content);
  }
}

// Service categorization functions
function isInfusionService(chargeDesc) {
  const infusionServices = [
    'saline', 'nad', 'energy', 'performance', 'recovery', 'alleviate', 'immunity',
    'all inclusive', 'lux beauty', 'glutathione infusion', 'methylene blue infusion',
    'vitamin c', 'hydration', 'myers', 'tri-immune', 'iv', 'drip'
  ];
  
  const lowerDesc = chargeDesc.toLowerCase();
  return infusionServices.some(service => 
    lowerDesc.includes(service) && 
    !lowerDesc.includes('injection') && 
    !lowerDesc.includes('weekly') &&
    !lowerDesc.includes('monthly')
  );
}

function isInjectionService(chargeDesc) {
  const injectionServices = [
    'injection', 'weekly', 'monthly', 'tirzepatide', 'semaglutide', 
    'b12', 'vitamin b12', 'vitamin d3', 'metabolism boost', 'toradol',
    'glutathione injection'
  ];
  
  const lowerDesc = chargeDesc.toLowerCase();
  return injectionServices.some(service => lowerDesc.includes(service)) ||
         (lowerDesc.includes('weekly') || lowerDesc.includes('monthly'));
}

function getServiceCategory(chargeDesc) {
  if (isInjectionService(chargeDesc)) return 'injection';
  if (isInfusionService(chargeDesc)) return 'infusion';
  return 'other';
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
    'monthly_goal': /MONTHLY REVENUE GOAL\s+\$([0-9,]+)/,
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

  // Track unique patients for membership counts
  const membershipCounts = {
    individual: new Set(),
    family: new Set(),
    concierge: new Set(),
    corporate: new Set(),
    familyConcierge: new Set(),
    dripConcierge: new Set()
  };

  // Process CSV data to extract membership information
  csvData.forEach(row => {
    const chargeDesc = (row['Charge Desc'] || '').toLowerCase();
    const patient = row['Patient'] || '';
    
    if (!patient) return; // Skip rows without patient info
    
    // Map membership types based on charge descriptions
    if (chargeDesc.includes('membership - individual')) {
      membershipCounts.individual.add(patient);
    } else if (chargeDesc.includes('membership - family') && !chargeDesc.includes('new')) {
      membershipCounts.family.add(patient);
    } else if (chargeDesc.includes('membership - family (new)')) {
      membershipCounts.family.add(patient);
    } else if (chargeDesc.includes('concierge membership')) {
      membershipCounts.concierge.add(patient);
    } else if (chargeDesc.includes('membership - corporate')) {
      membershipCounts.corporate.add(patient);
    }
    
    // Note: Family & Concierge and Drip & Concierge combinations 
    // are not typically found in CSV data as separate line items
    // They would be calculated based on overlapping memberships
  });

  // Set membership counts
  data.individual_memberships = membershipCounts.individual.size;
  data.family_memberships = membershipCounts.family.size;
  data.concierge_memberships = membershipCounts.concierge.size;
  data.corporate_memberships = membershipCounts.corporate.size;
  data.family_concierge_memberships = 0; // Not tracked separately in CSV
  data.drip_concierge_memberships = 0; // Not tracked separately in CSV
  
  // Calculate total memberships
  data.total_drip_iv_members = data.individual_memberships + 
                               data.family_memberships + 
                               data.concierge_memberships + 
                               data.corporate_memberships;

  // Extract date range from CSV data if available
  // Look for date columns or use current week as fallback
  let minDate = null;
  let maxDate = null;
  
  csvData.forEach(row => {
    // Try to find date fields in common column names
    const dateFields = ['Date', 'Service Date', 'Transaction Date', 'Created Date'];
    for (const field of dateFields) {
      const dateStr = row[field];
      if (dateStr) {
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          if (!minDate || date < minDate) minDate = date;
          if (!maxDate || date > maxDate) maxDate = date;
        }
      }
    }
  });

  if (minDate && maxDate) {
    data.week_start_date = minDate.toISOString().split('T')[0];
    data.week_end_date = maxDate.toISOString().split('T')[0];
  } else {
    // Default to current week
    const now = new Date();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    const endOfWeek = new Date(now.setDate(now.getDate() - now.getDay() + 6));
    data.week_start_date = startOfWeek.toISOString().split('T')[0];
    data.week_end_date = endOfWeek.toISOString().split('T')[0];
  }

  // Process services and count infusions vs injections
  const weeklyCustomers = new Set();
  const monthlyCustomers = new Set();
  const memberCustomers = new Set();
  const nonMemberCustomers = new Set();
  const infusionServices = {};
  const injectionServices = {};
  
  csvData.forEach(row => {
    const chargeType = row['Charge Type'] || '';
    const chargeDesc = row['Charge Desc'] || '';
    const patient = row['Patient'] || '';
    const date = new Date(row['Date'] || '');
    const isMember = chargeDesc.toLowerCase().includes('member') && !chargeDesc.toLowerCase().includes('non-member');
    
    // Skip non-procedure rows
    if (chargeType !== 'PROCEDURE' && chargeType !== 'OFFICE_VISIT') return;
    if (!patient || !chargeDesc) return;
    
    // Track customers
    if (!isNaN(date.getTime())) {
      weeklyCustomers.add(patient);
      monthlyCustomers.add(patient);
      
      if (isMember) {
        memberCustomers.add(patient);
      } else {
        nonMemberCustomers.add(patient);
      }
    }
    
    // Categorize service
    const category = getServiceCategory(chargeDesc);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    
    if (category === 'infusion') {
      // Count infusions
      if (isWeekend) {
        data.iv_infusions_weekend_weekly++;
        data.iv_infusions_weekend_monthly++;
      } else {
        data.iv_infusions_weekday_weekly++;
        data.iv_infusions_weekday_monthly++;
      }
      
      // Track popular infusions
      const serviceName = chargeDesc.replace(/\s*\((Member|Non-Member)\)\s*/i, '').trim();
      infusionServices[serviceName] = (infusionServices[serviceName] || 0) + 1;
      
    } else if (category === 'injection') {
      // Count injections
      if (isWeekend) {
        data.injections_weekend_weekly++;
        data.injections_weekend_monthly++;
      } else {
        data.injections_weekday_weekly++;
        data.injections_weekday_monthly++;
      }
      
      // Track popular injections
      const serviceName = chargeDesc.replace(/\s*\((Member|Non-Member)\)\s*/i, '').trim();
      injectionServices[serviceName] = (injectionServices[serviceName] || 0) + 1;
    }
  });
  
  // Set customer counts
  data.unique_customers_weekly = weeklyCustomers.size;
  data.unique_customers_monthly = monthlyCustomers.size;
  data.member_customers_weekly = memberCustomers.size;
  data.non_member_customers_weekly = nonMemberCustomers.size;
  
  // Calculate legacy totals for backward compatibility
  data.drip_iv_weekday_weekly = data.iv_infusions_weekday_weekly + data.injections_weekday_weekly;
  data.drip_iv_weekend_weekly = data.iv_infusions_weekend_weekly + data.injections_weekend_weekly;
  data.drip_iv_weekday_monthly = data.iv_infusions_weekday_monthly + data.injections_weekday_monthly;
  data.drip_iv_weekend_monthly = data.iv_infusions_weekend_monthly + data.injections_weekend_monthly;
  
  // Calculate popular services (top 3)
  const topInfusions = Object.entries(infusionServices)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 3)
    .map(([name]) => name);
  
  const topInjections = Object.entries(injectionServices)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 3)
    .map(([name]) => name);
  
  data.popular_infusions = topInfusions.length > 0 ? topInfusions : ['Energy', 'NAD+', 'Performance & Recovery'];
  data.popular_injections = topInjections.length > 0 ? topInjections : ['Tirzepatide', 'Semaglutide', 'B12'];
  data.popular_infusions_status = 'Active';
  data.popular_injections_status = 'Active';

  console.log('CSV Service Analysis:', {
    infusions: {
      weekday: data.iv_infusions_weekday_weekly,
      weekend: data.iv_infusions_weekend_weekly,
      popular: data.popular_infusions
    },
    injections: {
      weekday: data.injections_weekday_weekly,
      weekend: data.injections_weekend_weekly,
      popular: data.popular_injections
    },
    customers: {
      unique: data.unique_customers_weekly,
      members: data.member_customers_weekly,
      nonMembers: data.non_member_customers_weekly
    }
  });

  console.log('CSV Membership Counts:', {
    individual: data.individual_memberships,
    family: data.family_memberships,
    concierge: data.concierge_memberships,
    corporate: data.corporate_memberships,
    total: data.total_drip_iv_members
  });

  return data;
}

// Routes

// Home page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API Routes

// Get dashboard data
app.get('/api/dashboard', async (req, res) => {
  try {
    if (!pool) {
      // Use in-memory data for development
      if (inMemoryData) {
        return res.json({
          success: true,
          data: inMemoryData
        });
      } else {
        return res.json({
          success: false,
          message: 'No data available. Please upload analytics data.',
          data: null
        });
      }
    }

    const result = await pool.query(`
      SELECT * FROM analytics_data 
      ORDER BY upload_date DESC 
      LIMIT 1
    `);
    
    if (result.rows.length === 0) {
      return res.json({
        success: false,
        message: 'No data available. Please upload analytics data.',
        data: null
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
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

// Upload and process file
app.post('/api/upload', upload.single('analyticsFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { filename, originalname, mimetype, size, path: filePath } = req.file;
    
    // Record file upload
    const fileRecord = await pool.query(`
      INSERT INTO file_uploads (filename, file_type, file_size)
      VALUES ($1, $2, $3)
      RETURNING id
    `, [originalname, mimetype, size]);

    const fileId = fileRecord.rows[0].id;

    try {
      let extractedData;
      
      if (mimetype === 'text/csv' || originalname.endsWith('.csv')) {
        const csvData = await parseCSVData(filePath);
        extractedData = extractAnalyticsData(csvData, true);
      } else if (mimetype === 'application/pdf' || originalname.endsWith('.pdf')) {
        const pdfText = await parsePDFData(filePath);
        extractedData = extractAnalyticsData(pdfText, false);
      } else {
        throw new Error('Unsupported file type');
      }

      // Check if data already exists for this date range
      const existingData = await pool.query(`
        SELECT id FROM analytics_data 
        WHERE week_start_date = $1 AND week_end_date = $2
      `, [extractedData.week_start_date, extractedData.week_end_date]);

      let analyticsId;
      
      if (existingData.rows.length > 0) {
        // Update existing record
        const updateQuery = `
          UPDATE analytics_data SET
            drip_iv_weekday_weekly = $3, drip_iv_weekend_weekly = $4,
            semaglutide_consults_weekly = $5, semaglutide_injections_weekly = $6,
            hormone_followup_female_weekly = $7, hormone_initial_male_weekly = $8,
            drip_iv_weekday_monthly = $9, drip_iv_weekend_monthly = $10,
            semaglutide_consults_monthly = $11, semaglutide_injections_monthly = $12,
            hormone_followup_female_monthly = $13, hormone_initial_male_monthly = $14,
            actual_weekly_revenue = $15, weekly_revenue_goal = $16,
            actual_monthly_revenue = $17, monthly_revenue_goal = $18,
            drip_iv_revenue_weekly = $19, semaglutide_revenue_weekly = $20,
            drip_iv_revenue_monthly = $21, semaglutide_revenue_monthly = $22,
            total_drip_iv_members = $23, individual_memberships = $24,
            family_memberships = $25, family_concierge_memberships = $26,
            drip_concierge_memberships = $27, marketing_initiatives = $28,
            concierge_memberships = $29, corporate_memberships = $30,
            days_left_in_month = $31, updated_at = CURRENT_TIMESTAMP
          WHERE week_start_date = $1 AND week_end_date = $2
          RETURNING id
        `;
        
        const updateValues = [
          extractedData.week_start_date, extractedData.week_end_date,
          extractedData.drip_iv_weekday_weekly, extractedData.drip_iv_weekend_weekly,
          extractedData.semaglutide_consults_weekly, extractedData.semaglutide_injections_weekly,
          extractedData.hormone_followup_female_weekly, extractedData.hormone_initial_male_weekly,
          extractedData.drip_iv_weekday_monthly || 0, extractedData.drip_iv_weekend_monthly || 0,
          extractedData.semaglutide_consults_monthly || 0, extractedData.semaglutide_injections_monthly || 0,
          extractedData.hormone_followup_female_monthly || 0, extractedData.hormone_initial_male_monthly || 0,
          extractedData.actual_weekly_revenue, extractedData.weekly_revenue_goal,
          extractedData.actual_monthly_revenue, extractedData.monthly_revenue_goal,
          extractedData.drip_iv_revenue_weekly, extractedData.semaglutide_revenue_weekly,
          extractedData.drip_iv_revenue_monthly || 0, extractedData.semaglutide_revenue_monthly || 0,
          extractedData.total_drip_iv_members, extractedData.individual_memberships || 0,
          extractedData.family_memberships || 0, extractedData.family_concierge_memberships || 0,
          extractedData.drip_concierge_memberships || 0, extractedData.marketing_initiatives,
          extractedData.concierge_memberships, extractedData.corporate_memberships,
          extractedData.days_left_in_month
        ];

        const result = await pool.query(updateQuery, updateValues);
        analyticsId = result.rows[0].id;
        
        console.log(`Updated existing data for ${extractedData.week_start_date} to ${extractedData.week_end_date}`);
      } else {
        // Insert new record
        const insertQuery = `
          INSERT INTO analytics_data (
            week_start_date, week_end_date,
            drip_iv_weekday_weekly, drip_iv_weekend_weekly,
            semaglutide_consults_weekly, semaglutide_injections_weekly,
            hormone_followup_female_weekly, hormone_initial_male_weekly,
            drip_iv_weekday_monthly, drip_iv_weekend_monthly,
            semaglutide_consults_monthly, semaglutide_injections_monthly,
            hormone_followup_female_monthly, hormone_initial_male_monthly,
            actual_weekly_revenue, weekly_revenue_goal,
            actual_monthly_revenue, monthly_revenue_goal,
            drip_iv_revenue_weekly, semaglutide_revenue_weekly,
            drip_iv_revenue_monthly, semaglutide_revenue_monthly,
            total_drip_iv_members, individual_memberships,
            family_memberships, family_concierge_memberships,
            drip_concierge_memberships, marketing_initiatives,
            concierge_memberships, corporate_memberships,
            days_left_in_month
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
            $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29
          ) RETURNING id
        `;

        const values = [
          extractedData.week_start_date,
          extractedData.week_end_date,
          extractedData.drip_iv_weekday_weekly,
          extractedData.drip_iv_weekend_weekly,
          extractedData.semaglutide_consults_weekly,
          extractedData.semaglutide_injections_weekly,
          extractedData.hormone_followup_female_weekly,
          extractedData.hormone_initial_male_weekly,
          extractedData.drip_iv_weekday_monthly || 0,
          extractedData.drip_iv_weekend_monthly || 0,
          extractedData.semaglutide_consults_monthly || 0,
          extractedData.semaglutide_injections_monthly || 0,
          extractedData.hormone_followup_female_monthly || 0,
          extractedData.hormone_initial_male_monthly || 0,
          extractedData.actual_weekly_revenue,
          extractedData.weekly_revenue_goal,
          extractedData.actual_monthly_revenue,
          extractedData.monthly_revenue_goal,
          extractedData.drip_iv_revenue_weekly,
          extractedData.semaglutide_revenue_weekly,
          extractedData.drip_iv_revenue_monthly || 0,
          extractedData.semaglutide_revenue_monthly || 0,
          extractedData.total_drip_iv_members,
          extractedData.individual_memberships || 0,
          extractedData.family_memberships || 0,
          extractedData.family_concierge_memberships || 0,
          extractedData.drip_concierge_memberships || 0,
          extractedData.marketing_initiatives,
          extractedData.concierge_memberships,
          extractedData.corporate_memberships,
          extractedData.days_left_in_month
        ];

        const result = await pool.query(insertQuery, values);
        analyticsId = result.rows[0].id;
        
        console.log(`Inserted new data for ${extractedData.week_start_date} to ${extractedData.week_end_date}`);
      }

      // Update file record as processed
      await pool.query(`
        UPDATE file_uploads 
        SET processed = true, analytics_data_id = $1 
        WHERE id = $2
      `, [analyticsId, fileId]);

      // Clean up uploaded file
      fs.unlink(filePath, (err) => {
        if (err) console.error('Error deleting uploaded file:', err);
      });

      res.json({
        success: true,
        message: existingData.rows.length > 0 ? 'Data updated successfully' : 'File processed successfully',
        analyticsId,
        data: extractedData
      });

    } catch (processingError) {
      // Update file record with error
      await pool.query(`
        UPDATE file_uploads 
        SET error_message = $1 
        WHERE id = $2
      `, [processingError.message, fileId]);

      throw processingError;
    }

  } catch (error) {
    console.error('Error processing upload:', error);
    
    // Clean up file if it exists
    if (req.file && req.file.path) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Error deleting failed upload file:', err);
      });
    }

    res.status(500).json({ 
      error: 'Failed to process file',
      details: error.message 
    });
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
        message: 'July data already exists',
        analyticsId: existingData.rows[0].id
      });
    }

    // Insert new data without ON CONFLICT clause
    const insertQuery = `
      INSERT INTO analytics_data (
        week_start_date, week_end_date,
        drip_iv_weekday_weekly, drip_iv_weekend_weekly,
        semaglutide_consults_weekly, semaglutide_injections_weekly,
        hormone_followup_female_weekly, hormone_initial_male_weekly,
        drip_iv_weekday_monthly, drip_iv_weekend_monthly,
        semaglutide_consults_monthly, semaglutide_injections_monthly,
        hormone_followup_female_monthly, hormone_initial_male_monthly,
        actual_weekly_revenue, weekly_revenue_goal,
        actual_monthly_revenue, monthly_revenue_goal,
        drip_iv_revenue_weekly, semaglutide_revenue_weekly,
        drip_iv_revenue_monthly, semaglutide_revenue_monthly,
        total_drip_iv_members, individual_memberships,
        family_memberships, family_concierge_memberships,
        drip_concierge_memberships, marketing_initiatives,
        concierge_memberships, corporate_memberships,
        days_left_in_month
      ) VALUES (
        '2025-07-07', '2025-07-13',
        171, 47, 3, 39, 1, 1,
        977, 232, 17, 208, 4, 3,
        29934.65, 32125, 50223.9, 128500,
        18337.4, 10422.25,
        31090.15, 17143.75,
        126, 105, 0, 0, 0, 1, 21, 1, 18
      ) RETURNING id
    `;

    const result = await pool.query(insertQuery);
    
    if (result.rows.length > 0) {
      res.json({
        success: true,
        message: 'July data added successfully',
        analyticsId: result.rows[0].id
      });
    } else {
      res.json({
        success: true,
        message: 'July data already exists'
      });
    }
  } catch (error) {
    console.error('Error adding July data:', error);
    res.status(500).json({ 
      error: 'Failed to add July data',
      details: error.message 
    });
  }
})
.post(async (req, res) => {
  try {
    // First check if data already exists
    const existingData = await pool.query(`
      SELECT id FROM analytics_data 
      WHERE week_start_date = '2025-07-07' AND week_end_date = '2025-07-13'
    `);

    if (existingData.rows.length > 0) {
      return res.json({
        success: true,
        message: 'July data already exists',
        analyticsId: existingData.rows[0].id
      });
    }

    // Insert new data without ON CONFLICT clause
    const insertQuery = `
      INSERT INTO analytics_data (
        week_start_date, week_end_date,
        drip_iv_weekday_weekly, drip_iv_weekend_weekly,
        semaglutide_consults_weekly, semaglutide_injections_weekly,
        hormone_followup_female_weekly, hormone_initial_male_weekly,
        drip_iv_weekday_monthly, drip_iv_weekend_monthly,
        semaglutide_consults_monthly, semaglutide_injections_monthly,
        hormone_followup_female_monthly, hormone_initial_male_monthly,
        actual_weekly_revenue, weekly_revenue_goal,
        actual_monthly_revenue, monthly_revenue_goal,
        drip_iv_revenue_weekly, semaglutide_revenue_weekly,
        drip_iv_revenue_monthly, semaglutide_revenue_monthly,
        total_drip_iv_members, individual_memberships,
        family_memberships, family_concierge_memberships,
        drip_concierge_memberships, marketing_initiatives,
        concierge_memberships, corporate_memberships,
        days_left_in_month
      ) VALUES (
        '2025-07-07', '2025-07-13',
        171, 47, 3, 39, 1, 1,
        977, 232, 17, 208, 4, 3,
        29934.65, 32125, 50223.9, 128500,
        18337.4, 10422.25,
        31090.15, 17143.75,
        126, 105, 0, 0, 0, 1, 21, 1, 18
      ) RETURNING id
    `;

    const result = await pool.query(insertQuery);
    
    res.json({
      success: true,
      message: 'July data added successfully',
      analyticsId: result.rows[0].id
    });
    
  } catch (error) {
    console.error('Error adding July data:', error);
    res.status(500).json({ 
      error: 'Failed to add July data',
      details: error.message 
    });
  }
});

// Health check
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ status: 'unhealthy', error: error.message });
  }
});

// Initialize database tables
async function initializeDatabase() {
  try {
    if (!pool) {
      console.log('🚀 Skipping database initialization (using in-memory store)');
      return;
    }
    
    const schemaPath = path.join(__dirname, 'database', 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, 'utf8');
      await pool.query(schema);
      console.log('Database initialized successfully');
    }
  } catch (error) {
    console.error('Error initializing database:', error);
  }
}

// Start server
app.listen(port, async () => {
  console.log(`🌟 Drip IV Dashboard server running on port ${port}`);
  await initializeDatabase();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  pool.end(() => {
    process.exit(0);
  });
});
