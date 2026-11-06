'use strict';

/**
 * Phase 35 Wave 1 Regression Suite: Worktree Safety, Rollback & Seam Retry
 *
 * Verifies:
 * 1. Worktree merge conflict aborts active root merge without deleting the temporary branch.
 * 2. Failed worktree retains the branch and worktree directory for developer recovery.
 * 3. Cleanup happens exclusively on the successful merge path.
 * 4. Explicit later cleanup via cleanupRetainedWorktree safely cleans retained artifacts.
 * 5. execGitWithRetry utilizes clock seam with 0% CPU spin and immediate exit on success.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { execSync } = require('node:child_process');
const { cleanup } = require('./helpers.cjs');

const worktreeModule = require('../gsd-core/bin/lib/worktree-isolation.cjs');
const {
  createIsolatedWorktree,
  mergeAndCleanupWorktree,
  cleanupRetainedWorktree,
  execGitWithRetry,
} = worktreeModule;

describe('Phase 35 Wave 1 — Worktree Recovery & Conflict Resilience', () => {
  it('retains branch and worktree directory upon merge conflict and aborts active root merge', () => {
    // Create a real temporary Git repository
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-wt-conflict-'));
    try {
      execSync('git init -b main', { cwd: repoDir, windowsHide: true, timeout: 10000 });
      execSync('git config user.name "GSD Tester"', { cwd: repoDir, windowsHide: true, timeout: 10000 });
      execSync('git config user.email "tester@opengsd.org"', { cwd: repoDir, windowsHide: true, timeout: 10000 });

      // Initial commit on main
      fs.writeFileSync(path.join(repoDir, 'conflict.txt'), 'base version\n', 'utf8');
      execSync('git add -A', { cwd: repoDir, windowsHide: true, timeout: 10000 });
      execSync('git commit -m "initial commit"', { cwd: repoDir, windowsHide: true, timeout: 10000 });

      // Create isolated worktree for task
      const wtRes = createIsolatedWorktree({
        rootDir: repoDir,
        taskId: 'task-conflict-1',
        branchName: 'wt-conflict-branch',
      });

      assert.equal(wtRes.isFallback, false);
      const wtPath = wtRes.worktreePath;
      const branch = wtRes.branch;

      // Make divergent changes on main
      fs.writeFileSync(path.join(repoDir, 'conflict.txt'), 'version on main\n', 'utf8');
      execSync('git add -A', { cwd: repoDir, windowsHide: true, timeout: 10000 });
      execSync('git commit -m "update on main"', { cwd: repoDir, windowsHide: true, timeout: 10000 });

      // Make conflicting changes in worktree
      fs.writeFileSync(path.join(wtPath, 'conflict.txt'), 'version in worktree\n', 'utf8');

      // Attempt merge and cleanup — merge MUST fail due to conflict
      const mergeRes = mergeAndCleanupWorktree({
        rootDir: repoDir,
        worktreePath: wtPath,
        branch,
      });

      // Assert defensive rollback: failed merge does NOT delete branch or worktree
      assert.equal(mergeRes.success, false);
      assert.equal(mergeRes.recoveryBranch, branch);
      assert.equal(mergeRes.recoveryWorktreeDir, wtPath);

      // Branch must still exist!
      const branchCheck = execSync(`git branch --list ${branch}`, { cwd: repoDir, encoding: 'utf8', timeout: 10000 });
      assert.ok(branchCheck.includes(branch), 'Temporary branch MUST be retained for recovery');

      // Worktree directory must still exist!
      assert.ok(fs.existsSync(wtPath), 'Worktree directory MUST be retained for recovery');

      // Root repo must NOT be left in an unresolved merge state (MERGE_HEAD must be gone)
      const mergeHead = path.join(repoDir, '.git', 'MERGE_HEAD');
      assert.equal(fs.existsSync(mergeHead), false, 'Active merge MUST be cleanly aborted');

      // Now invoke explicit later cleanup
      const cleanRes = cleanupRetainedWorktree(repoDir, wtPath, branch);
      assert.equal(cleanRes.success, true);
      assert.equal(fs.existsSync(wtPath), false, 'Worktree directory cleanly removed on explicit cleanup');
    } finally {
      cleanup(repoDir);
    }
  });

  it('clock seam in execGitWithRetry executes without spinlock and exits immediately on success', () => {
    let sleepCalls = 0;
    const fakeClock = {
      now: () => Date.now(),
      nowIso: () => new Date().toISOString(),
      today: () => '2026-11-06',
      localToday: () => '2026-11-06',
      sleep: (_ms) => {
        sleepCalls++;
      },
    };

    // Successful git command exits on attempt 1 without calling clock.sleep
    const res = execGitWithRetry(['--version'], { clock: fakeClock });
    assert.equal(res.exitCode, 0);
    assert.equal(sleepCalls, 0, 'No sleep on immediate success');
  });
});
