---
name: gsd:plan
description: Produce a detailed phase plan (PLAN.md) with task waves, verification loop, and surgical JIT context injection
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
@~/.claude/gsd-core/workflows/spec-phase.md
@~/.claude/gsd-core/workflows/discuss-phase.md
@~/.claude/gsd-core/workflows/discuss-phase-assumptions.md
@~/.claude/gsd-core/workflows/discuss-phase-power.md
@~/.claude/gsd-core/workflows/ultraplan-phase.md
@~/.claude/gsd-core/workflows/spike.md
@~/.claude/gsd-core/workflows/spike-wrap-up.md
@~/.claude/gsd-core/workflows/sketch.md
@~/.claude/gsd-core/workflows/sketch-wrap-up.md
@~/.claude/gsd-core/workflows/explore.md
@~/.claude/gsd-core/workflows/plan-review-convergence.md
@~/.claude/gsd-core/workflows/ai-integration-phase.md
@~/.claude/gsd-core/workflows/mvp-phase.md
@~/.claude/gsd-core/workflows/secure-phase.md
@~/.claude/gsd-core/workflows/ui-phase.md
@~/.claude/gsd-core/workflows/add-phase.md
@~/.claude/gsd-core/workflows/insert-phase.md
@~/.claude/gsd-core/workflows/edit-phase.md
@~/.claude/gsd-core/workflows/remove-phase.md
@~/.claude/gsd-core/workflows/list-phase-assumptions.md
</execution_context>

<context>
Arguments: $ARGUMENTS
</context>

<process>
1. Load active phase requirements and architectural context.
2. Inject surgical JIT context for affected files.
3. Structure tasks into atomic, parallelizable waves with explicit verification steps.
4. Write the plan file and update STATE.md.
</process>
