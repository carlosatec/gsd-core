---
name: gsd-help
description: "Show available GSD commands and usage guide"
argument-hint: "[--brief | --full | <topic> | --brief <topic>]"
allowed-tools:
  - Read
---

<objective>
Display GSD help at the tier the user asked for: brief (one-line refresher), default (one-page tour), full (complete reference), a single topic section, or a compact scoped lookup of one topic (`--brief <topic>`: signature + one-line summary).

Output ONLY the reference content of the chosen tier. Do NOT add:
- Project-specific analysis
- Git status or file context
- Next-step suggestions
- Any commentary beyond the reference
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/help.md
@~/.claude/gsd-core/workflows/manager.md
@~/.claude/gsd-core/workflows/thread.md
@~/.claude/gsd-core/workflows/note.md
@~/.claude/gsd-core/workflows/list-workspaces.md
@~/.claude/gsd-core/workflows/new-workspace.md
@~/.claude/gsd-core/workflows/remove-workspace.md
@~/.claude/gsd-core/workflows/list-seeds.md
@~/.claude/gsd-core/workflows/plant-seed.md
@~/.claude/gsd-core/workflows/add-todo.md
@~/.claude/gsd-core/workflows/check-todos.md
@~/.claude/gsd-core/workflows/add-backlog.md
@~/.claude/gsd-core/workflows/node-repair.md
@~/.claude/gsd-core/workflows/transition.md
</execution_context>

<context>
Arguments: $ARGUMENTS
</context>

<process>
Follow ~/.claude/gsd-core/workflows/help.md with $ARGUMENTS.
</process>
