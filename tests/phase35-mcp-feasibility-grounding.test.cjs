'use strict';

/**
 * Phase 35 Wave 2 Regression Suite: MCP Server Feasibility Grounding & Write Safety
 *
 * Verifies:
 * 1. graph.files schema parity, populating knownExports, knownSymbols, and graphFreshness.
 * 2. Candidate classification into known, intentionallyNew, ignored, and missing.
 * 3. Declared new APIs and language built-ins do not trigger false grounding failures.
 * 4. gsd_write_state invokes inspectWriteSafety, rejecting catastrophic shrink and 0-byte truncation.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { cleanup } = require('./helpers.cjs');

const mcpServer = require('../gsd-core/bin/lib/mcp-server.cjs');
const { handleMessage } = mcpServer;

describe('Phase 35 Wave 2 — MCP Feasibility Grounding & Write Safety', () => {
  it('correctly reads graph.files and classifies candidates without false positives', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-mcp-feasibility-'));
    try {
      const intelDir = path.join(tmpDir, '.planning', 'intel');
      fs.mkdirSync(intelDir, { recursive: true });

      // Create a codebase-graph.json conforming to CodebaseGraph schema (graph.files)
      const graphContent = {
        version: '1.0.0',
        updatedAt: new Date().toISOString(),
        files: {
          'src/auth-service.ts': {
            exports: [{ name: 'AuthService' }, { name: 'validateToken' }],
            symbols: [{ name: 'UserSession' }, { name: 'hashPassword' }],
          },
        },
        symbolIndex: {
          AuthService: ['src/auth-service.ts'],
          validateToken: ['src/auth-service.ts'],
          UserSession: ['src/auth-service.ts'],
          hashPassword: ['src/auth-service.ts'],
        },
      };

      fs.writeFileSync(path.join(intelDir, 'codebase-graph.json'), JSON.stringify(graphContent), 'utf8');

      // Scenario A: Task referencing known symbol, built-in types, and declaring a new class
      const taskA = 'Use AuthService and validateToken with Array and Promise, then create class AuditLogger for logging.';
      const resA = handleMessage({
        jsonrpc: '2.0',
        id: 'req-1',
        method: 'tools/call',
        params: {
          name: 'gsd_feasibility_check',
          arguments: {
            taskText: taskA,
          },
        },
      }, { cwd: tmpDir });

      assert.equal(resA.error, undefined);
      const parsedA = JSON.parse(resA.result.content[0].text);
      assert.equal(parsedA.graphLoaded, true);
      assert.ok(parsedA.knownSymbolsCount >= 4);
      assert.ok(parsedA.candidates.known.includes('AuthService'));
      assert.ok(parsedA.candidates.known.includes('validateToken'));
      assert.ok(parsedA.candidates.intentionallyNew.includes('AuditLogger'));
      assert.ok(parsedA.candidates.ignored.includes('Array'));
      assert.ok(parsedA.candidates.ignored.includes('Promise'));
      assert.equal(parsedA.candidates.missing.length, 0);
      assert.equal(parsedA.feasible, true);

      // Scenario B: Task referencing an unknown code symbol without declaring it
      const taskB = 'Call NonExistentService to execute transfer.';
      const resB = handleMessage({
        jsonrpc: '2.0',
        id: 'req-2',
        method: 'tools/call',
        params: {
          name: 'gsd_feasibility_check',
          arguments: {
            taskText: taskB,
          },
        },
      }, { cwd: tmpDir });

      const parsedB = JSON.parse(resB.result.content[0].text);
      assert.ok(parsedB.candidates.missing.includes('NonExistentService'));
      assert.equal(parsedB.feasible, false);
    } finally {
      cleanup(tmpDir);
    }
  });

  it('gsd_write_state guards against catastrophic truncation of curated files', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-mcp-safety-'));
    try {
      const planDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planDir, { recursive: true });

      // Create an existing 50-line ROADMAP.md
      const roadmapPath = path.join(planDir, 'ROADMAP.md');
      const lines = Array.from({ length: 50 }, (_, i) => `Line ${i + 1} of milestone roadmap`).join('\n') + '\n';
      fs.writeFileSync(roadmapPath, lines, 'utf8');

      // Attempt catastrophic shrink via MCP gsd_write_state (e.g. shrink to 5 lines)
      const resShrink = handleMessage({
        jsonrpc: '2.0',
        id: 'req-shrink',
        method: 'tools/call',
        params: {
          name: 'gsd_write_state',
          arguments: {
            path: roadmapPath,
            content: 'Shrunk to 1 line\n',
          },
        },
      }, { cwd: tmpDir });

      assert.equal(resShrink.result.isError, true);
      assert.ok(resShrink.result.content[0].text.includes('Write safety violation'));
      assert.ok(resShrink.result.content[0].text.includes('CATASTROPHIC_SHRINK'));

      // Attempt 0-byte empty write
      const resEmpty = handleMessage({
        jsonrpc: '2.0',
        id: 'req-empty',
        method: 'tools/call',
        params: {
          name: 'gsd_write_state',
          arguments: {
            path: roadmapPath,
            content: '',
          },
        },
      }, { cwd: tmpDir });

      assert.equal(resEmpty.result.isError, true);
      assert.ok(resEmpty.result.content[0].text.includes('UNINTENDED_TRUNCATION'));

      // Legitimate full-content update succeeds
      const resValid = handleMessage({
        jsonrpc: '2.0',
        id: 'req-valid',
        method: 'tools/call',
        params: {
          name: 'gsd_write_state',
          arguments: {
            path: roadmapPath,
            content: lines + 'Line 51 newly added\n',
          },
        },
      }, { cwd: tmpDir });

      assert.equal(resValid.result.isError, undefined);
    } finally {
      cleanup(tmpDir);
    }
  });
});
