const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { createTempDir, cleanup, runGsdTools } = require('./helpers.cjs');
const { splitLines } = require('../gsd-core/bin/lib/text-lines.cjs');
const continuousMemory = require('../gsd-core/bin/lib/continuous-memory.cjs');
const codebaseAst = require('../gsd-core/bin/lib/codebase-ast-analyzer.cjs');
const systemOne = require('../gsd-core/bin/lib/system-one-engine.cjs');
const jitContext = require('../gsd-core/bin/lib/jit-context-injector.cjs');

test('Phase 37 Wave 1: Telemetry CLI multi-file parser & genuine relevance', async (t) => {
  await t.test('parses space-separated files in telemetry record CLI', () => {
    const tmp = createTempDir('gsd-p37-w1-');
    try {
      const out = runGsdTools(['telemetry', 'record', '--command', 'test', '--phase', '37', '--from-files', 'fileA.ts', 'fileB.ts', 'fileC.ts'], tmp);
      assert.equal(out.exitCode, 0);
      const parsed = JSON.parse(out.output);
      assert.deepEqual(parsed.targetFiles, ['fileA.ts', 'fileB.ts', 'fileC.ts']);
    } finally {
      cleanup(tmp);
    }
  });

  await t.test('parses mixed comma and space separated files', () => {
    const tmp = createTempDir('gsd-p37-w1-');
    try {
      const out = runGsdTools(['telemetry', 'record', '--command', 'test', '--from-files', 'mod1.ts,mod2.ts', 'mod3.ts'], tmp);
      assert.equal(out.exitCode, 0);
      const parsed = JSON.parse(out.output);
      assert.deepEqual(parsed.targetFiles, ['mod1.ts', 'mod2.ts', 'mod3.ts']);
    } finally {
      cleanup(tmp);
    }
  });

  await t.test('emits calculated BM25 or undefined relevance instead of hardcoded 95.0', () => {
    const tmp = createTempDir('gsd-p37-w1-');
    try {
      fs.mkdirSync(path.join(tmp, '.planning'), { recursive: true });
      fs.writeFileSync(path.join(tmp, 'app.ts'), 'export const app = 1;\n', 'utf8');

      // Assemble context for isolated file without graph neighbors
      const ctx = jitContext.assembleJitContext({
        targetFiles: ['app.ts'],
        planningDir: path.join(tmp, '.planning'),
        rootDir: tmp,
        query: 'database sql query',
      });

      // Query has no terms overlapping with app.ts, relevance score should be 0 or undefined, not 95.0
      assert.notEqual(ctx.relevanceScore, 95.0);
    } finally {
      cleanup(tmp);
    }
  });
});

test('Phase 37 Wave 2: Architectural Decision to Continuous Memory Bridge & Cognitive Guard', async (t) => {
  await t.test('syncDecisionsToMemory extracts decisions idempotently with permanent: true', () => {
    const tmp = createTempDir('gsd-p37-w2-');
    try {
      const planning = path.join(tmp, '.planning');
      fs.mkdirSync(planning, { recursive: true });
      const sampleState = [
        '# State',
        '## Decisions',
        '- **D-01 [Architecture]:** Analisador AST nativo em TypeScript sem dependência de Python ou compiladores externos.',
        '- **D-168 [Modular State Lock Subsystem]:** Decomposição do subsistema de locks cooperativos de `src/state.cts` em módulo dedicado `src/state-lock.cts`.',
      ].join('\n');
      fs.writeFileSync(path.join(planning, 'STATE.md'), sampleState, 'utf8');

      const firstSync = continuousMemory.syncDecisionsToMemory(planning, tmp);
      assert.equal(firstSync.total, 2);
      assert.equal(firstSync.synced, 2);

      // Verify stored entries in memory/decisions.jsonl
      const memFile = path.join(planning, 'memory', 'decisions.jsonl');
      assert.ok(fs.existsSync(memFile));
      const raw = fs.readFileSync(memFile, 'utf8');
      const lines = splitLines(raw).filter(Boolean);
      assert.equal(lines.length, 2);

      const d168 = JSON.parse(lines.find((l) => l.includes('D-168')));
      assert.equal(d168.id, 'D-168');
      assert.equal(d168.category, 'architecture_decision');
      assert.equal(d168.permanent, true);
      assert.ok(d168.relevantFiles.includes('src/state.cts'));
      assert.ok(d168.relevantFiles.includes('src/state-lock.cts'));

      // Idempotency: second run should sync 0 new items
      const secondSync = continuousMemory.syncDecisionsToMemory(planning, tmp);
      assert.equal(secondSync.synced, 0);
      assert.equal(secondSync.total, 2);
    } finally {
      cleanup(tmp);
    }
  });

  await t.test('queryMemory prioritizes permanent decisions without temporal decay', () => {
    const tmp = createTempDir('gsd-p37-w2-');
    try {
      const planning = path.join(tmp, '.planning');
      fs.mkdirSync(path.join(planning, 'memory'), { recursive: true });

      // Record a 90-day-old architectural decision and a recent transient memory
      const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
      const decEntry = {
        id: 'D-999',
        timestamp: ninetyDaysAgo,
        category: 'architecture_decision',
        summary: 'State lock concurrency invariants',
        relevantFiles: ['src/state-lock.cts'],
        keywords: ['state', 'lock', 'concurrency'],
        permanent: true,
      };
      fs.writeFileSync(
        path.join(planning, 'memory', 'decisions.jsonl'),
        JSON.stringify(decEntry) + '\n',
        'utf8'
      );

      const results = continuousMemory.queryMemory(tmp, 'state lock invariants', {
        files: ['src/state-lock.cts'],
        limit: 5,
      });

      assert.ok(results.length > 0);
      assert.equal(results[0].id, 'D-999');
    } finally {
      cleanup(tmp);
    }
  });

  await t.test('ArchitectureHead flags modules governed by active decisions', () => {
    const tmp = createTempDir('gsd-p37-w2-');
    try {
      const planning = path.join(tmp, '.planning');
      fs.mkdirSync(path.join(planning, 'memory'), { recursive: true });
      const dec = {
        id: 'D-168',
        timestamp: Date.now(),
        category: 'architecture_decision',
        summary: 'Lock facade invariant in state-lock.cts',
        relevantFiles: ['src/state-lock.cts'],
        keywords: ['state-lock', 'facade'],
        permanent: true,
      };
      fs.writeFileSync(path.join(planning, 'memory', 'decisions.jsonl'), JSON.stringify(dec) + '\n', 'utf8');

      const head = new systemOne.ArchitectureHead();
      const mockGraph = {
        version: '2.1.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        root: tmp,
        stats: { totalFiles: 1, totalSymbols: 1, totalExports: 1, totalRoutes: 0, scanDurationMs: 1 },
        files: {
          'src/state-lock.cts': {
            filePath: 'src/state-lock.cts',
            imports: [],
            exports: [{ name: 'withStateLock', kind: 'function', isTypeOnly: false }],
            symbols: [],
            routes: [],
            linesCount: 50,
          },
        },
        symbolIndex: {},
        reverseDependencies: {},
        pageRankScores: { 'src/state-lock.cts': 0.005 },
        routes: [],
      };

      const report = head.evaluate(
        'src/state-lock.cts',
        mockGraph,
        { rootDir: tmp, planningDir: planning }
      );

      assert.ok(report);
      assert.ok(report.reason.includes('D-168'));
      assert.equal(report.score, 2);
    } finally {
      cleanup(tmp);
    }
  });
});

