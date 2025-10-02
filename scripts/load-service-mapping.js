#!/usr/bin/env node

/**
 * Load Service Mapping from Excel to Database
 *
 * Reads the Optimantra Services Export Excel file and loads/updates
 * the service_mapping table with deterministic categorization rules.
 *
 * Usage: node scripts/load-service-mapping.js [--file=path/to/excel.xlsx]
 */

const { Pool } = require('pg');
const XLSX = require('xlsx');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

// Default Excel file path
const DEFAULT_EXCEL_PATH = 'Optimantra Services Export with Dashboard Bin Allocations.xlsx';

// Normalization function for service volume bins
function normalizeServiceVolumeBin(bin) {
  if (!bin) return bin;
  // Fix known typo: "Total Hormne Services" -> "Total Hormone Services"
  return bin.replace(/Total Hormne Services/gi, 'Total Hormone Services');
}

async function loadServiceMapping(excelPath) {
  console.log('🔄 Loading Service Mapping from Excel to Database\n');
  console.log('═'.repeat(60));

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    // 1. Read Excel file
    console.log(`\n📂 Reading Excel file: ${excelPath}`);

    if (!require('fs').existsSync(excelPath)) {
      throw new Error(`Excel file not found: ${excelPath}`);
    }

    const workbook = XLSX.readFile(excelPath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Parse with header row at index 1 (skip title row)
    const data = XLSX.utils.sheet_to_json(worksheet, {
      defval: '',
      range: 1
    });

    console.log(`✓ Parsed ${data.length} service rows from Excel\n`);

    // 2. Validate column names
    const requiredColumns = [
      'Service Name',
      'Service Type',
      'Charges',
      'Revenue Performance Bins',
      'Service Volume Analytics Bin',
      'Customer Analytics Bin'
    ];

    const firstRow = data[0];
    const missingColumns = requiredColumns.filter(col => !(col in firstRow));

    if (missingColumns.length > 0) {
      throw new Error(`Missing required columns: ${missingColumns.join(', ')}`);
    }

    // 3. Begin transaction
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 4. Process and upsert each service
      console.log('💾 Upserting services into service_mapping table...\n');

      let insertCount = 0;
      let updateCount = 0;
      const errors = [];

      for (let i = 0; i < data.length; i++) {
        const row = data[i];

        const serviceName = String(row['Service Name'] || '').trim();
        const serviceType = String(row['Service Type'] || '').trim();
        const charges = parseFloat(row['Charges']) || null;
        const revenuePerfBin = String(row['Revenue Performance Bins'] || '').trim() || null;
        let serviceVolumeBin = String(row['Service Volume Analytics Bin'] || '').trim() || null;
        const customerBin = String(row['Customer Analytics Bin'] || '').trim() || null;

        // Skip empty rows
        if (!serviceName) {
          continue;
        }

        // Normalize service volume bin
        if (serviceVolumeBin) {
          serviceVolumeBin = normalizeServiceVolumeBin(serviceVolumeBin);
        }

        try {
          const result = await client.query(
            `INSERT INTO service_mapping (
              service_name,
              service_type,
              default_charge,
              revenue_perf_bin,
              service_volume_bin,
              customer_bin
            ) VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (normalized_service_name, normalized_service_type)
            DO UPDATE SET
              service_name = EXCLUDED.service_name,
              service_type = EXCLUDED.service_type,
              default_charge = EXCLUDED.default_charge,
              revenue_perf_bin = EXCLUDED.revenue_perf_bin,
              service_volume_bin = EXCLUDED.service_volume_bin,
              customer_bin = EXCLUDED.customer_bin,
              updated_at = now()
            RETURNING (xmax = 0) AS inserted`,
            [serviceName, serviceType || null, charges, revenuePerfBin, serviceVolumeBin, customerBin]
          );

          if (result.rows[0].inserted) {
            insertCount++;
          } else {
            updateCount++;
          }

        } catch (err) {
          errors.push({
            row: i + 2, // Excel row number (1-indexed + header)
            service: serviceName,
            error: err.message
          });
        }
      }

      // 5. Calculate mapping hash for freshness tracking
      const mappingData = JSON.stringify(data.map(r => ({
        name: r['Service Name'],
        type: r['Service Type']
      })));
      const mappingHash = crypto.createHash('sha256').update(mappingData).digest('hex');

      // 6. Store metadata
      await client.query(
        `INSERT INTO mapping_meta (mapping_hash, row_count, source_file)
         VALUES ($1, $2, $3)`,
        [mappingHash, data.length, path.basename(excelPath)]
      );

      // 7. Commit transaction
      await client.query('COMMIT');

      console.log('✅ Service mapping loaded successfully!\n');
      console.log('📊 Summary:');
      console.log(`   • Inserted: ${insertCount} new services`);
      console.log(`   • Updated: ${updateCount} existing services`);
      console.log(`   • Total: ${insertCount + updateCount} services`);
      console.log(`   • Errors: ${errors.length}`);
      console.log(`   • Hash: ${mappingHash.substring(0, 16)}...`);

      if (errors.length > 0) {
        console.log('\n⚠️  Errors encountered:');
        errors.slice(0, 10).forEach(e => {
          console.log(`   Row ${e.row} (${e.service}): ${e.error}`);
        });
        if (errors.length > 10) {
          console.log(`   ... and ${errors.length - 10} more errors`);
        }
      }

      // 8. Display bin statistics
      const binStats = await client.query(`
        SELECT
          revenue_perf_bin,
          service_volume_bin,
          customer_bin,
          COUNT(*) as count
        FROM service_mapping
        GROUP BY revenue_perf_bin, service_volume_bin, customer_bin
        ORDER BY count DESC
      `);

      console.log('\n📈 Bin Distribution:');
      console.log('   Revenue Perf | Service Volume | Customer | Count');
      console.log('   ' + '─'.repeat(55));
      binStats.rows.slice(0, 15).forEach(row => {
        const rev = (row.revenue_perf_bin || 'NULL').padEnd(12);
        const vol = (row.service_volume_bin || 'NULL').padEnd(21);
        const cust = (row.customer_bin || 'NULL').padEnd(20);
        console.log(`   ${rev} | ${vol} | ${cust} | ${row.count}`);
      });

    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('\n❌ Error loading service mapping:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const fileArg = args.find(arg => arg.startsWith('--file='));
const excelPath = fileArg
  ? fileArg.split('=')[1]
  : path.join(__dirname, '..', DEFAULT_EXCEL_PATH);

// Run the loader
loadServiceMapping(excelPath);
