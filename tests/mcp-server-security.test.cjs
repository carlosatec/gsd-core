'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { cleanup } = require('./helpers.cjs');
const { handleMessage } = require('../gsd-core/bin/lib/mcp-server.cjs');

describe('MCP Server Security & Path Confinement (Task 23.03, D-124)', () => {
  test('denies reading files in workspace root outside .planning', () => {
    const fakeWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-fake-ws-'));
    try {
      const planningDir = path.join(fakeWorkspace, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });

      // Create a secret file in workspace root
      fs.writeFileSync(path.join(fakeWorkspace, 'secret.env'), 'API_KEY=topsecret');
      // Create a valid file inside .planning
      fs.writeFileSync(path.join(planningDir, 'STATE.md'), '# Planning State');

      // Attempt 1: reading secret.env directly
      const res1 = handleMessage(
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'gsd_read_state', arguments: { path: 'secret.env' } },
        },
        { cwd: fakeWorkspace }
      );

      assert.strictEqual(res1.result.isError, true, 'reading workspace root file outside .planning must fail');
      assert.match(res1.result.content[0].text, /Access denied/i);

      // Attempt 2: reading valid state file
      const res2 = handleMessage(
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'gsd_read_state', arguments: { path: 'STATE.md' } },
        },
        { cwd: fakeWorkspace }
      );

      assert.strictEqual(res2.result.isError, undefined, 'reading STATE.md inside .planning must succeed');
      assert.strictEqual(res2.result.content[0].text, '# Planning State');
    } finally {
      cleanup(fakeWorkspace);
    }
  });

  test('denies directory traversal attempts escaping .planning', () => {
    const fakeWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-traversal-ws-'));
    try {
      const planningDir = path.join(fakeWorkspace, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });

      fs.writeFileSync(path.join(fakeWorkspace, 'confidential.txt'), 'confidential');

      const traversalPaths = [
        '../confidential.txt',
        '..\\confidential.txt',
        '.planning/../confidential.txt',
        '../../package.json',
      ];

      for (let i = 0; i < traversalPaths.length; i++) {
        const res = handleMessage(
          {
            jsonrpc: '2.0',
            id: 10 + i,
            method: 'tools/call',
            params: { name: 'gsd_read_state', arguments: { path: traversalPaths[i] } },
          },
          { cwd: fakeWorkspace }
        );

        assert.strictEqual(
          res.result.isError,
          true,
          `Traversal path "${traversalPaths[i]}" must be denied`
        );
        assert.match(res.result.content[0].text, /Access denied/i);
      }
    } finally {
      cleanup(fakeWorkspace);
    }
  });

  test('denies writing state files outside .planning', () => {
    const fakeWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-write-ws-'));
    try {
      const planningDir = path.join(fakeWorkspace, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });

      // Attempt write outside .planning
      const res1 = handleMessage(
        {
          jsonrpc: '2.0',
          id: 20,
          method: 'tools/call',
          params: {
            name: 'gsd_write_state',
            arguments: { path: 'malicious.js', content: 'console.log("pwned");' },
          },
        },
        { cwd: fakeWorkspace }
      );

      assert.strictEqual(res1.result.isError, true, 'writing outside .planning must be denied');
      assert.match(res1.result.content[0].text, /Access denied/i);
      assert.strictEqual(fs.existsSync(path.join(fakeWorkspace, 'malicious.js')), false);

      // Attempt valid write inside .planning
      const res2 = handleMessage(
        {
          jsonrpc: '2.0',
          id: 21,
          method: 'tools/call',
          params: {
            name: 'gsd_write_state',
            arguments: { path: 'ROADMAP.md', content: '# Roadmap\n' },
          },
        },
        { cwd: fakeWorkspace }
      );

      assert.strictEqual(res2.result.isError, undefined, 'writing inside .planning must succeed');
      assert.strictEqual(fs.readFileSync(path.join(planningDir, 'ROADMAP.md'), 'utf8'), '# Roadmap\n');
    } finally {
      cleanup(fakeWorkspace);
    }
  });

  test('tools/list returns all 9 canonical tools with schemas', () => {
    const res = handleMessage({
      jsonrpc: '2.0',
      id: 101,
      method: 'tools/list',
    }, { cwd: path.resolve(__dirname, '..') });

    assert.ok(res);
    assert.equal(res.id, 101);
    assert.ok(res.result && Array.isArray(res.result.tools));

    const toolNames = res.result.tools.map(t => t.name);
    assert.ok(toolNames.includes('gsd_invoke_command'));
    assert.ok(toolNames.includes('gsd_read_state'));
    assert.ok(toolNames.includes('gsd_write_state'));
    assert.ok(toolNames.includes('gsd_jit_context'));
    assert.ok(toolNames.includes('gsd_preflight_check'));
    assert.ok(toolNames.includes('gsd_feasibility_check'));
    assert.ok(toolNames.includes('gsd_verify_step'));
    assert.ok(toolNames.includes('gsd_memory_recall'));
    assert.ok(toolNames.includes('gsd_memory_record'));
  });

  test('tools/call gsd_jit_context returns surgical context payload', () => {
    const res = handleMessage({
      jsonrpc: '2.0',
      id: 102,
      method: 'tools/call',
      params: {
        name: 'gsd_jit_context',
        arguments: {
          files: ['src/state.cts'],
          dryRun: true,
        },
      },
    }, { cwd: path.resolve(__dirname, '..') });

    assert.ok(res);
    assert.equal(res.id, 102);
    assert.ok(res.result && Array.isArray(res.result.content));
    const data = JSON.parse(res.result.content[0].text);
    assert.ok(Array.isArray(data.targetFiles));
    assert.ok(data.targetFiles.includes('src/state.cts'));
  });

  test('tools/call gsd_preflight_check inspects files and command risk', () => {
    const res = handleMessage({
      jsonrpc: '2.0',
      id: 103,
      method: 'tools/call',
      params: {
        name: 'gsd_preflight_check',
        arguments: {
          files: ['src/state.cts'],
          command: 'npm run lint',
        },
      },
    }, { cwd: path.resolve(__dirname, '..') });

    assert.ok(res);
    assert.equal(res.id, 103);
    const data = JSON.parse(res.result.content[0].text);
    assert.ok(data.checks);
    assert.ok(data.blastReport);
    assert.ok(['safe', 'low'].includes(data.blastReport.riskLevel));
  });

  test('tools/call gsd_feasibility_check returns analysis without throwing', () => {
    const res = handleMessage({
      jsonrpc: '2.0',
      id: 104,
      method: 'tools/call',
      params: {
        name: 'gsd_feasibility_check',
        arguments: {
          taskText: 'Refactor state engine transitions and update lock mechanisms',
          referencedFiles: ['src/state.cts'],
        },
      },
    }, { cwd: path.resolve(__dirname, '..') });

    assert.ok(res);
    assert.equal(res.id, 104);
    const data = JSON.parse(res.result.content[0].text);
    assert.equal(typeof data.feasible, 'boolean');
    assert.equal(data.missingFiles.length, 0);
  });

  test('tools/call gsd_verify_step returns verification status', () => {
    const res = handleMessage({
      jsonrpc: '2.0',
      id: 105,
      method: 'tools/call',
      params: {
        name: 'gsd_verify_step',
        arguments: {},
      },
    }, { cwd: path.resolve(__dirname, '..') });

    assert.ok(res);
    assert.equal(res.id, 105);
    const data = JSON.parse(res.result.content[0].text);
    assert.equal(data.ok, true);
    assert.ok(data.status);
  });

  test('tools/call gsd_memory_record and gsd_memory_recall roundtrip', () => {
    const testCategory = 'self_healing_fix';
    const testSummary = `Test memory entry for MCP test ${Date.now()}`;
    const root = path.resolve(__dirname, '..');

    // Record
    const recordRes = handleMessage({
      jsonrpc: '2.0',
      id: 106,
      method: 'tools/call',
      params: {
        name: 'gsd_memory_record',
        arguments: {
          category: testCategory,
          summary: testSummary,
          details: 'Root cause was mock timeout on Windows',
          relevantFiles: ['tests/sample.test.cjs'],
          keywords: ['timeout', 'mock', 'windows'],
        },
      },
    }, { cwd: root });

    assert.ok(recordRes);
    assert.equal(recordRes.id, 106);
    const recordData = JSON.parse(recordRes.result.content[0].text);
    assert.equal(recordData.ok, true);
    assert.equal(recordData.entry.summary, testSummary);

    // Recall
    const recallRes = handleMessage({
      jsonrpc: '2.0',
      id: 107,
      method: 'tools/call',
      params: {
        name: 'gsd_memory_recall',
        arguments: {
          query: 'mock timeout windows',
          files: ['tests/sample.test.cjs'],
        },
      },
    }, { cwd: root });

    assert.ok(recallRes);
    assert.equal(recallRes.id, 107);
    const recallData = JSON.parse(recallRes.result.content[0].text);
    assert.ok(Array.isArray(recallData));
    assert.ok(recallData.some(e => e.summary === testSummary));
  });
});
