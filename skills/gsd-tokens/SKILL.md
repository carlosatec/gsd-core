---
name: gsd-tokens
description: "Display real-time token telemetry dashboard, savings breakdown, and JIT context efficiency"
argument-hint: "[--json] [--reset]"
allowed-tools:
  - Read
  - Bash
---

<objective>
Display real-time token telemetry metrics, including token savings percentage, multi-command usage breakdown, language-weighted in-memory consumption, and JIT efficiency dashboard.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/analyze-dependencies.md
</execution_context>

<context>
Arguments: $ARGUMENTS
</context>

<process>
1. Execute `gsd_run telemetry dashboard` (or `gsd-tools telemetry summary --json` when `--json` is provided) reading `.planning/intel/telemetry.json`.
2. Render responsive 65-column ASCII dashboard with multi-command usage, savings breakdowns, and JIT efficiency ratios.
</process>