test('Phase 37 Wave 3: Unified Knowledge Graph AST v2.1 & Semantic Edge Typing', async (t) => {
  await t.test('classifies inline import { type Foo } as type_only edge', () => {
    const tmp = createTempDir('gsd-p37-w3-');
    try {
      fs.writeFileSync(path.join(tmp, 'types.ts'), 'export interface Config { timeout: number; }\n', 'utf8');
      fs.writeFileSync(path.join(tmp, 'consumer.ts'), 'import { type Config } from "./types";\nexport const x = 1;\n', 'utf8');

      const graph = codebaseAst.buildCodebaseGraph(tmp);
      const consumerNode = graph.files['consumer.ts'];
      assert.ok(consumerNode);
      assert.ok(consumerNode.dependencyKinds);
      assert.equal(consumerNode.dependencyKinds['./types'], 'type_only');
    } finally {
      cleanup(tmp);
    }
  });

  await t.test('excludes tests, scripts, and dotfiles from isOrphan dead code classification', () => {
    const tmp = createTempDir('gsd-p37-w3-');
    try {
      fs.mkdirSync(path.join(tmp, 'tests'), { recursive: true });
      fs.mkdirSync(path.join(tmp, 'scripts'), { recursive: true });

      fs.writeFileSync(path.join(tmp, 'tests', 'unit.test.ts'), 'export const testVal = 1;\n', 'utf8');
      fs.writeFileSync(path.join(tmp, 'scripts', 'deploy.ts'), 'export const deployVal = 2;\n', 'utf8');
      fs.writeFileSync(path.join(tmp, 'dead-code.ts'), 'export const deadVal = 3;\n', 'utf8');

      const graph = codebaseAst.buildCodebaseGraph(tmp);
      assert.equal(graph.files['tests/unit.test.ts'].isOrphan, false);
      assert.equal(graph.files['scripts/deploy.ts'].isOrphan, false);
      assert.equal(graph.files['dead-code.ts'].isOrphan, true);
    } finally {
      cleanup(tmp);
    }
  });

  await t.test('indexes knowledgeNodes (decisions & phases) into CodebaseGraph v2.1', () => {
    const tmp = createTempDir('gsd-p37-w3-');
    try {
      const planning = path.join(tmp, '.planning');
      fs.mkdirSync(path.join(planning, 'phases', '01-foundation'), { recursive: true });
      fs.writeFileSync(path.join(planning, 'STATE.md'), '- **D-01 [Architecture]:** Native AST Engine\n', 'utf8');
      fs.writeFileSync(path.join(planning, 'phases', '01-foundation', '01-01-PLAN.md'), '# Plan 1\n', 'utf8');

      const graph = codebaseAst.buildCodebaseGraph(tmp);
      assert.equal(graph.version, '2.1.0');
      assert.ok(graph.knowledgeNodes);
      assert.ok(graph.knowledgeNodes.decisions);
      assert.ok(graph.knowledgeNodes.decisions['D-01']);
      assert.equal(graph.knowledgeNodes.decisions['D-01'].category, 'Architecture');
      assert.ok(graph.knowledgeNodes.phases);
      assert.ok(graph.knowledgeNodes.phases['01-foundation']);
      assert.ok(graph.stats.totalKnowledgeNodes >= 2);
    } finally {
      cleanup(tmp);
    }
  });
});
