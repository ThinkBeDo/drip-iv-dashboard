# Windsurf Automation Hooks Documentation

## Overview
This document describes the 5 custom automation hooks configured for the Drip IV Dashboard project. These hooks eliminate development friction and maintain flow state by automating repetitive tasks.

---

## Hook Configurations

### 1. Auto-Commit & Push After Code Changes
**Status:** ⚠️ DISABLED (enable manually when ready)  
**Trigger:** `PostToolUse`  
**Fires After:** `Write`, `Edit`, `MultiEdit` operations  
**Timeout:** 30 seconds

**What It Does:**
- Automatically stages all changes (`git add -A`)
- Commits with message: "Auto-commit: AI code changes"
- Pushes to `origin/main` to trigger Railway deployment
- Logs output to `~/.claude/hook-debug.log`

**Why Disabled:**
This hook is powerful but potentially disruptive. Enable it only when you want fully automated deployments after every code change.

**To Enable:**
Change `"enabled": false` to `"enabled": true` in `.claude/settings.json`

**Safety Considerations:**
- Git will reject push if remote has changes (prevents conflicts)
- Creates many small commits (consider squashing later)
- Triggers Railway deployment immediately (ensure changes are tested)

---

### 2. Session Context Injection
**Status:** ✅ ENABLED  
**Trigger:** `SessionStart`  
**Fires:** When Windsurf session begins  
**Timeout:** 10 seconds

**What It Does:**
Automatically displays at session start:
- Current git branch
- Uncommitted changes (`git status --short`)
- Last 5 commits (`git log --oneline -5`)
- Up to 10 TODO/FIXME comments from `.js` and `.md` files

**Example Output:**
```
=== SESSION CONTEXT ===

📍 Branch:
main

📝 Status:
M server.js
?? new-script.js

📜 Recent commits:
56e770a docs: Add session documentation
19f11a2 Fix: Non-member customer count
1d9a1d9 Add verbose debug logging

🔍 TODOs:
server.js:45:// TODO: Refactor revenue calculation
server.js:892:// FIXME: Handle edge case for zero revenue

=== END CONTEXT ===
```

**Benefits:**
- Instant awareness of repo state
- No need to manually run `git status`
- Surfaces forgotten TODOs

---

### 3. Auto-Approve Safe Commands
**Status:** ✅ ENABLED  
**Trigger:** `PermissionRequest`  
**Fires:** Before permission dialog appears  

**Auto-Approved Commands:**
- **Git read operations:** `git status`, `git log`, `git branch`, `git diff`
- **Diagnostic scripts:** `node check-*.js`, `node test-*.js`, `node diagnose-*.js`, `node validate-*.js`, `node analyze-*.js`
- **Package management:** `npm install`, `npm run`
- **File operations:** `ls`, `cat`, `grep`

**What It Does:**
Eliminates permission dialogs for safe, read-only operations and your diagnostic scripts.

**Safety:**
- Only read-only git commands (no `git push`, `git commit`, `git reset`)
- No destructive file operations (no `rm`, `mv`, `dd`)
- Pattern matching prevents accidental approval of dangerous variants

**Not Auto-Approved:**
- `git push` (requires manual approval)
- `git commit` (requires manual approval)
- `rm`, `mv`, `dd` (destructive operations)
- Database operations (requires manual approval)

---

### 4. Syntax Validation After AI Completion
**Status:** ✅ ENABLED  
**Trigger:** `Stop`  
**Fires:** After AI finishes responding  
**Timeout:** 15 seconds

**What It Does:**
- Runs `node -c server.js` to check syntax
- Displays ✅ if syntax is valid
- Displays ❌ if syntax errors detected
- Logs output to `~/.claude/hook-debug.log`

**Example Output:**
```
🔍 Running validation...
✅ Syntax check passed
```

**Benefits:**
- Immediate feedback on code validity
- Catches syntax errors before deployment
- No need to manually run validation

**Limitations:**
- Only checks `server.js` syntax (not runtime errors)
- Doesn't run full test suite (no tests configured)
- Can be expanded to check other files or run diagnostic scripts

**Future Enhancements:**
```bash
# Add more validation steps:
"command": "echo '🔍 Running validation...' && node -c server.js && node check-database.js && echo '✅ All checks passed'"
```

---

### 5. Orchestration Mode Detection
**Status:** ✅ ENABLED  
**Trigger:** `UserPromptSubmit`  
**Fires:** Before user prompt is processed  
**Timeout:** 2 seconds

