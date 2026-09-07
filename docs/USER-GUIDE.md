# GSD User Guide

A narrative companion guide to GSD Core Nexus 3.2 — orient yourself here, then follow the links into the dedicated docs.

> **GSD Core's documentation is organised by [Diataxis](https://diataxis.fr).**
> Browse by goal: [Tutorials](README.md#tutorials) · [How-to guides](README.md#how-to-guides) · [Reference](README.md#reference) · [Explanation](README.md#explanation) · [Docs index](README.md)

---

## Table of Contents

- [The Unified 10-Command Surface](#the-unified-10-command-surface)
- [Project Lifecycle Overview](#project-lifecycle-overview)
- [Session Intelligence & Deterministic Replay CLI](#session-intelligence--deterministic-replay-cli)
- [Knowledge Graph & Obsidian Canvas](#knowledge-graph--obsidian-canvas)
- [DeepSeek Harness & Multi-Runtime Support](#deepseek-harness--multi-runtime-support)
- [Workflow Diagrams](#workflow-diagrams)
- [Validation & Quality Architecture](#validation--quality-architecture)
- [UI Design & Review Contract](#ui-design--review-contract)
- [Spiking & Sketching](#spiking--sketching)
- [Backlog & Context Threads](#backlog--context-threads)
- [Token Telemetry & Context Economy](#token-telemetry--context-economy)
- [Usage Examples](#usage-examples)
- [Troubleshooting & Recovery](#troubleshooting--recovery)
- [Project File Structure](#project-file-structure)
- [Related](#related)

---

## The Unified 10-Command Surface

Starting with GSD Core Nexus 3.2, the public command surface is streamlined into **10 Canonical Unified Commands**. All operational sub-skills and internal workflows are orchestrated seamlessly under these entrypoints:

| Command | Purpose | Primary Triggers & Flags |
|---|---|---|
| `/gsd-status` | Situational awareness, progress tracking, and drift detection | `--detail`, `--drift` |
| `/gsd-plan` | Research, UI design contract, and wave-based plan creation | `[phase]`, `--skip-research`, `--mvp` |
| `/gsd-exec` | Parallel execution in waves with automated testing and commits | `[phase]`, `--wave <N>`, `--tdd` |
| `/gsd-review` | Code review and automatic repairs (`--fix`), with dual-mode audit (`--full`/`--repo`) | `--fix`, `--full`, `--repo`, `--all`, `--depth <N>` |
| `/gsd-verify` | Conversational UAT and validation against phase success criteria | `[phase]`, `--strict` |
| `/gsd-ship` | Complete milestone, open PR, tag release, and archive state | `--draft`, `--tag <version>` |
| `/gsd-auto` | End-to-end autonomous autopilot across phase lifecycle | `--until <phase>`, `--max-iterations <N>` |
| `/gsd-tokens` | Real-time multi-command token telemetry dashboard, graph compression ratio, and savings breakdown | `--raw`, `--history`, `gsd-tools tokens` |
| `/gsd-migrate` | Non-destructive upgrade for legacy and greenfield projects to GSD Nexus 3.0 | `--dry-run`, `--force` |
| `/gsd-help` | Display command catalog, flags, and quick reference | `[command]` |

---

## Project Lifecycle Overview

The core GSD loop is: **status → plan → exec → review → verify → ship**, repeated per phase.

See [Your first project](tutorials/your-first-project.md) for a step-by-step tutorial.

**Relevant flags at a glance:**

| Flag | Command | When to use |
| ---- | ------- | ----------- |
| `--skip-research` | `/gsd-plan` | Skip ecosystem research when the stack is already familiar |
| `--mvp` | `/gsd-plan` | Structure phase plans around vertical MVP slices |
| `--tdd` | `/gsd-exec` | Enforce test-driven development per implementation task |
| `--fix` | `/gsd-review` | Automatically repair static analysis and linter findings |
| `--draft` | `/gsd-ship` | Open a draft pull request instead of ready-for-review |

For the full command reference with all flags, see [`docs/COMMANDS.md`](COMMANDS.md). For configuration options (model profiles, workflow agents, git branching), see [`docs/CONFIGURATION.md`](CONFIGURATION.md).

---

## Session Intelligence & Deterministic Replay CLI

GSD Core Nexus 3.2 automatically records structured, append-only JSONL execution events under `.planning/intel/sessions/`. Every command execution captures tool invocations, AST pre-flight checks, stack traces, and real diffs:

```bash
# Replay the latest session in the terminal
gsd-tools session replay latest

# Filter replay by failures and code mutations
gsd-tools session replay latest --errors-only
gsd-tools session replay latest --diffs

# Export session timeline to Markdown
gsd-tools session export latest --md
```

---

## Knowledge Graph & Obsidian Canvas

GSD Core Nexus natively generates visual knowledge artifacts directly from the codebase AST (100% offline, zero external dependencies):

- **Obsidian Open Canvas:** `.planning/ROADMAP.canvas` — visual node layout with color-coded phases, decisions, and modules.
- **Wikilinks & Backlinks Index:** `.planning/intel/backlinks.json` — bidirectional linkage index with inline code filtering (`stripInlineCode`) for Obsidian Vault navigation.
- **Interactive Visual Graph (HTML):** `/gsd-graph` command exports a standalone HTML/Canvas 2D visualization with PageRank physics, Fermat radial spiral distribution, thermal alpha cooling stabilization, and PNG snapshot export.

---

## DeepSeek Harness & Multi-Runtime Support

GSD 2.9 provides 1st-class host adapter support for **DeepSeek Harness** (`@deepseek-ai/dsh` micro-kernel), **Google Antigravity CLI**, **Claude Code**, **OpenCode**, and **Codex**, ensuring consistent spec-driven execution across all major AI coding platforms.

---

## Workflow Diagrams

### Full Project Lifecycle

```text
  ┌──────────────────────────────────────────────────────────┐
  │                    PROJECT ENTRY / STATUS                │
  │  /gsd-status  or  /gsd-plan 1                            │
  │  Questions -> Research -> Requirements -> Roadmap        │
  └────────────────────────────┬─────────────────────────────┘
                               │
                ┌──────────────▼─────────────┐
                │      FOR EACH PHASE:       │
                │                            │
                │  ┌────────────────────┐    │
                │  │ /gsd-plan <N>      │    │  <- Research + UI Design + Plan + Validation
                │  └──────────┬─────────┘    │
                │             │              │
                │  ┌──────────▼─────────┐    │
                │  │ /gsd-exec <N>      │    │  <- Parallel Wave Execution + TDD
                │  └──────────┬─────────┘    │
                │             │              │
                │  ┌──────────▼─────────┐    │
                │  │ /gsd-review --fix  │    │  <- Static Code Review + Auto-Repair
                │  └──────────┬─────────┘    │
                │             │              │
                │  ┌──────────▼─────────┐    │
                │  │ /gsd-verify <N>    │    │  <- Conversational UAT & Verification
                │  └──────────┬─────────┘    │
                │             │              │
                │  ┌──────────▼─────────┐    │
                │  │ /gsd-ship          │    │  <- Milestone Complete / PR / Tag
                │  └──────────┬─────────┘    │
                │             │              │
                │     Next Phase?────────────┘
                │             │ No
                └─────────────┼──────────────┘
                               │
               ┌───────────────▼──────────────┐
               │  /gsd-ship or /gsd-tokens    │
               │  Release, PR, Telemetry      │
               └──────────────────────────────┘
```

### Planning Agent Coordination

```text
  /gsd-plan N
         │
         ├── Phase Researcher (x4 parallel)
         │     ├── Stack researcher
         │     ├── Features researcher
         │     ├── Architecture researcher
         │     └── Pitfalls researcher
         │           │
         │     ┌──────▼──────┐
         │     │ RESEARCH.md │
         │     └──────┬──────┘
         │            │
         │     ┌──────▼──────┐
         │     │   Planner   │  <- Reads PROJECT.md, REQUIREMENTS.md,
         │     │             │     CONTEXT.md, RESEARCH.md
         │     └──────┬──────┘
         │            │
         │     ┌──────▼───────────┐     ┌────────┐
         │     │   Plan Checker   │────>│ PASS?  │
         │     └──────────────────┘     └───┬────┘
         │                                  │
         │                             Yes  │  No
         │                              │   │   │
         │                              │   └───┘  (loop, up to 3x)
         │                              │
         │                        ┌─────▼──────┐
         │                        │ PLAN files │
         │                        └────────────┘
         └── Done
```

### Execution Wave Coordination

```text
  /gsd-exec N
         │
         ├── Analyze plan dependencies & topological order
         │
         ├── Wave 1 (independent plans):
         │     ├── Executor A (fresh context) -> commit
         │     └── Executor B (fresh context) -> commit
         │
         ├── Wave 2 (depends on Wave 1):
         │     └── Executor C (fresh context) -> commit
         │
         └── Verification Loop
               ├── Check codebase against phase goals
               ├── Test quality audit (no disabled tests, circular patterns)
               │
               ├── PASS -> VERIFICATION.md (success)
               └── FAIL -> Issues logged for /gsd-verify
```

---

## Validation & Quality Architecture

During planning research, GSD maps automated test coverage to each phase requirement before code is written.

- **Output:** `{phase}-VALIDATION.md` — feedback contract for the phase.
- **Verification Gate:** Plans where tasks lack automated verify commands are refined before execution approval.
- **Review with Auto-Repair:** Running `/gsd-review --fix` analyzes changed files against anti-pattern stores and automatically applies non-destructive fixes.

---

## UI Design & Review Contract

AI-generated frontends stay visually consistent by establishing a UI contract before execution:
- `/gsd-plan [N]` automatically incorporates UI specifications (`UI-SPEC.md`) for frontend phases.
- `/gsd-review` performs a 6-pillar visual and accessibility audit of the implemented interface.

---

## Spiking & Sketching

Validate technical feasibility and explore visual direction prior to locking plans:

```bash
# Explore technical approaches
/gsd-plan 1 --spike "SSE vs WebSocket"

# Plan with full confidence
/gsd-plan 1
```

---

## Backlog & Context Threads

- **Backlog Ideas:** Track long-term ideas under phase `999.x` without polluting the active sequence.
- **Context Threads:** Lightweight cross-session knowledge stores for work that spans multiple sessions.

---

## Token Telemetry & Context Economy

GSD Nexus includes built-in pure technical observability for surgical JIT context injection, token avoidance, and graph compression (zero financial or cost metrics):

```bash
/gsd-tokens
```

Renders a responsive 65-column ASCII dashboard displaying:
- **Multi-Command Lifecycle Observability:** Tracks real token consumption and avoidance across `plan`, `exec`, and `review` workflows.
- **JIT Tokens Used vs Monolithic Avoided:** Compares surgical AST context against full-repo token weight.
- **Graph Compression Reduction Factor:** Real-time ratio ($R = \max(1.0, \text{monolithicTokens} / \text{jitTokens})$) demonstrating context compaction (e.g. `10895.2x`).
- **Transactional Cooperative Locking:** Backed by `withFileLockSync` with stale-lock auto-eviction, preventing data loss under concurrent multi-agent executions.
- **Pre-Exec Lifecycle Diagnostics:** Displays contextual guidance if planning/review is active before execution starts.
- **Dual-Mode Metric Transparency:** Accurately distinguishes surgical phase reviews (`targeted`, 80-95% saved) from whole-repo audits (`full-repo`, `tokensSaved = 0` and `review (full-repo)` badge).
- **CLI Subcommands & Seam:** `gsd-tools tokens`, `gsd-tools telemetry summary`, and `gsd-tools telemetry record`.

---

## Usage Examples

### Full Lifecycle Workflow

```bash
# 1. Check current situation and active phase
/gsd-status

# 2. Plan phase 1 (Research, UI spec, and wave plans)
/gsd-plan 1

# 3. Execute phase 1 plans in parallel waves
/gsd-exec 1

# 4. Review code and auto-fix potential linter/security issues
/gsd-review --fix

# 5. Validate built features with interactive UAT
/gsd-verify 1

# 6. Check token economy and context savings
/gsd-tokens

# 7. Ship release and generate PR
/gsd-ship
```

### Autonomous Mode (Autopilot)

```bash
# Execute through all milestone phases autonomously
/gsd-auto
```

### Quick Ad-Hoc Task

```bash
/gsd-exec --quick "Fix mobile navigation toggle responsiveness"
```

---

## Troubleshooting & Recovery

| Issue | Recommended Action |
|---|---|
| Lost context after break | Run `/gsd-status` to restore situational context |
| Broken implementation | Run `/gsd-review --fix` or `git revert` last phase commit |
| STATE.md out of sync | Run `gsd-tools state sync` to reconstruct state |
| High token consumption | Check `/gsd-tokens` and set `model_profile: "budget"` in config |
| Legacy project upgrade | Run `/gsd-migrate` to update structure to 2.5.0 format |

---

## Project File Structure

```text
.planning/
  PROJECT.md              # Project vision and context (always loaded)
  REQUIREMENTS.md         # Scoped requirements with IDs
  ROADMAP.md              # Phase breakdown with status tracking
  STATE.md                # Decisions, blockers, session memory
  config.json             # Workflow configuration
  MILESTONES.md           # Completed milestone archive
  phases/
    XX-phase-name/
      XX-YY-PLAN.md       # Atomic execution plans
      XX-YY-SUMMARY.md    # Execution outcomes and decisions
      CONTEXT.md          # Implementation preferences
      RESEARCH.md         # Ecosystem research findings
      VERIFICATION.md     # Post-execution verification results
      XX-UI-SPEC.md       # UI design contract
```

---

## Related

- [Docs index](README.md)
- [Architecture](ARCHITECTURE.md)
- [Command Reference](COMMANDS.md)
- [Configuration](CONFIGURATION.md)
