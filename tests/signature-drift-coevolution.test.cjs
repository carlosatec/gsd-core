/**
 * Tests for Signature Drift & Active Co-Evolution (Wave 2 / Wave 6)
 * - Detects signature changes on exported symbols with dependents
 * - Emits action: 'CO_EVOLVE_CALLERS' without blocking valid refactorings
 */

'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { cleanup } = require('./helpers.cjs');
const guardrails = require('../gsd-core/bin/lib/preflight-guardrails.cjs');
const codebaseAst = require('../gsd-core/bin/lib/codebase-ast-analyzer.cjs');
const { runPreFlightChecks } = guardrails;
const { buildCodebaseGraph, saveCodebaseGraph } = codebaseAst;

describe('Active Co-Evolution — Signature Drift Guardrails', () => {
  test('detects signature drift and generates CO_EVOLVE_CALLERS payload without blocking', () => {
    const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'sig-drift-test-'));

    try {
      const srcDir = path.join(tmpProject, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      // Provider file: auth.ts
      const authFile = path.join(srcDir, 'auth.ts');
      fs.writeFileSync(
        authFile,
        `
        export function login(username: string): boolean {
          return true;
        }
        `
      );

      // Caller file: app.ts
      const appFile = path.join(srcDir, 'app.ts');
      fs.writeFileSync(
        appFile,
        `
        import { login } from './auth';
        export function start() {
          return login('alice');
        }
        `
      );

      const planningDir = path.join(tmpProject, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });

      const graph = buildCodebaseGraph(tmpProject);
      saveCodebaseGraph(planningDir, graph);

      // Proposed modification to auth.ts changing arity/signature of login
      const report = runPreFlightChecks({
        taskId: 'refactor-auth',
        filesToModify: ['src/auth.ts'],
        proposedCodeMap: {
          'src/auth.ts': `
            export function login(username: string, token: string, rememberMe?: boolean): boolean {
              return true;
            }
          `,
        },
        planningDir,
        rootDir: tmpProject,
      });

      // Non-blocking: valid is still true because signature drift is a warning
      assert.strictEqual(report.valid, true, 'Report must be valid (non-blocking warning)');

      // Violation check
      const driftViolation = report.violations.find(v => v.rule === 'SIGNATURE_DRIFT');
      assert.ok(driftViolation, 'Must emit SIGNATURE_DRIFT violation');
      assert.strictEqual(driftViolation.severity, 'warning');
      assert.ok(driftViolation.message.includes('login'));

      // Co-evolution warning payload check
      assert.ok(Array.isArray(report.coEvolutionWarnings), 'Must contain coEvolutionWarnings array');
      const coEvolve = report.coEvolutionWarnings.find(w => w.symbolName === 'login');
      assert.ok(coEvolve, 'Must contain co-evolution warning for login');
      assert.strictEqual(coEvolve.action, 'CO_EVOLVE_CALLERS');
      assert.ok(coEvolve.callers.includes('src/app.ts'), 'Must identify src/app.ts as caller needing co-evolution');
    } finally {
      cleanup(tmpProject);
    }
  });
});
