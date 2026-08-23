---
name: gsd-review
description: "Deep code, architecture, UI/UX, and phase plan review with autonomous repairs (--fix)"
argument-hint: "[phase-number] [--fix] [--ui] [--backlog]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
---


<objective>
Run comprehensive static and heuristic code review over modified files, checking complexity, UI/UX consistency, AST contract integrity, and anti-patterns, with optional autonomous repairs (--fix).
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/code-review.md
@~/.claude/gsd-core/workflows/code-review-fix.md
@~/.claude/gsd-core/workflows/ui-review.md
@~/.claude/gsd-core/workflows/eval-review.md
@~/.claude/gsd-core/workflows/audit-fix.md
@~/.claude/gsd-core/workflows/review.md
</execution_context>

<context>
Phase number: extracted from $ARGUMENTS (required)

**Flags:**
- `--gemini` — Include Gemini CLI review
- `--claude` — Include Claude CLI review (uses separate session)
- `--codex` — Include Codex CLI review
- `--opencode` — Include OpenCode review (uses model from user's OpenCode config)
- `--qwen` — Include Qwen Code review (Alibaba Qwen models)
- `--cursor` — Include Cursor agent review
- `--agy` / `--antigravity` — Include Antigravity CLI review
- `--all` — Include all available CLIs

**No flags** — if `review.default_reviewers` is set, review with only those configured
reviewers that are detected; otherwise review with all available CLIs. Configured
`review.reviewer_instances` names may appear in `review.default_reviewers`; each runs as an
independent reviewer identity backed by its configured adapter+model (see
`docs/CONFIGURATION.md`). Instance names are not valid as flags.
</context>

<process>
Execute end-to-end.
</process>
