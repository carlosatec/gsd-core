---
name: gsd-ship
description: "Create PR, run review, and prepare for merge after verification passes"
argument-hint: "[phase number or milestone, e.g., '4' or 'v1.0']"
allowed-tools:
  - Read
  - Bash
  - Grep
  - Glob
  - Write
  - AskUserQuestion
---

<objective>
Bridge local completion → merged PR. After /gsd-verify passes, ship the work: push branch, create PR with auto-generated body, optionally trigger review, and track the merge.

Closes the plan → execute → verify → ship loop.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/ship.md
</execution_context>

<load_on_demand>
Progressive on-demand sub-workflows (loaded as needed by orchestrator or specialized subagents):
- workflows/pr-branch.md
- workflows/complete-milestone.md
- workflows/audit-milestone.md
- workflows/milestone-summary.md
- workflows/new-milestone.md
- workflows/graduation.md
</load_on_demand>

<context>
Arguments: $ARGUMENTS
</context>

Execute the ship workflow from @~/.claude/gsd-core/workflows/ship.md end-to-end.
