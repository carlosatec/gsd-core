# How to plan a phase

**Goal:** Turn phase decisions and research into an atomic, verifiable task plan ready for execution.

**Prerequisites:** `.planning/ROADMAP.md` exists. A `{phase}-CONTEXT.md` (or `--spec` / discussion) is strongly recommended but not required.

---

## Run the standard planning flow

```bash
/gsd-plan 2
```

This runs the unified planning pipeline:

1. **Research & Context** — Surgical JIT context injection and domain research.
2. **Plan & Spec** — Decompose into atomic tasks with explicit acceptance criteria (`{phase}-{N}-PLAN.md`).
3. **Verify** — Plan-checker validates plan quality and ensures atomic task waves fit clean subagent context windows.

If no phase number is given, `/gsd-plan` automatically reads `ROADMAP.md` and targets the next unplanned phase.

---

## Plan customization & options

**If the domain is familiar and you want to skip external research:**

```bash
/gsd-plan 3 --skip-research
```

**If you want to force refresh research:**

```bash
/gsd-plan 3 --research
```

**If you want to run research only** — write RESEARCH.md and exit before planning:

```bash
/gsd-plan-phase --research-phase 4
```

If RESEARCH.md already exists, you are prompted to update, view, or skip. To force-refresh without the prompt:

```bash
/gsd-plan-phase --research-phase 4 --research
```

To print existing RESEARCH.md to stdout without spawning the researcher:

```bash
/gsd-plan-phase --research-phase 4 --view
```

Note: `--research-phase <N>` is a flag on `/gsd-plan-phase`. There is no standalone research-phase command — the removed standalone research command was retired in favour of this flag.

---

## Override the planning granularity for one phase

**If you want fewer, larger tasks** for a simple or well-understood phase:

```bash
/gsd-plan-phase 2 --granularity coarse
```

**If you want more, smaller tasks** for tighter control over a risky or complex phase:

```bash
/gsd-plan-phase 2 --granularity fine
```

`--granularity` accepts `coarse`, `standard`, or `fine`. It overrides all granularity config keys (`granularities.planning`, `granularity`, `planning.granularity`) for this invocation only — no config edit required. Invalid values are rejected immediately with an error.

If you want this granularity applied permanently, set it in config — see [CONFIGURATION.md](../CONFIGURATION.md). For the full flag reference see [COMMANDS.md](../COMMANDS.md).

---

## Tracer-first slices (the default) and opting out

**By default, every plan leads with a `tracer` task** — the thinnest end-to-end slice (UI → API → DB) that touches every layer the phase modifies, wired and verified before any expansion task. A tracer is production-quality, not a throwaway prototype (see the `tracer bullet` glossary entry in `CONTEXT.md`). This proves the architecture early instead of discovering an integration dead-end after ten committed layers.

To opt out and plan horizontal layers (the legacy default):

```bash
/gsd-plan-phase 1 --no-tracer
```

`--mvp` layers MVP enrichment on top of tracer-first — it frames the phase goal as a user story and, on Phase 1 of a new project with no prior phase summaries, also produces `SKELETON.md` (a Walking Skeleton covering project scaffold, routing, one real DB read/write, one real UI interaction, and dev deployment):

```bash
/gsd-plan-phase 1 --mvp
```

You can persist MVP enrichment for a phase without the flag by adding `**Mode:** mvp` to that phase's entry in ROADMAP.md.

---

## Require a failing test per behaviour-adding task

**If you want TDD enforcement** — each behaviour-adding task begins with a failing test before implementation:

```bash
/gsd-plan-phase 1 --tdd
```

Composable with `--mvp`:

```bash
/gsd-plan-phase 1 --mvp --tdd
```

This produces vertical slices where every behaviour-adding task follows RED → GREEN → REFACTOR. The planner applies `type: tdd` to eligible tasks (business logic, API endpoints, data transformations) and uses standard `type: execute` for UI, configuration, and glue code.

TDD mode can also be persisted in config:

```bash
node gsd-tools.cjs config-set workflow.tdd_mode true
```

---

## Replan using cross-AI review feedback

**If you have run `/gsd-review --phase N` and a `REVIEWS.md` exists:**

```bash
/gsd-plan-phase 3 --reviews
```

The planner reads `REVIEWS.md` and revises plans to address the feedback. Cannot be combined with `--gaps`.

**If you want an automated loop** — replan and re-review until no HIGH concerns remain:

```bash
/gsd-plan-review-convergence 3
```

The convergence loop runs plan → review → replan → re-review cycles (up to three by default). Use `--max-cycles N` to override the cap.

---

## Close gaps after a failed verification

**If `VERIFICATION.md` exists with unresolved gaps and you want to replan against those gaps only:**

```bash
/gsd-plan-phase 3 --gaps
```

Research is skipped; the planner reads the verification gaps directly.

---

## Run an external bounce validation after planning

**If `workflow.plan_bounce_script` is configured and you want external validation of the finished plan:**

```bash
/gsd-plan-phase 1 --bounce
```

To skip bounce even if it is enabled in config:

```bash
/gsd-plan-phase 1 --skip-bounce
```

---

## Suppress interactive confirmations

```bash
/gsd-plan-phase --auto
```

Skips all prompts. Useful in automated pipelines. Research is skipped if `research_enabled` is false in config.

---

## What the plan produces

A successful run writes:

| File | Purpose |
|---|---|
| `{phase}-RESEARCH.md` | Domain research, package legitimacy audit, validation architecture |
| `{phase}-VALIDATION.md` | Nyquist test-mapping — the test cases the plan must satisfy (Dimension 8) |
| `{phase}-{N}-PLAN.md` | Executable task plan with frontmatter, wave assignments, and acceptance criteria |
| `{phase}/SKELETON.md` | Walking Skeleton (MVP mode, Phase 1 of new project only) |

Each PLAN.md contains tasks with mandatory `<read_first>` and `<acceptance_criteria>` fields. Every `<acceptance_criteria>` entry is verifiable as a source assertion, behaviour assertion, test command, or CLI output — never subjective language.

For the full field reference see [PLAN.md schema](../reference/plan-md.md).

### Plan quality dimensions

The `gsd-plan-checker` validates plans across eight dimensions before allowing execution:

1. Task atomicity — each task is a single concern
2. Dependency correctness — wave ordering is consistent
3. Acceptance criteria verifiability — no subjective criteria
4. `<read_first>` completeness — the file being modified is always listed
5. Concrete `<action>` values — no vague "align with" instructions
6. `must_haves` derived from phase goal
7. Requirement ID coverage — every phase requirement ID appears in at least one plan
8. Nyquist test mapping — plans address the validation strategy in VALIDATION.md

The revision loop runs up to three times. If quality gates have not passed after three iterations, the checker surfaces remaining issues for manual review.

---

## Replanning a closed phase

If a phase has `VERIFICATION.md` with `status: passed`, it is considered closed. Attempting to replan it stops with an error. If the closeout was incorrect, override with `--force`:

```bash
/gsd-plan-phase 2 --force
```

A warning is emitted into the transcript and any committed plan docs.

---

## Related

- [Discuss a phase](discuss-a-phase.md)
- [Execute a phase](execute-a-phase.md)
- [PLAN.md schema](../reference/plan-md.md)
- [Commands](../COMMANDS.md)
