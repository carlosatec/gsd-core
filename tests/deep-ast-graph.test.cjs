'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { cleanup } = require('./helpers.cjs');
const codebaseAst = require('../gsd-core/bin/lib/codebase-ast-analyzer.cjs');
const { buildCodebaseGraph, saveCodebaseGraph, loadCodebaseGraph, queryTopCentralFiles } = codebaseAst;

describe('Wave 2: Deep Call-Graph & PageRank (Option A)', () => {
  test('calculates PageRank and gives higher centrality to heavily imported modules', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-pagerank-'));
    try {
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });

      // core.ts (imported by A and B)
      fs.writeFileSync(path.join(tmpDir, 'core.ts'), 'export function coreUtil() {}\n');

      // a.ts (imports core.ts)
      fs.writeFileSync(path.join(tmpDir, 'a.ts'), 'import { coreUtil } from "./core";\nexport function aFn() { coreUtil(); }\n');

      // b.ts (imports core.ts and a.ts)
      fs.writeFileSync(path.join(tmpDir, 'b.ts'), 'import { coreUtil } from "./core";\nimport { aFn } from "./a";\nexport function bFn() { aFn(); }\n');

      // leaf.ts (imports nothing)
      fs.writeFileSync(path.join(tmpDir, 'leaf.ts'), 'export const leaf = 1;\n');

      const graph = buildCodebaseGraph(tmpDir);

      assert.ok(graph.pageRankScores, 'Graph should contain pageRankScores');
      assert.ok(typeof graph.pageRankScores['core.ts'] === 'number', 'core.ts should have a numeric PageRank score');

      assert.ok(
        graph.pageRankScores['core.ts'] > graph.pageRankScores['leaf.ts'],
        `core.ts score (${graph.pageRankScores['core.ts']}) should exceed leaf.ts score (${graph.pageRankScores['leaf.ts']})`
      );

      const top = queryTopCentralFiles(graph, 2);
      assert.strictEqual(top.length, 2);
      assert.strictEqual(top[0].file, 'core.ts', 'core.ts should be ranked top central file');

      saveCodebaseGraph(planningDir, graph);
      const loaded = loadCodebaseGraph(planningDir);
      assert.ok(loaded, 'Saved graph should load successfully');
      assert.ok(loaded.pageRankScores['core.ts'] > 0, 'Loaded graph should preserve pageRankScores');
    } finally {
      cleanup(tmpDir);
    }
  });
});
