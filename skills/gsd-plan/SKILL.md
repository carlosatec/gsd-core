---
name: gsd-plan
description: "Produce a detailed phase plan (PLAN.md) with task waves, verification loop, and surgical JIT context injection"
argument-hint: "[phase-number] [--converge] [--reviews]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Grep
  - Glob
  - AskUserQuestion
---

<objective>
Create a detailed, executable phase plan in .planning/phases/<phase_dir>/<phase>-PLAN.md with atomic task waves, verification criteria, dependency checks, and surgical JIT context injection.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/plan-phase.md
</execution_context>

<process>
1. Load active phase requirements and architectural context.
2. Inject surgical JIT context for affected files.
3. Structure tasks into atomic, parallelizable waves with explicit verification steps.
4. Write the plan file and update STATE.md.
</process>
