'use strict';

const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runNode } = require('./helpers/process-seam.cjs');
const { throwIfFailed } = require('./helpers/git-fixture.cjs');

const {
  profileOf,
} = require('../gsd-core/bin/lib/host-integration.cjs');
const { validateCapability } = require('../gsd-core/bin/lib/capability-validator.cjs');
const { createDeclarativeAdapter } = require('../gsd-core/bin/lib/adapter-declarative.cjs');
const { cleanup } = require('./helpers.cjs');
const { walk, runMinimalInstall, BUILD_SCRIPT } = require('./helpers/install-shared.cjs');
const {
  canonicalizeRuntimeName,
  getRuntimeLabel,
  getDirName,
} = require('../gsd-core/bin/lib/runtime-name-policy.cjs');

const DESC = path.join(__dirname, '..', 'capabilities', 'deepseek-harness', 'capability.json');
const DSH_CAP = JSON.parse(fs.readFileSync(DESC, 'utf8'));
const { BUILD_TIMEOUT_MS } = require('./helpers/timeouts.cjs');

before(() => {
  throwIfFailed(
    runNode([BUILD_SCRIPT], { timeoutMs: BUILD_TIMEOUT_MS }),
    `node ${BUILD_SCRIPT}`,
  );
});

test('DeepSeek Harness classifies as the declarative-cli reference profile (profileOf)', () => {
  const desc = JSON.parse(fs.readFileSync(DESC, 'utf8'));
  const axes = desc.runtime.hostIntegration;
  assert.ok(axes && axes.embeddingMode, 'deepseek-harness descriptor declares hostIntegration axes');
  assert.equal(profileOf(axes), 'declarative-cli',
    'DeepSeek Harness is a Declarative-CLI host');
});

test('the public declarative adapter classifies DeepSeek Harness as a declarative host', () => {
  const adapter = createDeclarativeAdapter({ runtime: 'deepseek-harness' });
  assert.equal(adapter.kind, 'declarative');
  assert.equal(adapter.runtime, 'deepseek-harness');
  assert.equal(typeof adapter.install, 'function');
  assert.equal(typeof adapter.uninstall, 'function');
});

test('runtime-name-policy resolves deepseek-harness and its aliases correctly', () => {
  assert.equal(canonicalizeRuntimeName('deepseek-harness'), 'deepseek-harness');
  assert.equal(canonicalizeRuntimeName('dsh'), 'deepseek-harness');
  assert.equal(canonicalizeRuntimeName('deepseek'), 'deepseek-harness');
  assert.equal(canonicalizeRuntimeName('deepseek-cli'), 'deepseek-harness');
  assert.equal(getRuntimeLabel('deepseek-harness'), 'DeepSeek Harness');
  assert.equal(getDirName('deepseek-harness'), '.dsh');
});

test('a real DeepSeek Harness install emits a gsd command/skill surface (invocable)', () => {
  const { configDir, root } = runMinimalInstall({ runtime: 'deepseek-harness', scope: 'global' });
  try {
    const files = walk(configDir);
    assert.ok(files.length > 0, 'install must emit artifacts');
    const gsdSurface = files.filter((f) => /gsd/i.test(path.relative(configDir, f)));
    assert.ok(gsdSurface.length > 0,
      'install must emit a gsd command/skill surface (declarative reference)');
    const commandsDir = path.join(configDir, 'commands');
    assert.ok(fs.existsSync(commandsDir), 'commands/ directory must exist');
    const cmdFiles = fs.readdirSync(commandsDir)
      .filter((f) => f.startsWith('gsd-') && f.endsWith('.md'));
    assert.ok(cmdFiles.length > 0, 'commands/ must contain gsd-*.md slash commands');
  } finally {
    cleanup(root);
  }
});

test('capabilities/deepseek-harness/capability.json validates — no errors', () => {
  const errors = validateCapability(DSH_CAP, 'deepseek-harness');
  assert.deepEqual(errors, [], `validateCapability must return no errors, got: ${JSON.stringify(errors)}`);
});
