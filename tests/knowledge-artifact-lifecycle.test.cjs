const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { inspectArtifactLifecycle, ARTIFACT_LIFECYCLE } = require('../gsd-core/bin/lib/artifact-lifecycle.cjs');
const { buildCodebaseGraph, saveCodebaseGraph } = require('../gsd-core/bin/lib/codebase-ast-analyzer.cjs');
const { assembleJitContext } = require('../gsd-core/bin/lib/jit-context-injector.cjs');
const { loadCodebaseGraph, computeCodebaseContentFingerprint } = require('../gsd-core/bin/lib/codebase-ast-analyzer.cjs');

test('lifecycle registry describes ownership, trigger, freshness, refresh, and retention policy', () => {
  for (const id of ['project-state', 'phase-plans', 'codebase-graph', 'semantic-index', 'telemetry', 'living-docs', 'memory', 'codebase-map', 'vault-visual-exports', 'temporary-workflow']) {
    const entry = ARTIFACT_LIFECYCLE.find(item => item.id === id);
    assert.ok(entry, `missing lifecycle entry ${id}`);
    for (const field of ['owner', 'trigger', 'freshness', 'refresh', 'retention', 'class']) assert.ok(entry[field], `${id} missing ${field}`);
  }
  assert.equal(ARTIFACT_LIFECYCLE.find(item => item.id === 'codebase-graph').path, '.planning/intel/codebase-graph.json');
});

test('read-only inspection marks same-size same-mtime source edits stale and preserves user knowledge', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-lifecycle-'));
  const planning = path.join(root, '.planning');
  try {
    fs.mkdirSync(path.join(planning, 'intel'), { recursive: true });
    fs.mkdirSync(path.join(planning, 'memory'), { recursive: true });
    fs.writeFileSync(path.join(planning, 'STATE.md'), 'state');
    fs.writeFileSync(path.join(planning, 'ROADMAP.md'), 'roadmap');
    fs.writeFileSync(path.join(planning, 'memory', 'decisions.jsonl'), '{"user":"keep"}\n');
    const source = path.join(root, 'sample.ts');
    fs.writeFileSync(source, 'export const alpha = 1;\n');
    const graph = buildCodebaseGraph(root);
    saveCodebaseGraph(planning, graph);
    const initial = inspectArtifactLifecycle(planning, root);
    assert.equal(initial.find(item => item.id === 'codebase-graph').status, 'current');
    const before = fs.statSync(source);
    fs.writeFileSync(source, 'export const bravo = 1;\n');
    fs.utimesSync(source, before.atime, before.mtime);
    const after = inspectArtifactLifecycle(planning, root);
    assert.equal(after.find(item => item.id === 'codebase-graph').status, 'stale');
    assert.equal(after.find(item => item.id === 'memory').status, 'present');
    assert.equal(fs.readFileSync(path.join(planning, 'memory', 'decisions.jsonl'), 'utf8'), '{"user":"keep"}\n');
    assert.equal(after.find(item => item.id === 'codebase-map').status, 'not generated');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('JIT rebuilds a stale graph before consuming its dependency signals', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-jit-graph-freshness-'));
  const planning = path.join(root, '.planning');
  fs.mkdirSync(planning, { recursive: true });
  const source = path.join(root, 'src.ts');
  fs.writeFileSync(source, 'export const alpha = 1;\n');
  try {
    saveCodebaseGraph(planning, buildCodebaseGraph(root));
    const before = fs.statSync(source);
    fs.writeFileSync(source, 'export const bravo = 1;\n');
    fs.utimesSync(source, before.atime, before.mtime);
    assembleJitContext({ targetFiles: ['src.ts'], planningDir: planning, rootDir: root, maxTokens: 300 });
    const refreshed = loadCodebaseGraph(planning);
    assert.equal(refreshed.stats.contentFingerprint, computeCodebaseContentFingerprint(root));
    assert.ok(refreshed.files['src.ts'].symbols.some(symbol => symbol.name === 'bravo'));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

