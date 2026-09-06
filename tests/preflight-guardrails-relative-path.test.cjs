'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { cleanup } = require('./helpers.cjs');

const guardrails = require('../gsd-core/bin/lib/preflight-guardrails.cjs');
const mcpServer = require('../gsd-core/bin/lib/mcp-server.cjs');
const semanticRag = require('../gsd-core/bin/lib/hybrid-semantic-rag.cjs');

describe('Wave 4: Preflight Guardrails Relative Path & Audited Fixes', () => {
  it('detects UNINTENDED_TRUNCATION when target file is passed with explicit ./ prefix', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-preflight-rel-'));
    try {
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });

      // Create a valid TypeScript file
      const codePath = path.join(tmpDir, 'service.ts');
      fs.writeFileSync(codePath, 'export function getStatus(): string { return "ok"; }\n');

      const report = guardrails.runPreFlightChecks({
        rootDir: tmpDir,
        planningDir,
        filesToModify: ['./service.ts'],
        proposedCodeMap: {
          './service.ts': '   \n  ', // 0-byte/whitespace truncation
        },
      });

      assert.strictEqual(report.valid, false);
      const truncationViolation = report.violations.find((v) => v.rule === 'UNINTENDED_TRUNCATION');
      assert.ok(truncationViolation, 'Should detect UNINTENDED_TRUNCATION even with ./ prefix');
    } finally {
      cleanup(tmpDir);
    }
  });

  it('resets server version cache via _resetServerVersionCache', () => {
    assert.strictEqual(typeof mcpServer._resetServerVersionCache, 'function');
    // Calling reset must not throw and should clear cache
    mcpServer._resetServerVersionCache();
    const res = mcpServer.handleMessage({ jsonrpc: '2.0', id: 1, method: 'initialize' });
    assert.strictEqual(res.jsonrpc, '2.0');
    assert.ok(res.result.serverInfo.version);
  });

  it('pre-calculates termCount in semantic index docs', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-rag-termcount-'));
    try {
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });

      fs.writeFileSync(path.join(tmpDir, 'sample.ts'), 'export const hello = "world"; export const number = 42;\n');
      const index = semanticRag.buildSemanticIndex(tmpDir, planningDir);

      assert.strictEqual(index.version, '2.0.0-bm25');
      const doc = index.docs['sample.ts'];
      assert.ok(doc, 'Document must be indexed');
      assert.strictEqual(typeof doc.termCount, 'number');
      assert.ok(doc.termCount > 0);
      assert.strictEqual(doc.termCount, Object.keys(doc.terms).length);
    } finally {
      cleanup(tmpDir);
    }
  });
});
