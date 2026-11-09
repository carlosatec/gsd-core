---
name: gsd:help
description: Show available GSD commands and usage guide
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
</execution_context>

<load_on_demand>
Progressive on-demand sub-workflows (loaded as needed by orchestrator or specialized subagents):
- workflows/manager.md
- workflows/thread.md
- workflows/note.md
- workflows/list-workspaces.md
- workflows/new-workspace.md
- workflows/remove-workspace.md
- workflows/list-seeds.md
- workflows/plant-seed.md
- workflows/add-todo.md
- workflows/check-todos.md
- workflows/add-backlog.md
- workflows/node-repair.md
- workflows/transition.md
</load_on_demand>

<context>
Arguments: $ARGUMENTS
</context>

<process>
Follow ~/.claude/gsd-core/workflows/help.md with $ARGUMENTS.
</process>
