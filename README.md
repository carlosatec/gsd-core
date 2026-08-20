<div align="center">

# GSD Core

**Git. Ship. Done.**

**English** · [Português](README.pt-BR.md)

**A light-weight meta-prompting, context engineering, and spec-driven development system for Claude Code, OpenCode, Antigravity CLI, Kimi CLI, Kilo, Codex, Copilot, Cursor, Windsurf, and more.**

[![npm version](https://img.shields.io/npm/v/%40opengsd%2Fgsd-core?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/@opengsd/gsd-core)
[![npm downloads](https://img.shields.io/npm/dm/%40opengsd%2Fgsd-core?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/@opengsd/gsd-core)
[![Tests](https://img.shields.io/github/actions/workflow/status/open-gsd/gsd-core/test.yml?branch=main&style=for-the-badge&logo=github&label=Tests)](https://github.com/open-gsd/gsd-core/actions/workflows/test.yml)
[![Discord](https://img.shields.io/badge/Discord-Join-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/mYgfVNfA2r)
[![GitHub stars](https://img.shields.io/github/stars/open-gsd/gsd-core?style=for-the-badge&logo=github&color=181717)](https://github.com/open-gsd/gsd-core)
[![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](LICENSE)

</div>

---

## What is GSD Core

GSD Core is a context-engineering and spec-driven development framework that drives AI coding agents (Claude Code, Codex, Antigravity CLI, Kimi CLI, Copilot, Cursor, and more) through a disciplined phase loop. It solves [context rot](docs/explanation/context-engineering.md) — the quality degradation that accumulates as an AI fills its context window — by running all heavy research, planning, and execution work in fresh-context subagents while keeping your main session lean.

---

## How it works

Each milestone repeats the same five-step loop, one phase at a time:

1. **Discuss** — capture implementation decisions before anything is planned
2. **Plan** — research, decompose, and verify the plan fits a fresh context window
3. **Execute** — run plans in parallel waves; each executor starts with a clean 200k-token context
4. **Verify** — walk through what was built; diagnose and fix before declaring done
5. **Ship** — create the PR, archive the phase, repeat for the next one

---

## GSD 2.3: Universal Intelligence, AST 360°, RAG & Token Telemetry

GSD Core 2.3 elevates AI coding agents with a full-stack static analysis and context governance engine:

- **Universal Multi-Language AST & Incremental Cache:** Native static code analysis across 17+ languages (TypeScript, Python, Go, Rust, Flutter, C#, Java, SQL, Docker, Shell, etc.) with `mtime`-based incremental AST caching and automatic Lite Mode for rapid scans.
- **Living, Incremental Documentation:** Post-commit sync auto-generates and verifies `.planning/codebase/ARCHITECTURE.md` and `.planning/codebase/APIS.md` directly from active code topology without $O(n^2)$ overhead.
- **Deep Call-Graph & Canonical Anchors:** Modules are ranked by PageRank architectural importance, allowing agents to anchor on canonical reference implementations.
- **Hybrid Semantic RAG (Non-Blocking):** Pure-Node TF-IDF and Jaccard similarity search over codebase concepts with isolated index and lazy loading.
- **Surgical Context Injection (JIT):** Replaces monolithic prompts by injecting only 1st-degree neighbors, active type contracts, and architectural decisions (yielding 80%–90% token savings).
- **Pre-Flight Guardrails & In-Memory Contract Validation:** Intercepts breaking export changes, circular dependencies (1000-node DFS limit), phantom imports, and accidental 0-byte truncations (`EMPTY_FILE_GUARD`) *before* writing to disk.
- **Soft Warning & Resilient Planning:** Auto-synthesizes missing `SPEC.md` files from roadmap goals with non-blocking guidance, ensuring zero workflow friction.
- **Persistent Anti-Pattern Store:** Durably remembers lessons from autonomous self-healing loops with cross-file query support (`errorQuery`) to prevent recurring mistakes across sessions.
- **Topology-Aware & Polyglot Test Scaffolding:** Synthesizes test skeletons matching native language conventions (inline `_test.go` for Go, `#[cfg(test)]` for Rust, Dart/Flutter `test/*_test.dart`, Java/Kotlin JUnit 5, isolated test suites for Python/Node).
- **Pure Token Telemetry & Dashboard:** Real-time observability tracking token savings, command breakdowns, and peak bursts via `/gsd:tokens` and `/gsd:status`.
- **Streamlined 6+1 Canonical Commands:** Unifies multi-runtime CLI workflows into `status`, `plan`, `exec`, `review` (with `--fix`), `verify`, `ship`, `auto`, `tokens`, and `migrate`.

---

## Quickstart

```bash
npx @opengsd/gsd-core@latest
```

The installer prompts for your runtime (Claude Code, OpenCode, Antigravity CLI, Kimi CLI, Kilo, Codex, Copilot, Cursor, Windsurf, and more) and whether to install globally or locally. The installer is required for cross-runtime compatibility — do not copy files from `agents/` or `commands/` directly.

On another runtime or without Node.js? See [Install on your runtime](docs/how-to/install-on-your-runtime.md).

Once installed, start a new project or onboard an existing repo:

```bash
/gsd-new-project   # greenfield project
/gsd-onboard       # existing codebase
```

New here? Check the [Complete Practical GSD Tutorial (Português)](tutorial-gsd.md) or follow [Your first project](docs/tutorials/your-first-project.md) for a guided walkthrough from install to first shipped phase, or [Onboarding an existing codebase](docs/tutorials/onboarding-an-existing-codebase.md) for brownfield setup.

---

## Documentation

**What's new in 1.7.0** → [docs/whats-new-1.7.0.md](docs/whats-new-1.7.0.md)

**Tutorials** — learning by doing:
- [Practical Tutorial: Mastering GSD Core 2.3](tutorial-gsd.md) 🔥
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
- [CLI tools](docs/CLI-TOOLS.md)

**Explanation** — concepts and design decisions:
- [Context engineering](docs/explanation/context-engineering.md)
- [The phase loop](docs/explanation/the-phase-loop.md)
- [Architecture](docs/ARCHITECTURE.md)

Full index: [docs/README.md](docs/README.md) · [Português](README.pt-BR.md).

---

## Why it works

Most AI-coding setups fail at scale because context bloat silently degrades output quality, there is no shared memory between sessions, and nothing verifies that code actually works. GSD Core solves all three: heavy work runs in fresh subagents, structured artifacts like `STATE.md` and `CONTEXT.md` survive session boundaries, and the verify step walks through what was built and generates fix plans before a phase is declared done. See [docs/explanation/context-engineering.md](docs/explanation/context-engineering.md) for the full reasoning.

Troubleshooting? See [docs/how-to/recover-and-troubleshoot.md](docs/how-to/recover-and-troubleshoot.md).

---

## Community

| Project | Platform |
|---------|----------|
| [gsd-opencode](https://github.com/rokicool/gsd-opencode) | Original OpenCode port |
| [Discord](https://discord.gg/mYgfVNfA2r) | Community support |

---

## Star History

<a href="https://star-history.com/#open-gsd/gsd-core&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=open-gsd/gsd-core&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=open-gsd/gsd-core&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=open-gsd/gsd-core&type=Date" />
 </picture>
</a>

---

## License

MIT License. See [LICENSE](LICENSE) for details.

---

<div align="center">

**Claude Code is powerful. GSD Core makes it reliable.**

</div>
