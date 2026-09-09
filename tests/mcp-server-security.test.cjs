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
});
