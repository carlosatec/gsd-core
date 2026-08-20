'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { cleanup } = require('./helpers.cjs');
const semanticRag = require('../gsd-core/bin/lib/hybrid-semantic-rag.cjs');
const jitInjector = require('../gsd-core/bin/lib/jit-context-injector.cjs');

describe('Wave 3: Hybrid Semantic RAG & Context Elasticity', () => {
  test('builds semantic index and accurately retrieves relevant files by concept', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-rag-test-'));
    try {
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });

      fs.writeFileSync(
        path.join(tmpDir, 'auth.ts'),
        'export function verifyJwtToken(token: string) { return "jwt payload"; }\n'
      );

      fs.writeFileSync(
        path.join(tmpDir, 'db.ts'),
        'export function connectPostgres(poolSize: number) { return "sql pool"; }\n'
      );

      fs.writeFileSync(
        path.join(tmpDir, 'billing.ts'),
        'export function chargeStripeCustomer(amount: number) { return "stripe receipt"; }\n'
      );

      const index = semanticRag.buildSemanticIndex(tmpDir, planningDir);
      assert.strictEqual(index.totalDocs, 3);

      const stripeResults = semanticRag.querySemanticSimilarFiles('stripe payment checkout receipt', planningDir, tmpDir, 2);
      assert.ok(stripeResults.length >= 1);
      assert.strictEqual(stripeResults[0].file, 'billing.ts');

      const authResults = semanticRag.querySemanticSimilarFiles('authenticate jwt token verification', planningDir, tmpDir, 2);
      assert.ok(authResults.length >= 1);
      assert.strictEqual(authResults[0].file, 'auth.ts');

      assert.ok(fs.existsSync(path.join(planningDir, 'intel', 'semantic-index.json')));
    } finally {
      cleanup(tmpDir);
    }
  });

  test('JIT context injector expands token budget for quality profile and injects RAG hits', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-rag-jit-'));
    try {
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });

      fs.writeFileSync(path.join(tmpDir, 'target.ts'), 'export const target = 1;\n');
      fs.writeFileSync(path.join(tmpDir, 'crypto.ts'), 'export function encryptAesGcmPayload() { return "secret"; }\n');

      const pkg = jitInjector.assembleJitContext({
        targetFiles: ['target.ts'],
        planningDir,
        rootDir: tmpDir,
        modelProfile: 'quality',
        query: 'encrypt AES encryption cipher',
      });

      assert.ok(pkg.markdownBlock.includes('crypto.ts'), 'Markdown block should contain semantically retrieved crypto.ts');
      assert.ok(pkg.markdownBlock.includes('#### Semantically Related Modules:'));
    } finally {
      cleanup(tmpDir);
    }
  });
});
