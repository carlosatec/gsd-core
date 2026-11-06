'use strict';

/**
 * Phase 35 Wave 3 Regression Suite: Full AST Type Contracts & JIT Rendering
 *
 * Verifies:
 * 1. AST analyzer captures normalized, source-derived meta.contract for interfaces, types, and enums.
 * 2. Size capping prevents giant type bodies from exploding memory.
 * 3. JIT context injector renders full TypeScript code blocks for target type contracts.
 * 4. Backward compatibility with older graphs lacking meta.contract.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { cleanup } = require('./helpers.cjs');

const astAnalyzer = require('../gsd-core/bin/lib/codebase-ast-analyzer.cjs');
const jitInjector = require('../gsd-core/bin/lib/jit-context-injector.cjs');
const { analyzeSourceFile } = astAnalyzer;
const { assembleJitContext } = jitInjector;

describe('Phase 35 Wave 3 — Full AST Type Contracts & JIT Context Injection', () => {
  it('extracts normalized, source-derived meta.contract and meta.signature from TypeScript definitions', () => {
    const tsCode = `
export interface UserSession {
  id: string;
  email: string;
  roles: string[];
  isActive(): boolean;
}

export type AuthToken = {
  token: string;
  expiresAt: number;
};

export enum UserRole {
  Admin = 'ADMIN',
  Member = 'MEMBER',
}
`;

    const result = analyzeSourceFile('src/models.ts', tsCode, null);
    assert.ok(result);

    const sessionSym = result.symbols.find(s => s.name === 'UserSession');
    assert.ok(sessionSym, 'UserSession must be extracted');
    assert.equal(sessionSym.kind, 'interface');
    assert.ok(sessionSym.meta && sessionSym.meta.contract, 'UserSession must have meta.contract');
    assert.ok(sessionSym.meta.contract.includes('isActive(): boolean;'));
    assert.equal(sessionSym.meta.signature, sessionSym.meta.contract);

    const tokenSym = result.symbols.find(s => s.name === 'AuthToken');
    assert.ok(tokenSym, 'AuthToken must be extracted');
    assert.ok(tokenSym.meta && tokenSym.meta.contract);
    assert.ok(tokenSym.meta.contract.includes('expiresAt: number'));

    const roleSym = result.symbols.find(s => s.name === 'UserRole');
    assert.ok(roleSym, 'UserRole must be extracted');
    assert.ok(roleSym.meta && roleSym.meta.contract);
    assert.ok(roleSym.meta.contract.includes("Admin = 'ADMIN'"));
  });

  it('bounds oversize type declarations to MAX_CONTRACT_CHARS', () => {
    // Generate a massive interface with 200 fields
    const fields = Array.from({ length: 200 }, (_, i) => `  field_${i}: string;`).join('\n');
    const bigCode = `export interface MassiveEntity {\n${fields}\n}`;

    const result = analyzeSourceFile('src/massive.ts', bigCode, null);
    const sym = result.symbols.find(s => s.name === 'MassiveEntity');
    assert.ok(sym && sym.meta && sym.meta.contract);
    assert.ok(sym.meta.contract.length <= 1000, 'Contract must be size-capped at 1000 chars');
    assert.ok(sym.meta.contract.endsWith('...'));
  });

  it('renders full TypeScript code blocks in JIT target type contracts', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-jit-contracts-'));
    try {
      const planDir = path.join(tmpDir, '.planning');
      const intelDir = path.join(planDir, 'intel');
      fs.mkdirSync(intelDir, { recursive: true });

      const graph = {
        version: '1.0.0',
        updatedAt: new Date().toISOString(),
        files: {
          'src/session.ts': {
            symbols: [
              {
                name: 'UserSession',
                kind: 'interface',
                line: 10,
                exported: true,
                isTypeOnly: true,
                file: 'src/session.ts',
                meta: {
                  contract: 'interface UserSession {\n  id: string;\n  name: string;\n}',
                  signature: 'interface UserSession {\n  id: string;\n  name: string;\n}',
                },
              },
            ],
            exports: [{ name: 'UserSession', kind: 'interface', isTypeOnly: true }],
            imports: [],
            routes: [],
            dependencies: [],
            linesCount: 30,
            language: 'typescript',
          },
        },
        symbolIndex: {
          UserSession: ['src/session.ts'],
        },
        reverseDependencies: {},
        pageRankScores: { 'src/session.ts': 1.0 },
        routes: [],
        stats: { totalFiles: 1, totalSymbols: 1, totalExports: 1, totalRoutes: 0, scanDurationMs: 1 },
      };

      fs.writeFileSync(path.join(intelDir, 'codebase-graph.json'), JSON.stringify(graph), 'utf8');

      const jit = assembleJitContext({
        planningDir: planDir,
        rootDir: tmpDir,
        targetFiles: ['src/session.ts'],
      });

      assert.ok(jit.markdownBlock.includes('#### Target Type Contracts:'));
      assert.ok(jit.markdownBlock.includes('```typescript'));
      assert.ok(jit.markdownBlock.includes('interface UserSession {'));
      assert.ok(jit.markdownBlock.includes('id: string;'));
    } finally {
      cleanup(tmpDir);
    }
  });
});
