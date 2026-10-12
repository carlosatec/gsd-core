'use strict';

/**
 * Phase 32 Wave 3 Unit Suite: JIT Headroom Re-investment & Context Fidelity Telemetry
 *
 * Validates:
 * 1. Headroom reinvestment: when headroomTokens >= 5000, JIT dynamically expands closure depth.
 * 2. Ingestion of historical self-healing lessons from anti-patterns.json.
 * 3. Telemetry schema v2.1 tracking: noiseTokensEliminated & usefulContextTokensInjected.
 * 4. Fidelity Balance display in ASCII Token Dashboard.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const jitInjector = require('../gsd-core/bin/lib/jit-context-injector.cjs');
const jitTelemetry = require('../gsd-core/bin/lib/jit-telemetry.cjs');
const antiPatternStore = require('../gsd-core/bin/lib/anti-pattern-store.cjs');
const dashboardRenderer = require('../gsd-core/bin/lib/token-dashboard-renderer.cjs');

const { assembleJitContext } = jitInjector;
const { recordJitInvocation, getTelemetrySummary } = jitTelemetry;
const { recordAntiPattern } = antiPatternStore;
const { renderTokenDashboard } = dashboardRenderer;

describe('Phase 32 Wave 3 — JIT Headroom Re-investment', () => {
  it('dynamically expands type closure depth and flags headroomReinvested when headroom >= 5000', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-jit-headroom-'));
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(path.join(planningDir, 'intel'), { recursive: true });

    // Seed dummy source files
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'a.ts'), 'export interface Alpha { id: string; }\n', 'utf8');

    // Assemble without headroom
    const standardPkg = assembleJitContext({
      targetFiles: ['src/a.ts'],
      planningDir,
      rootDir: tmpDir,
      headroomTokens: 1000,
      dryRun: false,
    });
    assert.equal(standardPkg.headroomReinvested, false);

    // Assemble with headroom >= 5000 tokens
    const expandedPkg = assembleJitContext({
      targetFiles: ['src/a.ts'],
      planningDir,
      rootDir: tmpDir,
      headroomTokens: 7500,
      dryRun: false,
    });
    assert.equal(expandedPkg.headroomReinvested, true);
  });
});

describe('Phase 32 Wave 3 — Priority Anti-Pattern Ingestion', () => {
  it('injects relevant historical anti-patterns and formats warnings into markdownBlock', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-jit-antipattern-'));
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(path.join(planningDir, 'intel'), { recursive: true });

    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'service.ts'), 'export class Service {}\n', 'utf8');

    // Record an anti-pattern for src/service.ts
    recordAntiPattern(planningDir, {
      file: 'src/service.ts',
      error: 'Unhandled promise rejection in async worker',
      lesson: 'Always wrap worker dispatch in try/catch to prevent unhandled rejections',
    });

    const pkg = assembleJitContext({
      targetFiles: ['src/service.ts'],
      planningDir,
      rootDir: tmpDir,
      dryRun: false,
    });

    assert.ok(pkg.applicableAntiPatterns);
    assert.ok(pkg.applicableAntiPatterns.length > 0);
    assert.ok(pkg.applicableAntiPatterns.some(l => l.includes('wrap worker dispatch')));
    assert.ok(pkg.markdownBlock.includes('Relevant Self-Healing Lessons & Anti-Patterns'));
    assert.ok(pkg.markdownBlock.includes('wrap worker dispatch'));
  });
});

describe('Phase 32 Wave 3 — Context Fidelity Telemetry & Dashboard', () => {
  it('records noiseTokensEliminated and usefulContextTokensInjected in telemetry', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-jit-telemetry-'));
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(path.join(planningDir, 'intel'), { recursive: true });

    const record = recordJitInvocation(
      planningDir,
      ['src/sample.ts'],
      500,
      5000,
      'exec',
      '32',
      'inv-test-32',
      'targeted',
      undefined,
      95,
      'high',
      4200, // noise eliminated
      1200  // useful context injected
    );

    assert.equal(record.noiseTokensEliminated, 4200);
    assert.equal(record.usefulContextTokensInjected, 1200);

    const summary = getTelemetrySummary(planningDir);
    assert.equal(summary.totalNoiseTokensEliminated, 4200);
    assert.equal(summary.totalUsefulTokensInjected, 1200);

    const dashboard = renderTokenDashboard(planningDir);
    assert.ok(dashboard.includes('Noise Diet Eliminated:'));
    assert.ok(dashboard.includes('Useful Context Added:'));
  });
});
