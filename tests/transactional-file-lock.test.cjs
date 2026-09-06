'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { cleanup } = require('./helpers.cjs');

const { withFileLockSync } = require('../gsd-core/bin/lib/shell-command-projection.cjs');

describe('Wave 4: Transactional File Lock & Stale Lock Eviction', () => {
  it('acquires lock, executes critical section, and cleans up lockfile', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-lock-test-'));
    try {
      const targetFile = path.join(tmpDir, 'data.json');
      const lockFile = targetFile + '.lock';

      let lockExistedDuringExec = false;
      const result = withFileLockSync(targetFile, () => {
        lockExistedDuringExec = fs.existsSync(lockFile);
        fs.writeFileSync(targetFile, JSON.stringify({ count: 1 }));
        return 42;
      });

      assert.strictEqual(result, 42);
      assert.strictEqual(lockExistedDuringExec, true, 'Lock file must exist during critical section');
      assert.strictEqual(fs.existsSync(lockFile), false, 'Lock file must be removed after critical section');
      assert.strictEqual(JSON.parse(fs.readFileSync(targetFile, 'utf8')).count, 1);
    } finally {
      cleanup(tmpDir);
    }
  });

  it('evicts stale lock when age exceeds staleMs', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-lock-stale-'));
    try {
      const targetFile = path.join(tmpDir, 'store.json');
      const lockFile = targetFile + '.lock';

      // Create an artificial stale lockfile from 10 seconds ago
      fs.writeFileSync(lockFile, JSON.stringify({ pid: process.pid, createdAt: Date.now() - 10000 }));

      let ran = false;
      withFileLockSync(targetFile, () => {
        ran = true;
      }, { staleMs: 1000, timeoutMs: 2000 });

      assert.strictEqual(ran, true, 'Critical section should execute after stale lock eviction');
      assert.strictEqual(fs.existsSync(lockFile), false, 'Lock file must be unlinked after execution');
    } finally {
      cleanup(tmpDir);
    }
  });

  it('evicts stale lock when PID is dead', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-lock-deadpid-'));
    try {
      const targetFile = path.join(tmpDir, 'store.json');
      const lockFile = targetFile + '.lock';

      // Non-existent PID
      fs.writeFileSync(lockFile, JSON.stringify({ pid: 99999999, createdAt: Date.now() }));

      let ran = false;
      withFileLockSync(targetFile, () => {
        ran = true;
      }, { staleMs: 60000, timeoutMs: 2000 });

      assert.strictEqual(ran, true, 'Critical section should execute after dead PID eviction');
      assert.strictEqual(fs.existsSync(lockFile), false);
    } finally {
      cleanup(tmpDir);
    }
  });

  it('preserves return value and cleans up on exception', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-lock-err-'));
    try {
      const targetFile = path.join(tmpDir, 'store.json');
      const lockFile = targetFile + '.lock';

      assert.throws(() => {
        withFileLockSync(targetFile, () => {
          throw new Error('boom');
        });
      }, /boom/);

      assert.strictEqual(fs.existsSync(lockFile), false, 'Lockfile must be unlinked even when fn throws');
    } finally {
      cleanup(tmpDir);
    }
  });
});
