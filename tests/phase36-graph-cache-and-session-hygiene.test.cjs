'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const astMod = require('../gsd-core/bin/lib/codebase-ast-analyzer.cjs');
const { loadCodebaseGraph, _clearGraphMemoryCache } = astMod;

const sys1Mod = require('../gsd-core/bin/lib/system-one-engine.cjs');
const { classifyRiskSync, evaluateAssertionSync } = sys1Mod;

const obsMod = require('../gsd-core/bin/lib/observability-aggregator.cjs');
const { aggregateOperationalSessions } = obsMod;
const { cleanup, createTempDir } = require('./helpers.cjs');

test('Wave 1: loadCodebaseGraph memory cache performance and invalidation', () => {
  if (typeof _clearGraphMemoryCache === 'function') {
    _clearGraphMemoryCache();
  }

  const graph1 = loadCodebaseGraph('.planning');

  assert.ok(graph1 !== null, 'Initial graph load should return valid graph');
  assert.ok(typeof graph1.files === 'object', 'Graph should have files map');

  // Second load must hit memory cache instantly (< 5ms)
  const start2 = Date.now();
  const graph2 = loadCodebaseGraph('.planning');
  const dur2 = Date.now() - start2;

  assert.strictEqual(graph1, graph2, 'Cached graph reference should be identical');
  assert.ok(dur2 < 15, `Cached graph load took ${dur2}ms (expected < 15ms)`);
});

test('Wave 2: SystemOneEngine decision logging reuses process logger and prevents session explosion', () => {
  const sessionsDir = path.resolve('.planning', 'intel', 'sessions');
  const initialFiles = fs.existsSync(sessionsDir)
    ? fs.readdirSync(sessionsDir).filter(f => f.startsWith('session_') && f.endsWith('.jsonl')).length
    : 0;

  const graph = loadCodebaseGraph('.planning');
  const ctx = { planningDir: '.planning', rootDir: '.', graph };

  // Run 10 synchronous evaluations
  for (let i = 0; i < 10; i++) {
    classifyRiskSync('src/codebase-ast-analyzer.cts', ctx);
    evaluateAssertionSync('Does this file break exports?', ctx);
  }

  const afterFiles = fs.readdirSync(sessionsDir).filter(f => f.startsWith('session_') && f.endsWith('.jsonl')).length;
  // It should NOT spawn 20 new session files (at most 1 process session)
  const diff = afterFiles - initialFiles;
  assert.ok(diff <= 1, `Expected at most 1 session file created, but got ${diff}`);
});

test('Wave 2: aggregateOperationalSessions excludes pure decision traces from command success metrics', () => {
  const tmpPlanningDir = createTempDir('gsd-obs-planning-');
  const tmpSessionsDir = path.join(tmpPlanningDir, 'intel', 'sessions');

  fs.mkdirSync(tmpSessionsDir, { recursive: true });

  try {
    // 1. Write one legitimate completed session
    const realSession = path.join(tmpSessionsDir, 'session_real_01.jsonl');
    fs.writeFileSync(realSession, [
      JSON.stringify({ type: 'session_start', command: 'plan', phaseId: '36', timestamp: new Date().toISOString() }),
      JSON.stringify({ type: 'tool_call', toolName: 'read_file', timestamp: new Date().toISOString() }),
      JSON.stringify({ type: 'session_end', status: 'completed', totalDurationMs: 1200, totalToolsCalled: 1, totalMutations: 0 })
    ].join('\n') + '\n', 'utf8');

    // 2. Write 5 orphan decision-only trace files
    for (let i = 0; i < 5; i++) {
      const traceFile = path.join(tmpSessionsDir, `session_trace_${i}.jsonl`);
      fs.writeFileSync(traceFile, JSON.stringify({
        type: 'system_one_decision',
        decisionType: 'risk_score',
        verdict: 1,
        source: 'ast_analytical'
      }) + '\n', 'utf8');
    }

    // 3. Aggregate
    const metrics = aggregateOperationalSessions(tmpPlanningDir);
    assert.strictEqual(metrics.totalSessions, 1, 'Only genuine operational sessions should be counted');
    assert.strictEqual(metrics.completedSessions, 1, 'Completed session count should be 1');
    assert.strictEqual(metrics.successRatePct, 100, 'Success rate should be 100%');
  } finally {
    cleanup(tmpPlanningDir);
  }
});

