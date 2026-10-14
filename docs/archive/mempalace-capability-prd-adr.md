# PRD + ADR — MemPalace Capability (Archived)

> [!NOTE]
> **Historical Archive / Superseded Proposal**
> This proposal is archived for historical reference. In GSD Core Nexus 3.6+, cross-session memory and context recovery are natively provided by GSD Nexus without external Python or ChromaDB dependencies (in accordance with Decision **D-01**).

---

> **Status:** **Archived / Superseded**
> **Tracking issue:** [#956](https://github.com/open-gsd/gsd-core/issues/956)
> **Type:** Feature Capability (ADR-857 plug-in)
> **ADR number:** Archived
> **Depends on:** ADR-857 (Capability System)
> **External dependency:** [MemPalace](https://github.com/MemPalace/mempalace) — local-first AI memory (ChromaDB + SQLite), MCP server + CLI + Claude Code hooks

---

# Part I — PRD

## 1. Problem

GSD's memory today is **per-project and per-artifact**: `STATE.md`, `.planning/graphs/` (the gsd-graphify knowledge graph), phase `CONTEXT.md`/`PLAN.md`/`SUMMARY.md`, and `gsd-extract-learnings` output. These are excellent *within* a milestone but have three gaps:

1. **No durable cross-session recall.** A decision made in phase 3 is re-derived in phase 9 because nothing surfaces it at the right moment. The learnings exist on disk but are not *retrieved* at discuss/plan time.
2. **No cross-project memory.** A pattern learned in `gsd-core` is invisible when working in `gsd-pi`. There is no semantic search across the developer's whole body of work.
3. **No verbatim, time-aware decision graph.** `.planning/graphs/` is project-scoped and lacks temporal validity (when did a decision become true; when was it superseded?).

MemPalace solves exactly these: local-first verbatim storage (wings/rooms/drawers), semantic search, a temporal knowledge graph (subject→predicate→object with `valid_from`/`valid_to`), cross-project tunnels, and a ~600–900-token `wake-up` recall layer that "leaves 95%+ of context free."

The opportunity: **wire MemPalace into the GSD loop's natural memory moments** — recall before you think, capture after you decide — via the ADR-857 capability mechanism, so it is opt-in, declarative, and default-resilient (no behavior change when MemPalace is absent).

## 2. Users & personas

| Persona | Need | What the capability gives them |
|---|---|---|
| **Solo maintainer across many repos** (the gsd-core author) | "Why did I decide X three milestones ago?" answered without grep archaeology | Cross-project recall at discuss/plan; temporal KG of decisions |
| **Long-running autonomous runs** (`/gsd-autonomous`, cron) | Memory that survives context compaction and session boundaries | precompact capture; diary journaling; CLI-path capture that works headless |
| **Team onboarding** (`/gsd-milestone-summary` consumer) | A queryable narrative of how the project got here | Verbatim drawers + KG timeline per wing |
| **Privacy-sensitive users** | Memory that never leaves the machine | MemPalace is local-first by construction; capability adds nothing cloud-bound |

## 3. Goals

- **G1 — Deliberate recall.** Surface relevant prior decisions, patterns, and surprises at `discuss:pre` and `plan:pre`, cheaply (wake-up + targeted search), so planning starts informed.
- **G2 — Deliberate capture.** Persist phase artifacts and extracted learnings into the palace at `discuss:post`, `plan:post`, `verify:post`, and `ship:post`, mapped to a stable wing/room taxonomy.
- **G3 — Bidirectional KG sync.** Mirror GSD's decisions/learnings into MemPalace's temporal KG, and (in the stronger modes) read them back.
- **G4 — Cross-project knowledge.** Build tunnels between related wings so a pattern in one repo is reachable from another.
- **G5 — Session journaling.** Write a per-agent diary entry at `ship:post` and on long-run boundaries.
- **G6 — Default-resilient & opt-in.** `tier: full`, master toggle `mempalace.enabled` defaults **off**. Every hook is `onError: skip`. Absent MCP/CLI ⇒ loop proceeds unchanged.

## 4. Non-goals

- **N1** — Not replacing `gsd-extract-learnings` analysis; we *feed* it into the palace, not supersede it.
- **N2** — No third-party-code loading into gsd-core (ADR-857 §7 keeps that out of scope). Integration is via MemPalace's MCP tools + CLI only.
- **N3** — Not authoring a new MemPalace source-adapter (RFC-002); GSD ships text artifacts MemPalace already mines.
- **N4** — Not a blocking gate. Memory never halts the loop. (No `blocking: true` hooks.)
- **N5** — Not shipping MemPalace itself; the capability declares the dependency and wires it, but install/`pip install mempalace` is the user's action.

## 5. Functional requirements

### 5.1 Memory-relationship modes (selectable)

The capability exposes **three modes** via `mempalace.memory_mode`, so the user chooses how tightly MemPalace couples to GSD's native memory. **All three are first-class and selectable** (not a one-time design pick):

| Mode | `.planning/graphs` KG | Learnings / STATE | Recall source of truth | Coupling |
|---|---|---|---|---|
| **`augment`** (default) | stays native | stays native | GSD native; palace is an *additional* recall layer fed from artifacts | lowest — palace is write-mostly, read-optional |
| **`kg_backend`** | routed to `mempalace_kg_*` | stays native | KG queries hit MemPalace's temporal graph | medium — graphify reads/writes the palace KG |
| **`replace`** | backed by palace | backed by palace | palace is the durable store; GSD reads memory through it | highest — MemPalace is a hard dependency |

Mode is read at hook-render time and changes *which* MemPalace surfaces the rendered instructions invoke. Switching modes is a config change, not a reinstall.

### 5.2 Recall (read path)

- **FR-R1** At `discuss:pre`, inject a recall fragment instructing the orchestrator to run `mempalace wake-up --wing <wing>` (L0+L1, ~600–900 tokens) plus `mempalace_search(query=<phase topic>, wing=<wing>)` and surface the top drawers + any relevant `mempalace_kg_query` facts into discussion.
- **FR-R2** At `plan:pre`, a recall step (skill `mempalace-recall`) produces `MEMORY-RECALL.md` consuming `CONTEXT.md`: prior decisions, patterns, and *surprises* relevant to this plan, retrieved by semantic search + KG timeline, deduped.
- **FR-R3** Recall is read-only and side-effect-free; if MemPalace is unreachable, `MEMORY-RECALL.md` is written with an "unavailable" stub and the loop continues.

### 5.3 Capture (write path)

- **FR-C1** At `discuss:post`, file `CONTEXT.md` as a drawer in `room: decisions` (dedup via `mempalace_check_duplicate`), and extract decision facts into the KG (`mempalace_kg_add` with `valid_from` = phase date).
- **FR-C2** At `plan:post`, file `PLAN.md` as a drawer in `room: planning`.
- **FR-C3** At `verify:post`, file `SUMMARY.md`/`UAT.md` excerpts in `room: milestones`, and file confirmed *problems→fixes* in `room: problems`.
- **FR-C4** `gsd-extract-learnings` output (decisions, lessons, patterns, surprises) is mirrored into the KG and corresponding rooms, with provenance (`source_file`, `source_drawer_id`).
- **FR-C5** All captures are idempotent: re-running a phase re-files the same content without duplication (MemPalace deterministic drawer IDs + `check_duplicate`).

### 5.4 Cross-project & journaling

- **FR-X1** At `ship:post`, when `mempalace.cross_project_tunnels = true`, propose tunnels between this wing's rooms and related wings (`mempalace_find_tunnels`), creating those the user/agent confirms.
- **FR-X2** At `ship:post`, when `mempalace.diary_journal = true`, write a session-summary diary entry (`mempalace_diary_write(agent_name, entry, topic="phase-ship", wing)`).
- **FR-X3** At `ship:post`, optionally run `mempalace sync --wing <wing> --apply` to prune drawers whose source artifacts were archived/deleted (guarded: never global prune).

### 5.5 Passive auto-capture (optional, separate layer)

- **FR-P1** When `mempalace.auto_capture_hooks = true`, the capability's lifecycle hooks install MemPalace's native Claude Code hooks (`session-start`, `stop` @ every 15 human messages, `precompact`) so tool output and mid-session context are captured even between loop points. Default **off** (the deliberate loop hooks are the primary integration; this is belt-and-suspenders).

### 5.6 Transport selection (robustness)

- **FR-T1** Interactive runs prefer the **MCP tools** (rich, structured). Autonomous/headless/cron runs prefer the **CLI** (`mempalace mine|search|wake-up|sync`) because MCP servers may be absent in headless harness contexts. Rendered hook instructions name both and pick by run context.

## 6. Success metrics

| Metric | Target |
|---|---|
| Recall token cost at discuss/plan | ≤ ~1k tokens (wake-up + one search) |
| Phases with artifacts captured | ≥ 95% when enabled |
| Recall relevance (manual spot-check) | top-5 drawers judged relevant ≥ 80% of phases |
| Loop overhead when MemPalace absent | 0 (skip-on-error, no failures) |
| Cross-session decision reuse | qualitative: maintainer reports "surfaced something I'd forgotten" |
| Duplicate drawers from re-runs | ~0 (idempotent capture) |

---

# Part II — ADR

## 8. Context

ADR-857 establishes the **host/core vs Capability plug-in** split: the five-step loop is the host; everything else is a Capability that contributes *data* (not control flow) at **12 stable Loop Extension Points** via three hook kinds — `step`, `contribution`, `gate`. Capabilities are declared in `capabilities/<id>/capability.json`, compiled by `scripts/gen-capability-registry.cjs` into `gsd-core/bin/lib/capability-registry.cjs`, and resolved at runtime by `loop render-hooks <point>`. Config keys are **federated** (new keys flow without editing the central `loadConfig` whitelist).

MemPalace is a natural Capability: it adds memory recall/capture behavior at loop points, owns its own skills/agents/config slice, and degrades gracefully. It calls **no gsd-core internals** — only MemPalace's MCP tools and CLI — so it fits ADR-857's "declarative + first-party, third-party code deferred" decision (the *integration glue* is first-party; MemPalace runs out-of-process).

## 9. Decision drivers

- Must be **opt-in** and **default-resilient** (G6) — memory is never load-bearing for the loop.
- Must map cleanly onto MemPalace's existing taxonomy (wings/rooms/drawers/KG) — no new MemPalace adapter.
- Must honor ADR-857's **data-not-control-flow** rule: hooks render *instructions*; the agent calls MemPalace.
- Must let the user pick coupling depth (`augment`/`kg_backend`/`replace`) without reinstall.
- Must work **headless** (CLI path), not just interactively (MCP path).

## 10. Resolved design forks

1. **Capability role — `feature`.** Owns skills + agents + hooks + config slice.
2. **Tier — `full`.** External dependency ⇒ opt-in only; never in `core`/`standard` profiles. Master toggle `mempalace.enabled` defaults **off**.
3. **Integration transport — MCP-primary, CLI-fallback.** Rendered hook markdown instructs the agent to call `mempalace_*` tools (interactive) or `mempalace` CLI (headless).
4. **Capture content — verbatim drawers, not AAAK.** Exact artifact text stored.
5. **Memory-relationship — three selectable modes.** `mempalace.memory_mode ∈ {augment, kg_backend, replace}`, default `augment`.
6. **Failure policy — skip everywhere; no gate.** Every hook is `onError: skip`; zero `blocking: true`.
7. **Passive auto-capture is separate and off by default.**
8. **Wing/room taxonomy is fixed by GSD semantics.** wing = project; rooms = `decisions | planning | milestones | problems | learnings`.
