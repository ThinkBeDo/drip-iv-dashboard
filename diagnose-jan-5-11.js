const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function analyzeWeekData() {
  const client = await pool.connect();
  
  try {
    console.log('=== Analyzing Jan 5-11, 2026 Data ===\n');
    
    // Check what data exists for Jan 5-11, 2026
    const weekSummary = await client.query(`
      SELECT 
        week_start_date,
        week_end_date,
        COUNT(*) as record_count,
        SUM(amount) as total_amount,
        MIN(service_date) as earliest_date,
        MAX(service_date) as latest_date
      FROM drip_iv_revenue_weekly
      WHERE service_date >= '2026-01-05' AND service_date <= '2026-01-11'
      GROUP BY week_start_date, week_end_date
      ORDER BY week_start_date
    `);
    
    console.log('Week Data Summary:');
    console.log(JSON.stringify(weekSummary.rows, null, 2));
    
    // Get detailed breakdown by service
    const services = await client.query(`
      SELECT 
        charge_description,
        COUNT(*) as count,
        SUM(amount) as total_amount
      FROM drip_iv_revenue_weekly
      WHERE service_date >= '2026-01-05' AND service_date <= '2026-01-11'
      GROUP BY charge_description
      ORDER BY total_amount DESC
    `);
    
    console.log('\n=== Services Breakdown ===');
    services.rows.forEach(s => {
      console.log(`${s.charge_description}: $${parseFloat(s.total_amount).toFixed(2)} (${s.count} times)`);
    });
    
    // Check for specific services mentioned in the issue
    const specific = await client.query(`
      SELECT 
        service_date,
        patient_name,
        charge_description,
        amount
      FROM drip_iv_revenue_weekly
      WHERE service_date >= '2026-01-05' AND service_date <= '2026-01-11'
        AND (
          charge_description ILIKE '%NAD 250mg%' OR
          charge_description ILIKE '%NAD 200mg%' OR
          charge_description ILIKE '%Micronutrient Labs%' OR
          charge_description ILIKE '%Xeomin%' OR
          charge_description ILIKE '%HD Vitamin C%' OR
          charge_description ILIKE '%Vitamin D3 Injection%' OR
          charge_description ILIKE '%Hormones - Initial%'
        )
      ORDER BY service_date, patient_name
    `);
    
    console.log('\n=== Specific Services (NAD, Labs, Xeomin, etc.) ===');
    console.log(JSON.stringify(specific.rows, null, 2));
    
    // Now analyze what's being counted vs not counted
    const categorized = await client.query(`
      SELECT 
        service_date,
        patient_name,
        charge_description,
        amount,
        CASE 
          WHEN charge_description ILIKE '%Saline 1L%' OR 
               charge_description ILIKE '%Hydration%' OR
               charge_description ILIKE '%Performance & Recovery%' OR
               charge_description ILIKE '%Energy%' OR
               charge_description ILIKE '%Immunity%' OR
               charge_description ILIKE '%Alleviate%' OR
               charge_description ILIKE '%All Inclusive%' OR
               charge_description ILIKE '%Lux Beauty%' OR
               charge_description ILIKE '%Methylene Blue Infusion%'
          THEN 'BASE_INFUSION'
          WHEN charge_description ILIKE '%B12 Injection%' OR
               charge_description ILIKE '%Metabolism Boost Injection%' OR
               charge_description ILIKE '%Vitamin D Injection%' OR
               charge_description ILIKE '%Glutathione Injection%' OR
               charge_description ILIKE '%Biotin Injection%' OR
               charge_description ILIKE '%Xeomin%'
          THEN 'STANDALONE_INJECTION'
          WHEN charge_description ILIKE '%Vitamin D3%' OR
               charge_description ILIKE '%Glutathione%' OR
               charge_description ILIKE '%NAD%' OR
               charge_description ILIKE '%Toradol%' OR
               charge_description ILIKE '%Magnesium%' OR
               charge_description ILIKE '%Vitamin B12%' OR
               charge_description ILIKE '%Zofran%' OR
               charge_description ILIKE '%Biotin%' OR
               charge_description ILIKE '%Vitamin C%' OR
               charge_description ILIKE '%Zinc%'
          THEN 'ADDON'
          WHEN charge_description ILIKE '%Membership%' OR
               charge_description ILIKE '%Lab%' OR
               charge_description ILIKE '%Office Visit%' OR
               charge_description ILIKE '%Consultation%'
          THEN 'ADMIN'
          WHEN charge_description ILIKE '%Semaglutide%' OR
               charge_description ILIKE '%Tirzepatide%' OR
               charge_description ILIKE '%Contrave%'
          THEN 'WEIGHT_LOSS'
          WHEN charge_description ILIKE '%Hormone%'
          THEN 'HORMONE'
          ELSE 'OTHER'
        END as category
      FROM drip_iv_revenue_weekly
      WHERE service_date >= '2026-01-05' AND service_date <= '2026-01-11'
      ORDER BY service_date, patient_name, charge_description
    `);
    
    console.log('\n=== Revenue by Category ===');
    const categoryTotals = {};
    categorized.rows.forEach(row => {
      if (!categoryTotals[row.category]) {
        categoryTotals[row.category] = 0;
      }
      categoryTotals[row.category] += parseFloat(row.amount);
    });
    
    Object.keys(categoryTotals).sort().forEach(cat => {
      console.log(`${cat}: $${categoryTotals[cat].toFixed(2)}`);
    });
    
    const total = categorized.rows.reduce((sum, r) => sum + parseFloat(r.amount), 0);
    console.log('\n=== Total from DB: $' + total.toFixed(2));
    
  } finally {
    client.release();
    await pool.end();
  }
}

analyzeWeekData().catch(console.error);
