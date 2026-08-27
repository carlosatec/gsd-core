'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { cleanup } = require('./helpers.cjs');
const telemetry = require('../gsd-core/bin/lib/jit-telemetry.cjs');
const dashboard = require('../gsd-core/bin/lib/token-dashboard-renderer.cjs');
const hub = require('../gsd-core/bin/lib/unified-workflow-hub.cjs');
const jitInjector = require('../gsd-core/bin/lib/jit-context-injector.cjs');

describe('Phase 7: Pure Token Telemetry & Observability', () => {
  describe('Schema v2.0 Multi-Dimensional Tracking', () => {
    test('records telemetry with command and phaseId dimensions and tracks peaks', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-tele-v2-'));
      try {
        const planningDir = path.join(tmpDir, '.planning');
        fs.mkdirSync(planningDir, { recursive: true });

        // Record 1: plan command in Phase 1
        const r1 = telemetry.recordJitInvocation(planningDir, ['src/user.ts'], 800, 8000, 'plan', '01');
        assert.strictEqual(r1.command, 'plan');
        assert.strictEqual(r1.phaseId, '01');
        assert.strictEqual(r1.tokensSaved, 7200);
        assert.strictEqual(r1.efficiencyPct, 90.0);

        // Record 2: exec command in Phase 2 with higher tokens (new peak)
        const r2 = telemetry.recordJitInvocation(planningDir, ['src/auth.ts'], 1500, 10000, 'exec', '02');
        assert.strictEqual(r2.command, 'exec');
        assert.strictEqual(r2.phaseId, '02');
        assert.strictEqual(r2.jitTokens, 1500);

        const summary = telemetry.getTelemetrySummary(planningDir);
        assert.strictEqual(summary.totalInvocations, 2);
        assert.strictEqual(summary.totalTokensSaved, 15700);
        assert.strictEqual(summary.totalJitTokensUsed, 2300);
        assert.strictEqual(summary.totalMonolithicTokensAvoided, 18000);
        assert.strictEqual(summary.peakInvocationTokens, 1500);

        assert.strictEqual(summary.commandBreakdown['plan'].invocations, 1);
        assert.strictEqual(summary.commandBreakdown['plan'].tokensUsed, 800);
        assert.strictEqual(summary.commandBreakdown['exec'].invocations, 1);
        assert.strictEqual(summary.commandBreakdown['exec'].tokensUsed, 1500);

        assert.strictEqual(summary.phaseBreakdown['01'].tokensUsed, 800);
        assert.strictEqual(summary.phaseBreakdown['02'].tokensUsed, 1500);
        assert.strictEqual(r1.compressionRatio, 10.0);
        assert.ok(summary.averageCompressionRatio >= 1.0);
      } finally {
        cleanup(tmpDir);
      }
    });

    test('preserves 100% backward compatibility with legacy 4-argument calls', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-tele-compat-'));
      try {
        const planningDir = path.join(tmpDir, '.planning');
        fs.mkdirSync(planningDir, { recursive: true });

        // Legacy invocation without command or phaseId
        const rec = telemetry.recordJitInvocation(planningDir, ['src/legacy.ts'], 500, 2500);
        assert.strictEqual(rec.command, 'other');
        assert.strictEqual(rec.phaseId, undefined);
        assert.strictEqual(rec.tokensSaved, 2000);
        assert.strictEqual(rec.efficiencyPct, 80.0);
        assert.strictEqual(rec.compressionRatio, 5.0);

        const summary = telemetry.getTelemetrySummary(planningDir);
        assert.strictEqual(summary.totalInvocations, 1);
        assert.strictEqual(summary.commandBreakdown['other'].invocations, 1);
      } finally {
        cleanup(tmpDir);
      }
    });
  });

  describe('Token Dashboard Renderer (ASCII 65 columns)', () => {
    test('renders clean ASCII dashboard with bars and breakdowns', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-dash-'));
      try {
        const planningDir = path.join(tmpDir, '.planning');
        fs.mkdirSync(planningDir, { recursive: true });

        // Empty state
        const emptyOutput = dashboard.renderTokenDashboard(planningDir);
        assert.ok(emptyOutput.includes('⚡ GSD Core Nexus Token Telemetry') || emptyOutput.includes('Token Telemetry'));
        assert.ok(emptyOutput.includes('No telemetry records found yet'));

        // Populated state
        telemetry.recordJitInvocation(planningDir, ['src/app.ts'], 1000, 10000, 'exec', '07');
        telemetry.recordJitInvocation(planningDir, ['src/plan.ts'], 500, 5000, 'plan', '07');

        const rendered = dashboard.renderTokenDashboard(planningDir);
        assert.ok(rendered.includes('Total Invocations:'));
        assert.ok(rendered.includes('Tokens Used (JIT):'));
        assert.ok(rendered.includes('Average Efficiency:'));
        assert.ok(rendered.includes('Graph Compression:'));
        assert.ok(rendered.includes('Distribution by Command:'));
        assert.ok(rendered.includes('exec'));
        assert.ok(rendered.includes('plan'));

        // Verify line lengths do not overflow 65 characters significantly
        const lines = rendered.split('\n');
        for (const line of lines) {
          assert.ok(line.length <= 70, `Line "${line}" exceeds target width (${line.length})`);
        }
      } finally {
        cleanup(tmpDir);
      }
    });
  });

  describe('Unified Workflow Hub & JIT Integration', () => {
    test('dispatches /gsd:tokens and returns telemetry dashboard', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-hub-tokens-'));
      try {
        const planningDir = path.join(tmpDir, '.planning');
        fs.mkdirSync(planningDir, { recursive: true });

        telemetry.recordJitInvocation(planningDir, ['src/core.ts'], 600, 6000, 'plan');

        const res = hub.dispatchUnifiedCommand('/gsd:tokens', { args: [], cwd: tmpDir });
        assert.strictEqual(res.command, 'tokens');
        assert.strictEqual(res.action, 'DISPLAY_TELEMETRY_DASHBOARD');
        assert.ok(res.message.includes('Token Telemetry'));

        // Normalized canonical aliases and D-42 fail-closed rejection
        assert.strictEqual(hub.normalizeCommandName('tokens'), 'tokens');
        assert.strictEqual(hub.normalizeCommandName('/gsd:tokens'), 'tokens');
        assert.strictEqual(hub.normalizeCommandName('/gsd-tokens'), 'tokens');
        assert.strictEqual(hub.normalizeCommandName('$gsd-tokens'), 'tokens');
        assert.strictEqual(hub.normalizeCommandName('telemetry'), null); // retired legacy alias rejected fail-closed
      } finally {
        cleanup(tmpDir);
      }
    });

    test('assembleJitContext records language-weighted in-memory telemetry with command metadata', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-jit-mem-'));
      try {
        const planningDir = path.join(tmpDir, '.planning');
        fs.mkdirSync(planningDir, { recursive: true });

        fs.writeFileSync(
          path.join(tmpDir, 'service.go'),
          'package main\n\nfunc RunService() {}\n'
        );

        const ctx = jitInjector.assembleJitContext({
          targetFiles: ['service.go'],
          planningDir,
          rootDir: tmpDir,
          command: 'exec',
          phaseId: '07',
        });

        assert.ok(ctx.estimatedTokens > 0);

        const summary = telemetry.getTelemetrySummary(planningDir);
        assert.strictEqual(summary.totalInvocations, 1);
        assert.strictEqual(summary.commandBreakdown['exec'].invocations, 1);
        assert.strictEqual(summary.phaseBreakdown['07'].invocations, 1);
      } finally {
        cleanup(tmpDir);
      }
    });
  });

  describe('Auto-Upgrade Greenfield Bootstrap & Frameworks', () => {
    test('bootstraps STATE.md, ROADMAP.md, config.json and detects Next.js framework', () => {
      const autoUpgrade = require('../gsd-core/bin/lib/auto-upgrade-engine.cjs');
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-greenfield-'));
      try {
        const planningDir = path.join(tmpDir, '.planning');
        fs.writeFileSync(
          path.join(tmpDir, 'package.json'),
          JSON.stringify({ dependencies: { next: '14.0.0', react: '18.0.0' } }, null, 2)
        );
        fs.writeFileSync(path.join(tmpDir, 'index.ts'), 'export const hello = "world";\n');

        const rep = autoUpgrade.runAutoUpgrade(planningDir, tmpDir);
        assert.strictEqual(rep.success, true);
        assert.ok(rep.detectedFrameworks.includes('Next.js'));
        assert.ok(rep.detectedFrameworks.includes('React'));
        assert.ok(fs.existsSync(path.join(planningDir, 'STATE.md')));
        assert.ok(fs.existsSync(path.join(planningDir, 'ROADMAP.md')));
        assert.ok(fs.existsSync(path.join(planningDir, 'config.json')));
      } finally {
        cleanup(tmpDir);
      }
    });
  });
});
