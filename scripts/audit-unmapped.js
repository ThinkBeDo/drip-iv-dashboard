#!/usr/bin/env node

/**
 * Audit Unmapped Services
 *
 * Displays services that could not be matched during import,
 * grouped by week for operational review.
 *
 * Usage:
 *   node scripts/audit-unmapped.js [--weekStart=YYYY-MM-DD] [--limit=N]
 */

const { Pool } = require('pg');
require('dotenv').config();

async function auditUnmapped(options = {}) {
  console.log('🔍 Auditing Unmapped Services\n');
  console.log('═'.repeat(70));

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    // Build query based on options
    let query = `
      SELECT
        week_start,
        COUNT(*) as unmapped_count,
        COUNT(DISTINCT normalized_service_name) as unique_services,
        json_agg(DISTINCT jsonb_build_object(
          'service', normalized_service_name,
          'type', normalized_service_type,
          'count', 1
        )) as services
      FROM unmapped_services
    `;

    const params = [];

    if (options.weekStart) {
      query += ` WHERE week_start = $1`;
      params.push(options.weekStart);
    }

    query += `
      GROUP BY week_start
      ORDER BY week_start DESC
      LIMIT ${options.limit || 10}
    `;

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      console.log('\n✅ No unmapped services found!');

      if (options.weekStart) {
        console.log(`   (for week starting ${options.weekStart})`);
      }

      // Check if there are ANY unmapped services
      const totalCount = await pool.query('SELECT COUNT(*) as count FROM unmapped_services');
      if (totalCount.rows[0].count > 0) {
        console.log(`\n📊 Total unmapped services in database: ${totalCount.rows[0].count}`);
        console.log('   Use --weekStart to filter by specific week');
      }

      await pool.end();
      return;
    }

    console.log(`\n📊 Found ${result.rows.length} week(s) with unmapped services:\n`);

    for (const week of result.rows) {
      console.log(`Week: ${week.week_start}`);
      console.log(`  Total unmapped rows: ${week.unmapped_count}`);
      console.log(`  Unique services: ${week.unique_services}`);

      // Get detailed breakdown for this week
      const details = await pool.query(
        `SELECT
          normalized_service_name,
          normalized_service_type,
          COUNT(*) as count,
          json_agg(DISTINCT file_row->'Charge Desc') as charge_descs
        FROM unmapped_services
        WHERE week_start = $1
        GROUP BY normalized_service_name, normalized_service_type
        ORDER BY count DESC
        LIMIT 20`,
        [week.week_start]
      );

      if (details.rows.length > 0) {
        console.log('\n  Top unmapped services:');
        console.log('  ' + '─'.repeat(68));
        console.log('  Service Name'.padEnd(35) + 'Type'.padEnd(20) + 'Count');
        console.log('  ' + '─'.repeat(68));

        details.rows.forEach(row => {
          const name = (row.normalized_service_name || 'NULL').substring(0, 33).padEnd(35);
          const type = (row.normalized_service_type || 'NULL').substring(0, 18).padEnd(20);
          console.log(`  ${name}${type}${row.count}`);
        });

        if (details.rows.length === 20) {
          console.log('  ... (showing top 20 only)');
        }
      }

      console.log('');
    }

    // Summary statistics
    const summary = await pool.query(`
      SELECT
        COUNT(DISTINCT week_start) as total_weeks,
        COUNT(*) as total_rows,
        COUNT(DISTINCT normalized_service_name) as unique_services
      FROM unmapped_services
    `);

    console.log('\n📈 Overall Summary:');
    console.log(`   Total weeks with unmapped: ${summary.rows[0].total_weeks}`);
    console.log(`   Total unmapped rows: ${summary.rows[0].total_rows}`);
    console.log(`   Unique unmapped services: ${summary.rows[0].unique_services}`);

    // Suggest next steps
    console.log('\n💡 Next Steps:');
    console.log('   1. Review unmapped services above');
    console.log('   2. Add missing services to Excel mapping file');
    console.log('   3. Run: npm run load:mapping');
    console.log('   4. Re-import affected weeks');

  } catch (error) {
    console.error('\n❌ Error auditing unmapped services:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options = {};

args.forEach(arg => {
  if (arg.startsWith('--weekStart=')) {
    options.weekStart = arg.split('=')[1];
  } else if (arg.startsWith('--limit=')) {
    options.limit = parseInt(arg.split('=')[1]);
  }
});

// Run the audit
auditUnmapped(options);
