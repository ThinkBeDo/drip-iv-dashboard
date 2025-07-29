#!/usr/bin/env node

// Test script to add July data locally
const axios = require('axios');

async function testJulyData() {
    try {
        console.log('🔄 Testing July data insertion...');
        
        // Test local server first
        const response = await axios.post('http://localhost:3000/api/add-july-data');
        
        console.log('✅ July data response:', response.data);
        
        // Test dashboard endpoint
        const dashboardResponse = await axios.get('http://localhost:3000/api/dashboard');
        
        console.log('📊 Dashboard data preview:');
        console.log('- Total Drip IV Members:', dashboardResponse.data.data?.total_drip_iv_members);
        console.log('- Weekly Revenue:', `$${dashboardResponse.data.data?.actual_weekly_revenue?.toLocaleString()}`);
        console.log('- Monthly Revenue:', `$${dashboardResponse.data.data?.actual_monthly_revenue?.toLocaleString()}`);
        console.log('- Week Range:', `${dashboardResponse.data.data?.week_start_date} to ${dashboardResponse.data.data?.week_end_date}`);
        
    } catch (error) {
        console.error('❌ Error testing July data:', error.response?.data || error.message);
        
        if (error.code === 'ECONNREFUSED') {
            console.log('\n💡 To test locally:');
            console.log('1. Start your server: npm start');
            console.log('2. Run this script: node test-july-data.js');
        }
    }
}

// Test against production Railway URL (update this with your actual URL)
async function testProduction(railwayUrl) {
    try {
        console.log(`🚀 Testing production at ${railwayUrl}...`);
        
        const response = await axios.post(`${railwayUrl}/api/add-july-data`);
        console.log('✅ Production July data:', response.data);
        
        const dashboardResponse = await axios.get(`${railwayUrl}/api/dashboard`);
        console.log('📊 Production dashboard ready!');
        
    } catch (error) {
        console.error('❌ Production error:', error.response?.data || error.message);
    }
}

testJulyData();

// Uncomment and update with your actual Railway URL to test production:
// testProduction('https://your-app-name.up.railway.app');
