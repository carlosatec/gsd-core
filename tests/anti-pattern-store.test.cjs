'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { cleanup } = require('./helpers.cjs');
const antiPatternStore = require('../gsd-core/bin/lib/anti-pattern-store.cjs');
const guardrails = require('../gsd-core/bin/lib/preflight-guardrails.cjs');

describe('Wave 1: Anti-Pattern Store & Self-Healing Feedback Loop', () => {
  test('records and queries anti-patterns with durability', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-ap-test-'));
    try {
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });

      const rec = antiPatternStore.recordAntiPattern(planningDir, {
        file: 'src/handler.ts',
        rule: 'CONTRACT_BREAK',
        error: 'Removed exported auth handler needed by caller',
        repairedAction: 'Restored exported symbol with deprecation tag',
        lesson: 'Do not remove public signatures without caller migration',
      });

      assert.ok(rec.id.startsWith('ap-'));
      assert.strictEqual(rec.file, 'src/handler.ts');

      const queried = antiPatternStore.queryAntiPatterns(planningDir, { file: 'src/handler.ts' });
      assert.strictEqual(queried.length, 1);
      assert.strictEqual(queried[0].rule, 'CONTRACT_BREAK');

      const storePath = path.join(planningDir, 'intel', 'anti-patterns.json');
      assert.ok(fs.existsSync(storePath), 'anti-patterns.json should be created');
    } finally {
      cleanup(tmpDir);
    }
  });

  test('records self-healing repairs automatically into the anti-pattern store', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-heal-ap-'));
    try {
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });

      let callCount = 0;
      const runFn = async () => {
        callCount++;
        if (callCount === 1) {
          return { success: false, error: 'TypeError: undefined method getProfile' };
        }
        return { success: true };
      };

      const repairFn = async (_err, _attempt) => {
        return true;
      };

      const result = await guardrails.executeWithSelfHealing(runFn, repairFn, 3, planningDir);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.repaired, true);
      assert.strictEqual(result.attempts, 2);

      const patterns = antiPatternStore.queryAntiPatterns(planningDir);
      assert.strictEqual(patterns.length, 1);
      assert.ok(patterns[0].error.includes('getProfile'));
      assert.ok(patterns[0].lesson.includes('Self-healing repaired error'));
    } finally {
      cleanup(tmpDir);
    }
  });

  test('queries anti-patterns using case-insensitive errorQuery filter', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-ap-errquery-'));
    try {
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });

      antiPatternStore.recordAntiPattern(planningDir, {
        file: 'src/db.ts',
        rule: 'QUERY_TIMEOUT',
        error: 'Fatal connection pool exhausted on port 5432',
        lesson: 'Increase pool size or recycle connections',
      });

      antiPatternStore.recordAntiPattern(planningDir, {
        file: 'src/api.ts',
        rule: 'SYNTAX_ERROR',
        error: 'Unexpected token < in JSON at position 0',
        lesson: 'Validate response content-type before JSON.parse',
      });

      const poolResults = antiPatternStore.queryAntiPatterns(planningDir, { errorQuery: 'CONNECTION POOL' });
      assert.strictEqual(poolResults.length, 1);
      assert.strictEqual(poolResults[0].file, 'src/db.ts');

      const jsonResults = antiPatternStore.queryAntiPatterns(planningDir, { errorQuery: 'json' });
      assert.strictEqual(jsonResults.length, 1);
      assert.strictEqual(jsonResults[0].file, 'src/api.ts');

      const noneResults = antiPatternStore.queryAntiPatterns(planningDir, { errorQuery: 'nonexistent error' });
      assert.strictEqual(noneResults.length, 0);
    } finally {
      cleanup(tmpDir);
    }
  });
});
