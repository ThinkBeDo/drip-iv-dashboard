# Browser Testing Protocol for Windsurf + Railway

**Purpose:** Replicate Vercel's agent browser workflow using Claude Browser MCP + Railway deployments for real-time web app testing and debugging.

---

## 🎯 **When to Use This Protocol**

Trigger this workflow when:
- Deploying new features to Railway preview/production
- Debugging console errors or runtime issues
- Testing UI interactions and user flows
- Validating API endpoints and data loading
- Checking cross-browser compatibility issues

---

## 📋 **Required Context**

Before starting browser testing, provide Claude with:

1. **Railway Project URL** - Link to Railway service dashboard
2. **Live Preview URL** - Deployed application URL (e.g., `your-app-production.up.railway.app`)
3. **Testing Scope** - What to test (specific features, pages, or full app audit)

---

## 🔄 **Browser Testing Workflow**

### **Phase 1: Railway Dashboard Inspection**

Navigate to Railway project dashboard to check:
- ✅ Service status (online/offline)
- ✅ Recent deployment success/failure
- ✅ Deploy logs for errors or warnings
- ✅ Build logs for compilation issues
- ✅ Service configuration (env vars, region, replicas)

**Expected Output:**
```
Deployment Status: Active ✅
Latest Deploy: [commit message] via GitHub
Deploy Time: [timestamp]
Build Status: Success
Runtime Logs: [any errors/warnings]
```

### **Phase 2: Live Application Testing**

Navigate to live preview URL and perform:

1. **Initial Load Test**
   - Take screenshot of landing page
   - Verify visual rendering (layout, colors, fonts)
   - Check for broken images or missing assets

2. **Console Log Analysis**
   ```javascript
   // Read all console messages
   read_console_messages(limit: 50, pattern: ".*")
   
   // Focus on errors only
   read_console_messages(limit: 50, pattern: "error|exception|failed", onlyErrors: true)
   ```

3. **Network Request Monitoring**
   ```javascript
   // Check API calls and responses
   read_network_requests(limit: 50, urlPattern: "/api/")
   
   // Monitor specific endpoints
   read_network_requests(urlPattern: "/api/users")
   ```

4. **Interactive Testing**
   - Click primary navigation elements
   - Test form submissions (with dummy data)
   - Verify button interactions
   - Test dropdown menus, modals, tooltips
   - Check responsive behavior (resize window if needed)

5. **Functional Flow Testing**
   - Complete key user journeys (e.g., login → dashboard → action)
   - Test data loading and state changes
   - Verify error handling (trigger edge cases if safe)

**Expected Output:**
```
✅ UI Loads Successfully
✅ No Critical Console Errors
🚨 Found Issues:
   1. [Error description with line number]
   2. [API endpoint returning wrong format]
   3. [UI element not responding to click]

Console Logs:
   [timestamp] [LOG] Feature X loaded successfully
   [timestamp] [ERROR] Failed to fetch /api/endpoint - 404
```

---

## 🐛 **Error Classification**

### **Critical Errors** (Fix Immediately)
- API endpoints returning 404/500 errors
- JavaScript runtime errors breaking features
- Authentication/authorization failures
- Data loading failures (blank screens, infinite loaders)

### **High Priority** (Fix Soon)
- Console warnings affecting functionality
- Slow API responses (>3 seconds)
- Memory leaks or performance degradation
- Cross-browser compatibility issues

### **Low Priority** (Fix Later)
- Browser extension conflicts (not your code)
- Minor styling inconsistencies
- Non-blocking console warnings
- Third-party library deprecation notices

---

## 📊 **Reporting Template**

After testing, provide this structured report:

