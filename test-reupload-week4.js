const XLSX = require('xlsx');
const FormData = require('form-data');
const fs = require('fs');
const axios = require('axios');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  // Delete week 4
  await pool.query("DELETE FROM analytics_data WHERE week_start_date = '2025-09-22'");
  console.log('Deleted week 4 data\n');
  
  // Read and filter week 4 data
  const workbook = XLSX.readFile('Patient Analysis (Charge Details & Payments) - V3  - With COGS (3).xls');
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const jsonData = XLSX.utils.sheet_to_json(worksheet);
  
  const weekData = jsonData.filter(row => {
    const dateStr = row['Date'];
    if (!dateStr) return false;
    const date = new Date((dateStr - 25569) * 86400 * 1000);
    return date >= new Date('2025-09-22') && date <= new Date('2025-09-28');
  });
  
  console.log(`Filtered ${weekData.length} rows for week 4`);
  
  // Create temp file
  const tempWorkbook = XLSX.utils.book_new();
  const tempWorksheet = XLSX.utils.json_to_sheet(weekData);
  XLSX.utils.book_append_sheet(tempWorkbook, tempWorksheet, 'Sheet1');
  XLSX.writeFile(tempWorkbook, 'temp_test.xls');
  
  // Upload
  const form = new FormData();
  form.append('file', fs.createReadStream('temp_test.xls'));
  
  try {
    const response = await axios.post('http://localhost:3000/api/upload', form, {
      headers: form.getHeaders()
    });
    
    console.log('\nUpload complete!');
  } catch (error) {
    console.error('Upload failed:', error.response?.data || error.message);
  }
  
  fs.unlinkSync('temp_test.xls');
  await pool.end();
})();
