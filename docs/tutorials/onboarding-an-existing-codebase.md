# Onboarding an existing codebase

In this tutorial you will bring GSD Core Nexus 2.5 into a repository that already has code in it. You will map the codebase, create a project that describes what you are *adding*, and run your first discuss-and-plan cycle for a small focused change. By the end, GSD Core's planning pipeline will know your stack, your conventions, and your concerns — and it will use that knowledge every time you plan.

---

## What you'll build

We will add a single `GET /health` endpoint to an existing Express application. The change is small enough that it will never distract from the real lesson: how GSD Core learns your codebase before it plans anything.

---

## Prerequisites

- **Node.js 18 or later** — `node --version` should print `v18.x.x` or higher.
- **An existing project** — any repo with code already in it. It does not have to be Express; the steps apply to any stack.
- **Supported Runtime** (Claude Code, Antigravity, Cursor, etc.).

---

## Step 1 — Check Workspace Situation

From your repo root:

```text
/gsd-status
```

GSD Core Nexus inspects the repository state and determines whether a brownfield onboarding map is needed.

---

## Step 2 — Map the Codebase

GSD automatically analyzes the codebase using native AST indexing and AST 360° topology:

```text
/gsd-status --detail
```

This scans your dependencies, conventions, architectures, and generates the `.planning/codebase/` structure:
- `STACK.md` (Technologies and detected dependencies)
- `ARCHITECTURE.md` (System design and patterns)
- `STRUCTURE.md` (Directory layout and organization)
- `CONVENTIONS.md` (Code style and patterns)
- `TESTING.md` (Test structure and practices)
- `INTEGRATIONS.md` (External services and APIs)
- `CONCERNS.md` (Technical debt and issues)

---

## Step 3 — Plan Phase 1

```text
/gsd-plan 1
```

GSD asks what feature you are adding to the existing codebase:

```text
Add a GET /health endpoint to the Express app. It should return
{ "status": "ok", "uptime": <seconds> }. We'll use it for load-balancer
health checks.
```

Because GSD already knows your existing architecture, the resulting plans in `.planning/phases/01-health-endpoint/` will match your codebase conventions seamlessly:
- `RESEARCH.md`
- `01-01-PLAN.md` (create `src/routes/health.js`)
- `01-02-PLAN.md` (register route in `src/routes/index.js`)

---

## Step 4 — Execute & Verify

Execute the planned tasks in parallel waves and run conversational verification:

```text
/gsd-exec 1
/gsd-review --fix
/gsd-verify 1
```

---

## Step 5 — Check Token Economy & Ship

```text
/gsd-tokens
/gsd-ship 1
```

---

## Related

- [Your first project](your-first-project.md) — the full greenfield loop from install to PR
- [Commands](../COMMANDS.md) — complete reference of the 10 canonical commands
- [Documentation index](../README.md)
