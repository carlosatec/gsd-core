'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const rag = require('../gsd-core/bin/lib/hybrid-semantic-rag.cjs');
const jit = require('../gsd-core/bin/lib/jit-context-injector.cjs');
const { cleanup } = require('./helpers.cjs');

test('chunk retrieval applies validated filters before ranking and keeps the legacy projection', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-rag-query-'));
  const planning = path.join(root, '.planning');
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/cache.ts'), 'export function cacheRefresh() { return "cache invalidation freshness"; }\n');
  fs.writeFileSync(path.join(root, 'docs/cache.md'), '# Cache Guide\nCache invalidation freshness retrieval.\n');
  try {
    rag.buildSemanticIndex(root, planning);
    const source = rag.querySemanticChunks('cache invalidation freshness', planning, root, { limit: 5, filters: { languages: ['ts'], fileKinds: ['source'], symbols: ['cacheRefresh'], paths: ['src'] } });
    assert.ok(source.length);
    assert.ok(source.every(hit => hit.file === 'src/cache.ts' && hit.symbol === 'cacheRefresh'));
    assert.throws(() => rag.querySemanticChunks('cache', planning, root, { filters: { paths: ['x'.repeat(257)] } }), /Invalid RAG paths/);
    const legacy = rag.querySemanticSimilarFiles('cache invalidation', planning, root, 5);
    assert.ok(legacy.some(hit => hit.file === 'src/cache.ts'));
    assert.deepEqual(Object.keys(legacy[0]).sort(), ['file', 'preview', 'score']);
    assert.equal(new Set(legacy.map(hit => hit.file)).size, legacy.length);
  } finally { cleanup(root); }
});

test('query refresh detects same-size content edits with preserved timestamps', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-rag-fresh-query-'));
  const planning = path.join(root, '.planning');
  const file = path.join(root, 'fresh.ts');
  try {
    fs.writeFileSync(file, 'export function marker() { return "alpha"; }\n');
    rag.buildSemanticIndex(root, planning);
    const before = fs.statSync(file);
    fs.writeFileSync(file, 'export function marker() { return "omega"; }\n');
    fs.utimesSync(file, before.atime, before.mtime);
    const results = rag.querySemanticChunks('omega', planning, root);
    assert.ok(results.some(hit => hit.content.includes('omega')));
    assert.ok(!results.some(hit => hit.content.includes('alpha')));
  } finally { cleanup(root); }
});

test('optional provider and reranker fail safely; diversity is deterministic', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-rag-rank-'));
  const planning = path.join(root, '.planning');
  try {
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/a.ts'), 'export function cacheAlpha() { return "cache eviction invalidation"; }\nexport function cacheBeta() { return "cache eviction invalidation"; }\n');
    fs.writeFileSync(path.join(root, 'src/b.ts'), 'export function cachePolicy() { return "cache expiration policy"; }\n');
    rag.buildSemanticIndex(root, planning);
    const query = 'cache eviction invalidation policy';
    const limited = rag.querySemanticChunks(query, planning, root, { limit: 5, topK: 2 });
    assert.ok(limited.length <= 2);
    const fallbackA = rag.querySemanticChunks(query, planning, root, { limit: 3, semanticProvider: { score() { throw new Error('offline'); } }, reranker() { throw new Error('offline'); } });
    const fallbackB = rag.querySemanticChunks(query, planning, root, { limit: 3 });
    assert.deepEqual(fallbackA.map(hit => hit.chunkId), fallbackB.map(hit => hit.chunkId));
    const diverseA = rag.querySemanticChunks(query, planning, root, { limit: 3, diversity: { lambda: 0.15 } });
    const diverseB = rag.querySemanticChunks(query, planning, root, { limit: 3, diversity: { lambda: 0.15 } });
    assert.deepEqual(diverseA.map(hit => hit.chunkId), diverseB.map(hit => hit.chunkId));
    assert.ok(new Set(diverseA.map(hit => hit.file)).size >= 2);
  } finally { cleanup(root); }
});

test('JIT injects chunk text with source lines and stays within its local retrieval cap', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-rag-jit-chunk-'));
  const planning = path.join(root, '.planning');
  try {
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/target.ts'), 'export const target = 1;\n');
    fs.writeFileSync(path.join(root, 'src/crypto.ts'), 'export function encryptPayload() { return "AES GCM cipher encryption"; }\n');
    const result = jit.assembleJitContext({ targetFiles: ['src/target.ts'], planningDir: planning, rootDir: root, modelProfile: 'quality', query: 'AES GCM cipher encryption', maxTokens: 4000 });
    assert.match(result.markdownBlock, /src\/crypto\.ts:\d+-\d+/);
    assert.match(result.markdownBlock, /AES GCM cipher encryption/);
    assert.ok(result.estimatedTokens <= 4000);
  } finally { cleanup(root); }
});
