/**
 * Phase 37 — Code Review Remediation Verification Suite
 * Covers all 7 findings from 37-CODE-REVIEW.md:
 * 1. Honest live JIT telemetry (v2.1.0, non-hardcoded recall, no stale masking)
 * 2. Second Brain <-> Anti-Pattern Store `{ patterns }` schema parity & dynamic active phase
 * 3. Unified Workflow Hub subdirectory plan resolution & hyphenated command forms
 * 4. Canonical plan/phase enumeration (tested via linters + runtime)
 * 5. System-One `evaluateGroundingScore` ignores removed `-` diff lines
 * 6. HTML exporters escape `<`, `>`, `&` in inline `<script>` JSON payloads and update dashboard footer
 * 7. Dead `state-markdown-parser` module removed cleanly
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { cleanup } = require('./helpers.cjs');
const jitTelemetry = require('../gsd-core/bin/lib/jit-telemetry.cjs');
const antiPatternStore = require('../gsd-core/bin/lib/anti-pattern-store.cjs');
const secondBrainMod = require('../gsd-core/bin/lib/obsidian-second-brain.cjs');
const unifiedHub = require('../gsd-core/bin/lib/unified-workflow-hub.cjs');
const systemOneEngine = require('../gsd-core/bin/lib/system-one-engine.cjs');
const visualGraphMod = require('../gsd-core/bin/lib/visual-graph-exporter.cjs');
const htmlDashboard = require('../gsd-core/bin/lib/observability-html-dashboard.cjs');
const aggregator = require('../gsd-core/bin/lib/observability-aggregator.cjs');

describe('Phase 37 — Code Review Fixes Regression Suite', () => {
  it('1. jit-telemetry writes version 2.1.0, computes non-hardcoded recall, and does not let stale JSON mask live metrics', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-p37-fix1-'));
    try {
      const planningDir = path.join(tmp, '.planning');
      fs.mkdirSync(path.join(planningDir, 'intel'), { recursive: true });

      // Empty project has honest 0 recall & HIGH amnesia risk (not fake 75.0 / 99.2)
      const emptySummary = jitTelemetry.getTelemetrySummary(planningDir);
      assert.strictEqual(emptySummary.averageContextRecallPct, 0);
      assert.strictEqual(emptySummary.brainCoveragePct, 0);
      assert.strictEqual(emptySummary.currentAmnesiaRisk, 'HIGH');

      // Seed stale v2.0.0 telemetry.json claiming 99.2 recall
      fs.writeFileSync(
        path.join(planningDir, 'intel', 'telemetry.json'),
        JSON.stringify({
          version: '2.0.0',
          totalInvocations: 5,
          averageContextRecallPct: 99.2,
          currentAmnesiaRisk: 'LOW',
          brainCoveragePct: 98.5,
          activeDecisionsLoaded: 42,
        }),
        'utf8'
      );

      // Summary must recompute live quality instead of returning stale masked values
      const staleSummary = jitTelemetry.getTelemetrySummary(planningDir);
      assert.strictEqual(staleSummary.averageContextRecallPct, 0);
      assert.strictEqual(staleSummary.currentAmnesiaRisk, 'HIGH');

      // Now seed decisions + graph and record an invocation
      fs.mkdirSync(path.join(planningDir, 'memory'), { recursive: true });
      fs.writeFileSync(
        path.join(planningDir, 'STATE.md'),
        '# State\n- **D-01 [Core]:** Rule one\n- **D-02 [Core]:** Rule two\n',
        'utf8'
      );
      fs.writeFileSync(
        path.join(planningDir, 'memory', 'decisions.jsonl'),
        '{"id":"D-01"}\n{"id":"D-02"}\n',
        'utf8'
      );
      fs.writeFileSync(
        path.join(planningDir, 'intel', 'codebase-graph.json'),
        JSON.stringify({ stats: { totalFiles: 4 }, files: { 'a.ts': {}, 'b.ts': {} } }),
        'utf8'
      );

      jitTelemetry.recordJitInvocation(planningDir, ['a.ts'], 200, 2000, 'exec', '12');

      const persisted = JSON.parse(
        fs.readFileSync(path.join(planningDir, 'intel', 'telemetry.json'), 'utf8')
      );
      assert.strictEqual(persisted.version, '2.1.0');

      const liveSummary = jitTelemetry.getTelemetrySummary(planningDir);
      // 2/2 decisions (60%) + 2/4 AST files (20%) = 80.0%
      assert.strictEqual(liveSummary.averageContextRecallPct, 80.0);
      assert.strictEqual(liveSummary.brainCoveragePct, 50.0);
      assert.strictEqual(liveSummary.activeDecisionsLoaded, 2);
    } finally {
      cleanup(tmp);
    }
  });

  it('2. anti-pattern-store file scoping excludes unattached local patterns and obsidian-second-brain renders `{ patterns }` + dynamic active phase', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-p37-fix2-'));
    try {
      const planningDir = path.join(tmp, '.planning');
      const phaseDir = path.join(planningDir, 'phases', '12-custom-feature');
      fs.mkdirSync(phaseDir, { recursive: true });
      fs.writeFileSync(path.join(planningDir, 'STATE.md'), '# State\nCurrent Phase: Phase 12\n- **D-01 [Core]:** Keep dynamic phases.\n', 'utf8');
      fs.writeFileSync(path.join(phaseDir, '12-01-PLAN.md'), '# Plan 12-01\n', 'utf8');

      antiPatternStore.recordAntiPattern(planningDir, {
        rule: 'NO_NULL',
        file: 'src/target.ts',
        error: 'TypeError on src/target.ts',
        lesson: 'Always guard target cleanly',
      });
      antiPatternStore.recordAntiPattern(planningDir, {
        rule: 'UNSCOPED_RULE',
        error: 'Generic error with no file',
        lesson: 'Do not leak into file queries',
      });

      const scoped = antiPatternStore.queryAntiPatterns(planningDir, {
        file: 'src/target.ts',
        includeGlobalLearnings: false,
      });
      assert.strictEqual(scoped.length, 1);
      assert.strictEqual(scoped[0].file, 'src/target.ts');

      const vault = secondBrainMod.generateSecondBrainVault(planningDir, tmp);
      const lessonPath = path.join(planningDir, 'vault', 'Lessons', 'AP-01.md');
      assert.ok(fs.existsSync(lessonPath), 'Vault must index patterns stored via anti-pattern-store');
      assert.ok(fs.readFileSync(lessonPath, 'utf8').includes('Always guard target cleanly'));

      const homeContent = fs.readFileSync(vault.homePath, 'utf8');
      assert.ok(!homeContent.includes('Phases/37-'), 'Home note must not hardcode Phase 37');
      assert.ok(homeContent.includes('12-custom-feature'), 'Home note must reference active Phase 12');
      assert.ok(homeContent.includes('1 fases'), 'Home note must report dynamic phase count');
    } finally {
      cleanup(tmp);
    }
  });

  it('3. unified-workflow-hub resolves subdirectory PLAN in verify and emits hyphenated nextStep in status', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-p37-fix3-'));
    try {
      const planningDir = path.join(tmp, '.planning');
      const phaseDir = path.join(planningDir, 'phases', '12-verify-sub');
      fs.mkdirSync(phaseDir, { recursive: true });
      fs.writeFileSync(
        path.join(tmp, 'package.json'),
        JSON.stringify({ name: 'p37-verify-fixture', scripts: { test: 'node -e "process.exit(0)"' } }),
        'utf8'
      );
      fs.writeFileSync(
        path.join(planningDir, 'STATE.md'),
        '# State\n**Current Phase**: Phase 12 (Verify Sub)\n',
        'utf8'
      );
      fs.writeFileSync(
        path.join(phaseDir, '12-01-PLAN.md'),
        '# Plan 12-01\n\n## Verification Criteria\n1. UniqueSubdirCriterionFromPhase12Plan executes cleanly\n',
        'utf8'
      );

      const statusRes = unifiedHub.dispatchUnifiedCommand('status', { args: [], cwd: tmp, raw: true });
      assert.ok(statusRes.nextStep.includes('/gsd-exec 12'), `Expected /gsd-exec 12, got: ${statusRes.nextStep}`);

      const verifyRes = unifiedHub.dispatchUnifiedCommand('verify', { args: ['12'], cwd: tmp, raw: true });
      assert.strictEqual(verifyRes.command, 'verify');
      assert.ok(verifyRes.data && typeof verifyRes.data.verdict === 'string', 'verify should return verdict');
      const warningsJoined = (verifyRes.data.warnings || []).join('\n');
      assert.ok(
        verifyRes.data.systemOneVerified === true || warningsJoined.includes('UniqueSubdirCriterionFromPhase12Plan'),
        `verify should resolve and evaluate criterion from phases/12-verify-sub/12-01-PLAN.md, got warnings: ${warningsJoined}`
      );
    } finally {
      cleanup(tmp);
    }
  });

  it('4. system-one-engine evaluateGroundingScore ignores removed diff lines', () => {
    const mockGraph = {
      files: {
        'src/app.ts': {
          exports: [{ name: 'knownValidMethod' }],
          symbols: [{ name: 'knownValidMethod' }],
        },
      },
    };
    const diff = [
      'diff --git a/src/app.ts b/src/app.ts',
      '--- a/src/app.ts',
      '+++ b/src/app.ts',
      '@@ -1,3 +1,3 @@',
      '-  client.legacyRemovedHallucination();',
      '-  client.anotherOldMissingCall();',
      '+  client.knownValidMethod();',
    ].join('\n');

    const res = systemOneEngine.evaluateGroundingScore({
      codeDiff: diff,
      graph: mockGraph,
    });
    assert.strictEqual(res.passed, true);
    assert.strictEqual(res.gate, 'PASSED');
  });

  it('5. HTML exporters escape script-breaking characters and avoid stale 3.4 footer version', () => {
    const htmlGraph = visualGraphMod.generateVisualGraphHtml({
      title: 'Test Graph </script><script>alert(1)</script>',
      generatedAt: '2026-11-14T00:00:00.000Z',
      stats: { totalNodes: 1, totalLinks: 0, totalFiles: 1 },
      nodes: [{ id: 'n1', label: 'bad</script><img src=x>', group: 'ts', val: 1, pagerank: 1 }],
      links: [],
    });
    assert.ok(!htmlGraph.includes('bad</script>'), 'JSON payload must escape closing script tags');
    assert.ok(htmlGraph.includes('\\u003c/script\\u003e'));

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-p37-fix5-'));
    try {
      const planningDir = path.join(tmp, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });
      const snapshot = aggregator.getObservabilitySnapshot(planningDir);
      const dashboardHtml = htmlDashboard.generateDashboardHtml(snapshot);
      assert.ok(!dashboardHtml.includes('GSD Core Nexus 3.4'), 'Footer must not hardcode GSD Core Nexus 3.4');
      assert.ok(!dashboardHtml.includes('<\\/script>'), 'Safe JSON serializer should encode < and >');
    } finally {
      cleanup(tmp);
    }
  });

  it('6. dead module state-markdown-parser is absent from src and compiled lib', () => {
    const repoRoot = path.resolve(__dirname, '..');
    assert.strictEqual(fs.existsSync(path.join(repoRoot, 'src', 'state-markdown-parser.cts')), false);
    assert.strictEqual(fs.existsSync(path.join(repoRoot, 'gsd-core', 'bin', 'lib', 'state-markdown-parser.cjs')), false);
  });
});
