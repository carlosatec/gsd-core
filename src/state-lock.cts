/**
 * GSD Core Nexus — State Lock Subsystem (Phase 36 Modularization Facade)
 *
 * Implements cooperative file-locking on STATE.md.lock with:
 * - Atomic O_EXCL creation and PID liveness verification (process.kill(pid, 0))
 * - Transient errno retry backoff (EPERM, EBUSY, EAGAIN, EINVAL, EIO, ENOENT, ESTALE)
 * - Stale lock steal with fresh-create floor and absolute deadman ceiling
 * - Test seams (_setLockProbes, _setStateLockTestHooks) for deterministic concurrency testing
 */

import fs from 'node:fs';
import { realClock } from './clock.cjs';
import { retryRenameSync } from './shell-command-projection.cjs';

export interface StateLockClock {
  now(): number;
  sleep(ms: number): void;
}

export interface StateLockTestHooks {
  afterAcquire?: (lockPath: string) => void;
  simulateWriteError?: string | null;
  onLoopIteration?: (ctx: { iteration: number }) => void;
  beforeSteal?: (ctx: { lockPath: string }) => void;
}

export type LockBodyStatus =
  | { kind: 'pid'; pid: number }
  | { kind: 'empty' }
  | { kind: 'unreadable' };

export const ACQUIRE_LOCK_RETRY_ERRNOS = new Set([
  'EPERM',   // Windows / macOS AV scanner holds the file open during delete
  'EBUSY',   // Windows: file in use by another process
  'EAGAIN',  // POSIX: resource temporarily unavailable
  'EINTR',   // POSIX: syscall interrupted by signal
  'EINVAL',  // Docker overlay-fs: transient during concurrent O_EXCL creation
  'EIO',     // Docker overlay-fs / NFS: transient I/O error
  'ENOENT',  // Docker overlay-fs: parent dir transiently missing during race
  'ESTALE',  // NFS: stale file handle (self-resolves on retry)
]);

export const _heldStateLocks = new Set<string>();

process.on('exit', () => {
  for (const lockPath of _heldStateLocks) {
    try { fs.unlinkSync(lockPath); } catch { /* already gone */ }
  }
});

export function _realIsPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export const _stateLockProbes: { isPidAlive: (pid: number) => boolean } = { isPidAlive: _realIsPidAlive };

export const _stateLockTestHooks: StateLockTestHooks = {};

export function _consumeSimulatedWriteError(): NodeJS.ErrnoException | null {
  const code = _stateLockTestHooks.simulateWriteError;
  if (!code) return null;
  _stateLockTestHooks.simulateWriteError = null;
  const e = new Error('simulated writeSync failure (' + code + ')') as NodeJS.ErrnoException;
  e.code = code;
  return e;
}

export function _stateLockIsPidAlive(pid: number): boolean {
  return _stateLockProbes.isPidAlive(pid);
}

export function _stateHolderVerifiedLive(lockPath: string): boolean {
  const pid = _stateLockBodyPid(lockPath);
  return pid !== null && _stateLockIsPidAlive(pid);
}

export function _stateLockBodyStatus(lockPath: string): LockBodyStatus {
  let body: string;
  try {
    body = fs.readFileSync(lockPath, 'utf-8');
  } catch {
    return { kind: 'unreadable' };
  }
  const trimmed = body.trim();
  const pid = parseInt(trimmed, 10);
  if (!Number.isInteger(pid) || pid <= 0 || String(pid) !== trimmed) return { kind: 'empty' };
  return { kind: 'pid', pid };
}

export function _stateLockBodyPid(lockPath: string): number | null {
  const status = _stateLockBodyStatus(lockPath);
  return status.kind === 'pid' ? status.pid : null;
}

let _stateStealSeq = 0;

