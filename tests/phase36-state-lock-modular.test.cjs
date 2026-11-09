const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cleanup, createTempDir } = require('./helpers.cjs');

const stateLock = require('../gsd-core/bin/lib/state-lock.cjs');
const state = require('../gsd-core/bin/lib/state.cjs');

test('Phase 36 Wave 4: modular state-lock exports and facade parity', async (t) => {
  await t.test('state-lock.cjs exports expected locking primitives and test hooks', () => {
    assert.equal(typeof stateLock.acquireStateLock, 'function');
    assert.equal(typeof stateLock.releaseStateLock, 'function');
    assert.equal(typeof stateLock.withStateLock, 'function');
    assert.equal(typeof stateLock._setLockProbes, 'function');
    assert.equal(typeof stateLock._resetLockProbes, 'function');
    assert.equal(typeof stateLock._setStateLockTestHooks, 'function');
    assert.equal(typeof stateLock._resetStateLockTestHooks, 'function');
  });

  await t.test('state.cjs exports 100% backwards-compatible facade functions', () => {
    assert.equal(typeof state.acquireStateLock, 'function');
    assert.equal(typeof state.releaseStateLock, 'function');
    assert.equal(typeof state.withStateLock, 'function');
    assert.equal(typeof state._setLockProbes, 'function');
    assert.equal(typeof state._resetLockProbes, 'function');
    assert.equal(typeof state._setStateLockTestHooks, 'function');
    assert.equal(typeof state._resetStateLockTestHooks, 'function');

    // Identical function references through delegation
    assert.equal(state.acquireStateLock, stateLock.acquireStateLock);
    assert.equal(state.releaseStateLock, stateLock.releaseStateLock);
    assert.equal(state.withStateLock, stateLock.withStateLock);
    assert.equal(state._setLockProbes, stateLock._setLockProbes);
    assert.equal(state._resetLockProbes, stateLock._resetLockProbes);
  });

  await t.test('withStateLock safely manages acquire and release across temp directory', async () => {
    const tmpDir = createTempDir('gsd-state-lock-test-');
    const statePath = path.join(tmpDir, 'STATE.md');
    fs.writeFileSync(statePath, '# State Test\n');

    let executed = false;
    const result = stateLock.withStateLock(statePath, () => {
      executed = true;
      const lockPath = statePath + '.lock';
      assert.ok(fs.existsSync(lockPath), 'lock file should exist during withStateLock execution');
      return 42;
    });

    assert.equal(executed, true);
    assert.equal(result, 42);
    assert.ok(!fs.existsSync(statePath + '.lock'), 'lock file should be released after execution');

    // Clean up
    cleanup(tmpDir);
  });

  await t.test('acquireStateLock and releaseStateLock work across facade boundaries', () => {
    const tmpDir = createTempDir('gsd-state-lock-test-');
    const statePath = path.join(tmpDir, 'STATE.md');
    fs.writeFileSync(statePath, '# State Test\n');

    // Acquire via direct state-lock module
    const handle = stateLock.acquireStateLock(statePath);
    assert.ok(handle, 'handle should be non-null');
    assert.ok(fs.existsSync(statePath + '.lock'), 'lock file must exist');

    // Release via state.cjs facade
    assert.doesNotThrow(() => {
      state.releaseStateLock(handle);
    });
    assert.ok(!fs.existsSync(statePath + '.lock'), 'lock file must not exist after release');

    // Clean up
    cleanup(tmpDir);
  });
});

