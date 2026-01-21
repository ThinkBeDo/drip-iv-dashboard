# Session Summary: Non-Member Customer Count Bug Fix

**Date**: 2026-01-21
**Session Type**: Bug Investigation & Fix
**Project**: Drip IV Dashboard
**Live URL**: https://drip-iv-dashboard-production.up.railway.app

---

## Executive Summary

Fixed a critical bug where `non_member_customers_weekly` always showed `0` despite having 143 total customers and 106 members. The root cause was **row-level member detection** in the wrong file (`import-multi-week-data.js`), which was discovered after extensive debugging revealed that multi-week uploads bypass the main `import-weekly-data.js` file.

### Key Discovery
The upload flow for files containing multiple weeks of data uses `import-multi-week-data.js`, NOT `import-weekly-data.js`. Initial fixes were applied to the wrong file.

---

## Bug Analysis

### Symptoms
- API Response: `non_member_customers_weekly: 0`
- API Response: `member_customers_weekly: 106`
- API Response: `unique_customers_weekly: 143`
- **Math doesn't add up**: 143 - 106 ≠ 0

### Root Cause (Two Issues)

#### Issue 1: Row-Level vs Patient-Level Detection
The original code checked member status **per row**, not **per patient**:

```javascript
// BUGGY: Row-level detection
weekData.rows.forEach(row => {
  const isMember = chargeDesc.toLowerCase().includes('member');
  if (isMember) {
    metrics.member_customers_weekly.add(patient);  // Added for "Saline 1L (Member)"
  } else {
    metrics.non_member_customers_weekly.add(patient);  // Added for "B12 Injection"
  }
});
```

If a patient had BOTH member and non-member services, they got added to BOTH Sets. Since Sets deduplicate, the same patient could be in both, causing inconsistent counts.

#### Issue 2: `includes('member')` Bug
```javascript
const isMember = chargeDesc.toLowerCase().includes('member');
// BUG: This matches "non-member" because it contains "member"!
```

### The Fix

**File**: [import-multi-week-data.js](../import-multi-week-data.js)
**Commit**: `19f11a2`

1. **Pre-compute patient member status** before processing rows:
```javascript
const patientMemberStatus = new Map(); // patient -> hasMemberService

for (const row of weekData.rows) {
  const patient = (row['Patient'] || '').trim();
  const lowerDesc = (row['Charge Desc'] || '').toLowerCase();

  if (!patientMemberStatus.has(patient)) {
    patientMemberStatus.set(patient, false);
  }

  // Check for "(member)" but NOT "non-member"
  if (lowerDesc.includes('(member)') && !lowerDesc.includes('non-member')) {
    patientMemberStatus.set(patient, true);
  }
}
```

2. **Use pre-computed status** when tracking customers:
```javascript
if (patient) {
  metrics.unique_customers_weekly.add(patient);

  const isMemberPatient = patientMemberStatus.get(patient) || false;
  if (isMemberPatient) {
    metrics.member_customers_weekly.add(patient);
  } else {
    metrics.non_member_customers_weekly.add(patient);
  }
}
```

---

## Files Modified

| File | Commit | Change |
|------|--------|--------|
| `import-multi-week-data.js` | `19f11a2` | **THE REAL FIX** - Patient-level member detection |
| `import-weekly-data.js` | `dff7ba8` | Same fix (for single-week uploads) |
| `server.js` | `2b1fe73` | Same fix (for direct API calls) |
| `server.js` | `b628e5a` | Added commit hash to `/api/version` for deployment verification |

### Git History (Most Recent First)
```
19f11a2 Fix: Non-member customer count in import-multi-week-data.js (THE REAL BUG!)
1d9a1d9 Add verbose debug logging for member/non-member customer tracking
b628e5a Add deployment verification: commit hash in /api/version and module load log
dff7ba8 Fix: Non-member customer count in import-weekly-data.js
2659e90 Add debug logging for member detection to diagnose non-member count issue
2b1fe73 Fix: Non-member customer count using patient-level detection
88e6023 Fix: Implement row-level processing for revenue and service counts
```

---

## Upload Flow Discovery

### How Multi-Week Uploads Work

1. User uploads revenue file containing multiple weeks of data
2. Server receives file at `/api/import-weekly-data` endpoint
3. **If data spans multiple weeks**: `import-multi-week-data.js` is used
4. **If data is single week**: `import-weekly-data.js` is used

### Key Log Messages to Identify Path

