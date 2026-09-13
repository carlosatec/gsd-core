'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { cleanup } = require('./helpers.cjs');
const aggregator = require('../gsd-core/bin/lib/observability-aggregator.cjs');
const telemetryMod = require('../gsd-core/bin/lib/jit-telemetry.cjs');

describe('Wave 1: Observability 360° Aggregator Core', () => {
  describe('formatCurrency adaptive precision', () => {
    test('formats zero, standard amounts, and micro-amounts adaptively', () => {
      assert.strictEqual(aggregator.formatCurrency(0), '$ 0.00');
      assert.strictEqual(aggregator.formatCurrency(23.21), '$ 23.21');
      assert.strictEqual(aggregator.formatCurrency(1.5), '$ 1.50');
      assert.strictEqual(aggregator.formatCurrency(0.145), '$ 0.145');
      assert.strictEqual(aggregator.formatCurrency(0.0034), '$ 0.0034');
      assert.strictEqual(aggregator.formatCurrency(0.0001), '$ 0.0001');
    });
  });

  describe('aggregateOperationalSessions', () => {
    test('handles non-existent or empty session directories gracefully', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-obs-test-'));
      try {
        const planningDir = path.join(tmpDir, '.planning');
        const emptyResult = aggregator.aggregateOperationalSessions(planningDir);

        assert.strictEqual(emptyResult.totalSessions, 0);
        assert.strictEqual(emptyResult.completedSessions, 0);
        assert.strictEqual(emptyResult.failedSessions, 0);
        assert.strictEqual(emptyResult.successRatePct, 0);
        assert.strictEqual(emptyResult.totalToolsCalled, 0);
        assert.strictEqual(emptyResult.totalMutations, 0);
        assert.deepStrictEqual(emptyResult.recentSessions, []);
      } finally {
        cleanup(tmpDir);
      }
    });

    test('parses realistic summary-tier sessions with errors and latency', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-obs-test-'));
      try {
        const planningDir = path.join(tmpDir, '.planning');
        const sessionsDir = path.join(planningDir, 'intel', 'sessions');
        fs.mkdirSync(sessionsDir, { recursive: true });

        // Session 1: Completed
        const s1Path = path.join(sessionsDir, 'session_20260901_000001.jsonl');
        fs.writeFileSync(
          s1Path,
          JSON.stringify({ type: 'session_start', sessionId: 's1', command: 'plan', phaseId: '01', timestamp: '2026-09-01T10:00:00Z' }) + '\n' +
          JSON.stringify({ type: 'session_end', sessionId: 's1', status: 'completed', totalDurationMs: 1200, totalToolsCalled: 4, totalMutations: 2 }) + '\n',
          'utf8'
        );

        // Session 2: Failed with error
        const s2Path = path.join(sessionsDir, 'session_20260901_000002.jsonl');
        fs.writeFileSync(
          s2Path,
          JSON.stringify({ type: 'session_start', sessionId: 's2', command: 'exec', phaseId: '01', timestamp: '2026-09-01T11:00:00Z' }) + '\n' +
          JSON.stringify({ type: 'session_end', sessionId: 's2', status: 'failed', totalDurationMs: 2500, error: 'EPERM: write blocked by guardrail' }) + '\n',
          'utf8'
        );

        // Session 3: Corrupt line resilience
        const s3Path = path.join(sessionsDir, 'session_20260901_000003.jsonl');
        fs.writeFileSync(
          s3Path,
          '{ corrupted json line...\n' +
          JSON.stringify({ type: 'session_start', sessionId: 's3', command: 'review', timestamp: '2026-09-01T12:00:00Z' }) + '\n' +
          JSON.stringify({ type: 'session_end', sessionId: 's3', status: 'completed', totalDurationMs: 800, totalToolsCalled: 1, totalMutations: 0 }) + '\n',
          'utf8'
        );

        const ops = aggregator.aggregateOperationalSessions(planningDir);

        assert.strictEqual(ops.totalSessions, 3);
        assert.strictEqual(ops.completedSessions, 2);
        assert.strictEqual(ops.failedSessions, 1);
        assert.strictEqual(ops.successRatePct, 66.7);
        assert.strictEqual(ops.totalDurationMs, 4500);
        assert.strictEqual(ops.avgDurationMs, 1500);
        assert.strictEqual(ops.peakDurationMs, 2500);
        assert.strictEqual(ops.totalToolsCalled, 5);
        assert.strictEqual(ops.totalMutations, 2);
        assert.ok(ops.errorTaxonomy['EPERM: write blocked by guardrail'] >= 1);
        assert.strictEqual(ops.recentSessions.length, 3);
      } finally {
        cleanup(tmpDir);
      }
    });

    test('extracts fine-grained tool_call and file_mutation events when present', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-obs-test-'));
      try {
        const planningDir = path.join(tmpDir, '.planning');
        const sessionsDir = path.join(planningDir, 'intel', 'sessions');
        fs.mkdirSync(sessionsDir, { recursive: true });

        const sPath = path.join(sessionsDir, 'session_20260902_000001.jsonl');
        fs.writeFileSync(
          sPath,
          JSON.stringify({ type: 'session_start', sessionId: 's_fg', command: 'exec' }) + '\n' +
          JSON.stringify({ type: 'tool_call', toolName: 'replace_file_content' }) + '\n' +
          JSON.stringify({ type: 'tool_call', toolName: 'replace_file_content' }) + '\n' +
          JSON.stringify({ type: 'tool_call', toolName: 'run_command' }) + '\n' +
          JSON.stringify({ type: 'file_mutation', filePath: 'src/app.ts' }) + '\n' +
          JSON.stringify({ type: 'file_mutation', filePath: 'src/server.ts' }) + '\n' +
          JSON.stringify({ type: 'session_end', sessionId: 's_fg', status: 'completed', totalDurationMs: 1400 }) + '\n',
          'utf8'
        );

        const ops = aggregator.aggregateOperationalSessions(planningDir);

        assert.strictEqual(ops.totalSessions, 1);
        assert.strictEqual(ops.totalToolsCalled, 3);
        assert.strictEqual(ops.toolDistribution['replace_file_content'], 2);
        assert.strictEqual(ops.toolDistribution['run_command'], 1);
        assert.strictEqual(ops.totalMutations, 2);
        assert.ok(ops.mutatedFiles.includes('src/app.ts'));
        assert.ok(ops.mutatedFiles.includes('src/server.ts'));
      } finally {
        cleanup(tmpDir);
      }
    });
  });

  describe('calculateFinancialMetrics', () => {
    test('computes dollar costs, net savings, and provider comparisons accurately', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-obs-test-'));
      try {
        const planningDir = path.join(tmpDir, '.planning');
        fs.mkdirSync(planningDir, { recursive: true });

        // Record JIT invocations: 1M JIT tokens used, 10M monolithic avoided -> 9M saved
        telemetryMod.recordJitInvocation(planningDir, ['src/core.ts'], 1000000, 10000000, 'plan', '25');

        const summary = telemetryMod.getTelemetrySummary(planningDir);
        const finClaude = aggregator.calculateFinancialMetrics(summary, planningDir, 'claude-3-7-sonnet');

        // Claude: $3.00 / 1M
        // 1M * $3.00 = $3.00 actual
        // 10M * $3.00 = $30.00 avoided
        // 9M * $3.00 = $27.00 saved (90.0%)
        assert.strictEqual(finClaude.actualCostUsd, 3.0);
        assert.strictEqual(finClaude.avoidedCostUsd, 30.0);
        assert.strictEqual(finClaude.netSavingsUsd, 27.0);
        assert.strictEqual(finClaude.savingsPercentage, 90.0);
        assert.strictEqual(finClaude.formattedActualCost, '$ 3.00');
        assert.strictEqual(finClaude.formattedAvoidedCost, '$ 30.00');
        assert.strictEqual(finClaude.formattedNetSavings, '$ 27.00');

        // Verify comparison table has all major models
        const comparisons = finClaude.providerComparisons;
        const gpt4o = comparisons.find(c => c.modelKey === 'gpt-4o');
        const gemini = comparisons.find(c => c.modelKey === 'gemini-2-0-pro');
        const deepseek = comparisons.find(c => c.modelKey === 'deepseek-chat');
        const local = comparisons.find(c => c.modelKey === 'local');

        assert.ok(gpt4o);
        assert.strictEqual(gpt4o.actualCostUsd, 2.5); // $2.50 / 1M
        assert.ok(gemini);
        assert.strictEqual(gemini.actualCostUsd, 1.25); // $1.25 / 1M
        assert.ok(deepseek);
        assert.strictEqual(deepseek.actualCostUsd, 0.14); // $0.14 / 1M
        assert.ok(local);
        assert.strictEqual(local.actualCostUsd, 0.0); // Free
      } finally {
        cleanup(tmpDir);
      }
    });

    test('supports custom rates from .planning/config.json', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-obs-test-'));
      try {
        const planningDir = path.join(tmpDir, '.planning');
        fs.mkdirSync(planningDir, { recursive: true });

        fs.writeFileSync(
          path.join(planningDir, 'config.json'),
          JSON.stringify({
            observability: {
              pricing_model: 'custom-corp-llm',
              custom_rates: {
                'custom-corp-llm': {
                  name: 'Corporate Internal LLM',
                  blendedCostPerMillion: 0.50,
                },
              },
            },
          }),
          'utf8'
        );

        telemetryMod.recordJitInvocation(planningDir, ['src/corp.ts'], 2000000, 8000000, 'exec', '25');

        const summary = telemetryMod.getTelemetrySummary(planningDir);
        const fin = aggregator.calculateFinancialMetrics(summary, planningDir);

        assert.strictEqual(fin.pricingModel, 'Corporate Internal LLM');
        // 2M * $0.50 = $1.00
        // 8M * $0.50 = $4.00
        // Net saved: $3.00
        assert.strictEqual(fin.actualCostUsd, 1.0);
        assert.strictEqual(fin.avoidedCostUsd, 4.0);
        assert.strictEqual(fin.netSavingsUsd, 3.0);
      } finally {
        cleanup(tmpDir);
      }
    });
  });

  describe('extractAstTopologyMetrics', () => {
    test('gracefully handles missing codebase-graph.json', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-obs-test-'));
      try {
        const planningDir = path.join(tmpDir, '.planning');
        const topology = aggregator.extractAstTopologyMetrics(planningDir);

        assert.strictEqual(topology.totalFiles, 0);
        assert.strictEqual(topology.totalSymbols, 0);
        assert.deepStrictEqual(topology.topHubs, []);
      } finally {
        cleanup(tmpDir);
      }
    });

    test('extracts AST topology and PageRank hubs correctly', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-obs-test-'));
      try {
        const planningDir = path.join(tmpDir, '.planning');
        const intelDir = path.join(planningDir, 'intel');
        fs.mkdirSync(intelDir, { recursive: true });

        const mockGraph = {
          version: '2.2.0',
          stats: {
            totalFiles: 42,
            totalSymbols: 350,
            totalExports: 80,
            totalRoutes: 5,
            filesByLanguage: { typescript: 40, shell: 2 },
          },
          files: {
            'src/index.ts': {
              symbols: ['start', 'stop'],
              linesCount: 120,
              language: 'typescript',
            },
            'src/core.ts': {
              symbols: ['Engine'],
              linesCount: 300,
              language: 'typescript',
            },
          },
          pageRankScores: {
            'src/core.ts': 0.4521,
            'src/index.ts': 0.1234,
          },
        };

        fs.writeFileSync(path.join(intelDir, 'codebase-graph.json'), JSON.stringify(mockGraph), 'utf8');

        const topology = aggregator.extractAstTopologyMetrics(planningDir);

        assert.strictEqual(topology.totalFiles, 42);
        assert.strictEqual(topology.totalSymbols, 350);
        assert.strictEqual(topology.totalExports, 80);
        assert.strictEqual(topology.languages.typescript, 40);
        assert.strictEqual(topology.topHubs.length, 2);
        assert.strictEqual(topology.topHubs[0].file, 'src/core.ts');
        assert.strictEqual(topology.topHubs[0].score, 0.4521);
        assert.strictEqual(topology.topHubs[0].symbolsCount, 1);
        assert.strictEqual(topology.topHubs[0].linesCount, 300);
      } finally {
        cleanup(tmpDir);
      }
    });
  });

  describe('getObservabilitySnapshot', () => {
    test('returns unified snapshot integrating telemetry, finances, operations and topology', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-obs-test-'));
      try {
        const planningDir = path.join(tmpDir, '.planning');
        fs.mkdirSync(planningDir, { recursive: true });

        const snapshot = aggregator.getObservabilitySnapshot(planningDir);

        assert.ok(snapshot.timestamp);
        assert.ok(snapshot.telemetry);
        assert.ok(snapshot.financial);
        assert.ok(snapshot.operational);
        assert.ok(snapshot.topology);
        assert.strictEqual(typeof snapshot.financial.netSavingsUsd, 'number');
        assert.strictEqual(typeof snapshot.operational.totalSessions, 'number');
      } finally {
        cleanup(tmpDir);
      }
    });
  });
});
