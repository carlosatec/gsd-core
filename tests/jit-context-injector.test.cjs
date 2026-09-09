/**
 * Tests for jit-context-injector — surgical context assembly.
 */

'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { cleanup } = require('./helpers.cjs');
const jitInjector = require('../gsd-core/bin/lib/jit-context-injector.cjs');
const { assembleJitContext, estimateTokens } = jitInjector;

describe('jit-context-injector', () => {
  test('estimateTokens calculates chars/4 correctly', () => {
    assert.strictEqual(estimateTokens('12345678'), 2);
    assert.strictEqual(estimateTokens(''), 0);
  });

  test('assembles surgical context for target file and extracts neighbors', () => {
    const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'jit-test-'));

    try {
      const srcDir = path.join(tmpProject, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      const fileA = path.join(srcDir, 'db.ts');
      fs.writeFileSync(
        fileA,
        `
        export interface DatabaseConfig { host: string; }
        export function connectDb(cfg: DatabaseConfig) { return true; }
      `
      );

      const fileB = path.join(srcDir, 'user-repo.ts');
      fs.writeFileSync(
        fileB,
        `
        import { connectDb, DatabaseConfig } from './db';
        export interface User { id: string; name: string; }
        export function findUser(id: string): User | null { return null; }
      `
      );

      const planningDir = path.join(tmpProject, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });
      fs.writeFileSync(
        path.join(planningDir, 'STATE.md'),
        `
        # State
        ## Decisions
        - **D-01 [Database]**: Use connection pool for all database operations.
      `
      );

      const result = assembleJitContext({
        targetFiles: ['src/user-repo.ts'],
        planningDir,
        rootDir: tmpProject,
        maxTokens: 1000,
      });

      assert.strictEqual(result.targetFiles[0], 'src/user-repo.ts');
      assert.ok(result.estimatedTokens > 0);
      assert.ok(result.markdownBlock.includes('<jit_context>'));
      assert.ok(result.markdownBlock.includes('src/user-repo.ts'));
      assert.ok(result.markdownBlock.includes('Active Architectural Decisions:'));
      assert.ok(result.markdownBlock.includes('D-01 [Database]'));
      assert.ok(result.markdownBlock.includes('User (interface'));

      // Test windowTier calibration
      const smallTier = assembleJitContext({
        targetFiles: ['src/user-repo.ts'],
        planningDir,
        rootDir: tmpProject,
        windowTier: 'small',
      });
      assert.ok(smallTier.estimatedTokens > 0);

      const largeTier = assembleJitContext({
        targetFiles: ['src/user-repo.ts'],
        planningDir,
        rootDir: tmpProject,
        windowTier: 'large',
      });
      assert.ok(largeTier.estimatedTokens > 0);

      const geminiModel = assembleJitContext({
        targetFiles: ['src/user-repo.ts'],
        planningDir,
        rootDir: tmpProject,
        modelName: 'gemini-1.5-pro',
      });
      assert.ok(geminiModel.estimatedTokens > 0);
    } finally {
      cleanup(tmpProject);
    }
  });

  test('ranks decisions by relevance to targetFiles and query over naive chronological order', () => {
    const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'jit-decisions-'));
    try {
      const srcDir = path.join(tmpProject, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, 'auth.ts'), 'export const auth = true;');

      const planningDir = path.join(tmpProject, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });
      fs.writeFileSync(
        path.join(planningDir, 'STATE.md'),
        `# State\n## Decisions\n- **D-01 [Database]**: Use connection pool for all database operations.\n- **D-02 [Cache]**: Use Redis for distributed session caching.\n- **D-03 [Logging]**: Standardize Winston JSON structured logging.\n- **D-04 [Metrics]**: Prometheus endpoint on port 9090.\n- **D-05 [Networking]**: Keep-alive HTTP agent timeout 30s.\n- **D-12 [Security / Auth]**: Require JWT Bearer tokens on all auth endpoints.\n`
      );

      const result = assembleJitContext({
        targetFiles: ['src/auth.ts'],
        planningDir,
        rootDir: tmpProject,
        maxDecisions: 2,
      });

      // D-12 matches "auth" from src/auth.ts and must be ranked first over D-01/D-02
      assert.strictEqual(result.applicableDecisions.length, 2);
      assert.ok(result.applicableDecisions[0].includes('D-12 [Security / Auth]'));
    } finally {
      cleanup(tmpProject);
    }
  });
});
