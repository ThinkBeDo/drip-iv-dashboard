# Conventions

## Language
- JavaScript (CommonJS) in `server.js` and scripts
- Minimal module structure; most logic centralized in `server.js`

## Patterns
- Console logging for debugging and validations
- Helper functions for service classification and revenue categorization
- Inline data validation with warnings in parsing pipeline

## Naming
- Functions: camelCase (e.g., `extractFromCSV`)
- Constants: camelCase or lower snake (e.g., `revenueCategoryMapping`)
- Files: descriptive, often `test-*.js` for scripts

## Error handling
- Try/catch around file parsing and DB operations
- Errors returned as JSON in API routes

## Dates
- Manual parsing of date strings in multiple formats
- Prefer `Date Of Payment` for revenue week calculations
