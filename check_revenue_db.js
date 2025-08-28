const { Pool } = require('pg');
require('dotenv').config();

async function checkRevenue() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    const result = await pool.query(`
      SELECT 
        week_start_date,
        week_end_date,
        actual_weekly_revenue,
        actual_monthly_revenue,
        drip_iv_revenue_weekly,
        drip_iv_revenue_monthly,
        semaglutide_revenue_weekly,
        semaglutide_revenue_monthly
      FROM analytics_data 
      ORDER BY week_start_date DESC 
      LIMIT 3
    `);
    
    console.log('Database Revenue Values:');
    result.rows.forEach(row => {
      console.log('\n=== Week:', row.week_start_date, 'to', row.week_end_date, '===');
      console.log('Weekly Revenue:', row.actual_weekly_revenue);
      console.log('Monthly Revenue:', row.actual_monthly_revenue);
      console.log('Weekly IV:', row.drip_iv_revenue_weekly);
      console.log('Monthly IV:', row.drip_iv_revenue_monthly);
      console.log('Weekly Semaglutide:', row.semaglutide_revenue_weekly);
      console.log('Monthly Semaglutide:', row.semaglutide_revenue_monthly);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkRevenue();
