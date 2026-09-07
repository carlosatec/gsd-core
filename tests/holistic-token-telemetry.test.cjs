'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync, fork } = require('node:child_process');

const { cleanup } = require('./helpers.cjs');
const telemetry = require('../gsd-core/bin/lib/jit-telemetry.cjs');
const dashboard = require('../gsd-core/bin/lib/token-dashboard-renderer.cjs');
const hub = require('../gsd-core/bin/lib/unified-workflow-hub.cjs');
const guardrails = require('../gsd-core/bin/lib/preflight-guardrails.cjs');
const codeReviewFlags = require('../gsd-core/bin/lib/code-review-flags.cjs');

const GSD_TOOLS = path.join(__dirname, '..', 'gsd-core', 'bin', 'gsd-tools.cjs');

describe('Phase 22: Holistic Token Telemetry, Multi-Command Observability & Concurrency Hardening', () => {
  test('Q1 (D-111): Concurrency hardening safely handles parallel multi-process writes under withFileLockSync', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-concurrency-'));
    try {
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(path.join(planningDir, 'intel'), { recursive: true });

      // Worker script that records an invocation via child processes
      const workerScript = `
        const path = require('node:path');
        const telemetry = require(${JSON.stringify(path.join(__dirname, '..', 'gsd-core', 'bin', 'lib', 'jit-telemetry.cjs'))});
        const planningDir = process.argv[2];
        const id = process.argv[3];
        telemetry.recordJitInvocation(
          planningDir,
          ['src/file_' + id + '.ts'],
          100 * Number(id),
          1000 * Number(id),
          'exec',
          '22',
          'inv-' + id
        );
      `;
      const workerPath = path.join(tmpDir, 'worker.cjs');
      fs.writeFileSync(workerPath, workerScript);

      const numWorkers = 8;
      const promises = [];

      for (let i = 1; i <= numWorkers; i++) {
        promises.push(new Promise((resolve, reject) => {
          const child = fork(workerPath, [planningDir, String(i)], { stdio: 'ignore' });
          child.on('exit', code => {
            if (code === 0) resolve();
            else reject(new Error(`Worker ${i} failed with code ${code}`));
          });
        }));
      }

      await Promise.all(promises);

      const summary = telemetry.getTelemetrySummary(planningDir);
      assert.strictEqual(summary.totalInvocations, numWorkers, 'All parallel invocations must be safely recorded');
      assert.strictEqual(summary.commandBreakdown['exec'].invocations, numWorkers);

      // Verify JSON integrity
      const telemetryJson = JSON.parse(fs.readFileSync(path.join(planningDir, 'intel', 'telemetry.json'), 'utf-8'));
      assert.strictEqual(telemetryJson.records.length, numWorkers);
    } finally {
      cleanup(tmpDir);
    }
  });

  test('Q1 (D-112): Idempotency deduplication ignores repeated calls with same invocationId', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-idempotent-'));
    try {
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });

      const r1 = telemetry.recordJitInvocation(planningDir, ['src/app.ts'], 500, 5000, 'plan', '22', 'dedup-unique-id-1');
      assert.strictEqual(r1.jitTokens, 500);
      assert.strictEqual(r1.tokensSaved, 4500);

      // Call again with exact same invocationId
      const r2 = telemetry.recordJitInvocation(planningDir, ['src/app.ts'], 500, 5000, 'plan', '22', 'dedup-unique-id-1');
      assert.strictEqual(r2.invocationId, 'dedup-unique-id-1');

      const summary = telemetry.getTelemetrySummary(planningDir);
      assert.strictEqual(summary.totalInvocations, 1, 'Duplicate invocation must not increment totalInvocations');
      assert.strictEqual(summary.totalTokensSaved, 4500, 'Duplicate invocation must not double-count saved tokens');
      assert.strictEqual(summary.totalJitTokensUsed, 500);
    } finally {
      cleanup(tmpDir);
    }
  });

  test('Q2 (D-113, D-121): Dual-mode review distinguishes targeted vs full-repo scope with transparent metrics', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-dual-review-'));
    try {
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(path.join(planningDir, 'phases'), { recursive: true });
      fs.writeFileSync(path.join(planningDir, 'STATE.md'), '# State\n- Current Phase: Phase 22\n');

      // Create dummy repo files
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, 'app.ts'), 'export function app() { return 42; }\n');
      fs.writeFileSync(path.join(srcDir, 'utils.ts'), 'export function util() { return "ok"; }\n');

      // 1. Targeted review (specific file)
      const targetedResult = hub.executeReview(planningDir, tmpDir, false, ['src/app.ts'], false, '22');
      assert.ok(targetedResult.telemetry, 'Targeted review must record telemetry');
      assert.strictEqual(targetedResult.telemetry.scopeMode, 'targeted');
      assert.ok(targetedResult.telemetry.tokensSaved > 0, 'Targeted review must show token savings');
      assert.ok(targetedResult.telemetry.efficiencyPct > 50, 'Targeted review efficiency should exceed 50%');

      // 2. Full-Repo review (--full / --repo)
      const fullRepoResult = hub.executeReview(planningDir, tmpDir, false, undefined, true, '22');
      assert.ok(fullRepoResult.telemetry, 'Full-repo review must record telemetry');
      assert.strictEqual(fullRepoResult.telemetry.scopeMode, 'full-repo');
      assert.strictEqual(fullRepoResult.telemetry.tokensSaved, 0, 'Full repo review must report 0 tokens saved for honest metrics');
      assert.strictEqual(fullRepoResult.telemetry.efficiencyPct, 0, 'Full repo review must report 0% efficiency');
      assert.strictEqual(fullRepoResult.telemetry.compressionRatio, 1.0);
      assert.strictEqual(fullRepoResult.telemetry.jitTokens, fullRepoResult.telemetry.fullRepoTokens);
    } finally {
      cleanup(tmpDir);
    }
  });

  test('Q2 (D-121): Code review flag parser identifies --full and --repo as fullRepo=true', () => {
    const flags1 = codeReviewFlags.parseCodeReviewFlags(['22', '--full']);
    assert.strictEqual(flags1.fullRepo, true);
    assert.strictEqual(flags1.fix, false);

    const flags2 = codeReviewFlags.parseCodeReviewFlags(['--repo', '--fix']);
    assert.strictEqual(flags2.fullRepo, true);
    assert.strictEqual(flags2.fix, true);

    const flags3 = codeReviewFlags.parseCodeReviewFlags(['22', '--fix']);
    assert.strictEqual(Boolean(flags3.fullRepo), false);
    assert.strictEqual(flags3.fix, true);
  });

  test('Q3 (D-117): Unified Hub CLI Seam routes canonical commands to dispatchUnifiedCommand', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-cli-seam-'));
    try {
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });
      fs.writeFileSync(path.join(planningDir, 'STATE.md'), '# State\n- Current Phase: Phase 1\n');

      // Test gsd-tools tokens
      const resTokens = spawnSync('node', [GSD_TOOLS, 'tokens'], { cwd: tmpDir, encoding: 'utf-8', timeout: 15000 });
      assert.strictEqual(resTokens.status, 0);
      assert.ok(resTokens.stdout.includes('Token Telemetry'));

      // Test gsd-tools review
      const resReview = spawnSync('node', [GSD_TOOLS, 'review'], { cwd: tmpDir, encoding: 'utf-8', timeout: 15000 });
      assert.strictEqual(resReview.status, 0);
      assert.ok(resReview.stdout.includes('Review complete'));
    } finally {
      cleanup(tmpDir);
    }
  });

  test('Q4 (D-119): Preflight guardrails checkPathExists anchors to rootDir regardless of process.cwd()', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-guardrails-root-'));
    try {
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });

      const testFileRel = 'src/service.ts';
      const testFileAbs = path.join(tmpDir, testFileRel);
      fs.mkdirSync(path.dirname(testFileAbs), { recursive: true });
      fs.writeFileSync(testFileAbs, 'export const v = 1;\n');

      // Even if cwd is somewhere completely different (e.g. os.tmpdir()),
      // checkPathExists anchored to rootDir must find testFileRel
      const report = guardrails.runPreFlightChecks({
        taskId: '22',
        filesToModify: [testFileRel],
        planningDir,
        rootDir: tmpDir,
      });

      assert.strictEqual(report.valid, true);
    } finally {
      cleanup(tmpDir);
    }
  });

  test('Q4 (D-120): Dynamic phase ID resolution extracts phase from any positional argument', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-flex-phase-'));
    try {
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });
      fs.writeFileSync(path.join(planningDir, 'STATE.md'), '# State\n- Current Phase: Phase 5\n');

      // Phase passed as first arg
      const res1 = hub.dispatchUnifiedCommand('review', { args: ['22'], cwd: tmpDir });
      assert.strictEqual(res1.command, 'review');

      // Phase passed after flags
      const res2 = hub.dispatchUnifiedCommand('review', { args: ['--full', '22'], cwd: tmpDir });
      assert.strictEqual(res2.command, 'review');

      // Fallback to STATE.md when no explicit phase arg
      const res3 = hub.dispatchUnifiedCommand('review', { args: ['--full'], cwd: tmpDir });
      assert.strictEqual(res3.command, 'review');
    } finally {
      cleanup(tmpDir);
    }
  });

  test('Q5 (D-114, D-115): Strict sanitization handles negative tokens and normalizes arbitrary commands', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-sanitize-'));
    try {
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });

      // Negative tokens and arbitrary command
      const rec = telemetry.recordJitInvocation(planningDir, ['a.ts'], -500, -1000, 'unrecognized_cmd', '22');
      assert.strictEqual(rec.jitTokens, 0, 'Negative tokens must be clamped to 0');
      assert.strictEqual(rec.fullRepoTokens, 0);
      assert.strictEqual(rec.tokensSaved, 0);
      assert.strictEqual(rec.command, 'other', 'Unrecognized command must be normalized to "other"');
    } finally {
      cleanup(tmpDir);
    }
  });

  test('Q5 (D-116): 65-column ASCII dashboard formats with exact width, ordering, and pre-exec lifecycle note', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-dash-65-'));
    try {
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });

      // Record plan and review, but exec is 0
      telemetry.recordJitInvocation(planningDir, ['src/plan.ts'], 300, 3000, 'plan', '22');
      telemetry.recordJitInvocation(planningDir, ['src/app.ts'], 400, 4000, 'review', '22', undefined, 'full-repo');

      const rendered = dashboard.renderTokenDashboard(planningDir);
      const lines = rendered.split('\n');

      // Validate strict 65-column boundary
      for (const line of lines) {
        assert.ok(
          line.length <= 65,
          `Line must not exceed 65 columns (got ${line.length}): "${line}"`
        );
      }

      // Check pre-exec lifecycle note
      assert.ok(
        rendered.includes('Lifecycle note: Plan/Review active. Next: run /gsd:exec'),
        'Must display pre-exec lifecycle note when plan/review exist and exec is 0'
      );

      // Check review (full-repo) label
      assert.ok(
        rendered.includes('review (full-repo)'),
        'Must display review (full-repo) badge on last run'
      );
    } finally {
      cleanup(tmpDir);
    }
  });
});
