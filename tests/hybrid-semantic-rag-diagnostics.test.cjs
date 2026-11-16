'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const rag = require('../gsd-core/bin/lib/hybrid-semantic-rag.cjs');
const { cleanup } = require('./helpers.cjs');

test('opt-in retrieval diagnostics report lifecycle and stage counts without user content', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-rag-diagnostics-'));
  const planning = path.join(root, '.planning');
  try {
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    const source = 'export function sensitiveNeedle() { return "do-not-log-source"; }\n';
    fs.writeFileSync(path.join(root, 'src/secret.ts'), source);
    let first;
    const results = rag.querySemanticChunks('private query phrase sensitiveNeedle', planning, root, { limit: 4, diagnostics(value) { first = value; } });
    assert.ok(results.length);
    assert.equal(first.indexState, 'missing');
    assert.equal(first.rebuilt, true);
    assert.ok(first.indexedChunks >= first.returnedChunks);
    assert.ok(first.candidatePool >= first.returnedChunks);
    assert.ok(first.queryMs >= first.rebuildMs);
    const serialized = JSON.stringify(first);
    assert.ok(!serialized.includes('private query phrase'));
    assert.ok(!serialized.includes('do-not-log-source'));
    assert.ok(!serialized.includes('secret.ts'));

    let second;
    rag.querySemanticChunks('sensitiveNeedle', planning, root, { diagnostics(value) { second = value; } });
    assert.equal(second.indexState, 'current');
    assert.equal(second.rebuilt, false);
    assert.equal(second.filteredChunks, second.indexedChunks);
  } finally { cleanup(root); }
});
