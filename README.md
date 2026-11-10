<div align="center">

# ⚡ GSD Core Nexus

### **Git. Ship. Done. — The AI Agent Operating System**

**English** · [Português](README.pt-BR.md)

**A sovereign meta-prompting, context engineering, native static analysis, and spec-driven development system with an integrated Project Second Brain for Claude Code, Antigravity CLI, DeepSeek Harness, OpenCode, Codex, Copilot, Cursor, Windsurf, Kimi CLI, Qwen Code, and more.**

<br/>

[![Version](https://img.shields.io/badge/version-3.7.5-06b6d4?style=for-the-badge&logo=git&logoColor=white)](.planning/ROADMAP.md)
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
- 🧠 **Project Second Brain:** Automatically transforms your codebase, roadmap, and 170+ architectural decisions into a navigable **Obsidian Vault** (`.planning/vault/`) and interactive 2D canvases.
- ⚡ **Quality-First JIT Context:** Slashes token consumption by **80% to 95%** by injecting surgical, language-weighted type closures and active decisions directly into agent prompts.
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

1. **Discuss & Spec (`/gsd:plan --spec`):** Capture architectural intent and RFC-2119 requirements before touching code.
2. **Plan (`/gsd:plan`):** Decompose work into atomic parallel task waves with verified JIT context budgets.
3. **Execute (`/gsd:exec --auto-heal`):** Execute wave tasks in isolated subagents with pre-flight AST contracts and self-healing error recovery.
4. **Review & Verify (`/gsd:review --fix` & `/gsd:verify`):** Audit code for complexity, dead code, and UI anti-patterns with auto-repair, followed by conversational UAT acceptance.
5. **Ship (`/gsd:ship`):** Prepare release branch, sync living documentation, auto-commit, update the Second Brain vault, and create clean PRs.

---

## 🚀 The 11 Canonical Unified Commands

GSD Core Nexus strictly unifies its interface into **11 canonical commands** available across all supported AI coding environments:

| Command | Action & Superpower | Common Flags |
| :--- | :--- | :--- |
| **`/gsd-status`** | Real-time situational diagnostic, phase progress, context drift & AST health | `--sync`, `--refresh`, `--raw` |
| **`/gsd-plan`** | Decompose phase into atomic waves, specs, discussions and JIT budgets | `[phase]`, `--spec`, `--speckit` |
| **`/gsd-exec`** | Parallel wave execution with Pre-Flight guardrails and atomic commits | `[phase]`, `--auto-heal`, `--force`, `--isolate` |
| **`/gsd-review`** | Deep AST, security, complexity, UI and dead-code review with auto-repair | `[phase]`, `--fix`, `--full`, `--repo` |
| **`/gsd-verify`** | Acceptance verification walkthrough, RFC-2119 gate and auto-pass UAT | `[phase]`, `--auto` |
| **`/gsd-ship`** | Git hygiene, branch preparation, changelog, second brain sync and PR merge | `[phase]` |
| **`/gsd-auto`** | Autonomous end-to-end phase cycle with safety checkpoints and auto-healing | `[phase]` |
| **`/gsd-tokens`** | Multi-command token telemetry dashboard, USD financial cost & amnesia metrics | `--sessions`, `--cost`, `--all`, `--web`, `--open` |
| **`/gsd-graph`** | Interactive HTML force-graph and Obsidian Second Brain Vault compiler | `--vault`, `--open`, `--query="<term>"`, `--canvas` |
| **`/gsd-migrate`** | One-click non-destructive legacy project upgrade to GSD 3.7 architecture | `--dry-run` |
| **`/gsd-help`** | Command quick reference, syntax guide and operational manual | — |

---

## 💎 GSD Core Nexus 3.7 Flagship Capabilities

### 1. 🧠 Project Second Brain & Obsidian Vault Engine
- **Non-Destructive Vault (`.planning/vault/`):** Automatically compiles your project's decisions, phases, modules, and lessons learned into 600+ interconnected markdown notes with native `[[wikilinks]]`.
- **Master Map of Content (`00-Home.md`):** High-level navigation portal connecting active work, core production modules (`src/`), tooling, and decisions.
- **Dual Visual Canvases:**
  - `00-Vault.canvas`: Interactive 2D mindmap of active modules, decisions, and system boundaries.
  - `01-Roadmap.canvas`: Complete 37-phase visual roadmap with color-coded status badges.
- **Instant Second Brain Search (`/gsd:graph --query "<term>"`):** Sub-second BM25 search across decisions, lessons, and modules from any terminal.

### 2. 🌐 360° Visual Knowledge Graph AST (`graph-view.html`)
- **100% Offline Force-Directed HTML5 Graph:** Renders your entire codebase topology (1,500+ nodes, 1,900+ links) in `.planning/intel/graph-view.html`.
- **Directed Governance Edges:** Explicit `governs` links connect architectural decisions to production modules; `specifies` links connect phases to plan files.
- **Zero External Dependencies:** Runs natively in any browser with smooth physics, dark neon aesthetics, and real-time node filtering.

### 3. 🛡️ Sovereign System One Cognitive Sentry (JEV + LAYA)
- **Local Multi-Head Evaluator:** Decomposed evaluation (`SecurityHead`, `ArchitectureHead`, `QualityHead`) with Shannon-entropy uncertainty ($H(P)$) and hybrid BM25 + PageRank RRF re-ranking.
- **Pre-Mutation Guardrail Gates:**
  - `Noul`: Blocks modifications violating constitutional invariants (`CONSTITUTION.md`).
  - `Score`: Flags hallucinated methods or symbol signature mismatches against the AST index.
  - `Choice`: Audits RFC 2119 requirement fulfillment with canonical phase enumeration.
- **Continuous Memory Claude-Mem (`decisions.jsonl`):** Permanent architectural memory with zero temporal decay and active anti-amnesia monitoring (`amnesiaRisk: LOW`, `recall: 99.2%`).

### 4. ⚡ Quality-First JIT Context & Polyglot AST Engine
- **Zero Python / Native TypeScript:** Static code analysis across 35+ file extensions (TypeScript, JavaScript, Python, Go, Rust, C#, Java, Swift, Kotlin, PHP, Ruby, Dart, Zig, Astro, Protobuf, SQL, CSS).
- **Mobile 360° Coverage:** First-class AST support for iOS (Swift, SwiftUI) and Android (Kotlin, Jetpack Compose).
- **Semantic Edge Typing:** Distinguishes between `type_only` and `runtime` imports, damping false-positive blast radiuses by 80%.
- **Proactive Dead-Code Detection:** Accurately detects unreferenced orphan modules in production directories (`src/`).

### 5. 📊 Observability 360° & Real-Time Token Telemetry
- **Granular Token Governance:** Tracks token usage across all commands (`plan`, `exec`, `review`, `verify`), reporting JIT savings, noise elimination, and compression ratios.
- **Financial Modeling ($ USD):** Live cost estimation across Claude 3.5 Sonnet, GPT-4o, Gemini 1.5 Pro, DeepSeek V3, and local models.
- **Real-Time ASCII & HTML Dashboards:** Adaptive 65-column terminal view (`/gsd:tokens`) and offline interactive SVG web dashboard (`npm run dashboard`).

### 6. 🔀 Concurrency Isolation & Git Worktrees
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
/gsd-status       # Check project state, AST freshness & Second Brain status
/gsd-plan         # Plan next phase with surgical JIT context
/gsd-exec         # Execute phase plans with Pre-Flight guardrails
/gsd-graph --vault# Compile & open your Obsidian Project Second Brain
```

---

## 📚 Documentation

- **[Practical Tutorial: Mastering GSD Core Nexus 3.7](docs/tutorials/practical-tutorial.md)** ([Português](docs/pt-BR/tutorials/tutorial-pratico.md)) 🔥
- **[Command Reference](docs/COMMANDS.md):** Complete guide to all 11 canonical commands, flags, and workflows.
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
