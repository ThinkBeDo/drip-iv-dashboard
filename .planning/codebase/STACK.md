# Stack

## Runtime
- Node.js (>=18) via `server.js`

## Backend
- Express server in `server.js`
- Middleware: `cors`, `compression`, `helmet`, `multer`
- File parsing: `xlsx`, `csv-parser`, `csv-parse`, `pdf-parse`, `iconv-lite`
- DB client: `pg`

## Frontend
- Static HTML/CSS/JS in `public/index.html`
- No frontend framework

## Data storage
- PostgreSQL schema in `database/schema.sql`

## Tooling
- `nodemon` for dev
- Assorted node scripts in repo root and `scripts/`

## Deployment
- Railway config: `railway.json`, `railway.toml`
- `Dockerfile.pgweb` for pgweb