**Multi-week path** (import-multi-week-data.js):
```
✅ Successfully processed 2 weeks
📅 Weeks in chronological order:
   1. 2025-12-22 to 2025-12-28 ($129.00, 1 customers)
   2. 2026-01-05 to 2026-01-11 ($30905.82, 143 customers)
```

**Single-week path** (import-weekly-data.js):
```
📦 import-weekly-data.js loaded (commit: dff7ba8, fix: patient-level member detection)
👥 PATIENT MEMBER STATUS PRE-COMPUTATION (FIX APPLIED):
```

---

## Verification Status

### Deployed to Railway
- **Commit**: `19f11a2` pushed to GitHub
- **Status**: Build completed, deployment in progress (as of session end)

### Pending Verification (NEXT SESSION)

After Railway deploys commit `19f11a2`, the next agent should:

1. **Re-upload the revenue file** (Jan 5-11, 2026 test data)

2. **Check Railway logs** for new debug output:
```
🗓️  Processing week Mon Jan 05 2026 to Sun Jan 11 2026 (XXX rows)
   👥 Patient member pre-computation: 143 patients (106 members, 37 non-members)
```

3. **Verify API response**:
```bash
curl https://drip-iv-dashboard-production.up.railway.app/api/dashboard
```
Expected:
- `non_member_customers_weekly` > 0 (should be ~37)
- `member_customers_weekly` + `non_member_customers_weekly` ≤ `unique_customers_weekly`

4. **Check browser console** for errors (previously saw 404 on health check)

---

## Expected Results After Fix

| Metric | Before Fix | After Fix |
|--------|------------|-----------|
| `unique_customers_weekly` | 143 | 143 |
| `member_customers_weekly` | 106 | 106 |
| `non_member_customers_weekly` | **0** | **37** |
| Math Check | 106 + 0 ≠ 143 | 106 + 37 = 143 ✅ |

---

## Known Issues / Observations

### Browser Console Errors (Unrelated to Bug)
```
Failed to load resource: 404
Health check failed: SyntaxError: Unexpected token '<', "<!DOCTYPE "...
runtime.lastError: A listener indicated an asynchronous response...
```
- The 404 and health check errors may indicate a routing issue or browser extension conflict
- `runtime.lastError` messages are from browser extensions, not our code

### Data Variance (From Original Testing)
| Metric | Expected | Actual | Status |
|--------|----------|--------|--------|
| Weight Loss Revenue | $10,199.00 | $10,224.00 | ⚠️ $25 variance |
| IV Therapy Revenue | $16,459.20 | $15,060.60 | ⚠️ ~$1,400 variance |
| Infusion Count | 90 | 71 | ⚠️ Data variance |

These variances are separate issues and should be investigated after confirming the non-member fix works.

---

## Test Files

- **Revenue File**: Patient Analysis export (Jan 5-11, 2026) - contains MHTML data
- **Membership File**: Member list export - contains membership totals

Both files should be re-uploaded after Railway deployment to verify the fix.

---

## Debugging Approach (For Reference)

The bug was discovered through systematic log tracing:

1. **Initial assumption**: Bug in `server.js` → Fixed, but didn't solve problem
2. **Second assumption**: Bug in `import-weekly-data.js` → Fixed, but logs showed code wasn't running
3. **Log analysis**: Noticed "Successfully processed 2 weeks" message
4. **Grep search**: Found message in `import-multi-week-data.js`
5. **Discovery**: Multi-week uploads use entirely different file!
6. **Fix**: Applied same patient-level detection to correct file

### Key Lesson
Always trace the **actual code path** by examining logs before assuming which file handles the request.

---

## Next Session Checklist

- [ ] Wait for Railway deployment of commit `19f11a2`
- [ ] Re-upload revenue + membership files
- [ ] Verify `non_member_customers_weekly > 0` in API response
- [ ] Verify math: member + non-member ≤ total
- [ ] Check for new debug logs showing pre-computation
- [ ] Investigate revenue variances (Weight Loss, IV Therapy)
- [ ] Investigate infusion count variance (90 expected vs 71 actual)
- [ ] Check browser console errors

---

## Contact / Resources

- **Railway Dashboard**: Check deployment status and logs
- **GitHub Repo**: ThinkBeDo/drip-iv-dashboard
- **Live URL**: https://drip-iv-dashboard-production.up.railway.app
- **API Endpoints**:
  - `/api/health` - Server health check
  - `/api/version` - Deployment version (should show `commitHash: 'dff7ba8'`)
  - `/api/dashboard` - Main data endpoint
