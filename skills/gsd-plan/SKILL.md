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

<load_on_demand>
Progressive on-demand sub-workflows (loaded as needed by orchestrator or specialized subagents):
- workflows/spec-phase.md
- workflows/discuss-phase.md
- workflows/discuss-phase-assumptions.md
- workflows/discuss-phase-power.md
- workflows/ultraplan-phase.md
- workflows/spike.md
- workflows/spike-wrap-up.md
- workflows/sketch.md
- workflows/sketch-wrap-up.md
- workflows/explore.md
- workflows/plan-review-convergence.md
- workflows/ai-integration-phase.md
- workflows/mvp-phase.md
- workflows/secure-phase.md
- workflows/ui-phase.md
- workflows/add-phase.md
- workflows/insert-phase.md
- workflows/edit-phase.md
- workflows/remove-phase.md
- workflows/list-phase-assumptions.md
</load_on_demand>

<context>
Arguments: $ARGUMENTS
</context>

<process>
1. Load active phase requirements and architectural context.
2. Inject surgical JIT context for affected files.
3. Structure tasks into atomic, parallelizable waves with explicit verification steps.
4. Write the plan file and update STATE.md.
5. Record plan telemetry via `node gsd-core/bin/gsd-tools.cjs telemetry record --command plan` (forwarding `--phase` and target files).
</process>