**What It Does:**
Detects project orchestration mode per `Agents.md` protocol:
- `[AUTO-CLAUDE MODE DETECTED]` if `.auto-claude/` directory exists
- `[GSD MODE DETECTED]` if `gsd/` directory exists
- `[STANDALONE MODE]` otherwise

**Why This Matters:**
Your `Agents.md` defines different workflows for each mode:
- **Auto-Claude Mode:** Work in git worktree, update GSD files as backup
- **GSD Mode:** Update GSD files as primary memory layer
- **Standalone Mode:** No project structure constraints

**Benefits:**
- Automatic context awareness
- Ensures AI follows correct workflow for orchestration layer
- No manual mode switching needed

---

## Hook Execution Details

### Parallel Execution
Multiple hooks under the same trigger run **in parallel**:
- `SessionStart` hooks run concurrently
- `PostToolUse` hooks run concurrently
- `Stop` hooks run concurrently

### Timeout Behavior
Each hook has a timeout (2-30 seconds):
- If hook exceeds timeout, it's terminated
- Other hooks continue executing
- Timeout doesn't block Windsurf

### Logging
All hooks with `2>&1 | tee -a ~/.claude/hook-debug.log` log to:
```
~/.claude/hook-debug.log
```

**View logs:**
```bash
tail -f ~/.claude/hook-debug.log
```

**Clear logs:**
```bash
rm ~/.claude/hook-debug.log
```

---

## Customization Guide

### Adding New Auto-Approved Commands
Edit `.claude/settings.json`, add to `matchers` array:
```json
{
  "trigger": "PermissionRequest",
  "matchers": [
    "git status",
    "your-new-command-pattern"
  ]
}
```

### Expanding Validation Hook
Add more checks to the `Stop` hook:
```json
{
  "trigger": "Stop",
  "command": "node -c server.js && node validate-dashboard-data.js && echo '✅ All validations passed'"
}
```

### Creating Custom Hooks
Add new hook to `hooks` array:
```json
{
  "name": "Your Hook Name",
  "description": "What it does",
  "trigger": "SessionStart|PostToolUse|Stop|PermissionRequest|UserPromptSubmit",
  "command": "your-shell-command",
  "timeout": 10000,
  "enabled": true
}
```

---

## Troubleshooting

### Hook Not Firing
1. Check `"enabled": true` in settings
2. Verify trigger type matches expected event
3. Check timeout isn't too short
4. Review `~/.claude/hook-debug.log` for errors

### Permission Denied Errors
1. Ensure commands have execute permissions
2. Check file paths are absolute or relative to project root
3. Verify git repository is initialized

### Performance Issues
1. Reduce timeout values
2. Disable heavy hooks temporarily
3. Optimize command execution (use `--short`, `--oneline` flags)

### Auto-Commit Hook Issues
If auto-commit hook causes problems:
1. Set `"enabled": false` immediately
2. Review commit history: `git log --oneline -20`
3. Squash commits if needed: `git rebase -i HEAD~10`
4. Force push if necessary: `git push --force-with-lease`

---

## Best Practices

### Start Conservative
1. Enable hooks one at a time
2. Test each hook individually
3. Monitor `~/.claude/hook-debug.log`
4. Adjust timeouts as needed

### Monitor Performance
- Hooks should complete in < 10 seconds
- Long-running hooks block workflow
- Use `timeout` parameter to prevent hangs

### Keep Commands Simple
- Avoid complex shell scripts
- Use existing diagnostic scripts
- Chain commands with `&&` for safety

### Version Control
- Commit `.claude/settings.json` to git
- Share hooks with team
- Use `.claude/settings.local.json` for personal overrides

---

## File Locations

```
drip-iv-dashboard-1/
├── .claude/
│   ├── settings.json          # Hook configurations (this file)
│   ├── settings.local.json    # Personal overrides (gitignored)
│   └── HOOKS_DOCUMENTATION.md # This documentation
└── ~/.claude/
    └── hook-debug.log         # Hook execution logs
```

---

## Next Steps

1. **Test Session Context Hook:** Restart Windsurf session to see context injection
2. **Test Auto-Approve Hook:** Run `git status` and verify no permission dialog
3. **Test Validation Hook:** Make a code edit and observe syntax check
4. **Enable Auto-Commit Hook:** When ready for automated deployments
5. **Monitor Logs:** `tail -f ~/.claude/hook-debug.log`

---

## Support

For hook syntax and advanced features, see:
- Windsurf documentation on automation hooks
- `.claude/settings.json` schema reference
- `Agents.md` for orchestration protocol
