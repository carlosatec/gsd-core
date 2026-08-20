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
    } finally {
      cleanup(tmpProject);
    }
  });
});
