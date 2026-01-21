# Architecture

## High-level
- Single-node Express app in `server.js`
- Static frontend served from `public/index.html`
- Data ingestion via file upload endpoints; parsing and aggregation run in-process
- Results stored in PostgreSQL `analytics_data` table and read back for dashboard

## Main flows
- Upload flow: `POST /api/upload` → `extractFromExcel()`/`extractFromCSV()` → computed metrics → insert into DB
- Membership upload: `POST /api/upload-memberships` → `parseExcelData()` → update membership counts
- Read flow: `GET /api/dashboard`, `GET /api/historical`, `GET /api/membership`

## Entry points
- `server.js` (Express app, routes, parsing logic, DB access)
- `public/index.html` (dashboard UI + fetches API)

## Data model
- `analytics_data` is the central table for weekly/monthly metrics (`database/schema.sql`)
- `file_uploads` tracks uploads (per schema)

## Key modules
- `extractFromExcel()` / `extractFromCSV()` / `extractFromPDF()` in `server.js`
- Service classification helpers: `isBaseInfusionService()`, `isStandaloneInjection()`, etc.
