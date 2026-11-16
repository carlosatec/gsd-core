---
name: gsd-migrate
description: "Inspect and guide a non-destructive migration of a legacy project into current GSD conventions"
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
Inspect a legacy project and prepare a conservative migration plan for its GSD project data. Preserve existing plans, history, and user files. Do not reinstall or update the GSD Core package; package updates belong to the update workflow.
</objective>

<load_on_demand>
Progressive on-demand sub-workflows (loaded as needed by orchestrator or specialized subagents):
- workflows/import.md
- workflows/from-gsd2.md
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
1. Inspect the repository, `.planning/` schema, installed GSD metadata, and supported migration helpers before proposing changes.
2. With `--dry-run`, report the exact files and schema changes that would be made; do not write files.
3. Without `--dry-run`, apply only migrations supported by the repository's migration helpers, preserve backups/history, then run the relevant schema and integrity checks. If no supported migration exists, explain that and provide a manual migration plan rather than guessing or changing schemas.
4. Treat `--force` as permission to continue past documented non-destructive warnings only; never use it to delete or overwrite user data.
</process>
