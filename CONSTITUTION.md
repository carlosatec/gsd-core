# GSD Core Nexus — Project Constitution

This constitution establishes the immutable architectural invariants, coding standards, and safety guardrails governing the development and evolution of GSD Core Nexus. All autonomous workflows, phase plans, subagents, and contributions MUST adhere strictly to these principles.

---

## Invariants (Non-Negotiable Principles)

- **Zero Python / Native TypeScript First (D-01)**: The core engine and all analysis tools MUST remain 100% native TypeScript/JavaScript. No Python runtimes, pip dependencies, ChromaDB, LangChain, or external compiled binaries may be introduced.
- **No-Throw Command Hub Contract**: Command handlers and MCP tools MUST NEVER crash the host process or throw unhandled exceptions. All execution paths must resolve into structured envelopes (`{ ok: boolean, status: string, error?: string, ... }`).
- **Strict Canonical 10 Unified Commands**: The command interface is strictly limited to 10 commands: `/gsd:status`, `/gsd:plan`, `/gsd:exec`, `/gsd:review`, `/gsd:verify`, `/gsd:ship`, `/gsd:auto`, `/gsd:tokens`, `/gsd:migrate`, and `/gsd:graph`. No ad-hoc top-level commands.
- **JIT Context Injection & Token Discipline (D-03)**: Context injection MUST be Just-In-Time (JIT) based on AST dependency graphs, strictly respecting model token budgets (default 4,000 tokens) with deterministic budget enforcement.
- **Windows Portability & NTFS Junction Safety**: All filesystem operations MUST support Windows and Unix seamlessly. Directory Junctions (`mklink /J` or `fs.symlinkSync(..., 'junction')`) MUST be explicitly unlinked via `fs.unlinkSync()` prior to directory removal to prevent host data loss.
- **Catastrophic Truncation Guard**: Write operations MUST inspect safety thresholds, rejecting file shrinkages >35% or truncation below 10 lines without explicit force override.

---

## Coding Standards

- **CommonJS / ESM Dual Interoperability**: Internal modules use TypeScript compiled to CommonJS (`.cts` -> `.cjs`) for universal Node.js compatibility, while exposing modern ESM wrappers (`.mjs`) and package exports.
- **Zero-Dependency Core**: Avoid heavyweight runtime dependencies. Rely on Node.js built-in modules (`node:fs`, `node:path`, `node:crypto`, `node:child_process`, `node:os`) whenever possible.
- **Living Documentation Sync (D-02)**: Public APIs and architectural components must be kept in sync with `docs/ARCHITECTURE.md` and `docs/APIS.md`.
- **Atomic Test Isolation**: Unit and integration tests must run isolated using `node:test` and `node:assert`, without polluting global process state or leaving dangling temp files.

---

## Guardrails

- **Pre-Flight Static Verification (D-04)**: Code execution MUST pass pre-flight static verification (blast radius checks, syntax linting, git cleanliness) before changes are applied.
- **Self-Healing Loop**: If verification or tests fail, execution MUST enter an automatic self-healing repair loop before escalating to the user.
- **Anti-Prompt-Injection Neutralization**: All external specifications, inputs, or imported plans MUST be sanitized to strip invisible unicode homoglyphs, script tags, and prompt injection markers.
- **Continuous Memory Sanitization**: Stored decisions and reflections must strip absolute paths and PII, keeping knowledge durable, compact, and privacy-preserving.

