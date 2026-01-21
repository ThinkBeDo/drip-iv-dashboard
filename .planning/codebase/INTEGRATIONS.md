# Integrations

## Database
- PostgreSQL via `pg` in `server.js`
- Schema and migrations in `database/`

## File ingestion
- XLS/XLSX: `xlsx` parsing in `extractFromExcel()` in `server.js`
- CSV: `csv-parser` / `csv-parse` usage in `server.js`
- PDF: `pdf-parse` usage in `parsePDFData()` in `server.js`

## Hosting/infra
- Railway deployment configs: `railway.json`, `railway.toml`
- Optional pgweb container: `Dockerfile.pgweb`, `start-pgweb.sh`

## External APIs
- None detected (no third-party HTTP APIs used in app code)
