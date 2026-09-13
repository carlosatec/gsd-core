'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { cleanup } = require('./helpers.cjs');
const dashboard = require('../gsd-core/bin/lib/token-dashboard-renderer.cjs');
const telemetry = require('../gsd-core/bin/lib/jit-telemetry.cjs');

describe('Wave 2: Token Dashboard Renderer Modularization', () => {
  function verifyBoxLines(output) {
    const lines = output.split('\n');
    assert.ok(lines.length >= 3, 'Must have at least 3 lines');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const visualWidth = dashboard.getVisualWidth(line);
      assert.strictEqual(
        visualWidth,
        63,
        `Line ${i} must have visual width 63. Got ${visualWidth}: "${line}"`
      );
    }
  }

  test('default view preserves 100% backward compatibility and exact width', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-dash-test-'));
    try {
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });

      // Empty state
      const emptyOutput = dashboard.renderTokenDashboard(planningDir);
      assert.ok(emptyOutput.includes('⚡ GSD Core Nexus Token Telemetry'));
      assert.ok(emptyOutput.includes('No telemetry records found yet'));
      verifyBoxLines(emptyOutput);

      // Seed records
      telemetry.recordJitInvocation(planningDir, ['src/app.ts'], 1200, 10000, 'plan', '25');
      telemetry.recordJitInvocation(planningDir, ['src/server.ts'], 800, 8000, 'exec', '25');

      const filledOutput = dashboard.renderTokenDashboard(planningDir);
      assert.ok(filledOutput.includes('Total Invocations:     2'));
      assert.ok(filledOutput.includes('Tokens Used (JIT):     2,000'));
      assert.ok(filledOutput.includes('Tokens Saved:          16,000'));
      assert.ok(filledOutput.includes('Distribution by Command'));
      verifyBoxLines(filledOutput);
    } finally {
      cleanup(tmpDir);
    }
  });

  test('--sessions view renders operational health metrics', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-dash-test-'));
    try {
      const planningDir = path.join(tmpDir, '.planning');
      const sessionsDir = path.join(planningDir, 'intel', 'sessions');
      fs.mkdirSync(sessionsDir, { recursive: true });

      fs.writeFileSync(
        path.join(sessionsDir, 'session_20260901_000001.jsonl'),
        JSON.stringify({ type: 'session_start', sessionId: 's1', command: 'plan' }) + '\n' +
        JSON.stringify({ type: 'tool_call', toolName: 'replace_file_content' }) + '\n' +
        JSON.stringify({ type: 'session_end', sessionId: 's1', status: 'completed', totalDurationMs: 1500, totalMutations: 1 }) + '\n',
        'utf8'
      );

      // Call via string flag
      const outStr = dashboard.renderTokenDashboard(planningDir, '--sessions');
      assert.ok(outStr.includes('GSD Agent Operational Sessions'));
      assert.ok(outStr.includes('Total Sessions:     1'));
      assert.ok(outStr.includes('Success Rate:       100.0%'));
      assert.ok(outStr.includes('replace_file_content'));
      verifyBoxLines(outStr);

      // Call via options object
      const outObj = dashboard.renderTokenDashboard(planningDir, { view: 'sessions' });
      assert.ok(outObj.includes('GSD Agent Operational Sessions'));
      verifyBoxLines(outObj);
    } finally {
      cleanup(tmpDir);
    }
  });

  test('--cost view renders financial telemetry and provider comparisons', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-dash-test-'));
    try {
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });

      telemetry.recordJitInvocation(planningDir, ['src/core.ts'], 1000000, 5000000, 'plan', '25');

      const outCost = dashboard.renderTokenDashboard(planningDir, '--cost');
      assert.ok(outCost.includes('GSD Financial Telemetry'));
      assert.ok(outCost.includes('Actual Cost:'));
      assert.ok(outCost.includes('Avoided Cost:'));
      assert.ok(outCost.includes('Net Dollar Savings:'));
      assert.ok(outCost.includes('Claude 3.7 Sonnet'));
      assert.ok(outCost.includes('GPT-4o'));
      assert.ok(outCost.includes('Gemini 2.0 Pro'));
      assert.ok(outCost.includes('DeepSeek V3/R1'));
      verifyBoxLines(outCost);
    } finally {
      cleanup(tmpDir);
    }
  });

  test('--all view stacks all panels with boundary integrity', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-dash-test-'));
    try {
      const planningDir = path.join(tmpDir, '.planning');
      const sessionsDir = path.join(planningDir, 'intel', 'sessions');
      fs.mkdirSync(sessionsDir, { recursive: true });

      fs.writeFileSync(
        path.join(sessionsDir, 'session_20260901_000001.jsonl'),
        JSON.stringify({ type: 'session_start', sessionId: 's1', command: 'review' }) + '\n' +
        JSON.stringify({ type: 'session_end', sessionId: 's1', status: 'completed', totalDurationMs: 2000 }) + '\n',
        'utf8'
      );

      telemetry.recordJitInvocation(planningDir, ['src/hub.ts'], 500000, 2500000, 'review', '25');

      const outAll = dashboard.renderTokenDashboard(planningDir, '--all');
      assert.ok(outAll.includes('Token Telemetry (Observability)'));
      assert.ok(outAll.includes('Financial Impact:'));
      assert.ok(outAll.includes('Operational Sessions:'));
      assert.ok(outAll.includes('Distribution by Command:'));
      verifyBoxLines(outAll);
    } finally {
      cleanup(tmpDir);
    }
  });
});
