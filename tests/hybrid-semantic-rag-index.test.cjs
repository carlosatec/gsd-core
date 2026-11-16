'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const rag = require('../gsd-core/bin/lib/hybrid-semantic-rag.cjs');
const { cleanup } = require('./helpers.cjs');

test('versioned semantic index reconciles rename, deletion, and project-root changes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-rag-index-'));
  const otherRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-rag-other-'));
  const planning = path.join(root, '.planning');
  try {
    fs.writeFileSync(path.join(root, 'before.ts'), 'export function uniqueNeedle() { return "first"; }\n');
    fs.writeFileSync(path.join(root, 'remove.ts'), 'export function removedNeedle() { return "gone"; }\n');
    const first = rag.buildSemanticIndex(root, planning);
    const priorId = first.files['before.ts'].chunkIds[0];
    fs.renameSync(path.join(root, 'before.ts'), path.join(root, 'after.ts'));
    fs.rmSync(path.join(root, 'remove.ts'));
    const second = rag.buildSemanticIndex(root, planning);
    assert.ok(second.files['after.ts']);
    assert.ok(!second.files['before.ts']);
    assert.ok(!second.files['remove.ts']);
    assert.ok(!second.chunks[priorId]);

    fs.writeFileSync(path.join(otherRoot, 'isolated.py'), 'def other_root_marker(): return "different root"\n');
    const third = rag.buildSemanticIndex(otherRoot, planning);
    assert.equal(third.rootPath, path.resolve(otherRoot));
    assert.deepEqual(Object.keys(third.files), ['isolated.py']);
  } finally {
    cleanup(root);
    cleanup(otherRoot);
  }
});

test('corrupt and unsupported semantic indexes rebuild instead of being consumed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-rag-corrupt-'));
  const planning = path.join(root, '.planning');
  const indexPath = path.join(planning, 'intel', 'semantic-index.json');
  try {
    fs.writeFileSync(path.join(root, 'source.ts'), 'export function recoveryMarker() { return "fresh"; }\n');
    fs.mkdirSync(path.dirname(indexPath), { recursive: true });
    fs.writeFileSync(indexPath, '{broken json');
    assert.ok(rag.buildSemanticIndex(root, planning).files['source.ts']);

    const unsupported = { ...rag.loadSemanticIndex(planning), version: '0.0.1-unknown' };
    fs.writeFileSync(indexPath, JSON.stringify(unsupported));
    assert.equal(rag.loadSemanticIndex(planning), null);
    assert.ok(rag.buildSemanticIndex(root, planning).files['source.ts']);
  } finally {
    cleanup(root);
  }
});

test('oversized files are skipped deterministically and diagnosed without content', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-rag-budget-'));
  try {
    fs.writeFileSync(path.join(root, 'oversized.ts'), `// ${'x'.repeat(300 * 1024)}\n`);
    fs.writeFileSync(path.join(root, 'small.ts'), 'export const indexedMarker = "safe";\n');
    const index = rag.buildSemanticIndex(root);
    assert.equal(index.diagnostics.skippedFiles, 1);
    assert.equal(index.diagnostics.indexedBytes, fs.statSync(path.join(root, 'small.ts')).size);
    assert.ok(!Object.keys(index.files).includes('oversized.ts'));
    assert.ok(!JSON.stringify(index.diagnostics).includes('xxxx'));
  } finally {
    cleanup(root);
  }
});

test('repository ignore rules are applied before indexing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-rag-ignore-'));
  try {
    fs.mkdirSync(path.join(root, 'secret'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, '.gitignore'), 'secret/\n*.generated.ts\n');
    fs.writeFileSync(path.join(root, 'secret/private.ts'), 'export const ignoredSecret = "hidden";\n');
    fs.writeFileSync(path.join(root, 'src/output.generated.ts'), 'export const generatedSecret = "hidden";\n');
    fs.writeFileSync(path.join(root, 'src/public.ts'), 'export const visibleMarker = "included";\n');
    const index = rag.buildSemanticIndex(root);
    assert.deepEqual(Object.keys(index.files), ['src/public.ts']);
  } finally { cleanup(root); }
});
