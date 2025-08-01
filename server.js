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
    ketamine_new_patient_weekly: 0,
    ketamine_initial_booster_weekly: 1,
    ketamine_booster_pain_weekly: 0,
    ketamine_booster_bh_weekly: 2,
    drip_iv_weekday_weekly: 171,
    drip_iv_weekend_weekly: 47,
    semaglutide_consults_weekly: 3,
    semaglutide_injections_weekly: 39,
    hormone_followup_female_weekly: 1,
    hormone_initial_male_weekly: 1,
    ketamine_new_patient_monthly: 0,
    ketamine_initial_booster_monthly: 6,
    ketamine_booster_pain_monthly: 1,
    ketamine_booster_bh_monthly: 12,
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
    ketamine_revenue_weekly: "2000.00",
    drip_iv_revenue_monthly: "31090.15",
    semaglutide_revenue_monthly: "17143.75",
    ketamine_revenue_monthly: "2000.00",
    total_drip_iv_members: 126,
    hubspot_ketamine_conversions: 0,
    marketing_initiatives: 1,
    concierge_memberships: 21,
    corporate_memberships: 1,
    days_left_in_month: 18,
    created_at: "2025-07-29T19:34:55.944Z",
    updated_at: "2025-07-29T19:34:55.944Z"
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

// Utility function to parse CSV data
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

