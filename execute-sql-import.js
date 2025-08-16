const fs = require('fs');
const pg = require('pg');
require('dotenv').config();

// Configure database connection
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:HAKCPSPQMVOhnwIEtFgiNLjOmJzJMlxR@autorack.proxy.rlwy.net:16513/railway',
  ssl: { rejectUnauthorized: false }
});

async function executeSQLImport() {
  console.log('🚀 Starting SQL import execution...\n');
  
  try {
    // Read the SQL file
    const sqlContent = fs.readFileSync('july-august-import.sql', 'utf-8');
    
    // Split by individual statements (each INSERT/DELETE is separate)
    const statements = sqlContent
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    console.log(`📊 Found ${statements.length} SQL statements to execute\n`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';
      
      // Skip pure comment lines
      if (statement.trim().startsWith('--')) continue;
      
      try {
        // Extract week info if it's an INSERT statement
        const weekMatch = statement.match(/'(\d{4}-\d{2}-\d{2})'/);
        const weekStart = weekMatch ? weekMatch[1] : 'Unknown';
        
        if (statement.includes('DELETE')) {
          console.log(`🗑️  Clearing data for week ${weekStart}...`);
        } else if (statement.includes('INSERT')) {
          console.log(`✅ Inserting data for week ${weekStart}...`);
        }
        
        await pool.query(statement);
        successCount++;
        
      } catch (error) {
        console.error(`❌ Error executing statement ${i + 1}:`, error.message);
        errorCount++;
      }
    }
    
    console.log(`\n📈 Import Summary:`);
    console.log(`   ✅ Successful: ${successCount} statements`);
    console.log(`   ❌ Failed: ${errorCount} statements\n`);
    
    // Verify the import
    console.log('🔍 Verifying imported data...\n');
    
    const result = await pool.query(`
      SELECT 
        week_start_date,
        week_end_date,
        actual_weekly_revenue,
        unique_customers_weekly,
        total_drip_iv_members
      FROM analytics_data
      WHERE week_start_date >= '2025-05-01'
      ORDER BY week_start_date
    `);
    
    console.log('📊 Imported Weeks:');
    let totalRevenue = 0;
    for (const row of result.rows) {
      console.log(`   ${row.week_start_date.toISOString().split('T')[0]} to ${row.week_end_date.toISOString().split('T')[0]}: $${row.actual_weekly_revenue} (${row.unique_customers_weekly} customers, ${row.total_drip_iv_members} members)`);
      totalRevenue += parseFloat(row.actual_weekly_revenue);
    }
    console.log(`   TOTAL REVENUE: $${totalRevenue.toFixed(2)}\n`);
    
    console.log('✨ SQL import completed successfully!');
    console.log('🎉 Your Drip IV Dashboard is now fully updated with July-August 2025 data!');
    
    await pool.end();
    
  } catch (error) {
    console.error('❌ Fatal error during import:', error.message);
    console.error(error);
    await pool.end();
    process.exit(1);
  }
}

// Run the import
executeSQLImport();