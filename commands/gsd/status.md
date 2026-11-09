---
name: gsd:status
description: Unified situational command: check progress, context drift, living docs, and token telemetry savings
argument-hint: "[--next [--auto]] [--drift] [--json]"
allowed-tools:
  - Read
  - Bash
  - Grep
  - Glob
  - AskUserQuestion
---
<objective>
Check project progress, inspect active phase in .planning/STATE.md and .planning/ROADMAP.md, verify living documentation drift against the real codebase AST, inspect token telemetry savings, and intelligently route to the next action.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/progress.md
</execution_context>

<load_on_demand>
Progressive on-demand sub-workflows (loaded as needed by orchestrator or specialized subagents):
- workflows/next.md
- workflows/health.md
- workflows/stats.md
- workflows/inbox.md
- workflows/forensics.md
- workflows/scan.md
- workflows/map-codebase.md
- workflows/smart-entry.md
- workflows/session-report.md
- workflows/diagnose-issues.md
- workflows/debug.md
</load_on_demand>

<context>
Arguments: $ARGUMENTS
</context>

<process>
1. Inspect .planning/STATE.md and .planning/ROADMAP.md.
2. Check token telemetry efficiency via JIT Telemetry.
3. Display current progress and recommend next step.
</process>