export function acquireStateLock(statePath: string, clock?: StateLockClock): string {
  if (clock === undefined) clock = realClock;
  const lockPath = statePath + '.lock';
  const retryDelay = 200;
  const maxWaitMs = 30000;
  const deadmanCeilingMs = 60000;
  const freshCreateFloorMs = 1000;
  const startedAt = clock.now();

  const checkBudgetAndSleep = (context: string) => {
    if (clock.now() - startedAt >= maxWaitMs) {
      const e = new Error(
        'acquireStateLock: ' + lockPath + ' ' + context + ' for ' +
        (clock.now() - startedAt) + 'ms (exceeded ' + maxWaitMs + 'ms budget)'
      );
      (e as unknown as Record<string, unknown>).lockBudgetExceeded = true;
      throw e;
    }
    const jitter = Math.floor(Math.random() * 50);
    clock.sleep(retryDelay + jitter);
  };

  let _loopIteration = 0;
  while (true) {
    if (_stateLockTestHooks.onLoopIteration) _stateLockTestHooks.onLoopIteration({ iteration: _loopIteration++ });
    try {
      const fd = fs.openSync(lockPath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY);
      try {
        const injected = _consumeSimulatedWriteError();
        if (injected) throw injected;
        fs.writeSync(fd, String(process.pid));
        fs.closeSync(fd);
      } catch (writeErr) {
        try { fs.closeSync(fd); } catch { /* best-effort */ }
        try { fs.unlinkSync(lockPath); } catch { /* best-effort */ }
        throw writeErr;
      }
      _heldStateLocks.add(lockPath);
      return lockPath;
    } catch (err) {
      if (ACQUIRE_LOCK_RETRY_ERRNOS.has((err as NodeJS.ErrnoException).code as string)) {
        checkBudgetAndSleep((err as NodeJS.ErrnoException).code + ' persisted');
        continue;
      }
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;

      try {
        const stat = fs.statSync(lockPath);
        const ageMs = clock.now() - stat.mtimeMs;
        const bodyStatus = _stateLockBodyStatus(lockPath);
        const bodyPid = bodyStatus.kind === 'pid' ? bodyStatus.pid : null;
        const holderLive = bodyPid !== null && _stateLockIsPidAlive(bodyPid);
        let steal: boolean;
        if (holderLive) {
          steal = ageMs > deadmanCeilingMs;
        } else if (bodyPid !== null) {
          steal = true;
        } else if (bodyStatus.kind === 'unreadable') {
          steal = ageMs > deadmanCeilingMs;
        } else {
          steal = ageMs > freshCreateFloorMs;
        }
        if (steal) {
          if (_stateLockTestHooks.beforeSteal) _stateLockTestHooks.beforeSteal({ lockPath });
          let confirmStat: fs.Stats;
          try {
            confirmStat = fs.statSync(lockPath);
          } catch {
            continue;
          }
          const sameInstance =
            typeof stat.dev === 'number' && typeof stat.ino === 'number' &&
            confirmStat.dev === stat.dev && confirmStat.ino === stat.ino &&
            _stateLockBodyPid(lockPath) === bodyPid;
          if (!sameInstance) {
            checkBudgetAndSleep('lock changed before steal');
            continue;
          }
          const stolen = lockPath + '.stale-' + process.pid + '-' + clock.now() + '-' + (_stateStealSeq++);
          let renamed = false;
          try { retryRenameSync(lockPath, stolen); renamed = true; } catch { /* another racer won */ }
          if (renamed) {
            try { fs.rmSync(stolen, { force: true }); } catch { /* best-effort */ }
            continue;
          }
          checkBudgetAndSleep('stale lock steal lost to racer');
          continue;
        }
      } catch (err) {
        if ((err as Record<string, unknown>)?.lockBudgetExceeded) throw err;
        checkBudgetAndSleep('statSync failed after EEXIST');
        continue;
      }
      checkBudgetAndSleep('held by live process');
    }
  }
}

export function releaseStateLock(lockPath: string): void {
  _heldStateLocks.delete(lockPath);
  try { fs.unlinkSync(lockPath); } catch { /* lock already gone */ }
}

export function withStateLock<T>(statePath: string, fn: () => T): T {
  const lockPath = acquireStateLock(statePath);
  try {
    return fn();
  } finally {
    releaseStateLock(lockPath);
  }
}

export function _setLockProbes(probes: Partial<{ isPidAlive: (pid: number) => boolean }>): void {
  if (typeof probes.isPidAlive === 'function') _stateLockProbes.isPidAlive = probes.isPidAlive;
}

export function _resetLockProbes(): void {
  _stateLockProbes.isPidAlive = _realIsPidAlive;
}

export function _setStateLockTestHooks(hooks: StateLockTestHooks): void {
  if ('afterAcquire' in hooks) _stateLockTestHooks.afterAcquire = hooks.afterAcquire;
  if ('simulateWriteError' in hooks) _stateLockTestHooks.simulateWriteError = hooks.simulateWriteError;
  if ('onLoopIteration' in hooks) _stateLockTestHooks.onLoopIteration = hooks.onLoopIteration;
  if ('beforeSteal' in hooks) _stateLockTestHooks.beforeSteal = hooks.beforeSteal;
}

export function _resetStateLockTestHooks(): void {
  delete _stateLockTestHooks.afterAcquire;
  delete _stateLockTestHooks.simulateWriteError;
  delete _stateLockTestHooks.onLoopIteration;
  delete _stateLockTestHooks.beforeSteal;
}

