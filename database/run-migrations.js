/**
 * Automatic Database Migration Runner
 *
 * Runs SQL migrations from database/migrations/ folder on server startup.
 * Tracks completed migrations in schema_migrations table.
 * Safe to run multiple times - only executes new migrations.
 */

const fs = require('fs');
const path = require('path');

/**
 * Run all pending database migrations
 * @param {Pool} pool - PostgreSQL connection pool
 */
async function runMigrations(pool) {
  console.log('\n🔧 Running database migrations...');

  try {
    // Create schema_migrations table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        migration_name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Get list of completed migrations
    const completedResult = await pool.query(
      'SELECT migration_name FROM schema_migrations ORDER BY migration_name'
    );
    const completedMigrations = new Set(
      completedResult.rows.map(row => row.migration_name)
    );

    // Read migration files from migrations directory
    const migrationsDir = path.join(__dirname, 'migrations');

    if (!fs.existsSync(migrationsDir)) {
      console.log('   ⚠️  No migrations directory found, skipping migrations');
      return;
    }

    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Ensures 001, 002, 003... order

    if (migrationFiles.length === 0) {
      console.log('   ℹ️  No migration files found');
      return;
    }

    console.log(`   Found ${migrationFiles.length} total migrations`);
    console.log(`   Already completed: ${completedMigrations.size}`);

    let executedCount = 0;
    let skippedCount = 0;

    // Execute pending migrations
    for (const filename of migrationFiles) {
      const migrationName = filename.replace('.sql', '');

      // Skip if already executed
      if (completedMigrations.has(migrationName)) {
        console.log(`   ⏭️  Skipping ${migrationName} (already completed)`);
        skippedCount++;
        continue;
      }

      console.log(`   🔄 Running ${migrationName}...`);

      try {
        // Read migration SQL file
        const migrationPath = path.join(migrationsDir, filename);
        const sql = fs.readFileSync(migrationPath, 'utf8');

        // Execute migration in a transaction
        await pool.query('BEGIN');

        try {
          // Run the migration SQL
          await pool.query(sql);

          // Record migration as completed
          await pool.query(
            'INSERT INTO schema_migrations (migration_name) VALUES ($1)',
            [migrationName]
          );

          await pool.query('COMMIT');

          console.log(`   ✅ ${migrationName} completed successfully`);
          executedCount++;

        } catch (err) {
          await pool.query('ROLLBACK');
          throw err;
        }

      } catch (err) {
        console.error(`   ❌ Migration ${migrationName} failed:`, err.message);

        // Log error but continue with other migrations
        // This allows the server to start even if a migration fails
        console.error(`   Stack: ${err.stack}`);
      }
    }

    // Summary
    console.log(`\n📊 Migration Summary:`);
    console.log(`   • Total migrations: ${migrationFiles.length}`);
    console.log(`   • Already completed: ${skippedCount}`);
    console.log(`   • Newly executed: ${executedCount}`);
    console.log(`   • Failed: ${migrationFiles.length - skippedCount - executedCount}`);

    if (executedCount > 0) {
      console.log(`\n✅ ${executedCount} new migration(s) completed successfully!`);
    } else if (skippedCount === migrationFiles.length) {
      console.log(`\n✅ All migrations up to date!`);
    }

  } catch (error) {
    console.error('\n❌ Migration runner error:', error.message);
    console.error('   Server will continue starting, but database may be out of sync');
    // Don't throw - allow server to start even if migrations fail
  }
}

/**
 * Get migration status (for API endpoint or CLI)
 * @param {Pool} pool - PostgreSQL connection pool
 */
async function getMigrationStatus(pool) {
  try {
    // Check if schema_migrations table exists
    const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'schema_migrations'
      ) as exists
    `);

    if (!tableExists.rows[0].exists) {
      return {
        status: 'not_initialized',
        message: 'Migration system not initialized',
        completedMigrations: [],
        pendingMigrations: []
      };
    }

    // Get completed migrations
    const completedResult = await pool.query(
      'SELECT migration_name, executed_at FROM schema_migrations ORDER BY migration_name'
    );

    const completed = completedResult.rows.map(row => ({
      name: row.migration_name,
      executedAt: row.executed_at
    }));

    // Get all migration files
    const migrationsDir = path.join(__dirname, 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .map(file => file.replace('.sql', ''))
      .sort();

    const completedNames = new Set(completed.map(m => m.name));
    const pending = migrationFiles.filter(name => !completedNames.has(name));

    return {
      status: pending.length === 0 ? 'up_to_date' : 'pending',
      totalMigrations: migrationFiles.length,
      completedCount: completed.length,
      pendingCount: pending.length,
      completedMigrations: completed,
      pendingMigrations: pending
    };

  } catch (error) {
    return {
      status: 'error',
      message: error.message
    };
  }
}

module.exports = {
  runMigrations,
  getMigrationStatus
};
