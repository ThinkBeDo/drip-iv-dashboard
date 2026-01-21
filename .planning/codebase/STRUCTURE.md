# Structure

## Top-level
- `server.js` - Express server, routes, parsing, metrics
- `public/` - Static frontend
- `database/` - Schema and migrations
- `scripts/` - Service mapping utilities
- `test-*.js` / `diagnose-*.js` - One-off diagnostics/tests
- `*.md` - Fix notes, runbooks, documentation

## Key directories
- `public/index.html` - Main dashboard UI
- `database/schema.sql` - DB schema
- `database/migrations/` - Migration scripts
- `scripts/` - Data mapping and audit scripts

## Notable files
- `import-*.js` - Data import helpers
- `validate-*.js` / `verify-*.js` - Validation scripts
- `railway.json`, `railway.toml` - Deployment config
