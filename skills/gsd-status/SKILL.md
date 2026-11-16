---
name: gsd-status
description: "Check project progress, artifact freshness, living docs, and token telemetry"
argument-hint: "[--next [--auto]] [--drift] [--json]"
allowed-tools:
  - Read
  - Bash
  - Grep
  - Glob
  - AskUserQuestion
---

<objective>
Check project progress, inspect active phase in .planning/STATE.md and .planning/ROADMAP.md, report knowledge artifact lifecycle and freshness without writing files, inspect token telemetry savings, and intelligently route to the next action.
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
3. Display authoritative state, derived artifact freshness, durable memory presence, optional exports, and safe refresh commands. This inspection is read-only.
4. Display current progress and recommend next step.
</process>
