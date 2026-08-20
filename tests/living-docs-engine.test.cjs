/**
 * Tests for living-docs-engine — auto-synchronization and verification against AST code.
 */

'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { cleanup } = require('./helpers.cjs');
const livingDocs = require('../gsd-core/bin/lib/living-docs-engine.cjs');
const {
  generateArchitectureDoc,
  generateApiSurfaceDoc,
  syncLivingDocs,
  verifyDocsAgainstCode,
} = livingDocs;

describe('living-docs-engine — Documentation Generators', () => {
  test('generates valid Markdown architecture doc from graph', () => {
    const mockGraph = {
      version: '2.0.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      root: '/fake/root',
      stats: {
        totalFiles: 2,
        totalSymbols: 5,
        totalExports: 3,
        totalRoutes: 1,
        scanDurationMs: 20,
      },
      files: {
        'src/auth.ts': {
          filePath: 'src/auth.ts',
          imports: [],
          exports: [{ name: 'login', kind: 'function', isTypeOnly: false }],
          symbols: [{ name: 'login', kind: 'function', line: 10, exported: true }],
          routes: [],
          externalDeps: [],
          localDeps: [],
          linesCount: 40,
        },
        'src/server.ts': {
          filePath: 'src/server.ts',
          imports: [],
          exports: [{ name: 'startServer', kind: 'function', isTypeOnly: false }],
          symbols: [{ name: 'startServer', kind: 'function', line: 5, exported: true }],
          routes: [{ method: 'GET', path: '/health', line: 15 }],
          externalDeps: ['express'],
          localDeps: ['./auth'],
          linesCount: 60,
        },
      },
      symbolIndex: {},
      reverseDependencies: {},
      routes: [{ method: 'GET', path: '/health', line: 15 }],
    };

    const doc = generateArchitectureDoc(mockGraph);
    assert.ok(doc.includes('# Codebase Architecture & Topology (Living Document)'));
    assert.ok(doc.includes('`/health`'));
    assert.ok(doc.includes('`src/auth.ts`'));
    assert.ok(doc.includes('`login`'));
  });

  test('generates API surface document with interfaces and classes', () => {
    const mockGraph = {
      version: '2.0.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      root: '/fake/root',
      stats: { totalFiles: 1, totalSymbols: 2, totalExports: 2, totalRoutes: 0, scanDurationMs: 10 },
      files: {
        'src/types.ts': {
          filePath: 'src/types.ts',
          imports: [],
          exports: [{ name: 'UserProfile', kind: 'interface', isTypeOnly: true }],
          symbols: [{ name: 'UserProfile', kind: 'interface', line: 12, exported: true, isTypeOnly: true }],
          routes: [],
          externalDeps: [],
          localDeps: [],
          linesCount: 20,
        },
      },
      symbolIndex: {},
      reverseDependencies: {},
      routes: [],
    };

    const doc = generateApiSurfaceDoc(mockGraph);
    assert.ok(doc.includes('### `src/types.ts`'));
    assert.ok(doc.includes('`UserProfile`'));
    assert.ok(doc.includes('`interface`'));
  });
});

describe('living-docs-engine — syncLivingDocs & verifyDocsAgainstCode', () => {
  test('syncs living docs and validates agreement with source code', () => {
    const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'living-docs-test-'));

    try {
      const srcDir = path.join(tmpProject, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      const serviceFile = path.join(srcDir, 'payment.ts');
      fs.writeFileSync(
        serviceFile,
        `
        export interface PaymentRequest {
          amount: number;
        }
        export function processPayment(req: PaymentRequest): boolean {
          return true;
        }
      `
      );

      const planningDir = path.join(tmpProject, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });

      // Run sync
      const report = syncLivingDocs(planningDir, tmpProject);
      assert.strictEqual(report.totalFiles, 1);
      assert.ok(fs.existsSync(path.join(planningDir, 'intel', 'codebase-graph.json')));
      assert.ok(fs.existsSync(path.join(planningDir, 'codebase', 'ARCHITECTURE.md')));
      assert.ok(fs.existsSync(path.join(planningDir, 'codebase', 'APIS.md')));

      // Run verify - should be 100% valid
      const verification = verifyDocsAgainstCode(planningDir, tmpProject);
      assert.strictEqual(verification.valid, true);
      assert.strictEqual(verification.discrepancies.length, 0);

      // Mutate code by removing processPayment export
      fs.writeFileSync(
        serviceFile,
        `
        export interface PaymentRequest {
          amount: number;
        }
      `
      );

      // Verify again - should catch discrepancy
      const failedVerify = verifyDocsAgainstCode(planningDir, tmpProject);
      assert.strictEqual(failedVerify.valid, false);
      assert.ok(failedVerify.discrepancies.some(d => d.type === 'missing_symbol' && d.detail.includes('processPayment')));
    } finally {
      cleanup(tmpProject);
    }
  });
});