function extractFromPDF(pdfText) {
  const data = {
    // Default values
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
    actual_weekly_revenue: 0,
    weekly_revenue_goal: 0,
    actual_monthly_revenue: 0,
    monthly_revenue_goal: 0,
    drip_iv_revenue_weekly: 0,
    semaglutide_revenue_weekly: 0,
    ketamine_revenue_weekly: 0,
    drip_iv_revenue_monthly: 0,
    semaglutide_revenue_monthly: 0,
    ketamine_revenue_monthly: 0,
    total_drip_iv_members: 0,
    hubspot_ketamine_conversions: 0,
    marketing_initiatives: 0,
    concierge_memberships: 0,
    corporate_memberships: 0,
    days_left_in_month: 0
  };

  // Extract data using regex patterns
  const patterns = {
    'ketamine_new_patient': /Ketamine \(New Patient\)\s+(\d+)\s+(\d+)/,
    'ketamine_initial_booster': /Ketamine \(Initial Booster-Series 6\)\s+(\d+)\s+(\d+)/,
    'ketamine_booster_pain': /Ketamine Booster \(Pain\)\s+(\d+)\s+(\d+)/,
    'ketamine_booster_bh': /Ketamine Booster \(BH\)\s+(\d+)\s+(\d+)/,
    'drip_iv_weekday': /Drip IV-Weekday\s+(\d+)\s+(\d+)/,
    'drip_iv_weekend': /Drip IV-Weekend\s+(\d+)\s+(\d+)/,
    'semaglutide_consults': /Semaglutide\/Tirzepitide Consults\s+(\d+)\s+(\d+)/,
    'semaglutide_injections': /Semaglutide\/Tirzepitide Injections\s+(\d+)\s+(\d+)/,
    'hormone_followup_female': /Hormones-Follow Up \(Females\)\s+(\d+)\s+(\d+)/,
    'hormone_initial_male': /Hormones-Initial Visit \(Males\)\s+(\d+)\s+(\d+)/,
    'weekly_revenue': /ACTUAL WEEKLY REVENUE\s+\$([0-9,]+\.?\d*)/,
    'weekly_goal': /WEEKLY REVENUE GOAL\s+\$([0-9,]+\.?\d*)/,
    'monthly_revenue': /ACTUAL MONTHLY REVENUE\s+\$([0-9,]+\.?\d*)/,
    'monthly_goal': /MONTHLY REVENUE GOAL\s+\$([0-9,]+)/,
    'total_members': /Total Drip IV Members.*?(\d+)/,
    'hubspot_conversions': /Hubspot Ketamine Conversions.*?(\d+)/,
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
        case 'ketamine_new_patient':
          data.ketamine_new_patient_weekly = parseInt(match[1]) || 0;
          data.ketamine_new_patient_monthly = parseInt(match[2]) || 0;
          break;
        case 'ketamine_initial_booster':
          data.ketamine_initial_booster_weekly = parseInt(match[1]) || 0;
          data.ketamine_initial_booster_monthly = parseInt(match[2]) || 0;
          break;
        case 'ketamine_booster_pain':
          data.ketamine_booster_pain_weekly = parseInt(match[1]) || 0;
          data.ketamine_booster_pain_monthly = parseInt(match[2]) || 0;
          break;
        case 'ketamine_booster_bh':
          data.ketamine_booster_bh_weekly = parseInt(match[1]) || 0;
          data.ketamine_booster_bh_monthly = parseInt(match[2]) || 0;
          break;
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
        case 'hubspot_conversions':
          data.hubspot_ketamine_conversions = parseInt(match[1]) || 0;
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
  const ketamineRevenue = pdfText.match(/\$([0-9,]+\.?\d*)\s*K\s*E\s*T\s*A\s*M\s*I\s*N\s*E/);

  if (dripIVRevenue) {
    data.drip_iv_revenue_weekly = parseFloat(dripIVRevenue[1].replace(/,/g, '')) || 0;
  }
  if (semaglutideRevenue) {
    data.semaglutide_revenue_weekly = parseFloat(semaglutideRevenue[1].replace(/,/g, '')) || 0;
  }
  if (ketamineRevenue) {
    data.ketamine_revenue_weekly = parseFloat(ketamineRevenue[1].replace(/,/g, '')) || 0;
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

  return data;
}

function extractFromCSV(csvData) {
  // Implementation for CSV parsing would go here
  // For now, return sample data structure
  return {
    week_start_date: new Date().toISOString().split('T')[0],
    week_end_date: new Date().toISOString().split('T')[0],
    // ... other fields would be extracted from CSV
  };
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
            ketamine_new_patient_weekly = $3, ketamine_initial_booster_weekly = $4,
            ketamine_booster_pain_weekly = $5, ketamine_booster_bh_weekly = $6,
            drip_iv_weekday_weekly = $7, drip_iv_weekend_weekly = $8,
            semaglutide_consults_weekly = $9, semaglutide_injections_weekly = $10,
            hormone_followup_female_weekly = $11, hormone_initial_male_weekly = $12,
            ketamine_new_patient_monthly = $13, ketamine_initial_booster_monthly = $14,
            ketamine_booster_pain_monthly = $15, ketamine_booster_bh_monthly = $16,
            drip_iv_weekday_monthly = $17, drip_iv_weekend_monthly = $18,
            semaglutide_consults_monthly = $19, semaglutide_injections_monthly = $20,
            hormone_followup_female_monthly = $21, hormone_initial_male_monthly = $22,
            actual_weekly_revenue = $23, weekly_revenue_goal = $24,
            actual_monthly_revenue = $25, monthly_revenue_goal = $26,
            drip_iv_revenue_weekly = $27, semaglutide_revenue_weekly = $28, ketamine_revenue_weekly = $29,
            drip_iv_revenue_monthly = $30, semaglutide_revenue_monthly = $31, ketamine_revenue_monthly = $32,
            total_drip_iv_members = $33, hubspot_ketamine_conversions = $34,
            marketing_initiatives = $35, concierge_memberships = $36, corporate_memberships = $37,
            days_left_in_month = $38, updated_at = CURRENT_TIMESTAMP
          WHERE week_start_date = $1 AND week_end_date = $2
          RETURNING id
        `;
        
        const updateValues = [
          extractedData.week_start_date, extractedData.week_end_date,
          extractedData.ketamine_new_patient_weekly, extractedData.ketamine_initial_booster_weekly,
          extractedData.ketamine_booster_pain_weekly, extractedData.ketamine_booster_bh_weekly,
          extractedData.drip_iv_weekday_weekly, extractedData.drip_iv_weekend_weekly,
          extractedData.semaglutide_consults_weekly, extractedData.semaglutide_injections_weekly,
          extractedData.hormone_followup_female_weekly, extractedData.hormone_initial_male_weekly,
          extractedData.ketamine_new_patient_monthly || 0, extractedData.ketamine_initial_booster_monthly || 0,
          extractedData.ketamine_booster_pain_monthly || 0, extractedData.ketamine_booster_bh_monthly || 0,
          extractedData.drip_iv_weekday_monthly || 0, extractedData.drip_iv_weekend_monthly || 0,
          extractedData.semaglutide_consults_monthly || 0, extractedData.semaglutide_injections_monthly || 0,
          extractedData.hormone_followup_female_monthly || 0, extractedData.hormone_initial_male_monthly || 0,
          extractedData.actual_weekly_revenue, extractedData.weekly_revenue_goal,
          extractedData.actual_monthly_revenue, extractedData.monthly_revenue_goal,
          extractedData.drip_iv_revenue_weekly, extractedData.semaglutide_revenue_weekly,
          extractedData.ketamine_revenue_weekly, extractedData.drip_iv_revenue_monthly || 0,
          extractedData.semaglutide_revenue_monthly || 0, extractedData.ketamine_revenue_monthly || 0,
          extractedData.total_drip_iv_members, extractedData.hubspot_ketamine_conversions,
          extractedData.marketing_initiatives, extractedData.concierge_memberships,
          extractedData.corporate_memberships, extractedData.days_left_in_month
        ];

        const result = await pool.query(updateQuery, updateValues);
        analyticsId = result.rows[0].id;
        
        console.log(`Updated existing data for ${extractedData.week_start_date} to ${extractedData.week_end_date}`);
      } else {
        // Insert new record
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
            total_drip_iv_members, hubspot_ketamine_conversions,
            marketing_initiatives, concierge_memberships, corporate_memberships,
            days_left_in_month
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
            $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
            $31, $32, $33, $34, $35, $36, $37
          ) RETURNING id
        `;

        const values = [
          extractedData.week_start_date,
          extractedData.week_end_date,
          extractedData.ketamine_new_patient_weekly,
          extractedData.ketamine_initial_booster_weekly,
          extractedData.ketamine_booster_pain_weekly,
          extractedData.ketamine_booster_bh_weekly,
          extractedData.drip_iv_weekday_weekly,
          extractedData.drip_iv_weekend_weekly,
          extractedData.semaglutide_consults_weekly,
          extractedData.semaglutide_injections_weekly,
          extractedData.hormone_followup_female_weekly,
          extractedData.hormone_initial_male_weekly,
          extractedData.ketamine_new_patient_monthly || 0,
          extractedData.ketamine_initial_booster_monthly || 0,
          extractedData.ketamine_booster_pain_monthly || 0,
          extractedData.ketamine_booster_bh_monthly || 0,
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
          extractedData.ketamine_revenue_weekly,
          extractedData.drip_iv_revenue_monthly || 0,
          extractedData.semaglutide_revenue_monthly || 0,
          extractedData.ketamine_revenue_monthly || 0,
          extractedData.total_drip_iv_members,
          extractedData.hubspot_ketamine_conversions,
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
        total_drip_iv_members, hubspot_ketamine_conversions,
        marketing_initiatives, concierge_memberships, corporate_memberships,
        days_left_in_month
      ) VALUES (
        '2025-07-07', '2025-07-13',
        0, 1, 0, 2, 171, 47, 3, 39, 1, 1,
        0, 6, 1, 12, 977, 232, 17, 208, 4, 3,
        29934.65, 32125, 50223.9, 128500,
        18337.4, 10422.25, 2000,
        31090.15, 17143.75, 2000,
        126, 0, 1, 21, 1, 18
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
        total_drip_iv_members, hubspot_ketamine_conversions,
        marketing_initiatives, concierge_memberships, corporate_memberships,
        days_left_in_month
      ) VALUES (
        '2025-07-07', '2025-07-13',
        0, 1, 0, 2, 171, 47, 3, 39, 1, 1,
        0, 6, 1, 12, 977, 232, 17, 208, 4, 3,
        29934.65, 32125, 50223.9, 128500,
        18337.4, 10422.25, 2000,
        31090.15, 17143.75, 2000,
        126, 0, 1, 21, 1, 18
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