```markdown
## Browser Test Report - [App Name]

**Test Date:** [timestamp]
**Railway Deploy:** [commit hash or deploy ID]
**Live URL:** [preview URL]

### Deployment Status
- ✅/🚨 Service Health: [Online/Offline]
- ✅/🚨 Deploy Success: [Yes/No]
- ✅/🚨 Build Logs: [Clean/Has Warnings]

### Application Testing

#### Visual Check
- ✅/🚨 UI Renders: [Correctly/Has Issues]
- ✅/🚨 Assets Load: [All/Some Missing]
- Screenshot: [image ID or description]

#### Console Errors
**Critical:**
1. [Error message] - Line [X] - Impact: [description]

**High Priority:**
1. [Warning message] - Impact: [description]

**Low Priority:**
1. [Minor issue] - Impact: [minimal]

#### Network Issues
- 🚨 Failed Requests: [endpoint] → [status code] → [error]
- ⚠️ Slow Requests: [endpoint] → [response time]ms

#### Interactive Testing
- ✅ Button clicks respond correctly
- 🚨 [Feature X] not working - [error description]
- ✅ Forms submit successfully

### Recommended Fixes

**Immediate:**
1. Fix [API endpoint] returning HTML instead of JSON
2. Add error handling for [failed feature]

**Soon:**
1. Optimize [slow API call]
2. Add loading states for [feature]

**Later:**
1. Refactor [minor issue]
```

---

## 🛠️ **Integration with Windsurf**

### **Triggering Browser Testing from Windsurf**

When working in Windsurf, use this pattern:

```markdown
**Developer (in Windsurf):**
"I just deployed the new authentication flow to Railway. 
Can you test it in the browser?"

**Claude Response:**
1. Navigate to Railway dashboard → check deploy status
2. Open live preview URL → test login/signup flow
3. Monitor console for auth errors
4. Test session persistence
5. Report back with findings + fixes needed
```

### **Feedback Loop**

```
1. Windsurf Cascade makes code changes
2. Push to GitHub → Railway auto-deploys
3. Claude browser tests the live preview
4. Claude reports errors back to Windsurf
5. Cascade fixes issues → repeat cycle
```

---

## 🚀 **Advanced Techniques**

### **Automated Test Scripts**

For repetitive tests, create JavaScript snippets:

```javascript
// Example: Test all navigation links
const links = document.querySelectorAll('nav a');
links.forEach(link => {
  console.log(`Testing: ${link.href}`);
  // Claude can execute via computer tool
});
```

### **Performance Monitoring**

```javascript
// Measure page load time
window.addEventListener('load', () => {
  const loadTime = performance.timing.loadEventEnd - performance.timing.navigationStart;
  console.log(`Page loaded in ${loadTime}ms`);
});
```

### **State Inspection**

For React/Vue apps:
```javascript
// Access React DevTools data (if available)
// Check component state, props, context
```

---

## 📌 **Best Practices**

1. **Always check Railway logs first** - Deploy issues often show up there before browser
2. **Clear console before testing** - Use `clear: true` to avoid old messages
3. **Test in incognito** - Avoid cache/extension conflicts
4. **Document user flows** - Explain what you're testing and why
5. **Provide actionable feedback** - Don't just say "error", explain impact and fix
6. **Screenshot liberally** - Visual proof helps debugging

---

## 🔗 **Related Tools**

- **Railway MCP** - For deploy logs and service status
- **Browser MCP** - For live app testing and console access
- **Desktop Commander** - For local file access and CLI operations
- **GitHub MCP** - For commit history and PR context

---

## 📝 **Example Session**

```
User: "Test the Drip IV dashboard deployment"

Claude:
1. Navigate to Railway dashboard
   ✅ Service online
   ✅ Deploy successful (3f8946bd)
   ✅ Logs show data processing working

2. Open live preview (drip-iv-dashboard-production.up.railway.app)
   ✅ UI loads correctly
   ✅ Data displays properly
   🚨 Found error: "Check Database Status" button broken

3. Click "Check Database Status"
   🚨 Error: API returns HTML instead of JSON
   🚨 Likely cause: Missing route or 404 error

4. Console shows:
   - SyntaxError: Unexpected token '<'
   - Endpoint likely returning 404 page

Recommendation: Check /api/check-db route in Express/Flask
```

---

**Last Updated:** 2026-01-21  
**Maintained By:** Tyler LaFleur / HP3 Consulting  
**Version:** 1.0
