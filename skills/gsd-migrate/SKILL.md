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
  - AskUserQuestion
---

<objective>
Upgrade legacy project structures and older GSD versions to GSD Core Nexus 2.9+ format, generating living documentation, AST dependency graphs, and token telemetry schema v2.0 without destroying existing plans or history.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/update.md
@~/.claude/gsd-core/workflows/import.md
@~/.claude/gsd-core/workflows/onboard.md
@~/.claude/gsd-core/workflows/new-project.md
@~/.claude/gsd-core/workflows/settings.md
@~/.claude/gsd-core/workflows/settings-advanced.md
@~/.claude/gsd-core/workflows/settings-integrations.md
@~/.claude/gsd-core/workflows/ingest-docs.md
@~/.claude/gsd-core/workflows/sync-skills.md
@~/.claude/gsd-core/workflows/docs-update.md
@~/.claude/gsd-core/workflows/profile-user.md
</execution_context>

<context>
Arguments: $ARGUMENTS
</context>

<process>
1. Inspect .planning/ directory structure.
2. Apply missing schema migrations (v1 -> v2).
3. Build multi-language AST codebase graph and living documentation.
</process>
