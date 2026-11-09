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
</execution_context>

<load_on_demand>
Progressive on-demand sub-workflows (loaded as needed by orchestrator or specialized subagents):
- workflows/import.md
- workflows/onboard.md
- workflows/new-project.md
- workflows/settings.md
- workflows/settings-advanced.md
- workflows/settings-integrations.md
- workflows/ingest-docs.md
- workflows/sync-skills.md
- workflows/docs-update.md
- workflows/profile-user.md
</load_on_demand>

<context>
Arguments: $ARGUMENTS
</context>

<process>
1. Inspect .planning/ directory structure.
2. Apply missing schema migrations (v1 -> v2).
3. Build multi-language AST codebase graph and living documentation.
</process>
