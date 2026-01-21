# Testing

## Current state
- No formal test framework configured
- `npm test` is a placeholder in `package.json`

## Ad-hoc scripts
- Numerous `test-*.js` files in repo root used as manual checks
- Examples: `test-csv-parse-fix.js`, `test-upload-simulation.js`, `test-revenue-fix.js`

## Suggested direction
- Add a minimal test harness (e.g., node + tap/jest) for parsing logic
- Focus on regression tests for revenue/service counts
