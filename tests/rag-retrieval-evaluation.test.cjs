'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const cleanup = require('./helpers.cjs').cleanup;
const rag = require('../gsd-core/bin/lib/hybrid-semantic-rag.cjs');

const development = [
  { query: 'refreshStaleIndex', relevant: 'src/indexing.ts' },
  { query: 'content fingerprint hash freshness', relevant: 'src/indexing.ts' },
  { query: 'recuperacion fragmentos busqueda local', relevant: 'docs/recuperacion.md' },
  { query: 'bearer token authenticate validate authorization', relevant: 'src/auth.py' },
];
const heldOut = [
  { query: 'requestScopedJitBudget', relevant: 'src/jit.ts' },
  { query: 'diverse ranking retrieval near duplicate chunks', relevant: 'src/search.go' },
  { query: 'invoice tax payment receipt', relevant: 'src/billing.ts' },
  { query: 'metadatos filtrar fragmentos lenguaje archivo', relevant: 'docs/filters.md' },
];

function scores(queries, queryFn, k) {
  let recalled = 0;
  let precision = 0;
  let reciprocalRank = 0;
  let queryMs = 0;
  for (const item of queries) {
    const started = performance.now();
    const results = queryFn(item.query, k);
    queryMs += performance.now() - started;
    const rank = results.findIndex(result => result.file === item.relevant);
    if (rank >= 0) { recalled++; reciprocalRank += 1 / (rank + 1); }
    precision += results.filter(result => result.file === item.relevant).length / k;
  }
  return { recallAtK: recalled / queries.length, precisionAtK: precision / queries.length, mrr: reciprocalRank / queries.length, avgQueryMs: queryMs / queries.length };
}

test('offline retrieval evaluation separates development and held-out metrics from generation quality', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-rag-eval-'));
  const planning = path.join(root, '.planning');
  for (const dir of ['src', 'docs']) fs.mkdirSync(path.join(root, dir), { recursive: true });
  const noise = Array.from({ length: 95 }, (_, i) => `const unrelatedRecord${i} = "catalog customer profile database export";`).join('\n');
  fs.writeFileSync(path.join(root, 'src/indexing.ts'), `export function loadLegacyIndex() { return "whole file lexical retrieval"; }\n${noise}\nexport function refreshStaleIndex() { return "content fingerprint hash freshness"; }\n`);
  fs.writeFileSync(path.join(root, 'src/jit.ts'), `export function assembleContext() { return "prompt integration context"; }\n${noise}\nexport function requestScopedJitBudget() { return "bounded injected context"; }\n`);
  fs.writeFileSync(path.join(root, 'src/search.go'), `package search\nfunc lexicalSearch() string { return "query retrieval ranking" }\n${noise}\nfunc diverseRank() string { return "near duplicate chunks mmr diversity" }\n`);
  fs.writeFileSync(path.join(root, 'src/auth.py'), 'def authenticate(token):\n    return "bearer token validate authorization"\n');
  fs.writeFileSync(path.join(root, 'src/billing.ts'), 'export function invoice() { return "invoice tax payment receipt"; }\n');
  fs.writeFileSync(path.join(root, 'docs/recuperacion.md'), '# Recuperación local\nLa búsqueda indexa y recupera fragmentos de texto.\n');
  fs.writeFileSync(path.join(root, 'docs/filters.md'), '# Aplicabilidad\nFiltrar por metadatos, fragmentos, lenguaje y archivo mejora el contexto.\n');
  fs.writeFileSync(path.join(root, 'docs/negative.md'), '# Negative\nA receipt query is unrelated to retrieval diversity.\n');

  try {
    const buildStarted = performance.now();
    rag.buildSemanticIndex(root, planning);
    const buildMs = performance.now() - buildStarted;
    const indexPath = path.join(planning, 'intel', 'semantic-index.json');
    const indexBytes = fs.statSync(indexPath).size;
    const k = 3;
    const finalQuery = (query, limit) => rag.querySemanticSimilarFiles(query, planning, root, limit);
    const baselineQuery = (query, limit) => rag.querySemanticSimilarFilesLegacy(query, planning, root, limit);
    const devFinal = scores(development, finalQuery, k);
    const devBaseline = scores(development, baselineQuery, k);
    const heldOutFinal = scores(heldOut, finalQuery, k);
    const heldOutBaseline = scores(heldOut, baselineQuery, k);
    const repeat = scores(heldOut, finalQuery, k);

    assert.deepEqual(
      { recallAtK: heldOutFinal.recallAtK, precisionAtK: heldOutFinal.precisionAtK, mrr: heldOutFinal.mrr },
      { recallAtK: repeat.recallAtK, precisionAtK: repeat.precisionAtK, mrr: repeat.mrr },
      'quality metrics are deterministic across repeated runs',
    );
    assert.ok(devFinal.recallAtK >= devBaseline.recallAtK);
    assert.ok(heldOutFinal.recallAtK >= heldOutBaseline.recallAtK);
    assert.ok(heldOutFinal.mrr >= heldOutBaseline.mrr);
    assert.ok(Number.isFinite(buildMs) && buildMs >= 0 && indexBytes > 0);
    assert.ok(Number.isFinite(heldOutFinal.avgQueryMs) && heldOutFinal.avgQueryMs >= 0);
    console.log(JSON.stringify({ k, buildMs: Number(buildMs.toFixed(2)), indexBytes, development: { baseline: devBaseline, chunks: devFinal }, heldOut: { baseline: heldOutBaseline, chunks: heldOutFinal } }));
  } finally {
    cleanup(root);
  }
});
