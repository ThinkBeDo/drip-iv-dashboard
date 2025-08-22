// Script to import July membership data directly
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const API_URL = 'https://drip-iv-dashboard-production.up.railway.app';
const EXCEL_FILE = '/Users/tylerlafleur/Desktop/Drip IV Active Memberships.xlsx';

async function importMembershipData() {
  try {
    console.log('📊 Starting membership data import...');
    console.log(`File: ${EXCEL_FILE}`);
    
    // Check if file exists
    if (!fs.existsSync(EXCEL_FILE)) {
      console.error('❌ Excel file not found!');
      return;
    }
    
    // Create form data
    const form = new FormData();
    form.append('membershipFile', fs.createReadStream(EXCEL_FILE));
    
    // Send request
    console.log('📤 Uploading to server...');
    const response = await axios.post(
      `${API_URL}/api/import-membership-excel`,
      form,
      {
        headers: {
          ...form.getHeaders()
        }
      }
    );
    
    console.log('✅ Import successful!');
    console.log('Response:', response.data);
    
    if (response.data.summary) {
      console.log('\n📊 Import Summary:');
      Object.entries(response.data.summary).forEach(([week, data]) => {
        console.log(`\n${week} (${data.start_date} to ${data.end_date}):`);
        console.log(`  Total Members: ${data.memberships.total}`);
        console.log(`  Individual: ${data.memberships.individual}`);
        console.log(`  Family: ${data.memberships.family}`);
        console.log(`  Concierge: ${data.memberships.concierge}`);
        console.log(`  Corporate: ${data.memberships.corporate}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Import failed!');
    if (error.response) {
      console.error('Error:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  }
}

// Run the import
importMembershipData();