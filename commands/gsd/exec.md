---
name: gsd:exec
description: Execute phase plans with wave-based parallelism, Pre-Flight Guardrails, and self-healing loop
argument-hint: "[phase-number] [--wave N] [--dry-run]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Grep
  - Glob
  - AskUserQuestion
---
<objective>
Execute all tasks in the phase plan sequentially or in parallel waves, running Pre-Flight Guardrail verification before edits, committing atomically with test verification, and triggering automatic self-healing loops upon test/linter failures.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-phase.md
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/workflows/quick.md
@~/.claude/gsd-core/workflows/fast.md
@~/.claude/gsd-core/workflows/do.md
@~/.claude/gsd-core/workflows/pause-work.md
@~/.claude/gsd-core/workflows/resume-project.md
@~/.claude/gsd-core/workflows/cleanup.md
@~/.claude/gsd-core/workflows/undo.md
@~/.claude/gsd-core/workflows/reapply-patches.md
</execution_context>

<context>
Arguments: $ARGUMENTS
</context>

<process>
1. Run pre-flight static verification against AST contracts and export signatures.
2. Execute tasks per wave, running test suites after each task.
3. If tests fail, run automated self-healing loop to diagnose and repair.
4. Generate SUMMARY.md and record token telemetry.
</process>
