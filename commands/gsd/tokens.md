---
name: gsd:tokens
description: Display real-time token telemetry dashboard, savings breakdown, and JIT context efficiency
argument-hint: "[--sessions] [--cost] [--all] [--web] [--open] [--json] [--reset]"
allowed-tools:
  - Read
  - Bash
---
<objective>
Display real-time token telemetry metrics, operational sessions reliability, financial cost calculations ($ USD), interactive HTML web dashboard export, and JIT context efficiency.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/analyze-dependencies.md
</execution_context>

<context>
Arguments: $ARGUMENTS
</context>

<process>
1. Execute `node gsd-core/bin/gsd-tools.cjs telemetry dashboard $ARGUMENTS` (or `gsd_run telemetry dashboard $ARGUMENTS`, or `gsd-tools telemetry web [--open]` for the standalone HTML 360° visual dashboard, or `gsd-tools telemetry summary --json` when `--json` is provided) reading `.planning/intel/telemetry.json` and session logs.
2. Render responsive 65-column ASCII dashboard with multi-command usage, operational sessions, financial impacts, and JIT efficiency ratios.
</process>

