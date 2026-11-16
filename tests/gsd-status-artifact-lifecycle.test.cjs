const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { cleanup } = require('./helpers.cjs');
const { inspectArtifactLifecycle } = require('../gsd-core/bin/lib/artifact-lifecycle.cjs');
const { dispatchUnifiedCommand } = require('../gsd-core/bin/lib/unified-workflow-hub.cjs');

test('artifact status is read-only and reports current, missing, durable, and opt-in artifacts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-status-lifecycle-'));
  const planning = path.join(root, '.planning');
  fs.mkdirSync(planning, { recursive: true });
  fs.writeFileSync(path.join(planning, 'STATE.md'), 'state');
  fs.writeFileSync(path.join(planning, 'ROADMAP.md'), 'roadmap');
  const before = fs.readdirSync(planning).sort();
  try {
    const report = inspectArtifactLifecycle(planning, root);
    const lookup = id => report.find(item => item.id === id);
    assert.equal(lookup('project-state').status, 'present');
    assert.equal(lookup('codebase-graph').status, 'missing');
    assert.equal(lookup('memory').status, 'absent');
    assert.equal(lookup('codebase-map').status, 'not generated');
    assert.equal(lookup('codebase-graph').refresh, '/gsd:graph');
    assert.deepEqual(fs.readdirSync(planning).sort(), before);
    assert.doesNotMatch(JSON.stringify(report), /source text|query text|user home/i);
  } finally { cleanup(root); }
});

test('the status command includes lifecycle diagnostics without creating artifacts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-status-command-'));
  const planning = path.join(root, '.planning');
  fs.mkdirSync(planning, { recursive: true });
  fs.writeFileSync(path.join(planning, 'STATE.md'), '# Project State');
  fs.writeFileSync(path.join(planning, 'ROADMAP.md'), '# Roadmap');
  try {
    const result = dispatchUnifiedCommand('status', { args: [], cwd: root });
    const graph = result.data.artifactLifecycle.find(item => item.id === 'codebase-graph');
    assert.equal(graph.status, 'missing');
    assert.equal(graph.refresh, '/gsd:graph');
    assert.equal(fs.existsSync(path.join(planning, 'intel')), false);
  } finally { cleanup(root); }
});
