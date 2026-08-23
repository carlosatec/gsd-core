# How to verify and ship a phase

**Goal:** Walk executed work through user acceptance testing or automated Auto-Pass, diagnose and fix any failures, then open a pull request with an auto-generated body.

**Prerequisites:** The phase has been executed and has `SUMMARY.md` files. If execution is not yet done, see [Execute a phase](execute-a-phase.md).

---

## Run user acceptance testing & verification

```bash
/gsd-verify 1
```

GSD reads the phase's `SUMMARY.md` and `PLAN.md` files, verifies automated test suite coverage (triggering Auto-Pass when 100% test coverage and validation criteria are satisfied), and walks you through conversational UAT checkpoints if interactive confirmation is needed.

- `yes` / `y` / empty → pass, move to next test
- Anything else → recorded as an issue, severity inferred from your description

Progress is written to `.planning/phases/01-<name>/01-VERIFICATION.md` (or `UAT.md`) and survives a `/clear`. If a session is interrupted, re-run `/gsd-verify 1` and GSD resumes from the last checkpoint.

---

## When failures are found: auto-diagnose and fix planning

If any tests report issues, GSD proceeds automatically:

1. **Diagnoses root causes** — spawns parallel debug agents to investigate test failures or UAT issues.
2. **Plans gap closure** — uses surgical context injection to prepare repair plans.
3. **Presents next step** — execute fixes with `/gsd-exec 1 --gaps-only` or `/gsd-review --fix`.

---

## When all tests pass: ship the phase

Once verification passes (or Auto-Pass triggers), the phase is marked complete in `ROADMAP.md` and `STATE.md` automatically.

```bash
/gsd-ship 1
```

GSD runs preflight checks (verification status, clean working tree, branch, remote, `gh` CLI authentication), pushes the branch, and creates a PR:

```bash
/gsd-ship 1          # Ready-for-review PR
/gsd-ship 1 --draft  # Draft PR — useful when more phases will follow
```

The PR body is assembled from planning artefacts automatically:

- Phase goal from `ROADMAP.md`
- Per-plan summaries from `SUMMARY.md` files and their key files
- Requirements addressed (REQ-IDs)
- Verification status from `VERIFICATION.md`
- Key decisions from `STATE.md`

No manual body writing required.

---

## Optional: code review before or after shipping

`/gsd-ship` does not run a code review automatically, but you can slot one in at any point:

**Before verification** (catches issues before UAT):

```bash
/gsd-code-review 1          # Standard review
/gsd-code-review 1 --fix    # Review then auto-fix Critical + Warning findings
```

**After the PR is open** (to gate on quality before merge):

```bash
/gsd-code-review 1 --depth=deep  # Cross-file analysis including import graphs
```

See [Set up cross-AI review](set-up-cross-ai-review.md) to configure Gemini, Codex, or other reviewers for plan review earlier in the cycle.

---

## Optional: create a clean PR branch

If your branch contains `.planning/` commits that you do not want reviewers to see:

```bash
/gsd-pr-branch          # Filter against main
/gsd-pr-branch develop  # Filter against develop
```

`/gsd-pr-branch` creates a new branch with only code changes — planning artefact commits are excluded. Run this before `/gsd-ship` if your team's review policy excludes planning noise.

---

## Closing a milestone

If this was the last phase in the milestone, run the milestone audit and archive it:

```bash
/gsd-audit-milestone      # Verify all requirements shipped
/gsd-complete-milestone   # Archive, create git tag
```

`/gsd-complete-milestone` is the natural next step after the PR merges. See the [The phase loop](../explanation/the-phase-loop.md) for how verification and shipping fit into the full project lifecycle.

---

## Related

- [Execute a phase](execute-a-phase.md)
- [Set up cross-AI review](set-up-cross-ai-review.md)
- [The phase loop](../explanation/the-phase-loop.md)
- [Commands](../COMMANDS.md)
