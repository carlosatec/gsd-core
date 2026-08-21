---
name: gsd-migrate
description: "One-click non-destructive legacy project upgrade and AST universal intelligence graph build"
argument-hint: "[--dry-run] [--force]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Grep
  - Glob
---

<objective>
Upgrade legacy project structures and older GSD versions to GSD Core Nexus 2.3 format, generating living documentation, AST dependency graphs, and token telemetry schema v2.0 without destroying existing plans or history.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/update.md
</execution_context>

<process>
1. Inspect .planning/ directory structure.
2. Apply missing schema migrations (v1 -> v2).
3. Build multi-language AST codebase graph and living documentation.
</process>
