/**
 * Tests for Preflight Path Cache (Wave 2 / Wave 6)
 * - Validates inMemoryPathSet eliminates disk overhead
 * - Measures runPreFlightChecks latency using performance.now() (< 15ms)
 */

'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { performance } = require('node:perf_hooks');

const { cleanup } = require('./helpers.cjs');
const guardrails = require('../gsd-core/bin/lib/preflight-guardrails.cjs');
const codebaseAst = require('../gsd-core/bin/lib/codebase-ast-analyzer.cjs');
const { runPreFlightChecks } = guardrails;
const { buildCodebaseGraph, saveCodebaseGraph } = codebaseAst;

describe('Preflight Path Cache — Sub-15ms In-Memory Verification', () => {
  test('executes runPreFlightChecks in sub-15ms using inMemoryPathSet', () => {
    const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-cache-test-'));

    try {
      const srcDir = path.join(tmpProject, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      // Generate 30 interconnected files
      for (let i = 0; i < 30; i++) {
        const nextDep = i + 1 < 30 ? `import { fn${i + 1} } from './mod${i + 1}';` : '';
        fs.writeFileSync(
          path.join(srcDir, `mod${i}.ts`),
          `
          ${nextDep}
          export function fn${i}() { return ${i}; }
          `
        );
      }

      const planningDir = path.join(tmpProject, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });

      // Build and persist codebase graph
      const graph = buildCodebaseGraph(tmpProject);
      saveCodebaseGraph(planningDir, graph);

      // Warm up JIT compiler
      runPreFlightChecks({
        taskId: 'warmup',
        filesToModify: ['src/mod0.ts'],
        planningDir,
        rootDir: tmpProject,
      });

      // Benchmark using performance.now() (sub-millisecond resolution)
      const t0 = performance.now();
      const report = runPreFlightChecks({
        taskId: 'bench-task',
        filesToModify: ['src/mod0.ts'],
        proposedCodeMap: {
          'src/mod0.ts': `import { fn1 } from './mod1'; export function fn0() { return fn1() + 10; }`,
        },
        planningDir,
        rootDir: tmpProject,
      });
      const durationMs = performance.now() - t0;

      assert.strictEqual(report.valid, true, 'Preflight report must be valid');
      assert.strictEqual(report.violations.length, 0, 'Must have zero violations');
      assert.ok(
        durationMs < 15,
        `runPreFlightChecks took ${durationMs.toFixed(2)}ms, expected < 15ms`
      );
    } finally {
      cleanup(tmpProject);
    }
  });
});
