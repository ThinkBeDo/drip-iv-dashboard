const { Pool } = require('pg');
require('dotenv').config();

async function checkMonthlyRevenue() {
  console.log('='.repeat(80));
  console.log('MONTHLY REVENUE DIAGNOSTIC - OCTOBER 2025');
  console.log('='.repeat(80));

  if (!process.env.DATABASE_URL) {
    console.log('\n❌ ERROR: DATABASE_URL not found in environment');
    console.log('To connect to Railway database:');
    console.log('1. Create .env file from .env.example');
    console.log('2. Add your Railway PostgreSQL URL as DATABASE_URL');
    console.log('3. Find the URL in Railway dashboard > PostgreSQL service > Connect');
    return;
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // Check what data exists in the database
    console.log('\n📊 Checking all data in analytics_data table...');
    
    const allDataResult = await pool.query(`
      SELECT
        week_start_date,
        week_end_date,
        actual_weekly_revenue,
        drip_iv_revenue_weekly,
        semaglutide_revenue_weekly,
        upload_date,
        created_at
      FROM analytics_data
      ORDER BY week_start_date DESC
      LIMIT 10
    `);

    console.log(`\n✅ Found ${allDataResult.rows.length} recent week(s) in database:\n`);
    
    if (allDataResult.rows.length === 0) {
      console.log('❌ NO DATA FOUND in analytics_data table');
      console.log('The database appears to be empty. Data needs to be uploaded.');
      return;
    }

    allDataResult.rows.forEach((row, i) => {
      console.log(`Week ${i + 1}: ${row.week_start_date} to ${row.week_end_date}`);
      console.log(`  Total Revenue: $${parseFloat(row.actual_weekly_revenue).toFixed(2)}`);
      console.log(`  IV Therapy: $${parseFloat(row.drip_iv_revenue_weekly).toFixed(2)}`);
      console.log(`  Weight Loss: $${parseFloat(row.semaglutide_revenue_weekly).toFixed(2)}`);
      console.log(`  Uploaded: ${row.upload_date || row.created_at}`);
      console.log('');
    });

    // Check specifically for September 2025 data
    console.log('\n🔍 Checking September 2025 specifically...');
    
    const sepDataResult = await pool.query(`
      SELECT
        week_start_date,
        week_end_date,
        actual_weekly_revenue,
        drip_iv_revenue_weekly,
        semaglutide_revenue_weekly,
        upload_date,
        created_at
      FROM analytics_data
      WHERE week_start_date >= '2025-09-01' AND week_start_date < '2025-10-01'
      ORDER BY week_start_date ASC
    `);

    if (sepDataResult.rows.length === 0) {
      console.log('❌ NO SEPTEMBER 2025 DATA FOUND');
      console.log('This explains why monthly = weekly totals');
      console.log('Need to upload September data to database');
    } else {
      console.log(`\n✅ Found ${sepDataResult.rows.length} September 2025 week(s):\n`);
      
      let totalRevenue = 0;
      let totalIV = 0;
      let totalSema = 0;

      sepDataResult.rows.forEach((row, i) => {
        const weekRevenue = parseFloat(row.actual_weekly_revenue) || 0;
        const ivRevenue = parseFloat(row.drip_iv_revenue_weekly) || 0;
        const semaRevenue = parseFloat(row.semaglutide_revenue_weekly) || 0;
        
        console.log(`Week ${i + 1}: ${row.week_start_date} to ${row.week_end_date}`);
        console.log(`  Total Revenue: $${weekRevenue.toFixed(2)}`);
        console.log(`  IV Therapy: $${ivRevenue.toFixed(2)}`);
        console.log(`  Weight Loss: $${semaRevenue.toFixed(2)}`);
        console.log('');

        totalRevenue += weekRevenue;
        totalIV += ivRevenue;
        totalSema += semaRevenue;
      });

      console.log('='.repeat(50));
      console.log('SEPTEMBER 2025 SHOULD SHOW:');
      console.log('='.repeat(50));
      console.log(`Total Revenue: $${totalRevenue.toFixed(2)}`);
      console.log(`IV Therapy: $${totalIV.toFixed(2)}`);
      console.log(`Weight Loss: $${totalSema.toFixed(2)}`);
      console.log(`Number of weeks: ${sepDataResult.rows.length}`);
      
      if (sepDataResult.rows.length === 1) {
        console.log('\n⚠️  ISSUE IDENTIFIED: Only 1 week of September data exists');
        console.log('This is why monthly totals = weekly totals in dashboard');
        console.log('Need to upload remaining September weeks to fix this');
      }
    }

    // Test the current monthly calculation query
    console.log('\n🧮 Testing current monthly calculation logic...');
    
    const currentDate = new Date();
    const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    
    console.log(`Current month: ${monthStart.toISOString().split('T')[0]} to ${monthEnd.toISOString().split('T')[0]}`);

    const monthlyQuery = await pool.query(`
      SELECT
        SUM(drip_iv_revenue_weekly) as total_iv_revenue,
        SUM(semaglutide_revenue_weekly) as total_sema_revenue,
        SUM(actual_weekly_revenue) as total_revenue,
        COUNT(*) as weeks_count
      FROM analytics_data
      WHERE week_start_date <= $2 AND week_end_date >= $1
    `, [monthStart.toISOString().split('T')[0], monthEnd.toISOString().split('T')[0]]);

    const monthlyData = monthlyQuery.rows[0];
    console.log('\nCurrent monthly calculation result:');
    console.log(`  Weeks found: ${monthlyData.weeks_count}`);
    console.log(`  Total Revenue: $${parseFloat(monthlyData.total_revenue || 0).toFixed(2)}`);
    console.log(`  IV Therapy: $${parseFloat(monthlyData.total_iv_revenue || 0).toFixed(2)}`);
    console.log(`  Weight Loss: $${parseFloat(monthlyData.total_sema_revenue || 0).toFixed(2)}`);

  } catch (error) {
    console.error('❌ Database Error:', error.message);
    console.log('\nPossible solutions:');
    console.log('1. Check DATABASE_URL is correct');
    console.log('2. Verify Railway database is accessible');
    console.log('3. Check network connectivity');
  } finally {
    await pool.end();
  }
}

checkMonthlyRevenue().then(() => {
  console.log('\n' + '='.repeat(80));
  console.log('MONTHLY REVENUE DIAGNOSTIC COMPLETE');
  console.log('='.repeat(80));
});