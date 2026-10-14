"use strict";
/**
 * GSD Active Session Ledger & Multi-Agent Collision Guard (Phase 32 — Wave 5)
 *
 * Concurrency & Cache Guardrails:
 * 1. Atomic reservation of files under edit in `.planning/intel/active-edits.json` with withFileLockSync.
 * 2. Multi-agent collision prevention with automatic orphan lock expiration (TTL).
 * 3. In-memory Reread Guard to prevent redundant read loops over unchanged files.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = __importDefault(require("node:crypto"));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const shellProj = require("./shell-command-projection.cjs");
const { platformReadSync, platformWriteSync, platformEnsureDir, withFileLockSync } = shellProj;
const DEFAULT_LOCK_TTL_MS = 30 * 60 * 1000; // 30 minutes
/**
 * Normalizes a file path to POSIX relative form.
 */
function normalizePath(filePath) {
    return filePath.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}
/**
 * Loads the active edits ledger from `.planning/intel/active-edits.json`.
 */
function loadLedger(planningDir) {
    const ledgerPath = node_path_1.default.join(planningDir, 'intel', 'active-edits.json');
    try {
        const raw = platformReadSync(ledgerPath);
        if (!raw)
            throw new Error('Empty');
        const parsed = JSON.parse(raw);
        return {
            version: parsed.version || '1.0.0',
            locks: parsed.locks || {},
        };
    }
    catch {
        return {
            version: '1.0.0',
            locks: {},
        };
    }
}
/**
 * Persists the active edits ledger to disk.
 */
function saveLedger(planningDir, data) {
    const intelDir = node_path_1.default.join(planningDir, 'intel');
    platformEnsureDir(intelDir);
    const ledgerPath = node_path_1.default.join(intelDir, 'active-edits.json');
    platformWriteSync(ledgerPath, JSON.stringify(data, null, 2));
}
/**
 * Removes expired locks whose TTL has elapsed.
 */
function pruneExpiredLocks(data, nowMs = Date.now()) {
    let changed = false;
    for (const [key, lock] of Object.entries(data.locks)) {
        const lockTime = Date.parse(lock.lockedAt);
        if (isNaN(lockTime) || nowMs - lockTime > (lock.ttlMs || DEFAULT_LOCK_TTL_MS)) {
            delete data.locks[key];
            changed = true;
        }
    }
    return changed;
}
/**
 * Atomically acquires an edit reservation on a target file.
 */
function acquireFileLock(planningDir, filePath, agentId, sessionId = 'session-default', ttlMs = DEFAULT_LOCK_TTL_MS) {
    const norm = normalizePath(filePath);
    const ledgerPath = node_path_1.default.join(planningDir, 'intel', 'active-edits.json');
    return withFileLockSync(ledgerPath, () => {
        const data = loadLedger(planningDir);
        pruneExpiredLocks(data);
        const existing = data.locks[norm];
        if (existing) {
            if (existing.agentId !== agentId) {
                return {
                    acquired: false,
                    conflict: existing,
                    reason: `COLLISION_GUARD_BLOCK: File "${norm}" is under active edit by agent "${existing.agentId}" (sessionId: ${existing.sessionId}).`,
                };
            }
        }
        const newLock = {
            path: norm,
            agentId,
            sessionId,
            lockedAt: new Date().toISOString(),
            ttlMs,
        };
        data.locks[norm] = newLock;
        saveLedger(planningDir, data);
        return {
            acquired: true,
            lock: newLock,
        };
    });
}
/**
 * Releases a previously acquired edit reservation.
 */
function releaseFileLock(planningDir, filePath, agentId) {
    const norm = normalizePath(filePath);
    const ledgerPath = node_path_1.default.join(planningDir, 'intel', 'active-edits.json');
    return withFileLockSync(ledgerPath, () => {
        const data = loadLedger(planningDir);
        const existing = data.locks[norm];
        if (existing && existing.agentId === agentId) {
            delete data.locks[norm];
            saveLedger(planningDir, data);
            return true;
        }
        return false;
    });
}
/**
 * Returns all active, unexpired locks.
 */
function getActiveLocks(planningDir) {
    const data = loadLedger(planningDir);
    pruneExpiredLocks(data);
    return Object.values(data.locks);
}
/**
 * Clears all locks in the active edits ledger.
 */
function clearAllLocks(planningDir) {
    const ledgerPath = node_path_1.default.join(planningDir, 'intel', 'active-edits.json');
    withFileLockSync(ledgerPath, () => {
        saveLedger(planningDir, { version: '1.0.0', locks: {} });
    });
}
/**
 * Inspects whether a file has an active edit reservation by another agent without acquiring a lock.
 */
function checkLockConflict(planningDir, filePath, agentId) {
    const norm = normalizePath(filePath);
    const data = loadLedger(planningDir);
    pruneExpiredLocks(data);
    const existing = data.locks[norm];
    if (existing && existing.agentId !== agentId) {
        return {
            acquired: false,
            conflict: existing,
            reason: `COLLISION_GUARD_BLOCK: File "${norm}" is under active edit by agent "${existing.agentId}" (sessionId: ${existing.sessionId}).`,
        };
    }
    return { acquired: true };
}
/**
 * Releases all active locks held by a specific agent (or all agents if omitted).
 */
function releaseAgentLocks(planningDir, agentId) {
    const ledgerPath = node_path_1.default.join(planningDir, 'intel', 'active-edits.json');
    return withFileLockSync(ledgerPath, () => {
        const data = loadLedger(planningDir);
        let releasedCount = 0;
        for (const [key, lock] of Object.entries(data.locks)) {
            if (!agentId || lock.agentId === agentId) {
                delete data.locks[key];
                releasedCount++;
            }
        }
        if (releasedCount > 0) {
            saveLedger(planningDir, data);
        }
        return releasedCount;
    });
}
// ─── In-Memory Reread Guard ───────────────────────────────────────────────────
const _rereadCache = new Map();
/**
 * Tracks a file read and detects redundant reread loops on unchanged files.
 */
function trackFileRead(filePath, content, mtimeMs) {
    const norm = normalizePath(filePath);
    const hash = node_crypto_1.default.createHash('sha256').update(content).digest('hex').slice(0, 12);
    const existing = _rereadCache.get(norm);
    if (existing && existing.hash === hash) {
        if (mtimeMs === undefined || mtimeMs === existing.mtimeMs) {
            return { isRedundant: true, hash };
        }
    }
    _rereadCache.set(norm, {
        hash,
        content,
        timestamp: Date.now(),
        mtimeMs: mtimeMs ?? 0,
    });
    return { isRedundant: false, hash };
}
/**
 * Retrieves the cached read content for a file if available.
 */
function getCachedFileRead(filePath) {
    return _rereadCache.get(normalizePath(filePath));
}
/**
 * Clears the in-memory reread cache.
 */
function clearRereadCache() {
    _rereadCache.clear();
}
module.exports = {
    loadLedger,
    saveLedger,
    pruneExpiredLocks,
    acquireFileLock,
    releaseFileLock,
    getActiveLocks,
    clearAllLocks,
    checkLockConflict,
    releaseAgentLocks,
    trackFileRead,
    getCachedFileRead,
    clearRereadCache,
};
