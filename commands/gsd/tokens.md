---
name: gsd:tokens
description: Display real-time token telemetry dashboard, savings breakdown, and JIT context efficiency
argument-hint: "[--json] [--reset]"
allowed-tools:
  - Read
  - Bash
---
<objective>
Display real-time token telemetry metrics, including token savings percentage, prompt cache hits, language-weighted in-memory consumption, and JIT efficiency dashboard.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/stats.md
@~/.claude/gsd-core/workflows/analyze-dependencies.md
</execution_context>

<context>
Arguments: $ARGUMENTS
</context>

<process>
1. Read .planning/telemetry/ data.
2. Render responsive 65-column ASCII dashboard with usage and savings breakdowns.
</process>
