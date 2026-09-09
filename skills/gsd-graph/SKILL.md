---
name: gsd-graph
description: "Export and visualize interactive HTML knowledge graph and Obsidian canvas"
argument-hint: "[--no-open]"
allowed-tools:
  - Read
  - Write
  - Bash
---

<objective>
Export interactive HTML visual graph representation and Obsidian canvas mapping AST dependencies, phases, requirements, and architectural state.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/analyze-dependencies.md
</execution_context>

<context>
Arguments: $ARGUMENTS
</context>

<process>
1. Run `gsd-tools graph` to build knowledge graph from codebase AST and `.planning/` state.
2. Export self-contained offline visualizer to `.planning/intel/graph-view.html` and `.planning/ROADMAP.canvas`.
3. Launch graph view in default web browser unless `--no-open` is passed.
</process>
