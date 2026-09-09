<div align="center">

# GSD Core Nexus

**Git. Ship. Done.**

**English** · [Português](README.pt-BR.md)

**A light-weight meta-prompting, context engineering, native static analysis, and spec-driven development system for Claude Code, DeepSeek Harness, OpenCode, Antigravity CLI, Kimi CLI, Kilo, Codex, Copilot, Cursor, Windsurf, and more.**

[![version](https://img.shields.io/badge/version-3.3.2-CB3837?style=for-the-badge&logo=git&logoColor=white)](.planning/ROADMAP.md)
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

## GSD Core Nexus 3.3 Highlights

GSD Core Nexus 3.3 elevates AI coding agents with deep execution observability, multi-runtime autonomy, mobile intelligence, strict canonical surface, and unified release automation:

1. **Universal 360° AST & Native Knowledge Graph (Zero Python):** Native static code analysis in pure TypeScript across 35+ extensions with full **Mobile 360°** support (iOS Swift/SwiftUI, Android Kotlin/Compose) and PageRank architectural ranking.
2. **Quality-First JIT & Transitive Type Closure:** Deep recursive type discovery up to 3 degrees (BFS 3 hops), eliminating context rot and saving **80% to 95% of tokens**.
3. **Strict 11 Canonical Unified Commands:** Streamlined public surface (`status`, `plan`, `exec`, `review`, `verify`, `ship`, `auto`, `tokens`, `migrate`, `graph`, `help`) with fail-closed dispatch and zero confusing duplicates across all AI runtimes.
4. **Causal Session Intelligence & Deterministic Replay CLI (`gsd-tools session`):** Append-only JSONL execution logging with 32 KB smart trimming, secret sanitization, ring buffer (50 sessions / 30 days), and terminal timeline replay.
5. **Holistic Multi-Command Token Telemetry (65-Column Dashboard):** Real-time context observability backed by transactional file locking (`withFileLockSync`) across `plan`, `exec`, `review`, and `auto`.
6. **Dual-Mode Code Review with Autonomous Repair (`--fix`):** Surgical targeted reviews saving 80–95% tokens via JIT, alongside zero-cost whole-repository AST audits (`--full` / `--repo`).
7. **1st-Class DeepSeek Harness Support (`@deepseek-ai/dsh`):** Full declarative host adapter with Cordis micro-kernel integration, Model Context Protocol (MCP) transport, and seamless CLI alias resolution.

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

**What's new in GSD Core Nexus 3.3** → [Complete Practical Tutorial](docs/tutorials/practical-tutorial.md) · [Roadmap](.planning/ROADMAP.md)

**Tutorials** — learning by doing:
- [Practical Tutorial: Mastering GSD Core Nexus 3.3](docs/tutorials/practical-tutorial.md) ([Português](docs/pt-BR/tutorials/tutorial-pratico.md)) 🔥
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
