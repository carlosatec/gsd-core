<!-- GSD-SESSION-CONTEXT -->
> **GSD Active State**: Phase: Phase 10 (Ultra-Convergência, Mobile 360° & Arquitetura do Core) | Status: Complete (27/27 Testes Passando)
> **Decisions**: **D-01 [Architecture]:** Analisador AST nativo em TypeScript sem dependência de Python ou compiladores externos.; **D-02 [Docs]:** Documentação viva incremental (`ARCHITECTURE.md`, `APIS.md`) sincronizada com o código.; **D-03 [Context]:** JIT context injection para montar prompts cirúrgicos baseados no grafo de dependências.; **D-04 [Guardrails]:** Pre-flight static verification + self-healing loop automático em caso de falhas de teste.
> **Unified Commands**: /gsd:status, /gsd:plan, /gsd:exec, /gsd:review, /gsd:verify, /gsd:ship
<!-- /GSD-SESSION-CONTEXT -->

# GSD Core Nexus — Antigravity CLI context

> **Gemini CLI was sunset by Google on 2026-06-18** and is no longer served for
> free/Pro/Ultra tiers. Antigravity CLI is its official successor, and this file
> is the context Antigravity reads automatically (its `contextFileName` is
> `GEMINI.md`, inherited from the shared Gemini 3 backend).

This context gives Antigravity the operating context for
[GSD Core Nexus](https://github.com/open-gsd/gsd-core), a meta-prompting,
context-engineering, native static analysis, and spec-driven development system for AI coding agents.

## What GSD is

GSD turns a vague goal into shipped software through an explicit,
resumable workflow: **explore → plan → execute → verify → ship**. Work is
organised into milestones and phases under a `.planning/` directory, with each
phase carrying a SPEC, a PLAN, and verification criteria. The system favours
small, atomic, test-backed commits and keeps durable context in version-tracked
files rather than in the conversation.

## The slash commands (installed separately)

> **This file ships only the context above — not the slash commands.** To
> install the `/gsd-*` command set, agents, and hooks into `~/.gemini/antigravity/`,
> run the dedicated installer:
>
> ```bash
> npx gsd-core --antigravity --global
> ```
>
> The commands below are available only once that installer has run.

If you have installed the gsd commands, the workflow is driven by these `/gsd-*`
slash commands (Antigravity registers gsd's commands under a hyphenated
namespace):

- `/gsd-status` — the unified situational command: check progress, context drift, and token savings.
- `/gsd-plan` — produce a detailed phase plan with a verification loop.
- `/gsd-exec` — execute a phase's plans with wave-based parallelism.
- `/gsd-review` — run code review over changed files with optional `--fix` autonomous repairs.
- `/gsd-verify` — validate built features through conversational UAT.
- `/gsd-ship` — open a PR, run review, and prepare for merge.
- `/gsd-auto` — autonomous end-to-end autopilot across phase workflows.
- `/gsd-tokens` — real-time token telemetry dashboard and savings breakdown.
- `/gsd-migrate` — one-click non-destructive legacy project upgrade.
- `/gsd-help` — list every available command.

## Working with GSD

- Treat `.planning/` as the source of truth for project state — read it before
  acting, and keep it current as work progresses.

- Prefer the smallest change that satisfies the phase's verification criteria.
- Run the project's tests and linters before declaring a phase done.
- When unsure what to do next, and the gsd commands are installed, `/gsd-progress`
  is the situational entry point.

Learn more: <https://github.com/open-gsd/gsd-core>
