'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { cleanup } = require('./helpers.cjs');
const hub = require('../gsd-core/bin/lib/unified-workflow-hub.cjs');
const telemetryMod = require('../gsd-core/bin/lib/jit-telemetry.cjs');

describe('Wave 4: Unified Workflow Hub Observability & Zero-Touch Telemetry', () => {
  test('dispatches tokens with --sessions, --cost, and --all sub-panels', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-hub-obs-'));
    try {
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });

      // Seed telemetry
      telemetryMod.recordJitInvocation(planningDir, ['src/hub.ts'], 100000, 500000, 'plan', '25');

      // Test --cost
      const resCost = hub.dispatchUnifiedCommand('tokens', {
        cwd: tmpDir,
        args: ['--cost'],
      });
      assert.strictEqual(resCost.command, 'tokens');
      assert.strictEqual(resCost.action, 'DISPLAY_TELEMETRY_DASHBOARD');
      assert.ok(resCost.message.includes('GSD Financial Telemetry'));

      // Test --sessions
      const resSessions = hub.dispatchUnifiedCommand('tokens', {
        cwd: tmpDir,
        args: ['--sessions'],
      });
      assert.ok(resSessions.message.includes('GSD Agent Operational Sessions'));

      // Test --all
      const resAll = hub.dispatchUnifiedCommand('tokens', {
        cwd: tmpDir,
        args: ['--all'],
      });
      assert.ok(resAll.message.includes('Financial Impact:'));
      assert.ok(resAll.message.includes('Operational Sessions:'));
    } finally {
      cleanup(tmpDir);
    }
  });

  test('dispatches tokens with --web to export HTML dashboard', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-hub-obs-'));
    try {
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });

      telemetryMod.recordJitInvocation(planningDir, ['src/web.ts'], 50000, 200000, 'review', '25');

      const resWeb = hub.dispatchUnifiedCommand('tokens', {
        cwd: tmpDir,
        args: ['--web'],
      });

      assert.strictEqual(resWeb.command, 'tokens');
      assert.strictEqual(resWeb.action, 'EXPORT_OBSERVABILITY_DASHBOARD');
      assert.ok(resWeb.message.includes('dashboard.html'));
      assert.ok(fs.existsSync(path.join(planningDir, 'intel', 'dashboard.html')));
    } finally {
      cleanup(tmpDir);
    }
  });

  test('automatically records zero-touch telemetry on exec and verify lifecycle completion', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-hub-obs-'));
    try {
      const planningDir = path.join(tmpDir, '.planning');
      const phasesDir = path.join(planningDir, 'phases', '25-phase');
      fs.mkdirSync(phasesDir, { recursive: true });

      // Create a plan file with target files
      fs.writeFileSync(
        path.join(phasesDir, '25-01-PLAN.md'),
        '# Plan\nTarget file: `src/feature.ts`\n',
        'utf8'
      );
      fs.writeFileSync(
        path.join(phasesDir, '25-SUMMARY.md'),
        '# Summary\nCompleted 100% tests.\n',
        'utf8'
      );
      fs.writeFileSync(
        path.join(planningDir, 'STATE.md'),
        '# State\nCurrent Phase: 25\nStatus: Ready to execute\n',
        'utf8'
      );

      // Dispatch exec
      hub.dispatchUnifiedCommand('exec', {
        cwd: tmpDir,
        args: ['25', '--force'],
      });

      // Verify exec telemetry recorded
      let summary = telemetryMod.getTelemetrySummary(planningDir);
      assert.ok(summary.commandBreakdown['exec']);
      assert.strictEqual(summary.commandBreakdown['exec'].invocations, 1);

      // Dispatch verify
      hub.dispatchUnifiedCommand('verify', {
        cwd: tmpDir,
        args: ['25'],
      });

      // Verify verify telemetry recorded
      summary = telemetryMod.getTelemetrySummary(planningDir);
      assert.ok(summary.commandBreakdown['verify']);
      assert.strictEqual(summary.commandBreakdown['verify'].invocations, 1);
    } finally {
      cleanup(tmpDir);
    }
  });
});
