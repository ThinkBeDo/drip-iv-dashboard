once finished with code edits, additions, or improvements, commit and push to github so the app redeploys on railway
----------------------
AUTO CLAUDE + GSD INTEGRATION PROTOCOL
ORCHESTRATION LAYER DETECTION: At the beginning of EVERY session, detect the orchestration context:

Check for Auto Claude orchestration:
Look for .auto-claude/ directory in project root
Check if current working directory is inside auto-claude/{spec-name}/ (worktree)
Check for specs/ directory with Auto Claude task definitions
Check for apps/backend/ with Auto Claude agent logic
Check for GSD files:
Look for gsd/ directory in project root
Check for gsd/PROJECT.md, gsd/STATE.md, gsd/PLAN.md, gsd/ISSUES.md in current directory
ORCHESTRATION MODE DETERMINATION:

MODE 1: AUTO CLAUDE ORCHESTRATED PROJECT
Detection: .auto-claude/ directory exists OR working in auto-claude/{spec-name}/ worktree

Session Start Sequence:

Read Auto Claude spec file (if in worktree: ../../specs/{spec-name}.md or similar)
Read GSD files IF they exist (gsd/PROJECT.md → gsd/STATE.md → gsd/PLAN.md → gsd/ISSUES.md)
Understand that:
Auto Claude's Kanban board is the PRIMARY task orchestration layer
Auto Claude's Graphiti memory layer is the PRIMARY insight/decision store
GSD files are SECONDARY - human-readable backup and local context
Task status flows through Auto Claude: Planning → In Progress → AI Review → Human Review → Done
During Work (Auto Claude Mode):

Focus on the SPECIFIC task assigned by Auto Claude (check spec file for task context)
DO NOT update Auto Claude's memory directly (it has its own graph database)
DO update GSD files as lightweight local context IF they exist
Use GSD commands (/gsd:execute-plan, /gsd:map-codebase) for local navigation
Reference gsd/SUMMARY.md for project-specific decisions, but know Auto Claude tracks broader insights
Work in isolation - you're in a git worktree, changes won't affect other parallel agents
Session End (Auto Claude Mode):

Update GSD gsd/STATE.md with LOCAL progress (what YOU changed in this worktree)
Update GSD gsd/ISSUES.md with blockers YOU discovered
DO NOT try to update gsd/SUMMARY.md with insights - Auto Claude's memory layer handles this
Trust Auto Claude's QA loop to validate your work before human review
Your changes will be reviewed in Auto Claude's "AI Review" column before merging
Key Rules for Auto Claude Mode:

