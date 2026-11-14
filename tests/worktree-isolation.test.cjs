'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { mock } = require('node:test');
const { cleanup } = require('./helpers.cjs');

const {
  isWorktreeSupported,
  linkSharedDependencies,
  unlinkSharedDependencies,
  createIsolatedWorktree,
  cleanupRetainedWorktree,
  cleanupWaveWorktrees,
} = require('../gsd-core/bin/lib/worktree-isolation.cjs');

test('Worktree Isolation: isWorktreeSupported in repository', () => {
  // Current repo root is a git repository
  const repoRoot = path.resolve(__dirname, '..');
  const supported = isWorktreeSupported(repoRoot);
  assert.equal(supported, true);

  // A plain temp dir is not a git repo
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-non-git-'));
  try {
    assert.equal(isWorktreeSupported(tmpDir), false);
  } finally {
    cleanup(tmpDir);
  }
});

test('Worktree Isolation: Shared Dependency Linking & Windows Junction Safety', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-link-root-'));
  const tmpWorktree = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-link-wt-'));

  try {
    // Create dummy node_modules in root with a test file
    const rootNodeModules = path.join(tmpRoot, 'node_modules');
    fs.mkdirSync(rootNodeModules, { recursive: true });
    const sentinelFile = path.join(rootNodeModules, 'sentinel.txt');
    fs.writeFileSync(sentinelFile, 'ROOT_DATA_PRESERVED', 'utf8');

    // 1. Link shared dependencies
    const linkResult = linkSharedDependencies(tmpRoot, tmpWorktree);
    assert.equal(linkResult.linked, true);
    assert.ok(linkResult.method === 'junction' || linkResult.method === 'symlink');

    // Verify sentinel file is accessible from worktree
    const wtSentinel = path.join(tmpWorktree, 'node_modules', 'sentinel.txt');
    assert.ok(fs.existsSync(wtSentinel), 'Sentinel file must be visible in worktree');
    assert.equal(fs.readFileSync(wtSentinel, 'utf8'), 'ROOT_DATA_PRESERVED');

    // 2. Defensively unlink shared dependencies
    const unlinked = unlinkSharedDependencies(tmpWorktree);
    assert.equal(unlinked, true);

    // CRITICAL SAFETY ASSERTION:
    // Root node_modules and its sentinel file MUST NOT have been deleted!
    assert.ok(fs.existsSync(rootNodeModules), 'Root node_modules must remain intact!');
    assert.ok(fs.existsSync(sentinelFile), 'Root sentinel file must not be deleted!');
    assert.equal(fs.readFileSync(sentinelFile, 'utf8'), 'ROOT_DATA_PRESERVED');

    // Worktree node_modules must now be unlinked
    assert.equal(fs.existsSync(path.join(tmpWorktree, 'node_modules')), false);
  } finally {
    // Unlink first just in case before rmdir
    unlinkSharedDependencies(tmpWorktree);
    cleanup(tmpRoot);
    cleanup(tmpWorktree);
  }
});

test('Worktree Isolation: In-Place Fallback for non-git directory', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-fallback-'));
  try {
    const res = createIsolatedWorktree({
      rootDir: tmpDir,
      taskId: 'test-fallback-task',
      subagentId: 'agent-fallback-01',
    });

    assert.equal(res.isFallback, true);
    assert.equal(res.worktreePath, tmpDir);
    assert.equal(res.env.GSD_WORKTREE_ROOT, tmpDir);
  } finally {
    cleanup(tmpDir);
  }
});

test('Worktree Isolation: Deterministic Wave Rollback cleanup', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-wave-clean-'));
  try {
    const fakeWt = path.join(tmpRoot, 'wt-fake');
    fs.mkdirSync(fakeWt, { recursive: true });

    // Calling cleanupWaveWorktrees should not crash
    assert.doesNotThrow(() => {
      cleanupWaveWorktrees(tmpRoot, [{ worktreePath: fakeWt, branch: 'fake-branch' }]);
    });
  } finally {
    cleanup(tmpRoot);
  }
});

test('Worktree Isolation: cleanup aborts before rmSync when unlinkSharedDependencies returns false', (t) => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-unlink-fail-'));
  const fakeWt = path.join(tmpRoot, 'wt-locked');
  const fakeNodeModules = path.join(fakeWt, 'node_modules');
  fs.mkdirSync(fakeNodeModules, { recursive: true });
  t.after(() => cleanup(tmpRoot));

  const rmSyncSpy = mock.method(fs, 'rmSync');
  const lstatMock = mock.method(fs, 'lstatSync', (p) => {
    if (path.resolve(String(p)) === path.resolve(fakeNodeModules)) {
      return { isSymbolicLink: () => true, isDirectory: () => true };
    }
    return fs.lstatSync.mock.original ? fs.lstatSync.mock.original(p) : {};
  });
  const unlinkMock = mock.method(fs, 'unlinkSync', (p) => {
    if (path.resolve(String(p)) === path.resolve(fakeNodeModules)) {
      const err = new Error('EBUSY');
      err.code = 'EBUSY';
      throw err;
    }
  });
  const rmdirMock = mock.method(fs, 'rmdirSync', (p) => {
    if (path.resolve(String(p)) === path.resolve(fakeNodeModules)) {
      const err = new Error('EBUSY');
      err.code = 'EBUSY';
      throw err;
    }
  });
  t.after(() => {
    rmSyncSpy.mock.restore();
    lstatMock.mock.restore();
    unlinkMock.mock.restore();
    rmdirMock.mock.restore();
  });

  const retainedRes = cleanupRetainedWorktree(tmpRoot, fakeWt, 'fake-branch');
  assert.equal(retainedRes.success, false, 'cleanupRetainedWorktree must abort when unlink fails');
  assert.match(retainedRes.error, /Refusing to remove worktree/);
  assert.equal(rmSyncSpy.mock.callCount(), 0, 'fs.rmSync must never be invoked after unlink failure');

  cleanupWaveWorktrees(tmpRoot, [{ worktreePath: fakeWt, branch: 'fake-branch' }]);
  assert.equal(rmSyncSpy.mock.callCount(), 0, 'cleanupWaveWorktrees must skip fs.rmSync when unlink fails');
});
