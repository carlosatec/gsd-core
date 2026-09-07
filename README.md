<div align="center">

# GSD Core Nexus

**Git. Ship. Done.**

**English** · [Português](README.pt-BR.md)

**A light-weight meta-prompting, context engineering, native static analysis, and spec-driven development system for Claude Code, DeepSeek Harness, OpenCode, Antigravity CLI, Kimi CLI, Kilo, Codex, Copilot, Cursor, Windsurf, and more.**

[![version](https://img.shields.io/badge/version-3.2.0-CB3837?style=for-the-badge&logo=git&logoColor=white)](.planning/ROADMAP.md)
[![Tests](https://img.shields.io/github/actions/workflow/status/carlosatec/gsd-core/test.yml?branch=next&style=for-the-badge&logo=github&label=Tests)](https://github.com/carlosatec/gsd-core/actions)
[![GitHub stars](https://img.shields.io/github/stars/carlosatec/gsd-core?style=for-the-badge&logo=github&color=181717)](https://github.com/carlosatec/gsd-core/stargazers)
[![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](LICENSE)

</div>

---

## What is GSD Core Nexus

GSD Core Nexus is a context-engineering, native static analysis, and spec-driven development framework that drives AI coding agents (Claude Code, DeepSeek Harness, Codex, Antigravity CLI, Kimi CLI, Copilot, Cursor, and more) through a disciplined phase loop. It solves [context rot](docs/explanation/context-engineering.md) — the quality degradation that accumulates as an AI fills its context window — by running all heavy research, planning, and execution work in fresh-context subagents while keeping your main session lean.

---

## How it works

Each milestone repeats the same five-step loop, one phase at a time:

1. **Discuss & Spec** — capture implementation decisions before anything is planned (`/gsd:plan --spec`)
2. **Plan** — research, decompose, and verify the plan fits a fresh context window (`/gsd:plan`)
3. **Execute** — run plans in parallel waves with Pre-Flight static guardrails (`/gsd:exec`)
4. **Review & Verify** — deep code & UI review with auto-fix (`/gsd:review --fix`) and acceptance UAT (`/gsd:verify`)
5. **Ship** — clean release, auto-generate PR, archive phase, and repeat (`/gsd:ship`)

---

## GSD Core Nexus 3.2: DeepSeek Harness, Session Replay, Universal Versioning & AST 360°

GSD Core Nexus 3.2 elevates AI coding agents with deep execution observability, multi-runtime autonomy, mobile intelligence, strict canonical surface, and unified release automation:

- **DeepSeek Harness 1st-Class Support (`@deepseek-ai/dsh` — D-53):** Full declarative host adapter with Cordis micro-kernel integration, Model Context Protocol (MCP) transport, and seamless CLI alias resolution (`dsh`, `deepseek`, `deepseek-cli`).
- **Structured Session Logging & Intelligent Ring Buffer (D-54 / D-55):** Append-only JSONL execution event logging (`.planning/intel/sessions/`) with 32 KB smart trimming for stack traces and code patches, regex-based secret sanitization, transparent hub tracking across all 10 commands, and generous 50-session/30-day disk-bounded retention (~25-40 MB gitignored).
- **Deterministic Session Replay CLI (`gsd-tools session` — D-56):** Interactive terminal timeline replay with `--summary`, `--errors-only`, `--diffs`, default `latest` resolution, Markdown export, and direct feeding of failure diagnostics into `anti-pattern-store.cts`.
- **Automated Unified Version Management (`npm run version:bump` — D-57 / D-58):** Single-command atomic release orchestrator (`scripts/bump-version.cjs`) with SemVer validation, lockstep synchronization across 49 capability manifests, README badges, core modules, and derived pipelines (`npm run version:check`).
- **Strict 10-Command Public Surface (D-41 / D-42):** Clean slash-command menu featuring exclusively the 10 Canonical Unified Commands (`status`, `plan`, `exec`, `review`, `verify`, `ship`, `auto`, `tokens`, `migrate`, `help`) with strict fail-closed dispatch and zero confusing duplicates.
- **Universal Multi-Language AST & Mobile 360°:** Native static code analysis across 35+ extensions (TypeScript, Python, Go, Rust, C#, Java, PHP, Ruby, C/C++, SQL, Docker, Shell, YAML) with full **Mobile 360° support** for iOS (Swift, SwiftUI, XCTest) and Android (Kotlin, Jetpack Compose, Hilt, JUnit 5, Gradle).
- **100% Native Knowledge Graph (Zero Python — D-31):** Pure-TypeScript Graphify facade (`2.3-native`) building and querying the AST dependency graph in memory with zero external Python dependencies.
- **Session Context Hook (Zero Context Blindness — D-30):** Automatically injects and keeps active project state updated in `GEMINI.md`, `AGENTS.md`, or rules, giving the AI instant context at startup.
- **Okapi BM25 RAG & Code-Aware Tokenizer (D-33):** High-precision semantic retrieval with term saturation ($k_1=1.5, b=0.75$), identifier splitting (`camelCase`, `PascalCase`, `kebab-case`, `snake_case`), and mobile build cache exclusions.
- **Living, Incremental Documentation:** Post-commit sync auto-generates and verifies `.planning/codebase/ARCHITECTURE.md` and `.planning/codebase/APIS.md` directly from active code topology without $O(n^2)$ overhead.
- **Deep Call-Graph & Canonical Anchors:** Modules are ranked by PageRank architectural importance, allowing agents to anchor on canonical reference implementations.
- **Tiered AST Engine (Tiers 1, 2 & 3 — D-100):** On-demand official TypeScript compiler (interface inheritance `extends`, type aliases, discriminated unions, exact method signatures, zero V8 memory retention) with universal fallback to a 2-pass state-machine lexer immune to comments and docstrings across 9 polyglot languages.
- **Quality-First JIT & Transitive Type Closure (D-99):** Deep recursive type discovery up to 3 degrees of dependency (BFS 3 hops / 50 unique types cap) ordered by PageRank with model-aware dynamic budgets (2.5K to 24K tokens).
- **Sub-15ms Pre-Flight Guardrails & Active Co-Evolution (D-101 / D-102):** In-memory path caching ($O(1)$) cutting preflight latency from ~60ms to **1–3ms**, combined with `SIGNATURE_DRIFT` warnings and structured `CO_EVOLVE_CALLERS` payloads.
- **Persistent Anti-Pattern Store with Okapi BM25:** Durably remembers lessons from autonomous self-healing loops with BM25 relevance ranking and canonical stack trace sanitization (`<PATH>`, `<LINE>`, `<HEX>`).
- **Topology-Aware & Polyglot Test Scaffolding:** Synthesizes test skeletons matching native language conventions (Swift XCTest, Kotlin/Java JUnit 5, inline `_test.go` for Go, `#[cfg(test)]` for Rust, Dart/Flutter `test/*_test.dart`, isolated test suites for Python/Node).
- **Holistic Multi-Command Token Telemetry & Concurrency Hardening (D-111 to D-121):** End-to-end token tracking across `plan`, `exec`, and `review` backed by transactional locking (`withFileLockSync`), `invocationId` deduplication, physical file auto-estimation, and a 65-column stabilized ASCII dashboard with pre-exec diagnostics.
- **Dual-Mode Review Architecture (D-113, D-121):** Surgical targeted reviews saving 80–95% tokens via JIT, alongside zero-cost whole-repository audits (`/gsd:review --full` / `--repo`) with PageRank hub prioritization and honest metric reporting.
- **Unified Hub CLI Seam & Root-Anchored Guardrails (D-117, D-119, D-120):** Direct terminal execution for all 10 commands (`node gsd-tools.cjs <command>`), flexible phase resolution, and cwd-independent preflight validation (`path.resolve(root, p)`).
- **Concurrency & Security Hardening (D-35 to D-40):** Universal clock seam (`realClock.sleep` via `Atomics.wait`), secure MCP confinement within `.planning/`, chunk-resilient JSON-RPC streaming, and lockstep versioning across all 49 manifests.

---

## Quickstart

```bash
npx github:carlosatec/gsd-core
```

The interactive installer prompts for your runtime (Claude Code, OpenCode, Antigravity CLI, Codex, Copilot, Cursor, Windsurf, and more), installation scope (global or local), and language for command descriptions (`Português (Brasil)` or `English`, also configurable via `--lang=pt-br`). The installer is required for cross-runtime compatibility — do not copy files from `agents/` or `commands/` directly.

On another runtime or without Node.js? See [Install on your runtime](docs/how-to/install-on-your-runtime.md).

Once installed, check status or start planning:

```bash
/gsd-status       # check project state, living docs & telemetry
/gsd-plan         # plan next phase
/gsd-exec         # execute phase plan
```

New here? Check the [Complete Practical GSD Tutorial](docs/tutorials/practical-tutorial.md) ([Português](docs/pt-BR/tutorials/tutorial-pratico.md)) or follow [Your first project](docs/tutorials/your-first-project.md) for a guided walkthrough from install to first shipped phase, or [Onboarding an existing codebase](docs/tutorials/onboarding-an-existing-codebase.md) for brownfield setup.

---

## Documentation

**What's new in GSD Core Nexus 3.2** → [Complete Practical Tutorial](docs/tutorials/practical-tutorial.md) · [Roadmap](.planning/ROADMAP.md)

**Tutorials** — learning by doing:
- [Practical Tutorial: Mastering GSD Core Nexus 3.2](docs/tutorials/practical-tutorial.md) ([Português](docs/pt-BR/tutorials/tutorial-pratico.md)) 🔥
- [Your first project](docs/tutorials/your-first-project.md)
- [Onboarding an existing codebase](docs/tutorials/onboarding-an-existing-codebase.md)

**How-to guides** — task-focused recipes:
- [Install on your runtime](docs/how-to/install-on-your-runtime.md)
- [Plan a phase](docs/how-to/plan-a-phase.md)
- [Verify and ship](docs/how-to/verify-and-ship.md)
- … [see all how-to guides](docs/README.md#how-to-guides)

**Reference** — authoritative facts:
- [Commands](docs/COMMANDS.md)
- [Configuration](docs/CONFIGURATION.md)
- [CLI tools](docs/reference/CLI-TOOLS.md)

**Explanation** — concepts and design decisions:
- [Context engineering](docs/explanation/context-engineering.md)
- [The phase loop](docs/explanation/the-phase-loop.md)
- [Architecture](docs/ARCHITECTURE.md)

Full index: [docs/README.md](docs/README.md) · [Português](README.pt-BR.md).

---

## Why it works

Most AI-coding setups fail at scale because context bloat silently degrades output quality, there is no shared memory between sessions, and nothing verifies that code actually works. GSD Core Nexus solves all three: heavy work runs in fresh subagents, structured artifacts like `STATE.md` and `CONTEXT.md` survive session boundaries, and the verify step walks through what was built and generates fix plans before a phase is declared done. See [docs/explanation/context-engineering.md](docs/explanation/context-engineering.md) for the full reasoning.

Troubleshooting? See [docs/how-to/recover-and-troubleshoot.md](docs/how-to/recover-and-troubleshoot.md).

---

## Uninstallation

To uninstall GSD Core Nexus cleanly, pass the `--uninstall` flag along with the desired target scope (`--global` or `--local`) and optional runtime flag:

```bash
# Uninstall Claude Code global installation (default runtime)
npx github:carlosatec/gsd-core --global --uninstall

# Uninstall Antigravity global installation
npx github:carlosatec/gsd-core --antigravity --global --uninstall

# Uninstall Codex global installation
npx github:carlosatec/gsd-core --codex --global --uninstall

# Uninstall from local project directory only
npx github:carlosatec/gsd-core --local --uninstall

# Uninstall from all runtimes globally
npx github:carlosatec/gsd-core --all --global --uninstall
```

### What is removed vs. what is preserved:

- **Cleaned up:** `gsd-core/` runtime directory, all `gsd-*` commands/skills/agents, GSD-managed hooks in `hooks/`, and internal GSD manifests.
- **Preserved:** Your custom files and preferences (`USER-PROFILE.md`, `dev-preferences.md`), custom non-GSD skills/agents, custom settings in `settings.json`/`config.toml`, and project `.planning/` directories.

---

## Credits & Upstream

GSD Core Nexus is built upon the open-source foundation of [GSD Core (`open-gsd/gsd-core`)](https://github.com/open-gsd/gsd-core), extending it with native multi-language AST analysis, Mobile 360° support, Okapi BM25 semantic RAG, surgical JIT context injection, and pre-flight guardrails.

---

## License

MIT License. See [LICENSE](LICENSE) for details.

---

<div align="center">

**AI coding agents are powerful. GSD Core Nexus makes them reliable, disciplined, and token-efficient.**

</div>
