'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const childProcess = require('node:child_process');

const { cleanup } = require('./helpers.cjs');
const telemetry = require('../gsd-core/bin/lib/jit-telemetry.cjs');
const dashboard = require('../gsd-core/bin/lib/token-dashboard-renderer.cjs');

describe('Multi-Command Telemetry & Visual Formatting (Phase 23, Tasks 23.11-23.16)', () => {
  test('supports "auto" as a canonical command with workflowContext tracking', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-tele-auto-'));
    try {
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });

      const rec = telemetry.recordJitInvocation(
        planningDir,
        ['src/app.ts'],
        1200,
        12000,
        'auto',
        '23',
        'inv-auto-1',
        'targeted',
        'autopilot-phase-loop'
      );

      assert.strictEqual(rec.command, 'auto');
      assert.strictEqual(rec.phaseId, '23');
      assert.strictEqual(rec.workflowContext, 'autopilot-phase-loop');
      assert.strictEqual(rec.tokensSaved, 10800);
      assert.strictEqual(rec.efficiencyPct, 90);

      const summary = telemetry.getTelemetrySummary(planningDir);
      assert.ok(summary.commandBreakdown.auto);
      assert.strictEqual(summary.commandBreakdown.auto.invocations, 1);
      assert.strictEqual(summary.commandBreakdown.auto.tokensUsed, 1200);
      assert.strictEqual(summary.commandBreakdown.auto.tokensSaved, 10800);
    } finally {
      cleanup(tmpDir);
    }
  });

  test('renders 65-column dashboard respecting emoji visual widths and canonical order', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-dash-multi-'));
    try {
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });

      telemetry.recordJitInvocation(planningDir, ['src/plan.ts'], 300, 3000, 'plan', '23');
      telemetry.recordJitInvocation(planningDir, ['src/exec.ts'], 500, 5000, 'exec', '23');
      telemetry.recordJitInvocation(planningDir, ['src/review.ts'], 400, 4000, 'review', '23');
      telemetry.recordJitInvocation(planningDir, ['src/verify.ts'], 200, 2000, 'verify', '23');
      telemetry.recordJitInvocation(planningDir, ['src/auto.ts'], 600, 6000, 'auto', '23');

      const rendered = dashboard.renderTokenDashboard(planningDir);
      const lines = rendered.split('\n');

      // Every line must stay within 65 characters total string length
      for (const line of lines) {
        assert.ok(
          line.length <= 65,
          `Line exceeds 65 characters (length ${line.length}): "${line}"`
        );
      }

      // Check canonical ordering: plan -> exec -> review -> verify -> auto
      const planIdx = rendered.indexOf('• plan');
      const execIdx = rendered.indexOf('• exec');
      const revIdx = rendered.indexOf('• review');
      const verIdx = rendered.indexOf('• verify');
      const autoIdx = rendered.indexOf('• auto');

      assert.ok(planIdx !== -1 && execIdx !== -1 && revIdx !== -1 && verIdx !== -1 && autoIdx !== -1);
      assert.ok(planIdx < execIdx, 'plan must appear before exec');
      assert.ok(execIdx < revIdx, 'exec must appear before review');
      assert.ok(revIdx < verIdx, 'review must appear before verify');
      assert.ok(verIdx < autoIdx, 'verify must appear before auto');
    } finally {
      cleanup(tmpDir);
    }
  });

  test('routeTelemetry full-repo auto-estimation sets non-zero jitTokens equal to fullRepoTokens', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-cli-tele-'));
    try {
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });

      // Create a dummy codebase with a file to measure
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, 'module.js'), 'console.log("Hello from module");\n'.repeat(50));

      const toolsPath = path.resolve(__dirname, '..', 'gsd-core', 'bin', 'gsd-tools.cjs');

      const proc = childProcess.spawnSync(
        process.execPath,
        [toolsPath, 'telemetry', 'record', '--command', 'review', '--scope-mode', 'full-repo', '--raw'],
        {
          cwd: tmpDir,
          encoding: 'utf-8',
          timeout: 10000,
        }
      );

      assert.strictEqual(proc.status, 0, `CLI failed: ${proc.stderr}`);
      const rec = JSON.parse(proc.stdout.trim());

      assert.strictEqual(rec.command, 'review');
      assert.strictEqual(rec.scopeMode, 'full-repo');
      assert.ok(rec.fullRepoTokens > 0, 'fullRepoTokens must be > 0 in full-repo mode');
      assert.strictEqual(rec.jitTokens, rec.fullRepoTokens, 'jitTokens must equal fullRepoTokens in full-repo mode');
      assert.strictEqual(rec.tokensSaved, 0, 'tokensSaved must be 0 in full-repo mode');
      assert.strictEqual(rec.efficiencyPct, 0, 'efficiencyPct must be 0 in full-repo mode');
    } finally {
      cleanup(tmpDir);
    }
  });
});
