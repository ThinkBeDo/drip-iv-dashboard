# Bug Log

Keep entries brief and chronological. Each entry should include date, issue, solution, and prevention notes if applicable.

## Format

### YYYY-MM-DD - Brief Description
- **Issue**: What went wrong
- **Root Cause**: Why it happened
- **Solution**: How it was fixed
- **Prevention**: How to avoid it in the future

### 2026-01-31 - Membership upload rejected valid file (missing email)
- **Issue**: `/api/upload-memberships` rejected the Active Memberships file because it has no Email column.
- **Root Cause**: Validation required Email/Email Address despite the real file only having Patient and Title.
- **Solution**: Made email optional; warn and dedupe by patient name when email is missing.
- **Prevention**: Validate against real source files before enforcing required columns.
