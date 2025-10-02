/**
 * Automatic Service Mapping Loader
 *
 * Automatically loads service-to-bin mapping from Excel on server startup
 * if the service_mapping table is empty or stale.
 */

const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const crypto = require('crypto');

// Default Excel file path (relative to project root)
const DEFAULT_EXCEL_PATH = path.join(__dirname, '..', 'Optimantra Services Export with Dashboard Bin Allocations.xlsx');

/**
 * Normalize service volume bin - fixes known typos
 */
function normalizeServiceVolumeBin(bin) {
  if (!bin) return bin;
  return bin.replace(/Total Hormne Services/gi, 'Total Hormone Services');
}

/**
 * Check if service mapping needs to be loaded
 */
async function shouldLoadMapping(pool) {
  try {
    // Check if service_mapping table exists
    const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'service_mapping'
      ) as exists
    `);

    if (!tableExists.rows[0].exists) {
      console.log('   ℹ️  service_mapping table does not exist (will be created by migration)');
      return false; // Migration will create it
    }

    // Check if table is empty
    const countResult = await pool.query('SELECT COUNT(*) as count FROM service_mapping');
    const count = parseInt(countResult.rows[0].count);

    if (count === 0) {
      console.log('   📭 service_mapping table is empty - needs loading');
      return true;
    }

    console.log(`   ✅ service_mapping has ${count} services`);

    // Check if mapping is stale (optional - could compare hashes)
    // For now, we'll just log the last update time
    const metaResult = await pool.query(`
      SELECT loaded_at, row_count, mapping_hash
      FROM mapping_meta
      ORDER BY loaded_at DESC
      LIMIT 1
    `);

    if (metaResult.rows.length > 0) {
      const lastLoaded = metaResult.rows[0].loaded_at;
      const rowCount = metaResult.rows[0].row_count;
      const hash = metaResult.rows[0].mapping_hash;

      console.log(`   📅 Last loaded: ${new Date(lastLoaded).toLocaleString()}`);
      console.log(`   🔢 Services loaded: ${rowCount}`);
      console.log(`   #️⃣  Mapping hash: ${hash.substring(0, 16)}...`);
    }

    return false; // Already loaded

  } catch (error) {
    console.warn('   ⚠️  Error checking mapping status:', error.message);
    return false; // Don't load if we can't check
  }
}

/**
 * Load service mapping from Excel file
 */
async function loadServiceMapping(pool, excelPath = DEFAULT_EXCEL_PATH) {
  console.log(`\n📂 Loading service mapping from Excel...`);

  try {
    // Check if Excel file exists
    if (!fs.existsSync(excelPath)) {
      console.warn(`   ⚠️  Excel file not found: ${excelPath}`);
      console.warn(`   Skipping automatic mapping load`);
      console.warn(`   Run manually: npm run load:mapping`);
      return false;
    }

    console.log(`   Reading: ${path.basename(excelPath)}`);

    // Read Excel file
    const workbook = XLSX.readFile(excelPath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Parse with header row at index 1 (skip title row)
    const data = XLSX.utils.sheet_to_json(worksheet, {
      defval: '',
      range: 1
    });

    console.log(`   Parsed ${data.length} services from Excel`);

    // Begin transaction
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
      if (!serviceName) continue;

      // Normalize service volume bin
      if (serviceVolumeBin) {
        serviceVolumeBin = normalizeServiceVolumeBin(serviceVolumeBin);
      }

      try {
        const result = await pool.query(
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
          row: i + 2,
          service: serviceName,
          error: err.message
        });
      }
    }

    // Calculate mapping hash
    const mappingData = JSON.stringify(data.map(r => ({
      name: r['Service Name'],
      type: r['Service Type']
    })));
    const mappingHash = crypto.createHash('sha256').update(mappingData).digest('hex');

    // Store metadata
    await pool.query(
      `INSERT INTO mapping_meta (mapping_hash, row_count, source_file)
       VALUES ($1, $2, $3)`,
      [mappingHash, data.length, path.basename(excelPath)]
    );

    console.log(`   ✅ Mapping loaded successfully!`);
    console.log(`      • Inserted: ${insertCount} new services`);
    console.log(`      • Updated: ${updateCount} existing services`);
    console.log(`      • Errors: ${errors.length}`);

    if (errors.length > 0 && errors.length <= 5) {
      errors.forEach(e => {
        console.warn(`      ⚠️  Row ${e.row} (${e.service}): ${e.error}`);
      });
    } else if (errors.length > 5) {
      console.warn(`      ⚠️  ${errors.length} errors occurred during load`);
    }

    return true;

  } catch (error) {
    console.error(`   ❌ Error loading service mapping:`, error.message);
    console.error(`   Server will continue, but mapping may be incomplete`);
    console.error(`   Run manually: npm run load:mapping`);
    return false;
  }
}

/**
 * Auto-load service mapping on server startup if needed
 */
async function autoLoadMapping(pool, excelPath = DEFAULT_EXCEL_PATH) {
  console.log('\n🗺️  Checking service mapping status...');

  try {
    const needsLoading = await shouldLoadMapping(pool);

    if (needsLoading) {
      await loadServiceMapping(pool, excelPath);
    } else {
      console.log('   ✅ Service mapping already loaded');
    }

  } catch (error) {
    console.error('   ⚠️  Auto-load mapping error:', error.message);
    // Don't crash the server
  }
}

/**
 * Get mapping status (for API endpoint or CLI)
 */
async function getMappingStatus(pool) {
  try {
    // Check if tables exist
    const tablesExist = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'service_mapping') as mapping_exists,
        (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'mapping_meta') as meta_exists
    `);

    if (tablesExist.rows[0].mapping_exists === 0) {
      return {
        status: 'not_initialized',
        message: 'service_mapping table does not exist'
      };
    }

    // Get service count
    const countResult = await pool.query('SELECT COUNT(*) as count FROM service_mapping');
    const serviceCount = parseInt(countResult.rows[0].count);

    // Get metadata
    let metadata = null;
    if (tablesExist.rows[0].meta_exists > 0) {
      const metaResult = await pool.query(`
        SELECT * FROM mapping_meta ORDER BY loaded_at DESC LIMIT 1
      `);
      if (metaResult.rows.length > 0) {
        metadata = metaResult.rows[0];
      }
    }

    return {
      status: serviceCount > 0 ? 'loaded' : 'empty',
      serviceCount,
      metadata,
      excelPath: DEFAULT_EXCEL_PATH,
      excelExists: fs.existsSync(DEFAULT_EXCEL_PATH)
    };

  } catch (error) {
    return {
      status: 'error',
      message: error.message
    };
  }
}

module.exports = {
  autoLoadMapping,
  loadServiceMapping,
  shouldLoadMapping,
  getMappingStatus
};
