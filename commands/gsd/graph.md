---
name: gsd:graph
description: Export and visualize interactive HTML knowledge graph, Obsidian canvas, and Project Second Brain Vault
argument-hint: "[--vault] [--canvas] [--open] [--no-open]"
allowed-tools:
  - Read
  - Write
  - Bash
---
<objective>
Export interactive HTML visual graph representation, Obsidian canvas, or full Project Second Brain Obsidian Vault mapping AST dependencies, phases, requirements, and architectural state.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/analyze-dependencies.md
</execution_context>

<context>
Arguments: $ARGUMENTS
</context>

<process>
1. If `--vault` or `--brain` is passed, run `gsd-tools graph --vault` to compile the Project Second Brain Obsidian Vault under `.planning/vault/` with `00-Home.md`, `00-Vault.canvas`, and interconnected notes for Decisions, Phases, and Code Modules.
2. If `--canvas` is passed, export visual Roadmap canvas to `.planning/ROADMAP.canvas`.
3. Otherwise, run `gsd-tools graph` to build knowledge graph from codebase AST and `.planning/` state, exporting self-contained visualizer to `.planning/intel/graph-view.html` and `.planning/ROADMAP.canvas`.
4. Launch graph view or vault in browser/viewer when `--open` is specified.
</process>