✓ Read spec files for task context
✓ Update GSD files as local backup/context
✓ Work in isolation (you're in a worktree)
✓ Trust Auto Claude's memory layer for insights
✓ Defer to Auto Claude's QA loop for validation
✗ NEVER try to sync with Auto Claude's Graphiti database directly
✗ NEVER assume you're the only agent working (parallel execution is happening)
✗ NEVER update files outside your worktree scope
MODE 2: STANDALONE GSD PROJECT
Detection: gsd/ directory exists with GSD files BUT no .auto-claude/ directory

Session Start Sequence:

Read gsd/PROJECT.md → understand project scope and goals
Read gsd/STATE.md → understand current phase and status
Read gsd/PLAN.md → understand current tasks/implementation plan
Read gsd/ISSUES.md → check for known blockers or gotchas
During Work (Standalone Mode):

Use /gsd:execute-plan when working on planned tasks
Use /gsd:map-codebase if codebase structure is unclear
Use /gsd:plan-phase when starting new development phase
Reason through problems without editing GSD files during work
Reference gsd/SUMMARY.md for past decisions when similar issues arise
Keep gsd/PLAN.md as single source of truth for tasks
Session End (Standalone Mode):

Update gsd/STATE.md with what changed (phase progress, blockers resolved, new blockers)
Update gsd/ISSUES.md if new blockers or technical debt discovered
Update gsd/SUMMARY.md with key decisions made (WHY behind implementation choices)
Run /gsd:execute-plan or /gsd:plan-phase if phase work completed
Persist before context window fills or session ends
MODE 3: NO PROJECT STRUCTURE
Detection: No .auto-claude/ directory AND no gsd/ directory

Action: If no .auto-claude/ or gsd/ exists, ask once. If the user explicitly says to proceed (or asks to initialize GSD), continue after checking there is no Auto Claude task pending.


INTEGRATION ARCHITECTURE
Visual Orchestration Layer (Auto Claude):

Kanban board UI for task management
Git worktrees for parallel agent execution (up to 12 agents)
Graphiti graph memory + semantic RAG for insights
Self-validating QA loop before human review
Task flow: Planning → In Progress → AI Review → Human Review → Done
Local Source of Truth (GSD Files):

gsd/PROJECT.md = Project scope, goals, architecture overview
gsd/ROADMAP.md = High-level phases and milestones
gsd/STATE.md = Current phase, what's done, what's next, blockers
gsd/PLAN.md = Detailed task breakdown for current phase
gsd/SUMMARY.md = Implementation decisions and "why" explanations (lighter in Auto Claude mode)
gsd/ISSUES.md = Known blockers, technical debt, gotchas
Code Execution Environment (Windsurf):

Terminal where Auto Claude spawns agent processes
IDE where agents read/write code
Git worktree isolation for parallel execution
Memory Layer Hierarchy:

Auto Claude's Graphiti (when orchestrating) = Primary insight store, cross-project learning
GSD gsd/SUMMARY.md (always) = Project-specific decisions, human-readable backup
Auto Claude spec files (when orchestrating) = Task-specific context and requirements
ANTI-PATTERNS (Do not repeat)
General:

✗ NEVER code without reading project context first (GSD files OR Auto Claude specs)
✗ NEVER finish session without updating gsd/STATE.md
✗ NEVER create plans outside gsd/PLAN.md (keep single source of truth)
✗ NEVER re-log resolved issues as open in gsd/ISSUES.md
✗ NEVER assume user remembers - project files are source of truth
Auto Claude Specific:

✗ NEVER try to access Auto Claude's Graphiti database directly
✗ NEVER assume you're the only agent (parallel execution)
✗ NEVER modify files outside your worktree when in Auto Claude mode
✗ NEVER duplicate insights in gsd/SUMMARY.md that Auto Claude is tracking
✗ NEVER bypass Auto Claude's QA loop with manual validation
Standalone GSD Specific:

✗ NEVER lose track of "why" behind decisions (capture in gsd/SUMMARY.md)
✗ NEVER skip gsd/SUMMARY.md updates (it's your only memory layer)
RECALL PATTERN
In Auto Claude Mode:

Check Auto Claude spec file for task requirements
Check gsd/ISSUES.md for known gotchas
Check gsd/SUMMARY.md for project-specific decisions
Trust Auto Claude's memory layer for broader insights
In Standalone GSD Mode:

Check gsd/ISSUES.md for known gotchas
Check gsd/SUMMARY.md for past decision rationale
Check gsd/STATE.md for current context
Reference specific phase history in gsd/ROADMAP.md
EXECUTION PERMISSIONS
When MCP operations, GSD commands, or git operations are intended, assume permission granted - execute without asking.---
trigger: manual
---



## Project Memory System

This project maintains institutional knowledge in `docs/project_notes/` for consistency across sessions.

### Memory Files

- **bugs.md** - Bug log with dates, solutions, and prevention notes
- **decisions.md** - Architectural Decision Records (ADRs) with context and trade-offs
- **key_facts.md** - Project configuration, ports, and important URLs (no secrets)
- **issues.md** - Work log with ticket IDs, descriptions, and URLs

### Memory-Aware Protocols

**Before proposing architectural changes:**
- Check `docs/project_notes/decisions.md` for existing decisions
- Verify the proposed approach does not conflict with past choices
- If it does conflict, acknowledge the existing decision and explain why a change is warranted

**When encountering errors or bugs:**
- Search `docs/project_notes/bugs.md` for similar issues
- Apply known solutions if found
- Document new bugs and solutions when resolved

**When looking up project configuration:**
- Check `docs/project_notes/key_facts.md` for non-sensitive configuration facts
- Prefer documented facts over assumptions

**When completing work on tickets:**
- Log completed work in `docs/project_notes/issues.md`
- Include ticket ID, date, brief description, and URL

### Style Guidelines for Memory Files

- Prefer bullet lists over tables
- Keep entries concise (1-3 lines)
- Always include dates
- Include URLs when relevant
