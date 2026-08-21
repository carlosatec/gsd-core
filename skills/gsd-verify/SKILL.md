---
name: gsd-verify
description: "Validate built features through conversational UAT and automated test suite coverage verification"
argument-hint: "[phase-number] [--auto]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Grep
  - Glob
  - AskUserQuestion
---

<objective>
Validate built features against phase acceptance criteria, run end-to-end test suites, and generate a VERIFICATION.md report. Grants Auto-Pass when 100% test coverage and validation criteria are satisfied.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/verify-work.md
</execution_context>

<process>
1. Read verification criteria from PLAN.md and SUMMARY.md.
2. Run test suites and verify functional behavior.
3. Produce VERIFICATION.md with status (passed, gaps_found, human_needed).
4. Update STATE.md and roadmap progress.
</process>
