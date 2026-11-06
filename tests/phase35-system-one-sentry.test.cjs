'use strict';

/**
 * Phase 35 Wave 5 Regression Suite: JEV & LAYA Sovereign Cognitive Sentry Gates
 *
 * Verifies:
 * 1. Noul(isSafeToMutate) blocks invariant violations before disk mutation with AMNESIA_GATE_VIOLATION.
 * 2. Score(groundingFidelity) intercepts hallucinated method invocations with GROUNDING_MISMATCH.
 * 3. Choice(actionRouting) audits RFC 2119 mandatory MUST/SHALL requirements with REQUIREMENT_EVIDENCE_MISSING.
 * 4. Active learning records correlated fail-then-pass self-healing lessons into continuous memory.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { cleanup } = require('./helpers.cjs');

const sysOne = require('../gsd-core/bin/lib/system-one-engine.cjs');
const continuousMem = require('../gsd-core/bin/lib/continuous-memory.cjs');
const {
  evaluateNoulSafety,
  evaluateGroundingScore,
  evaluateChoiceStrategy,
  recordSelfHealingLesson,
} = sysOne;

describe('Phase 35 Wave 5 — JEV & LAYA Sovereign Cognitive Sentry Gates', () => {
  it('Noul safety gate intercepts Python violations and Windows junction hazards', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-noul-'));
    try {
      const planDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planDir, { recursive: true });

      // Violation 1: External Python ChromaDB runtime introduction
      const pyViolation = evaluateNoulSafety({
        taskText: 'Install chromadb using pip install chromadb and import chromadb to store embeddings in Python script.',
        rootDir: tmpDir,
        planningDir: planDir,
      });
      assert.equal(pyViolation.passed, false);
      assert.equal(pyViolation.noul, 0.0);
      assert.equal(pyViolation.gate, 'AMNESIA_GATE_VIOLATION');
      assert.ok(pyViolation.reason && pyViolation.reason.includes('Decision D-01'));

      // Violation 2: Raw fs.rmSync on Windows directory junction without unlinking
      const junctionViolation = evaluateNoulSafety({
        taskText: 'Clean up worktree node_modules junction using fs.rmSync(targetPath, { recursive: true }) directly.',
        rootDir: tmpDir,
        planningDir: planDir,
      });
      assert.equal(junctionViolation.passed, false);
      assert.equal(junctionViolation.noul, 0.0);
      assert.equal(junctionViolation.gate, 'AMNESIA_GATE_VIOLATION');
      assert.ok(junctionViolation.reason && junctionViolation.reason.includes('Windows Junction Safety'));

      // Clean execution
      const cleanPlan = evaluateNoulSafety({
        taskText: 'Build AST analyzer in native TypeScript with strict unit test coverage.',
        rootDir: tmpDir,
        planningDir: planDir,
      });
      assert.equal(cleanPlan.passed, true);
      assert.equal(cleanPlan.noul, 1.0);
      assert.equal(cleanPlan.gate, 'PASSED');
    } finally {
      cleanup(tmpDir);
    }
  });

  it('Score grounding reflex detects hallucinated method calls against AST symbols', () => {
    const mockGraph = {
      files: {
        'src/user-service.ts': {
          exports: [{ name: 'UserService' }],
          symbols: [{ name: 'findById' }, { name: 'createUser' }],
        },
      },
      symbolIndex: {
        UserService: ['src/user-service.ts'],
        findById: ['src/user-service.ts'],
        createUser: ['src/user-service.ts'],
      },
    };

    // Code with hallucinated methods not in AST
    const hallucinatedDiff = `
      const u = new UserService();
      u.nonExistentMethodA();
      u.phantomOperationB();
    `;

    const scoreRes = evaluateGroundingScore({
      taskText: 'Call UserService operations',
      codeDiff: hallucinatedDiff,
      graph: mockGraph,
    });

    assert.equal(scoreRes.passed, false);
    assert.equal(scoreRes.gate, 'GROUNDING_MISMATCH');
    assert.ok(scoreRes.score < 2);
    assert.ok(scoreRes.missingSymbols && scoreRes.missingSymbols.includes('nonExistentMethodA'));

    // Grounded code calling valid AST methods
    const groundedDiff = `
      const u = new UserService();
      u.findById('123');
      u.createUser({ name: 'Alice' });
    `;

    const groundedRes = evaluateGroundingScore({
      taskText: 'Call valid UserService operations',
      codeDiff: groundedDiff,
      graph: mockGraph,
    });

    assert.equal(groundedRes.passed, true);
    assert.equal(groundedRes.gate, 'PASSED');
    assert.equal(groundedRes.score, 3);
  });

  it('Choice auditor checks RFC 2119 MUST/SHALL requirements against evidence', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-rfc-'));
    try {
      const planDir = path.join(tmpDir, '.planning');
      const phasesDir = path.join(planDir, 'phases', '35-test-phase');
      fs.mkdirSync(phasesDir, { recursive: true });

      const specContent = `
# Phase 35 Spec
- All error cases MUST return structured JSON-RPC responses.
- Memory compaction SHALL preserve all architectural decisions.
`;
      fs.writeFileSync(path.join(phasesDir, '35-SPEC.md'), specContent, 'utf8');

      // Attempt close without evidence
      const noEvidence = evaluateChoiceStrategy({
        phaseId: '35',
        rootDir: tmpDir,
        planningDir: planDir,
        evidence: [],
      });

      assert.equal(noEvidence.passed, false);
      assert.equal(noEvidence.gate, 'REQUIREMENT_EVIDENCE_MISSING');
      assert.equal(noEvidence.choice, 'BLOCK_PHASE_CLOSE');

      // Attempt close with human waiver
      const withWaiver = evaluateChoiceStrategy({
        phaseId: '35',
        rootDir: tmpDir,
        planningDir: planDir,
        waiver: 'Approved by lead architect',
      });

      assert.equal(withWaiver.passed, true);
      assert.equal(withWaiver.choice, 'PROCEED');

      // Route self-healing repair strategies
      const syntaxRepair = evaluateChoiceStrategy({
        phaseId: '35',
        rootDir: tmpDir,
        planningDir: planDir,
        failureCategory: 'syntax',
      });
      assert.equal(syntaxRepair.choice, 'revert_and_reparse');

      const concurrencyRepair = evaluateChoiceStrategy({
        phaseId: '35',
        rootDir: tmpDir,
        planningDir: planDir,
        failureCategory: 'concurrency',
      });
      assert.equal(concurrencyRepair.choice, 'retry_with_backoff_and_lock');
    } finally {
      cleanup(tmpDir);
    }
  });

  it('Active Learning records self-healing lessons into continuous memory decisions.jsonl', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-active-learning-'));
    try {
      const ok = recordSelfHealingLesson({
        rootDir: tmpDir,
        testFailureOutput: 'TypeError: Cannot read property status of undefined in worktree-isolation.cts',
        successfulFixSummary: 'Fixed SpawnResultOutput property access to use exitCode instead of status',
        files: ['src/worktree-isolation.cts'],
        command: 'npm test',
      });

      assert.equal(ok, true);

      // Verify that continuous memory recalled the lesson
      const recalled = continuousMem.queryMemory(tmpDir, 'worktree exitCode status', {
        files: ['src/worktree-isolation.cts'],
      });

      assert.ok(recalled.length > 0);
      assert.equal(recalled[0].category, 'self_healing_fix');
      assert.ok(recalled[0].summary.includes('exitCode'));
    } finally {
      cleanup(tmpDir);
    }
  });
});

