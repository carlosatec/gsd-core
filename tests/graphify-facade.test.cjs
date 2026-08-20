'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const graphify = require('../gsd-core/bin/lib/graphify.cjs');
const {
  checkGraphifyInstalled,
  checkGraphifyVersion,
  execGraphify,
  graphifyBuild,
  graphifyQuery,
  safeReadJson,
} = graphify;

describe('Graphify Native Facade (D-31)', () => {
  let tmpDir;
  let planningDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-graphify-test-'));
    planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });

    // Enable capability for test
    const configPath = path.join(planningDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      graphify: { enabled: true },
    }));

    // Create a sample source file in tmpDir
    fs.writeFileSync(path.join(tmpDir, 'index.ts'), `
export interface User { id: string; name: string; }
export class UserService {
  getUser(): User { return { id: '1', name: 'Alice' }; }
}
`);
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // non-blocking cleanup
    }
  });

  it('should report installed = true and version = 2.3-native without Python on PATH', () => {
    const installed = checkGraphifyInstalled();
    assert.equal(installed.installed, true);
    assert.match(installed.message, /Native TypeScript graph engine active/);

    const version = checkGraphifyVersion();
    assert.equal(version.version, '2.3-native');
    assert.equal(version.compatible, true);
  });

  it('should execute native graphify stub without spawning subprocesses', () => {
    const execRes = execGraphify(tmpDir, ['status']);
    assert.equal(execRes.exitCode, 0);
    assert.equal(execRes.reason, 'ok');
    assert.match(execRes.stdout, /native TypeScript engine/);
  });

  it('should build codebase graph in TypeScript and save graph.json with action = completed', () => {
    const buildRes = graphifyBuild(tmpDir);

    assert.equal(buildRes.action, 'completed');
    assert.equal(buildRes.version, '2.3-native');
    assert.equal(buildRes.artifacts.includes('graph.json'), true);

    const graphFile = path.join(planningDir, 'graphs', 'graph.json');
    assert.equal(fs.existsSync(graphFile), true);

    const graphData = safeReadJson(graphFile);
    assert.equal(typeof graphData.stats.totalFiles, 'number');
    assert.equal(graphData.stats.totalFiles >= 1, true);
  });

  it('should query the built graph in TypeScript without errors', () => {
    // Build first
    graphifyBuild(tmpDir);

    // Query for UserService
    const queryRes = graphifyQuery(tmpDir, 'UserService');
    assert.equal(typeof queryRes, 'object');
    assert.equal(queryRes !== null, true);
  });
});
