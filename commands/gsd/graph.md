---
name: gsd:graph
description: Export interactive HTML knowledge graph, Obsidian canvas, and Second Brain Vault
argument-hint: "[--vault] [--canvas] [--open] [--no-open]"
allowed-tools:
  - Read
  - Write
  - Bash
---
<objective>
Build the canonical AST graph and explicitly requested HTML, canvas, or Second Brain Vault exports. The canonical graph is `.planning/intel/codebase-graph.json`; visual and vault exports remain opt-in.
</objective>

<context>
Arguments: $ARGUMENTS
</context>

<process>
1. If `--vault` or `--brain` is passed, run `gsd-tools graph --vault` to compile the Project Second Brain Obsidian Vault under `.planning/vault/` with `00-Home.md`, `00-Vault.canvas`, and interconnected notes for Decisions, Phases, and Code Modules.
2. If `--canvas` is passed, export visual Roadmap canvas to `.planning/ROADMAP.canvas`.
3. Otherwise, run `gsd-tools graph` to build knowledge graph from codebase AST and `.planning/` state, exporting self-contained visualizer to `.planning/intel/graph-view.html` and `.planning/ROADMAP.canvas`.
4. Launch graph view or vault in browser/viewer when `--open` is specified.

The AST graph build reports and writes `.planning/intel/codebase-graph.json`. It does not create `.planning/graphs/graph.json`; legacy files there are read compatibility only. Do not generate the vault, canvas, or visualizer unless the invocation requests that export.
</process>
