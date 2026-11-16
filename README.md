<div align="center">

# ⚡ GSD Core Nexus

### **Git. Ship. Done. — The AI Agent Operating System**

**English** · [Português](README.pt-BR.md)

**A sovereign meta-prompting, context engineering, native static analysis, and spec-driven development system with an integrated Project Second Brain for Claude Code, Antigravity CLI, DeepSeek Harness, OpenCode, Codex, Copilot, Cursor, Windsurf, Kimi CLI, Qwen Code, and more.**

<br/>

[![Version](https://img.shields.io/badge/version-3.8.1-06b6d4?style=for-the-badge&logo=git&logoColor=white)](.planning/ROADMAP.md)
[![Tests](https://img.shields.io/github/actions/workflow/status/carlosatec/gsd-core/test.yml?branch=next&style=for-the-badge&logo=github&label=Tests&color=34d399)](https://github.com/carlosatec/gsd-core/actions)
[![License](https://img.shields.io/badge/license-MIT-38bdf8?style=for-the-badge)](LICENSE)
[![Zero Python](https://img.shields.io/badge/zero-python%20%7C%20native%20ts-a855f7?style=for-the-badge&logo=typescript&logoColor=white)](docs/ARCHITECTURE.md)
[![Second Brain](https://img.shields.io/badge/obsidian-second%20brain-8b5cf6?style=for-the-badge&logo=obsidian&logoColor=white)](.planning/vault/)
[![GitHub stars](https://img.shields.io/github/stars/carlosatec/gsd-core?style=for-the-badge&logo=github&color=181717)](https://github.com/carlosatec/gsd-core/stargazers)

<br/>

</div>

---

## 🌟 Why GSD Core Nexus?

Most AI coding setups fail in medium-to-large codebases because of three critical bottlenecks:
1. **Context Rot & Token Waste:** As sessions run, accumulated conversation fills the context window, degrading output quality, hallucinating methods, and burning millions of unnecessary tokens.
2. **Context Amnesia & Lost Decisions:** Every new chat resets the AI's memory. Architectural decisions, past mistakes, and invariant rules are instantly forgotten.
3. **Unguarded Edits & Silent Breakages:** Agents mutate files without static safety validation, breaking downstream types, violating constitutional invariants, and leaving hidden regressions.

**GSD Core Nexus fundamentally eliminates these flaws:**
- 🧠 **Persistent Project Knowledge:** Keeps project state and decisions across sessions. The Obsidian vault, codebase maps, and visual exports are generated only when requested.
- ⚡ **Bounded JIT Context:** Retrieves relevant code and documentation chunks with file and line provenance, local ranking, and explicit context-budget limits.
- 🛡️ **Sovereign Cognitive Sentinels:** System One risk evaluation (`SecurityHead`, `ArchitectureHead`, `QualityHead`), constitutional `Noul` invariants, and AST grounding checks run 100% locally with zero external API latency.
- 🔄 **Self-Healing Loop:** Pre-flight guardrails block regressions before edits, while automated test-repair loops diagnose and auto-fix failures.

---

## 🔄 The 5-Step Continuous Phase Loop

Every project milestone is broken down into structured, test-backed phases executed through a clean 5-step lifecycle:

```
    ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
    │ 1. DISCUSS   │ ──> │   2. PLAN    │ ──> │   3. EXEC    │ ──> │  4. REVIEW   │ ──> │   5. SHIP    │
    │   & SPEC     │     │              │     │  (Self-Heal) │     │   & VERIFY   │     │              │
    └──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
           │                    │                    │                    │                    │
           └────────────────────┴────────────────────┼────────────────────┴────────────────────┘
                                                     ▼
                                      🧠 PROJECT SECOND BRAIN & INTEL
                            (Obsidian Vault · 360° Visual Graph · Memory SSOT)
```

1. **Discuss & Spec (`/gsd:plan`):** Capture requirements and implementation decisions before execution.
2. **Plan (`/gsd:plan`):** Decompose work into atomic parallel task waves with verified JIT context budgets.
3. **Execute (`/gsd:exec`):** Execute plan tasks with pre-flight checks and configured self-healing recovery.
4. **Review & Verify (`/gsd:review --fix` & `/gsd:verify`):** Audit code for complexity, dead code, and UI anti-patterns with auto-repair, followed by conversational UAT acceptance.
5. **Ship (`/gsd:ship`):** Verify release readiness and prepare the requested delivery workflow.

---

## 🚀 Canonical Commands

The primary workflow has six commands, with `auto` for autonomous execution and four supporting commands:

| Command | Action & Superpower | Common Flags |
| :--- | :--- | :--- |
| **`/gsd:status`** | Read project progress, artifact freshness, and telemetry; `--sync` or `--refresh` explicitly refreshes derived data | `--sync`, `--refresh` |
| **`/gsd:plan`** | Create or update a phase plan with requirements, task waves, and JIT context | `[phase]` |
| **`/gsd:exec`** | Execute phase plans with pre-flight checks and verification | `[phase]` |
| **`/gsd:review`** | Review implementation and identify actionable issues | `[phase]` |
| **`/gsd:verify`** | Check phase requirements and verification evidence | `[phase]` |
| **`/gsd:ship`** | Prepare completed work for delivery | `[phase]` |
| **`/gsd:auto`** | Run the phase workflow autonomously with safety checkpoints | `[phase]` |
| **`/gsd:tokens`** | Inspect token and JIT telemetry | options vary by runtime |
| **`/gsd:graph`** | Build the canonical graph and requested exports; vault generation is opt-in | `--vault`, `--canvas`, `--open` |
| **`/gsd:migrate`** | Migrate a legacy project to the current GSD layout | `--dry-run` |
| **`/gsd:help`** | Show command guidance | — |

---

## 💎 GSD Core Nexus 3.8 Flagship Capabilities

### 1. 🧠 Project Second Brain & Obsidian Vault Engine
- **Opt-in Vault (`.planning/vault/`):** The explicit `/gsd:graph --vault` command exports project decisions, phases, modules, and lessons into linked Markdown notes.
- **Master Map of Content (`00-Home.md`):** High-level navigation portal connecting active work, core production modules (`src/`), tooling, and decisions.
- **Optional Visual Canvases:**
  - `00-Vault.canvas`: Interactive 2D mindmap of active modules, decisions, and system boundaries.
  - `01-Roadmap.canvas`: Optional visual export of the current roadmap.
- **Persistent Memory:** User-recorded memories and architectural decisions remain durable across sessions.

### 2. 🌐 360° Visual Knowledge Graph AST (`graph-view.html`)
- **Offline Force-Directed HTML5 Graph:** An explicitly requested export renders codebase topology in `.planning/intel/graph-view.html`.
- **Directed Governance Edges:** Explicit `governs` links connect architectural decisions to production modules; `specifies` links connect phases to plan files.
- **Zero External Dependencies:** Runs natively in any browser with smooth physics, dark neon aesthetics, and real-time node filtering.

### 3. 🛡️ Sovereign System One Cognitive Sentry (JEV + LAYA)
- **Local Multi-Head Evaluator:** Decomposed evaluation (`SecurityHead`, `ArchitectureHead`, `QualityHead`) with Shannon-entropy uncertainty ($H(P)$) and hybrid BM25 + PageRank RRF re-ranking.
- **Pre-Mutation Guardrail Gates:**
  - `Noul`: Blocks modifications violating constitutional invariants (`CONSTITUTION.md`).
  - `Score`: Flags hallucinated methods or symbol signature mismatches against the AST index.
  - `Choice`: Audits RFC 2119 requirement fulfillment with canonical phase enumeration.
- **Continuous Memory (`decisions.jsonl`):** Durable architectural decisions and recorded lessons are available across sessions.

### 4. ⚡ Quality-First JIT Context & Polyglot AST Engine
- **Zero Python / Native TypeScript:** Static analysis supports TypeScript, JavaScript, Python, Go, Rust, C#, Java, Swift, Kotlin, PHP, Ruby, Dart, Zig, Astro, Protobuf, SQL, CSS, and additional formats.
- **Mobile Coverage:** AST analysis supports Swift and Kotlin source files.
- **Semantic Edge Typing:** Distinguishes between `type_only` and `runtime` imports when calculating dependency impact.
- **Proactive Dead-Code Detection:** Accurately detects unreferenced orphan modules in production directories (`src/`).

### 5. 📚 Offline Chunk Retrieval and Artifact Freshness
- The semantic index stores bounded code and Markdown chunks with file, line, language, and symbol or section provenance.
- Content fingerprints detect edits even when file size and modification time stay the same. The canonical AST graph is `.planning/intel/codebase-graph.json`.
- `/gsd:status` reports artifact freshness without writing files. Maps, vaults, and visual exports remain opt-in.

### 6. 📊 Observability & Token Telemetry
- **Granular Token Governance:** Tracks token usage across all commands (`plan`, `exec`, `review`, `verify`), reporting JIT savings, noise elimination, and compression ratios.
- **Financial Modeling ($ USD):** Live cost estimation across Claude 3.5 Sonnet, GPT-4o, Gemini 1.5 Pro, DeepSeek V3, and local models.
- **Real-Time ASCII & HTML Dashboards:** Adaptive 65-column terminal view (`/gsd:tokens`) and offline interactive SVG web dashboard (`npm run dashboard`).

### 7. 🔀 Concurrency Isolation & Git Worktrees
- **Ephemeral Worktree Engine:** Zero-copy worktree concurrency (Worktrunk pattern) with NTFS directory junction safety for Windows.
- **Cooperative State Lock Facade:** Multi-process lock coordination with PID liveness verification, atomic steal recovery, and transactional release.

---

## ⚡ Quickstart

Install GSD Core Nexus globally or in your current project with a single command:

```bash
npx github:carlosatec/gsd-core
```

The interactive installer will configure your runtime, scope (global or local), and preferred language (`Português (Brasil)` or `English`, also configurable via `--lang=pt-br`).

### Run on your preferred AI runtime:

```bash
# Antigravity CLI (Official Gemini CLI successor)
npx github:carlosatec/gsd-core --antigravity --global

# Claude Code
npx github:carlosatec/gsd-core --claude --global

# Codex
npx github:carlosatec/gsd-core --codex --global

# OpenCode / Cursor / Windsurf / Copilot / DeepSeek Harness
npx github:carlosatec/gsd-core --all --global
```

Once installed, bootstrap your workflow immediately:

```bash
/gsd:status       # Read project state and artifact freshness
/gsd:plan         # Plan the next phase with JIT context
/gsd:exec         # Execute phase plans with pre-flight checks
/gsd:graph --vault # Explicitly export the Obsidian Project Second Brain
```

---

## 📚 Documentation

- **[Practical Tutorial: Mastering GSD Core Nexus 3.8](docs/tutorials/practical-tutorial.md)** ([Português](docs/pt-BR/tutorials/tutorial-pratico.md)) 🔥
- **[Command Reference](docs/COMMANDS.md):** Guide to canonical commands, flags, and workflows.
- **[System Architecture](docs/ARCHITECTURE.md):** Comprehensive deep dive into the component architecture, AST engine, and JIT context injector.
- **[Feature Reference](docs/FEATURES.md):** Full catalog of 170+ capabilities and architectural milestones.
- **[Configuration Guide](docs/CONFIGURATION.md):** Customize model profiles, reviewer instances, and guardrail tolerances.
- **[Troubleshooting & Recovery](docs/how-to/recover-and-troubleshoot.md):** Fast resolution recipes for locks, drift, and edge cases.

---

## 🧹 Clean Uninstallation

GSD Core Nexus provides a clean, non-destructive uninstaller:

```bash
# Global uninstall for Antigravity
npx github:carlosatec/gsd-core --antigravity --global --uninstall

# Global uninstall for Claude Code
npx github:carlosatec/gsd-core --claude --global --uninstall

# Uninstall from all runtimes globally
npx github:carlosatec/gsd-core --all --global --uninstall
```

- **Cleaned:** Runtime hooks, skill manifests, GSD CLI tools, and agent templates.
- **Preserved:** Your source code, user preferences (`USER-PROFILE.md`), and `.planning/` project history.

---

## 📜 License & Credits

- **License:** [MIT License](LICENSE)
- **Built Upon:** Open-source foundation of [GSD Core (`open-gsd/gsd-core`)](https://github.com/open-gsd/gsd-core), extended with native TypeScript AST analysis, Project Second Brain Obsidian Vault, System One Cognitive Sentry, and Quality-First JIT context engineering.

<div align="center">

**AI coding agents are powerful. GSD Core Nexus makes them disciplined, amnesia-proof, and token-efficient.**

</div>
