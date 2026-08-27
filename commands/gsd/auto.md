---
name: gsd:auto
description: Autonomous end-to-end autopilot across phase workflows with continuous guardrails
argument-hint: "[--until-phase N] [--max-phases N] [--force]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Grep
  - Glob
  - AskUserQuestion
---
<objective>
Run continuous autonomous autopilot across all remaining phases in ROADMAP.md, automatically advancing through discuss → plan → execute → review → verify → complete with safety checkpoints.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/autonomous.md
@~/.claude/gsd-core/workflows/extract-learnings.md
</execution_context>

<context>
Arguments: $ARGUMENTS
</context>

<process>
1. Read ROADMAP.md and STATE.md for active and pending phases.
2. Execute the full phase lifecycle autonomously with pre-flight checks.
3. Stop at human-decision checkpoints or upon completion.
</process>
