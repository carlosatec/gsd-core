# 🚀 Practical Tutorial: Mastering GSD Core Nexus 2.7

> 🌐 **Language / Idioma:** **English** | [Versão em Português (Brasil)](TUTORIAL.pt-BR.md)  
> **Git. Ship. Done.**  
> The definitive guide to autonomous software engineering, meta-prompting, surgical context injection, causal session intelligence, and AI governance with **GSD Core Nexus 2.7**.

---

## 📖 Table of Contents

1. [What is GSD Core Nexus](#1-what-is-gsd-core-nexus)
2. [Installation and Setup](#2-installation-and-setup)
3. [Starting a Project (Greenfield vs. Brownfield)](#3-starting-a-project)
4. [The 10 Canonical Unified Commands Surface](#4-the-10-canonical-unified-commands-surface)
5. [The 5-Stage Development Lifecycle](#5-the-5-stage-development-lifecycle)
6. [Codebase Intelligence: Universal 360° AST, Mobile & Living Docs](#6-codebase-intelligence-universal-360-ast-mobile--living-docs)
7. [Surgical Context Injection (JIT) & Okapi BM25 Semantic RAG](#7-surgical-context-injection-jit--okapi-bm25-semantic-rag)
8. [Pre-Flight Safety: Guardrails, Anti-Patterns & Self-Healing](#8-pre-flight-safety-guardrails-anti-patterns--self-healing)
9. [Token Telemetry & Observability Dashboard (`/gsd:tokens`)](#9-token-telemetry--observability-dashboard-gsdtokens)
10. [Session Intelligence & Deterministic Replay CLI (`gsd-tools session`)](#10-session-intelligence--deterministic-replay-cli)
11. [Unified Version Management & Release System (`npm run version:bump`)](#11-unified-version-management--release-system)
12. [Step-by-Step Example: Building a Feature from Scratch](#12-step-by-step-example-building-a-feature-from-scratch)
13. [Quick Command Cheat Sheet](#-quick-command-cheat-sheet)

---

## 1. What is GSD Core Nexus

**GSD Core Nexus** is a meta-prompting, context-engineering, native static analysis, and spec-driven development framework for AI coding agents (Claude Code, DeepSeek Harness, Codex, Antigravity CLI, Kimi CLI, Copilot, Cursor, and more). It solves the **Context Rot** problem (the degradation of AI accuracy and hallucination as conversation history accumulates noise) through:

* **Subagents with Clean Context:** Every execution plan runs in an isolated, fresh 200k context window.
* **Persistent File-Backed State:** The `.planning/` directory is the single source of truth — progress, technical decisions, and plans are tracked in Git.
* **Surgical Just-In-Time (JIT) Injection:** Instead of dumping the entire repository into prompt context, GSD injects only relevant interface contracts and neighbor symbols, slashing token usage by **80% to 90%**.
* **Strict Public Surface:** Zero confusion with dozens of legacy aliases — 10 clear, canonical, and unified commands.
* **Deterministic Session Intelligence & Replay:** Every unified command execution is recorded into structured append-only JSONL events with smart trimming and terminal timeline replay.

---

## 2. Installation and Setup

Install GSD Core Nexus globally or locally for your preferred AI runtime:

```bash
npx github:carlosatec/gsd-core
```

The interactive installer guides you through 3 simple steps:
1. **Runtime Detection & Selection:** Automatically detects or lets you choose your environment (Claude Code, DeepSeek Harness, Antigravity CLI, OpenCode, Codex, Copilot, Cursor, Windsurf, Kimi CLI, Kilo, etc.).
2. **Installation Scope:** Choose between **Global** (available across all projects) or **Local** (scoped to the current repository).
3. **Descriptions Language (i18n):** Automatically senses your OS locale and configures **English** or **Português (Brasil)**.

> **Tip — Direct One-Liner Install:** To run unattended without interactive prompts:
> ```bash
> npx github:carlosatec/gsd-core --antigravity --global --lang=en
> ```

---

## 3. Starting a Project

### Scenario A: New or Existing Project Setup
```bash
/gsd:status
```
GSD inspects git repository state, detects project configuration, and guides initialization of `PROJECT.md`, `ROADMAP.md`, and the initial phase.

### Scenario B: Plan Immediately
```bash
/gsd:plan
```
Generates the specification and task plans for the upcoming milestone phase based on provided requirements.

### Scenario C: Upgrade a Legacy Project
```bash
/gsd:migrate
```
Upgrades directory layouts, manifests, and schema versions to GSD Core Nexus 2.7 non-destructively.

---

## 4. The 10 Canonical Unified Commands Surface

In GSD 2.6, the user-facing command surface is strictly consolidated into **10 canonical commands**, while all operational playbooks are dynamically loaded on-demand via execution context:

```text
┌─────────────────────────────────────────────────────────────┐
│                 GSD 2.7 CANONICAL INTERFACE                 │
├────────────┬────────────────────────────────────────────────┤
│ Command    │ Operational Purpose                            │
├────────────┼────────────────────────────────────────────────┤
│ /gsd:status│ Situational diagnostics, progress, and roadmap │
│ /gsd:plan  │ Detailed phase planning with waves and specs   │
│ /gsd:exec  │ Parallel wave execution with fresh subagents   │
│ /gsd:review│ Static code review with optional --fix repairs │
│ /gsd:verify│ Conversational UAT validation and Auto-Pass    │
│ /gsd:ship  │ Branch cleanup, verification gate, PR creation │
│ /gsd:auto  │ Autonomous autopilot (discuss → plan → exec)   │
│ /gsd:tokens│ Real-time token telemetry and savings dashboard│
│ /gsd:migrate│ Non-destructive legacy migration & AST rebuild │
│ /gsd:help  │ Complete help and command reference guide      │
└────────────┴────────────────────────────────────────────────┘
```

> **Syntax Compatibility:** GSD natively supports your runtime's slash command formatting: `/gsd:plan`, `/gsd-plan`, `$gsd-plan`, or `gsd plan`. Legacy retired commands fail closed safely with guidance pointing to the canonical 10.

---

## 5. The 5-Stage Development Lifecycle

Every phase in the roadmap follows an explicit, verifiable lifecycle:

```
  1. DISCUSS ──────► 2. PLAN ──────► 3. EXECUTE ──────► 4. VERIFY ──────► 5. SHIP
  (Align What)      (Design How)     (Build Code)       (UAT Testing)    (Deliver PR)
```

1. **Discuss / Spec (`/gsd:plan` / `discuss`):** Aligns architectural decisions before drafting plans and records them in `STATE.md`. If skipped, GSD issues a non-blocking soft warning and synthesizes `SPEC.md` directly from `ROADMAP.md` decisions.
2. **Plan (`/gsd:plan`):** Decomposes the phase into atomic tasks structured across parallel execution waves in `PLAN.md`.
3. **Execute (`/gsd:exec`):** Dispatches fresh subagents per plan wave with isolated worktrees and pre-flight validation.
4. **Verify (`/gsd:verify`):** Validates feature deliverables through conversational UAT checkpoints and test suite Auto-Pass.
5. **Ship (`/gsd:ship`):** Sanitizes commits, verifies tree cleanliness, pushes branch, and creates the ready-for-review Pull Request.

---

## 6. Codebase Intelligence: Universal 360° AST, Mobile & Living Docs

GSD Core statically analyzes your codebase without compiler overhead or external toolchains:

* **35+ Native Technologies & Extensions:** TypeScript, JavaScript, Python, Go, Rust, C#, Java, PHP, Ruby, C/C++, SQL/DDL, Prisma, GraphQL, CSS/SCSS/LESS, HTML/Vue/Svelte, Dockerfile, Shell Script, YAML.
* **📱 Mobile 360° Native Support:**
  - **iOS (Swift & SwiftUI):** Dedicated AST parser for `.swift`, `.m`, `.mm` extracting `struct`, `class`, `protocol`, `enum`, `extension`, `func`, and SwiftUI components (`View`, `body: some View`). Recognizes `Package.swift`, `Podfile`, `Info.plist`, and `XCTestCase` scaffolds.
  - **Android (Kotlin & Jetpack Compose):** Automatic detection of `@Composable fun` (as UI components), `sealed class`, `object` (singletons), `@HiltViewModel` (as dependency injection services), and `suspend fun`. Supports `build.gradle.kts`, `settings.gradle.kts`, and `AndroidManifest.xml`.
  - **One-Shot Mobile Runners:** Automatic runner detection for `swift test`, `xcodebuild test`, `./gradlew test`, and `gradle test`.
* **🌐 100% Native Knowledge Graph (Zero Python — D-31):** The Graphify engine is implemented entirely in pure TypeScript (version `2.3-native`), building AST graphs and storing `codebase-graph.json` without requiring external Python environments.
* **Incremental `mtime` Caching:** Compares disk file timestamps against existing graphs, reprocessing only modified files to accelerate analysis by up to **85%**.
* **Lite Mode & Auto PageRank Optimization:** For small repos (< 50 files) or quick inspection commands, GSD automatically switches to direct degree scoring, removing unnecessary iterations.
* **Polyglot Test Scaffolding:** Generates test skeletons conforming to language idioms (Swift XCTest, Kotlin/Java JUnit 5, Go `_test.go`, Rust `#[cfg(test)]`, Dart `test/*_test.dart`, Python `test_*.py`, Node `.test.cjs`).
* **Living Docs Engine:** Automatically generates and validates:
  - `.planning/codebase/ARCHITECTURE.md` (module topology and dependency graph)
  - `.planning/codebase/APIS.md` (exported types, structs, and HTTP route catalog)
* **Doc Drift Prevention:** Continuous post-commit verification without redundant $O(n^2)$ graph recomputation.

---

## 7. Surgical Context Injection (JIT) & Okapi BM25 Semantic RAG

Rather than flooding the LLM context window with hundreds of irrelevant source lines, the JIT engine:

1. **Queries the AST Graph with PageRank Ordering:** Discovers upstream consumers and downstream dependencies, sorting neighbors by architectural importance.
2. **Extracts Contract Signatures:** Feeds only exported interfaces, structs, and function headers, omitting noisy implementation bodies of adjacent files.
3. **Injects Canonical Architecture Anchors:** Automatically picks the repository's highest-quality reference file (based on centrality and type density) so the AI adheres to codebase conventions.
4. **Okapi BM25 Semantic RAG Engine (D-33):**
   - **Calibrated Parameters:** ($k_1 = 1.5, b = 0.75$) with term frequency saturation and average document length (`avgdl`) normalization.
   - **Multilingual Code Tokenizer:** Splits identifiers in `camelCase`, `PascalCase`, `kebab-case`, and `snake_case`.
   - **Universal Coverage:** Indexes 35+ file types with automated exclusion of heavy build artifacts (`Pods`, `.gradle`, `DerivedData`, `.build`, `node_modules`).
5. **Attaches Active Decisions:** Injects only relevant ADRs from `STATE.md` using the native decision parser.
6. **⚡ Automated Session Context Hook (D-30):** Automatically injects the project briefing (≤ 15 lines) into `GEMINI.md`, `AGENTS.md`, or `.agents/rules/gsd-session.md` at command invocation, eliminating context loss across fresh AI sessions.

**Result:** The model receives a compact `<jit_context>` block with 100% signal and minimal token overhead.

---

## 8. Pre-Flight Safety: Guardrails, Anti-Patterns & Self-Healing

To guarantee AI edits do not break repository invariants:

* **In-Memory Pre-Flight AST Diffing:** Simulates diffs in memory before touching disk. If an edit removes an exported function required by an external file, the patch is blocked (`CONTRACT_BREAK`).
* **Bounded Depth DFS (1,000 Nodes):** Circular dependency checking is depth-capped, eliminating stack overflows in complex graph topologies.
* **Empty File Guard (`EMPTY_FILE_GUARD`):** Blocks LLM streaming dropouts or hallucinations from wiping files to 0 bytes (`UNINTENDED_TRUNCATION`).
* **Hub Quality & UI/UX Guardrails (D-34):**
  - **In `/gsd:plan`:** Runs gap analysis and alerts on unaddressed requirements.
  - **In `/gsd:review`:** Flags cyclomatic complexity (> 15) and checks frontend files for hardcoded colors missing design tokens or buttons missing accessibility labels (`aria-label`).
  - **In `/gsd:verify`:** Triggers `autoPassed: true` automatically when test coverage and assertions reach 100%.
* **Co-Evolution Authorization:** When a function and its caller are modified within the same atomic changeset, pre-flight passes without false positives.
* **Self-Healing Loop:** If a test fails during task execution, subagents enter an automated repair loop (up to 3 iterations) to diagnose and fix the failure.
* **Cross-Session Anti-Pattern Store:** Every resolved bug is recorded in `.planning/intel/anti-patterns.json` with search indexing (`errorQuery`), preventing recurring mistakes in future sessions.

---

## 9. Token Telemetry & Observability Dashboard (`/gsd:tokens`)

Inspect token savings and context utilization in real time:

```bash
/gsd:tokens
```

**Terminal Output (65 Columns):**
```text
┌─────────────────────────────────────────────────────────────┐
│ ⚡ GSD Core Nexus Token Telemetry (Observability)            │
├─────────────────────────────────────────────────────────────┤
│ • Total Invocations:     42     executions                  │
│ • Tokens Used (JIT):     84,500     tokens                  │
│ • Monolithic Avoided:    820,000    tokens                  │
│ • Tokens Saved:          735,500    tokens                  │
│ • Average Efficiency:    89.7 % context saved               │
│ • Peak Invocation:       3,200  tokens                      │
├─────────────────────────────────────────────────────────────┤
│ 🔀 Distribution by Command:                                  │
│ • exec     [████████░░░░]  60% (50,700 tokens)              │
│ • plan     [███░░░░░░░░░]  20% (16,900 tokens)              │
│ • review   [███░░░░░░░░░]  20% (16,900 tokens)              │
└─────────────────────────────────────────────────────────────┘
```

---

## 10. Session Intelligence & Deterministic Replay CLI

GSD 2.6 automatically records append-only execution events for all unified commands in `.planning/intel/sessions/session_<timestamp>_<uuid>.jsonl`.

### Key Capabilities:
- **Smart 32 KB Trimming:** Output buffers and stack traces larger than 32 KB preserve both the start (16 KB) and end (16 KB) with `... [truncated N bytes] ...`, preventing disk explosion while keeping root causes.
- **Secret Redaction:** Masks API keys (`sk-*`, `ghp_*`, Bearer tokens) automatically before disk write.
- **Ring Buffer (50/30d):** Retains up to 50 sessions / 30 days (~25-40 MB budget) safely gitignored.

### Replay Commands (`gsd-tools session`):

```bash
# 1. Replay latest session in terminal
node gsd-core/bin/gsd-tools.cjs session replay latest

# 2. View summary (1 line per step)
node gsd-core/bin/gsd-tools.cjs session replay latest --summary

# 3. Filter for errors and failed tools only
node gsd-core/bin/gsd-tools.cjs session replay latest --errors-only

# 4. View file modification diffs
node gsd-core/bin/gsd-tools.cjs session replay latest --diffs

# 5. Export session to Markdown report
node gsd-core/bin/gsd-tools.cjs session export latest --md

# 6. List all recorded sessions or clean old ones
node gsd-core/bin/gsd-tools.cjs session list
node gsd-core/bin/gsd-tools.cjs session clean --max 50 --days 30
```

---

## 11. Unified Version Management & Release System

GSD Core Nexus 2.7 includes an automated, single-command release orchestrator (`scripts/bump-version.cjs`):

```bash
# 1. Elevate version across all 49 capability manifests, core modules, lockfiles, and badges
npm run version:bump 2.7.0

# 2. Verify strict lockstep synchronization across the repository
npm run version:check

# 3. Preview changes without writing to disk
node scripts/bump-version.cjs 2.7.0 --dry-run
```

---

## 12. Step-by-Step Example: Building a Feature from Scratch

Follow a complete end-to-end GSD development flow:

### Step 1: Check Current Status
```bash
/gsd:status
```
> GSD reads git status and `STATE.md`, displaying current phase status and next actions.

### Step 2: Plan the Phase
```bash
/gsd:plan
```
> The planner inspects codebase AST, generates execution waves in `PLAN.md`, and sets acceptance criteria.

### Step 3: Execute Tasks
```bash
/gsd:exec
```
> Subagents execute task waves in parallel with JIT context. If a test fails, the self-healing loop automatically remediates.

### Step 4: Run Code Review with Autonomous Fixes
```bash
/gsd:review --fix
```
> GSD reviews modified files, detects style/type defects, and applies autonomous fixes.

### Step 5: Validate Deliverables (UAT)
```bash
/gsd:verify
```
> The agent walks through acceptance checkpoints and validates test completion.

### Step 6: Ship and Open PR
```bash
/gsd:ship
```
> Validates working tree, runs final verification checks, pushes branch, and opens the Pull Request!

---

## 🎯 Quick Command Cheat Sheet

| What do you want to do? | Run this command |
|---|---|
| Check situation / Next action | `/gsd:status` |
| Plan the next phase | `/gsd:plan` |
| Execute planned tasks | `/gsd:exec` |
| Audit and repair code | `/gsd:review --fix` |
| Validate UAT deliverables | `/gsd:verify` |
| View token savings dashboard | `/gsd:tokens` |
| Replay latest AI session | `node gsd-core/bin/gsd-tools.cjs session replay latest` |
| Export session post-mortem | `node gsd-core/bin/gsd-tools.cjs session export latest --md` |
| Bump ecosystem version | `npm run version:bump <version>` |
| Check repository sync | `npm run version:check` |
| Ship branch / Open PR | `/gsd:ship` |
| Autonomous autopilot | `/gsd:auto` |
| Upgrade legacy project | `/gsd:migrate` |
| View help and command list | `/gsd:help` |

---

*GSD Core Nexus 2.7 — Develop with surgical precision, zero context rot, causal observability, and peak efficiency.*
