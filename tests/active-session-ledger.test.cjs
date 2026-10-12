'use strict';

/**
 * Phase 32 Wave 5 Unit Suite: Active Session Ledger & Multi-Agent Collision Guard
 *
 * Validates:
 * 1. Atomic reservation of active edits with withFileLockSync.
 * 2. Multi-agent collision prevention: blocking concurrent edits across different agents.
 * 3. Lock release and TTL orphan lock auto-expiration.
 * 4. PreFlight Guardrails integration: emitting COLLISION_GUARD_BLOCK.
 * 5. In-memory Reread Guard: tracking and caching redundant reads.
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const ledgerMod = require('../gsd-core/bin/lib/active-session-ledger.cjs');
const preFlight = require('../gsd-core/bin/lib/preflight-guardrails.cjs');

const {
  acquireFileLock,
  releaseFileLock,
  getActiveLocks,
  pruneExpiredLocks,
  clearAllLocks,
  trackFileRead,
  getCachedFileRead,
  clearRereadCache,
  loadLedger,
} = ledgerMod;

const { runPreFlightChecks } = preFlight;

describe('Phase 32 Wave 5 — Active Session Ledger & Concurrency Locks', () => {
  let tmpDir;
  let planningDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-ledger-'));
    planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(path.join(planningDir, 'intel'), { recursive: true });
    clearAllLocks(planningDir);
  });

  it('atomically acquires, queries, and releases a lock for an agent', () => {
    const res = acquireFileLock(planningDir, 'src/service.ts', 'agent-alpha', 'session-1');
    assert.equal(res.acquired, true);
    assert.ok(res.lock);
    assert.equal(res.lock.agentId, 'agent-alpha');
    assert.equal(res.lock.path, 'src/service.ts');

    const active = getActiveLocks(planningDir);
    assert.equal(active.length, 1);
    assert.equal(active[0].path, 'src/service.ts');

    const released = releaseFileLock(planningDir, 'src/service.ts', 'agent-alpha');
    assert.equal(released, true);

    const afterRelease = getActiveLocks(planningDir);
    assert.equal(afterRelease.length, 0);
  });

  it('blocks concurrent edits from a different agent with COLLISION_GUARD_BLOCK', () => {
    acquireFileLock(planningDir, 'src/database.ts', 'agent-alpha', 'session-1');

    // Attempt concurrent lock from agent-beta
    const conflictRes = acquireFileLock(planningDir, 'src/database.ts', 'agent-beta', 'session-2');
    assert.equal(conflictRes.acquired, false);
    assert.ok(conflictRes.conflict);
    assert.equal(conflictRes.conflict.agentId, 'agent-alpha');
    assert.ok(conflictRes.reason && conflictRes.reason.includes('COLLISION_GUARD_BLOCK'));
  });

  it('allows re-entrant lock from the same agent in the same session', () => {
    const res1 = acquireFileLock(planningDir, 'src/util.ts', 'agent-alpha', 'session-1');
    assert.equal(res1.acquired, true);

    const res2 = acquireFileLock(planningDir, 'src/util.ts', 'agent-alpha', 'session-1');
    assert.equal(res2.acquired, true);
  });

  it('automatically prunes orphan locks when TTL has expired', () => {
    // Seed an expired lock directly
    const data = loadLedger(planningDir);
    data.locks['src/legacy.ts'] = {
      path: 'src/legacy.ts',
      agentId: 'agent-dead',
      sessionId: 'session-old',
      lockedAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(), // 40 min ago
      ttlMs: 30 * 60 * 1000, // 30 min TTL
    };

    const changed = pruneExpiredLocks(data, Date.now());
    assert.equal(changed, true);
    assert.equal(data.locks['src/legacy.ts'], undefined);
  });
});

describe('Phase 32 Wave 5 — PreFlight Guardrails Collision Integration', () => {
  it('emits COLLISION_GUARD_BLOCK error when target file is locked by another agent', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-preflight-col-'));
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(path.join(planningDir, 'intel'), { recursive: true });

    // Agent-A acquires lock on src/engine.ts
    acquireFileLock(planningDir, 'src/engine.ts', 'agent-a', 'session-1');

    // Agent-B runs preflight checks on src/engine.ts
    const report = runPreFlightChecks({
      taskId: 'task-collision-test',
      filesToModify: ['src/engine.ts'],
      planningDir,
      rootDir: tmpDir,
      agentId: 'agent-b',
      sessionId: 'session-2',
    });

    const collisionErrors = report.violations.filter(v => v.rule === 'COLLISION_GUARD_BLOCK');
    assert.ok(collisionErrors.length > 0);
    assert.equal(collisionErrors[0].severity, 'error');
    assert.ok(collisionErrors[0].message.includes('COLLISION_GUARD_BLOCK'));
  });
});

describe('Phase 32 Wave 5 — In-Memory Reread Guard & Cache', () => {
  beforeEach(() => {
    clearRereadCache();
  });

  it('tracks file reads and detects redundant reads of identical content', () => {
    const firstRead = trackFileRead('src/config.json', '{"key": "value"}');
    assert.equal(firstRead.isRedundant, false);
    assert.ok(firstRead.hash);

    const secondRead = trackFileRead('src/config.json', '{"key": "value"}');
    assert.equal(secondRead.isRedundant, true);
    assert.equal(secondRead.hash, firstRead.hash);

    const cached = getCachedFileRead('src/config.json');
    assert.ok(cached);
    assert.equal(cached.content, '{"key": "value"}');
  });

  it('invalidates redundancy when content changes', () => {
    trackFileRead('src/config.json', '{"key": "v1"}');
    const modifiedRead = trackFileRead('src/config.json', '{"key": "v2"}');
    assert.equal(modifiedRead.isRedundant, false);
  });
});
