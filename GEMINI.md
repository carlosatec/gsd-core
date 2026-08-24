<!-- GSD-SESSION-CONTEXT -->
> **GSD Active State**: Phase: Phase 14 (DeepSeek Harness Adapter, Rich Session Logging & Deterministic Replay) | Status: Complete (DeepSeek Harness 1ª Classe, Session Logger 50/30d JSONL, Replay CLI, Versão 2.6.0 & Version Manager, 19/19 Testes, Build Limpo, 0 Lint Warnings)
> **Decisions**: **D-53 [DeepSeek Harness Adapter]:** Suporte declarativo a @deepseek-ai/dsh.; **D-54 [Rich Session Logging]:** Log append-only em JSONL com 32KB smart trimming.; **D-55 [Ring Buffer Retention]:** 50 sessões / 30 dias de retenção.; **D-56 [Deterministic Replay]:** Replay determinístico via CLI com filtros e anti-pattern feeding.; **D-57 [Release v2.6.0]:** Elevação uniforme para a versão 2.6.0 em todo o ecossistema.; **D-58 [Automated Version Manager]:** Orquestrador atômico scripts/bump-version.cjs.
> **Unified Commands**: /gsd-status, /gsd-plan, /gsd-exec, /gsd-review, /gsd-verify, /gsd-ship, /gsd-auto, /gsd-tokens, /gsd-migrate, /gsd-help
<!-- /GSD-SESSION-CONTEXT -->

# GSD Core Nexus — Antigravity CLI context

> **Gemini CLI was sunset by Google on 2026-06-18** and is no longer served for
> free/Pro/Ultra tiers. Antigravity CLI is its official successor, and this file
> is the context Antigravity reads automatically (its `contextFileName` is
> `GEMINI.md`, inherited from the shared Gemini 3 backend).

This context gives Antigravity the operating context for
[GSD Core Nexus](https://github.com/carlosatec/gsd-core), a meta-prompting,
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
> npx github:carlosatec/gsd-core --antigravity --global
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
- When unsure what to do next, and the gsd commands are installed, `/gsd-status`
  is the situational entry point.

Learn more: <https://github.com/carlosatec/gsd-core>
