# Concerns

## Structural
- `server.js` is a monolith with parsing, business logic, and routes; high change risk
- Heavy reliance on console logs for logic correctness

## Data correctness
- Revenue/service logic spans multiple passes with mixed row- vs visit-level calculations
- Filters for tips/memberships/gift cards are inconsistent across stages
- Multiple date parsing branches increase risk of mis-bucketing weeks

## Testing gaps
- No automated tests; regressions rely on manual scripts

## Operational
- Many one-off scripts and fix notes suggest frequent data issues; risk of drift between scripts and live logic
