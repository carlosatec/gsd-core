/**
 * Tests for preflight-guardrails — contract break prevention and self-healing loop.
 */

'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const guardrails = require('../gsd-core/bin/lib/preflight-guardrails.cjs');
const { runPreFlightChecks, executeWithSelfHealing } = guardrails;

describe('preflight-guardrails', () => {
  test('detects contract break when an imported export is removed from proposed code', () => {
    const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-test-'));

    try {
      const srcDir = path.join(tmpProject, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      const fileA = path.join(srcDir, 'auth.ts');
      fs.writeFileSync(
        fileA,
        `
        export function login() { return true; }
        export function logout() { return true; }
      `
      );

      const fileB = path.join(srcDir, 'app.ts');
      fs.writeFileSync(
        fileB,
        `
        import { login } from './auth';
        export function start() { login(); }
      `
      );

      const planningDir = path.join(tmpProject, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });

      // Proposed edit to auth.ts that deletes login (which app.ts depends on)
      const report = runPreFlightChecks({
        taskId: 'task-01',
        filesToModify: ['src/auth.ts'],
        proposedCodeMap: {
          'src/auth.ts': `export function logout() { return true; }`,
        },
        planningDir,
        rootDir: tmpProject,
      });

      assert.strictEqual(report.valid, false);
      assert.ok(report.violations.some(v => v.rule === 'CONTRACT_BREAK' && v.message.includes('login')));
    } finally {
      fs.rmSync(tmpProject, { recursive: true, force: true });
    }
  });

  test('self-healing loop repairs transient error on second attempt', async () => {
    let callCount = 0;
    let codeFixed = false;

    const runFn = async () => {
      callCount++;
      if (codeFixed) {
        return { success: true };
      }
      return { success: false, error: 'SyntaxError on line 10' };
    };

    const repairFn = async (err, attempt) => {
      if (attempt === 1) {
        codeFixed = true; // simulate fix
        return true;
      }
      return false;
    };

    const result = await executeWithSelfHealing(runFn, repairFn, 3);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.attempts, 2);
    assert.strictEqual(result.repaired, true);
  });
});
