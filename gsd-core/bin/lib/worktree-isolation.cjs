'use strict';
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.execGitWithRetry = execGitWithRetry;
exports.isWorktreeSupported = isWorktreeSupported;
exports.linkSharedDependencies = linkSharedDependencies;
exports.unlinkSharedDependencies = unlinkSharedDependencies;
exports.createIsolatedWorktree = createIsolatedWorktree;
exports.mergeAndCleanupWorktree = mergeAndCleanupWorktree;
exports.cleanupRetainedWorktree = cleanupRetainedWorktree;
exports.cleanupWaveWorktrees = cleanupWaveWorktrees;
/**
 * Worktree Isolation & Zero-Copy Concurrency Engine (Worktrunk Pattern) - Phase 34
 *
 * Orchestrates isolated Git worktrees for concurrent wave-based execution,
 * sharing `node_modules` via Windows NTFS Directory Junctions and Unix symlinks
 * with strict Windows defensive unlinking (`fs.unlinkSync`), Git index.lock
 * backoff retries, deterministic wave rollback, and in-place fallback resilience.
 */
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const shell_command_projection_cjs_1 = require("./shell-command-projection.cjs");
const clock_cjs_1 = require("./clock.cjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const worktreeSafety = require("./worktree-safety.cjs");
/**
 * Execute Git command with exponential backoff retry for index.lock contention
 */
function execGitWithRetry(args, opts = {}) {
    const maxAttempts = opts.maxAttempts ?? 3;
    const clock = opts.clock ?? clock_cjs_1.realClock;
    let attempt = 0;
    let lastResult = { exitCode: 1, stdout: '', stderr: '', signal: null, error: null, timedOut: false };
    while (attempt < maxAttempts) {
        attempt++;
        lastResult = (0, shell_command_projection_cjs_1.execGit)(args, { cwd: opts.cwd, timeout: opts.timeout || 15000 });
        if (lastResult.exitCode === 0) {
            return lastResult;
        }
        const errStr = (lastResult.stderr || '') + (lastResult.stdout || '');
        if (errStr.includes('.git/index.lock') || errStr.includes('Unable to create') || errStr.includes('File exists')) {
            if (attempt < maxAttempts) {
                // Lock contention detected: backoff 150ms * attempt using clock seam (CPU-idle)
                const sleepMs = 150 * attempt;
                clock.sleep(sleepMs);
                continue;
            }
        }
        // Non-retryable error
        break;
    }
    return lastResult;
}
/**
 * Check if the root directory is inside a valid Git repository supporting worktrees
 */
function isWorktreeSupported(rootDir) {
    try {
        const res = (0, shell_command_projection_cjs_1.execGit)(['rev-parse', '--is-inside-work-tree'], { cwd: rootDir });
        return res.exitCode === 0 && res.stdout.trim() === 'true';
    }
    catch {
        return false;
    }
}
/**
 * Links `node_modules` from the main repository into the worktree.
 * On Windows, uses NTFS Directory Junction ('junction').
 * On POSIX, uses standard directory symlink ('dir').
 */
function linkSharedDependencies(mainRoot, worktreePath) {
    const sourceNodeModules = path.resolve(mainRoot, 'node_modules');
    const targetNodeModules = path.resolve(worktreePath, 'node_modules');
    if (!fs.existsSync(sourceNodeModules)) {
        return { linked: false, method: 'none', path: targetNodeModules };
    }
    // If target already exists, do not recreate
    if (fs.existsSync(targetNodeModules)) {
        return { linked: true, method: process.platform === 'win32' ? 'junction' : 'symlink', path: targetNodeModules };
    }
    try {
        if (process.platform === 'win32') {
            fs.symlinkSync(sourceNodeModules, targetNodeModules, 'junction');
            return { linked: true, method: 'junction', path: targetNodeModules };
        }
        else {
            fs.symlinkSync(sourceNodeModules, targetNodeModules, 'dir');
            return { linked: true, method: 'symlink', path: targetNodeModules };
        }
    }
    catch {
        // Fail-open without breaking execution
        return { linked: false, method: 'none', path: targetNodeModules };
    }
}
/**
 * Defensively unlinks the shared `node_modules` dependency junction or symlink.
 * CRITICAL WINDOWS GUARANTEE: Never call fs.rmSync on a junction directory without
 * explicitly unlinking first, otherwise Windows deletes files in the target root!
 */
function unlinkSharedDependencies(worktreePath) {
    const targetNodeModules = path.resolve(worktreePath, 'node_modules');
    try {
        let lstat = null;
        try {
            lstat = fs.lstatSync(targetNodeModules);
        }
        catch {
            return true; // Doesn't exist, nothing to unlink
        }
        if (lstat.isSymbolicLink() || (process.platform === 'win32' && lstat.isDirectory())) {
            try {
                fs.unlinkSync(targetNodeModules);
                return true;
            }
            catch {
                // Fallback for directory junctions on older Windows/Node
                try {
                    fs.rmdirSync(targetNodeModules);
                    return true;
                }
                catch {
                    return false;
                }
            }
        }
    }
    catch {
        return false;
    }
    return true;
}
/**
 * Creates an isolated Git worktree for parallel wave execution.
 * Falls back safely to in-place execution if worktrees are unsupported.
 */
function createIsolatedWorktree(options) {
    const { rootDir, taskId, subagentId } = options;
    const safeTaskId = taskId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const branch = options.branchName || `worktree-agent-${safeTaskId}-${Date.now().toString(36)}`;
    const worktreeDirName = `wt-${safeTaskId}`;
    const worktreesBase = path.join(rootDir, '.planning', 'worktrees');
    const worktreePath = path.join(worktreesBase, worktreeDirName);
    if (!isWorktreeSupported(rootDir)) {
        // Safe in-place fallback
        return {
            worktreePath: rootDir,
            branch: 'main',
            isFallback: true,
            env: {
                GSD_WORKTREE_ROOT: rootDir,
                GSD_PROJECT_ROOT: rootDir,
            },
            sharedDependencyMethod: 'none',
        };
    }
    try {
        fs.mkdirSync(worktreesBase, { recursive: true });
        // Clean up existing stale worktree if present
        if (fs.existsSync(worktreePath)) {
            unlinkSharedDependencies(worktreePath);
            execGitWithRetry(['worktree', 'remove', '--force', worktreePath], { cwd: rootDir });
            try {
                fs.rmSync(worktreePath, { recursive: true, force: true });
            }
            catch {
                // Non-blocking
            }
        }
        // Git worktree add -b <branch> <worktreePath> HEAD
        const addRes = execGitWithRetry(['worktree', 'add', '-b', branch, worktreePath, 'HEAD'], { cwd: rootDir });
        if (addRes.exitCode !== 0) {
            // In-place fallback if git worktree fails
            return {
                worktreePath: rootDir,
                branch: 'main',
                isFallback: true,
                env: {
                    GSD_WORKTREE_ROOT: rootDir,
                    GSD_PROJECT_ROOT: rootDir,
                },
                sharedDependencyMethod: 'none',
            };
        }
        // Prevent Git from tracking node_modules in the worktree
        try {
            const gitDirRes = (0, shell_command_projection_cjs_1.execGit)(['rev-parse', '--git-dir'], { cwd: worktreePath });
            if (gitDirRes.exitCode === 0) {
                const gitDir = path.resolve(worktreePath, gitDirRes.stdout.trim());
                const excludePath = path.join(gitDir, 'info', 'exclude');
                fs.mkdirSync(path.dirname(excludePath), { recursive: true });
                fs.appendFileSync(excludePath, '\nnode_modules\n.tmp\n', 'utf8');
            }
        }
        catch {
            // Non-blocking
        }
        // Link shared dependencies zero-copy
        const linkRes = linkSharedDependencies(rootDir, worktreePath);
        // Create isolated .tmp directory
        const tmpDir = path.join(worktreePath, '.tmp');
        try {
            fs.mkdirSync(tmpDir, { recursive: true });
        }
        catch {
            // Non-blocking
        }
        return {
            worktreePath,
            branch,
            isFallback: false,
            env: {
                GSD_WORKTREE_ROOT: worktreePath,
                GSD_PROJECT_ROOT: worktreePath,
                TMP: tmpDir,
                TEMP: tmpDir,
                ...(subagentId ? { GSD_AGENT_ID: subagentId } : {}),
            },
            sharedDependencyMethod: linkRes.method,
        };
    }
    catch {
        // In-place fallback on error
        return {
            worktreePath: rootDir,
            branch: 'main',
            isFallback: true,
            env: {
                GSD_WORKTREE_ROOT: rootDir,
                GSD_PROJECT_ROOT: rootDir,
            },
            sharedDependencyMethod: 'none',
        };
    }
}
/**
 * Merge changes from a worktree branch and safely remove the worktree.
 * Refined in Phase 35: on merge conflict, preserves the branch and worktree
 * for developer inspection, cleanly aborts any in-progress merge on the root repo,
 * and performs cleanup exclusively on the successful merge path.
 */
function mergeAndCleanupWorktree(options) {
    const { rootDir, worktreePath, branch, commitMessage, mergeStrategy = 'merge' } = options;
    if (worktreePath === rootDir) {
        // In-place fallback was used: no worktree to merge or remove
        return { success: true };
    }
    try {
        // 1. Commit any uncommitted changes inside the worktree
        execGitWithRetry(['add', '-A'], { cwd: worktreePath });
        const msg = commitMessage || `chore(worktree): save changes from ${branch}`;
        execGitWithRetry(['commit', '-m', msg], { cwd: worktreePath });
        // 2. Merge branch into current branch in root BEFORE destroying worktree
        const mergeArgs = mergeStrategy === 'squash'
            ? ['merge', '--squash', branch]
            : ['merge', '--no-ff', '-m', `Merge branch '${branch}'`, branch];
        const mergeRes = execGitWithRetry(mergeArgs, { cwd: rootDir });
        // 3. Handle merge failure defensively without deleting branch or worktree
        if (mergeRes.exitCode !== 0) {
            // Abort only active root merge so repo returns to clean pre-merge state
            const mergeHeadPath = path.join(rootDir, '.git', 'MERGE_HEAD');
            if (fs.existsSync(mergeHeadPath)) {
                execGitWithRetry(['merge', '--abort'], { cwd: rootDir });
            }
            return {
                success: false,
                error: mergeRes.stderr || mergeRes.stdout || 'Merge conflict encountered, branch and worktree preserved for recovery',
                recoveryBranch: branch,
                recoveryWorktreeDir: worktreePath,
            };
        }
        // 4. Merge succeeded: handle squash commit if requested
        let commitHash;
        if (mergeStrategy === 'squash') {
            const commitRes = execGitWithRetry(['commit', '-m', msg], { cwd: rootDir });
            if (commitRes.exitCode === 0) {
                const revRes = (0, shell_command_projection_cjs_1.execGit)(['rev-parse', 'HEAD'], { cwd: rootDir });
                commitHash = revRes.stdout.trim();
            }
        }
        else {
            const revRes = (0, shell_command_projection_cjs_1.execGit)(['rev-parse', 'HEAD'], { cwd: rootDir });
            commitHash = revRes.stdout.trim();
        }
        // 5. Cleanup EXCLUSIVELY on successful merge path
        unlinkSharedDependencies(worktreePath);
        execGitWithRetry(['worktree', 'remove', '--force', worktreePath], { cwd: rootDir });
        execGitWithRetry(['branch', '-D', branch], { cwd: rootDir });
        if (fs.existsSync(worktreePath)) {
            try {
                fs.rmSync(worktreePath, { recursive: true, force: true });
            }
            catch {
                // Non-blocking
            }
        }
        return {
            success: true,
            commitHash,
        };
    }
    catch (err) {
        return {
            success: false,
            error: err instanceof Error ? err.message : String(err),
            recoveryBranch: branch,
            recoveryWorktreeDir: worktreePath,
        };
    }
}
/**
 * Explicit later cleanup of a retained worktree and its branch after conflict resolution.
 */
function cleanupRetainedWorktree(rootDir, worktreePath, branch) {
    try {
        unlinkSharedDependencies(worktreePath);
        execGitWithRetry(['worktree', 'remove', '--force', worktreePath], { cwd: rootDir });
        execGitWithRetry(['branch', '-D', branch], { cwd: rootDir });
        if (fs.existsSync(worktreePath)) {
            try {
                fs.rmSync(worktreePath, { recursive: true, force: true });
            }
            catch {
                // Non-blocking
            }
        }
        return { success: true };
    }
    catch (err) {
        return {
            success: false,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}
/**
 * Deterministic wave rollback: safely unlinks and cleans up all worktrees in a failed wave.
 */
function cleanupWaveWorktrees(rootDir, worktrees) {
    for (const wt of worktrees) {
        if (wt.worktreePath === rootDir)
            continue;
        try {
            unlinkSharedDependencies(wt.worktreePath);
            execGitWithRetry(['worktree', 'remove', '--force', wt.worktreePath], { cwd: rootDir });
            execGitWithRetry(['branch', '-D', wt.branch], { cwd: rootDir });
            if (fs.existsSync(wt.worktreePath)) {
                fs.rmSync(wt.worktreePath, { recursive: true, force: true });
            }
        }
        catch {
            // Best-effort cleanup
        }
    }
    try {
        worktreeSafety.pruneOrphanedWorktrees(rootDir);
    }
    catch {
        // Non-blocking
    }
}
