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
</execution_context>

<load_on_demand>
Progressive on-demand sub-workflows (loaded as needed by orchestrator or specialized subagents):
- workflows/execute-plan.md
- workflows/quick.md
- workflows/fast.md
- workflows/do.md
- workflows/pause-work.md
- workflows/resume-project.md
- workflows/cleanup.md
- workflows/undo.md
- workflows/reapply-patches.md
</load_on_demand>

<context>
Arguments: $ARGUMENTS
</context>

<process>
1. Run pre-flight static verification against AST contracts and export signatures.
2. Execute tasks per wave, running test suites after each task.
3. If tests fail, run automated self-healing loop to diagnose and repair.
4. Generate SUMMARY.md and record token telemetry via `node gsd-core/bin/gsd-tools.cjs telemetry record --command exec` (or `gsd_run telemetry record --command exec`, forwarding `--phase`).
</process>
