/**
 * Tests for codebase-ast-analyzer — native AST symbol and topology engine.
 */

'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { cleanup } = require('./helpers.cjs');
const codebaseAst = require('../gsd-core/bin/lib/codebase-ast-analyzer.cjs');
const {
  analyzeSourceFile,
  buildCodebaseGraph,
  querySymbolLocations,
  queryFileDependencies,
  saveCodebaseGraph,
  loadCodebaseGraph,
} = codebaseAst;

describe('codebase-ast-analyzer — analyzeSourceFile', () => {
  test('extracts imports, exports, functions, classes and interfaces from TypeScript code', () => {
    const code = `
      import fs from 'node:fs';
      import { resolve, join as pathJoin } from 'path';
      import type { UserConfig } from './config-types.js';
      import express from 'express';

      export interface SessionData {
        id: string;
        user: string;
      }

      export type Status = 'active' | 'inactive';

      export class AuthService {
        private token: string;
        constructor() {
          this.token = '';
        }
      }

      export function authenticateUser(username: string): boolean {
        return true;
      }

      const helperVar = 42;
      export const API_VERSION = '2.0.0';
    `;

    const result = analyzeSourceFile('dummy.ts', code);

    assert.strictEqual(result.filePath, 'dummy.ts');
    assert.strictEqual(result.imports.length, 4);

    // Verify external and local dependencies
    assert.ok(result.externalDeps.includes('express'), 'must identify express as external');
    assert.ok(result.localDeps.includes('./config-types.js'), 'must identify local dependency');

    // Verify symbols
    const symbolNames = result.symbols.map(s => s.name);
    assert.ok(symbolNames.includes('SessionData'), 'must find SessionData interface');
    assert.ok(symbolNames.includes('Status'), 'must find Status type');
    assert.ok(symbolNames.includes('AuthService'), 'must find AuthService class');
    assert.ok(symbolNames.includes('authenticateUser'), 'must find authenticateUser function');
    assert.ok(symbolNames.includes('API_VERSION'), 'must find API_VERSION const');

    // Verify exported symbols
    const exportNames = result.exports.map(e => e.name);
    assert.ok(exportNames.includes('SessionData'));
    assert.ok(exportNames.includes('AuthService'));
    assert.ok(exportNames.includes('authenticateUser'));
    assert.ok(exportNames.includes('API_VERSION'));
  });

  test('extracts HTTP route definitions', () => {
    const code = `
      const express = require('express');
      const app = express();

      app.get('/api/users', (req, res) => res.json([]));
      app.post('/api/users', (req, res) => res.status(201).end());
      app.delete('/api/users/:id', (req, res) => res.status(204).end());
    `;

    const result = analyzeSourceFile('server.js', code);
    assert.strictEqual(result.routes.length, 3);
    assert.strictEqual(result.routes[0].method, 'GET');
    assert.strictEqual(result.routes[0].path, '/api/users');
    assert.strictEqual(result.routes[1].method, 'POST');
    assert.strictEqual(result.routes[2].method, 'DELETE');
  });

  test('handles empty or whitespace-only files gracefully', () => {
    const result = analyzeSourceFile('empty.ts', '   \n  \n');
    assert.strictEqual(result.symbols.length, 0);
    assert.strictEqual(result.imports.length, 0);
    assert.strictEqual(result.exports.length, 0);
  });
});

describe('codebase-ast-analyzer — buildCodebaseGraph & Queries', () => {
  test('builds graph over a directory and calculates reverse dependencies', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ast-graph-test-'));

    try {
      const fileA = path.join(tmpDir, 'serviceA.ts');
      const fileB = path.join(tmpDir, 'serviceB.ts');

      fs.writeFileSync(
        fileA,
        `
        export function computeA() { return 1; }
      `
      );

      fs.writeFileSync(
        fileB,
        `
        import { computeA } from './serviceA';
        export function computeB() { return computeA() + 1; }
      `
      );

      const graph = buildCodebaseGraph(tmpDir);

      assert.strictEqual(graph.stats.totalFiles, 2);
      assert.ok(graph.symbolIndex['computeA'], 'must index computeA symbol');
      assert.ok(graph.symbolIndex['computeB'], 'must index computeB symbol');

      // Query symbol
      const locs = querySymbolLocations(graph, 'computeA');
      assert.strictEqual(locs.length, 1);
      assert.strictEqual(locs[0].symbol.name, 'computeA');

      // Query file dependencies
      const depsB = queryFileDependencies(graph, 'serviceB.ts');
      assert.ok(depsB.imports.includes('./serviceA'), 'serviceB must list serviceA in imports');

      const depsA = queryFileDependencies(graph, 'serviceA.ts');
      assert.ok(depsA.importedBy.includes('serviceB.ts'), 'serviceA must be importedBy serviceB.ts');
    } finally {
      cleanup(tmpDir);
    }
  });

  test('saves and loads codebase graph to planning directory', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ast-persist-test-'));

    try {
      const graph = {
        version: '2.0.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        root: tmpDir,
        stats: { totalFiles: 1, totalSymbols: 2, totalExports: 1, totalRoutes: 0, scanDurationMs: 15 },
        files: {},
        symbolIndex: { myFunc: ['foo.ts'] },
        reverseDependencies: {},
        routes: [],
      };

      const savedPath = saveCodebaseGraph(tmpDir, graph);
      assert.ok(fs.existsSync(savedPath), 'file must be written');

      const loaded = loadCodebaseGraph(tmpDir);
      assert.ok(loaded, 'must load graph');
      assert.strictEqual(loaded.version, '2.0.0');
      assert.deepStrictEqual(loaded.symbolIndex, { myFunc: ['foo.ts'] });
    } finally {
      cleanup(tmpDir);
    }
  });
});
