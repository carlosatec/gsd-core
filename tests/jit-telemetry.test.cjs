/**
 * Tests for JIT Telemetry Engine.
 */

'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { cleanup } = require('./helpers.cjs');
const telemetry = require('../gsd-core/bin/lib/jit-telemetry.cjs');
const { recordJitInvocation, getTelemetrySummary } = telemetry;

describe('jit-telemetry', () => {
  test('records JIT invocations and calculates efficiency percentage', () => {
    const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'telemetry-test-'));

    try {
      const planningDir = path.join(tmpProject, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });

      // Record 1: 500 tokens JIT vs 5000 tokens full repo (90% savings)
      const r1 = recordJitInvocation(planningDir, ['src/app.ts'], 500, 5000);
      assert.strictEqual(r1.tokensSaved, 4500);
      assert.strictEqual(r1.efficiencyPct, 90.0);

      // Record 2: 1000 tokens JIT vs 5000 tokens full repo (80% savings)
      const r2 = recordJitInvocation(planningDir, ['src/server.ts'], 1000, 5000);
      assert.strictEqual(r2.tokensSaved, 4000);
      assert.strictEqual(r2.efficiencyPct, 80.0);

      const summary = getTelemetrySummary(planningDir);
      assert.strictEqual(summary.totalInvocations, 2);
      assert.strictEqual(summary.totalTokensSaved, 8500);
      assert.strictEqual(summary.averageEfficiencyPct, 85.0);
      assert.strictEqual(summary.lastInvocation.tokensSaved, 4000);
    } finally {
      cleanup(tmpProject);
    }
  });
});
