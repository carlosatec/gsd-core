/**
 * Structured Session Logger — Append-only JSONL execution tracing for GSD Core Nexus
 * (Phase 14 / ADR-1239 / Decisions D-54, D-55, D-56).
 *
 * Persists session event streams in `.planning/intel/sessions/<id>.jsonl` with:
 * - Smart trimming (32 KB limit preserving head & tail)
 * - Secret redaction (API keys, auth tokens, passwords)
 * - Safe ring buffer rotation (50 sessions / 30 days retention)
 * - Windows concurrency & EPERM resilience
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { splitLines } from './text-lines.cjs';

type SessionEventType =
  | 'session_start'
  | 'tool_call'
  | 'tool_result'
  | 'file_mutation'
  | 'guardrail_intercept'
  | 'test_result'
  | 'session_end';

interface SessionEvent {
  type: SessionEventType;
  sessionId: string;
  timestamp: string;
  [key: string]: unknown;
}

interface SessionLoggerOptions {
  planningDir?: string;
  sessionId?: string;
  maxSessions?: number;
  maxAgeDays?: number;
  maxOutputBytes?: number;
}

interface SessionInfo {
  id: string;
  file: string;
  timestamp: string;
  command?: string;
  phaseId?: string;
  status?: string;
  sizeBytes: number;
  eventCount: number;
}

const DEFAULT_MAX_OUTPUT_BYTES = 32 * 1024; // 32 KB smart trimming cap
const DEFAULT_MAX_SESSIONS = 50;
const DEFAULT_MAX_AGE_DAYS = 30;

const SENSITIVE_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/g,
  /Bearer\s+[a-zA-Z0-9._-]+/gi,
  /password\s*[:=]\s*\S+/gi,
  /secret\s*[:=]\s*\S+/gi,
  /token\s*[:=]\s*\S+/gi,
  /api[_-]?key\s*[:=]\s*\S+/gi,
  /ghp_[a-zA-Z0-9]{36}/g,
  /gho_[a-zA-Z0-9]{36}/g,
  /xoxb-[a-zA-Z0-9-]+/g,
  /DEEPSEEK_API_KEY\s*[:=]\s*\S+/gi,
  /ANTHROPIC_API_KEY\s*[:=]\s*\S+/gi,
  /GEMINI_API_KEY\s*[:=]\s*\S+/gi,
];

class SessionLogger {
  readonly sessionId: string;
  readonly planningDir: string;
  readonly sessionsDir: string;
  readonly sessionFile: string;
  readonly maxOutputBytes: number;
  readonly maxSessions: number;
  readonly maxAgeDays: number;
  private isClosed = false;
  private toolCallsCount = 0;
  private mutationsCount = 0;
  private startTime: number;

  constructor(opts: SessionLoggerOptions = {}) {
    this.planningDir = opts.planningDir || path.resolve('.planning');
    this.sessionsDir = path.join(this.planningDir, 'intel', 'sessions');
    this.sessionId = opts.sessionId || SessionLogger.generateSessionId();
    this.sessionFile = path.join(this.sessionsDir, `session_${this.sessionId}.jsonl`);
    this.maxOutputBytes = opts.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    this.maxSessions = opts.maxSessions ?? DEFAULT_MAX_SESSIONS;
    this.maxAgeDays = opts.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS;
    this.startTime = Date.now();

    this.ensureDirectory();
  }

  static generateSessionId(): string {
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const rand = crypto.randomBytes(3).toString('hex');
    return `${timestamp}_${rand}`;
  }

  private ensureDirectory(): void {
    try {
      if (!fs.existsSync(this.sessionsDir)) {
        fs.mkdirSync(this.sessionsDir, { recursive: true });
      }
    } catch {
      // Ignored for environments where filesystem permissions are managed externally
    }
  }

  static trimOutput(output: unknown, maxBytes: number = DEFAULT_MAX_OUTPUT_BYTES): string {
    if (output === null || output === undefined) return '';
    const str = typeof output === 'string' ? output : JSON.stringify(output);
    const buf = Buffer.from(str, 'utf8');
    if (buf.length <= maxBytes) return str;

    const half = Math.floor((maxBytes - 100) / 2);
    const head = buf.subarray(0, half).toString('utf8');
    const tail = buf.subarray(buf.length - half).toString('utf8');
    const truncatedBytes = buf.length - (half * 2);

    return `${head}\n\n... [truncated ${truncatedBytes} bytes] ...\n\n${tail}`;
  }

  static redactSecrets(text: unknown): unknown {
    if (typeof text !== 'string') {
      if (text && typeof text === 'object') {
        if (Array.isArray(text)) {
          const arr: unknown[] = [];
          for (let i = 0; i < text.length; i++) {
            arr.push(SessionLogger.redactSecrets(text[i]));
          }
          return arr;
        }
        const copy: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(text as Record<string, unknown>)) {
          copy[k] = SessionLogger.redactSecrets(v);
        }
        return copy;
      }
      return text;
    }

    let result = text;
    for (const pattern of SENSITIVE_PATTERNS) {
      pattern.lastIndex = 0;
      result = result.replace(pattern, '[REDACTED_SECRET]');
    }
    return result;
  }

  log(event: Omit<SessionEvent, 'sessionId' | 'timestamp'> & { timestamp?: string }): void {
    if (this.isClosed) return;
    try {
      this.ensureDirectory();
      const fullEvent = {
        type: event.type,
        sessionId: this.sessionId,
        timestamp: event.timestamp || new Date().toISOString(),
        ...event,
      };

      const sanitized = SessionLogger.redactSecrets(fullEvent);
      const line = JSON.stringify(sanitized) + '\n';
      fs.appendFileSync(this.sessionFile, line, 'utf8');
    } catch {
      // Non-blocking log emission (fail-safe)
    }
  }

  startSession(metadata: Record<string, unknown> = {}): string {
    this.startTime = Date.now();
    this.log({
      type: 'session_start',
      platform: process.platform,
      nodeVersion: process.version,
      ...metadata,
    });
    SessionLogger.rotateSessions(this.sessionsDir, this.maxSessions, this.maxAgeDays);
    return this.sessionId;
  }

  logToolCall(toolName: string, params: Record<string, unknown> = {}, callId?: string): void {
    this.toolCallsCount++;
    this.log({
      type: 'tool_call',
      toolName,
      callId: callId || `call_${this.toolCallsCount}`,
      params: SessionLogger.redactSecrets(params),
    });
  }

  logToolResult(
    toolName: string,
    output: unknown,
    success = true,
    error?: string,
    durationMs?: number,
    callId?: string,
  ): void {
    const trimmedOutput = SessionLogger.trimOutput(output, this.maxOutputBytes);
    this.log({
      type: 'tool_result',
      toolName,
      callId: callId || `call_${this.toolCallsCount}`,
      success,
      output: trimmedOutput,
      error: error ? SessionLogger.trimOutput(error, 4096) : undefined,
      durationMs,
    });
  }

  logFileMutation(
    filePath: string,
    changeType: 'create' | 'update' | 'delete',
    diff?: string,
    beforeHash?: string,
    afterHash?: string,
  ): void {
    this.mutationsCount++;
    this.log({
      type: 'file_mutation',
      filePath,
      changeType,
      diff: diff ? SessionLogger.trimOutput(diff, this.maxOutputBytes) : undefined,
      beforeHash,
      afterHash,
    });
  }

  logGuardrailIntercept(
    ruleId: string,
    target: string,
    reason: string,
    action: 'blocked' | 'warned' = 'blocked',
  ): void {
    this.log({
      type: 'guardrail_intercept',
      ruleId,
      target,
      reason,
      action,
    });
  }

  logTestResult(
    suite: string,
    passed: number,
    failed: number,
    durationMs?: number,
    failureSummary?: string,
  ): void {
    this.log({
      type: 'test_result',
      suite,
      passed,
      failed,
      durationMs,
      failureSummary: failureSummary ? SessionLogger.trimOutput(failureSummary, 8192) : undefined,
    });
  }

  endSession(
    status: 'completed' | 'failed' | 'aborted' = 'completed',
    summary: Record<string, unknown> = {},
  ): void {
    if (this.isClosed) return;
    const totalDurationMs = Date.now() - this.startTime;
    this.log({
      type: 'session_end',
      status,
      totalToolsCalled: this.toolCallsCount,
      totalMutations: this.mutationsCount,
      totalDurationMs,
      ...summary,
    });
    this.isClosed = true;
    SessionLogger.rotateSessions(this.sessionsDir, this.maxSessions, this.maxAgeDays);
  }

  static rotateSessions(
    sessionsDir: string,
    maxSessions = DEFAULT_MAX_SESSIONS,
    maxAgeDays = DEFAULT_MAX_AGE_DAYS,
  ): number {
    if (!fs.existsSync(sessionsDir)) return 0;
    let deletedCount = 0;
    try {
      const files = fs
        .readdirSync(sessionsDir)
        .filter((f) => f.startsWith('session_') && f.endsWith('.jsonl'))
        .map((f) => {
          const fullPath = path.join(sessionsDir, f);
          try {
            const stat = fs.statSync(fullPath);
            return { file: f, path: fullPath, mtime: stat.mtimeMs };
          } catch {
            return null;
          }
        })
        .filter((entry): entry is { file: string; path: string; mtime: number } => entry !== null)
        .sort((a, b) => b.mtime - a.mtime); // Newest first

      const now = Date.now();
      const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

      for (let i = 0; i < files.length; i++) {
        const item = files[i];
        const isPastCount = i >= maxSessions;
        const isPastAge = now - item.mtime > maxAgeMs;

        if (isPastCount || isPastAge) {
          try {
            fs.unlinkSync(item.path);
            deletedCount++;
          } catch {
            // Transient Windows locks / permissions ignored
          }
        }
      }
    } catch {
      // Rotation failures are non-fatal
    }
    return deletedCount;
  }

  static listSessions(planningDir = '.planning'): SessionInfo[] {
    const sessionsDir = path.join(planningDir, 'intel', 'sessions');
    if (!fs.existsSync(sessionsDir)) return [];

    const result: SessionInfo[] = [];
    try {
      const files = fs
        .readdirSync(sessionsDir)
        .filter((f) => f.startsWith('session_') && f.endsWith('.jsonl'));

      for (const file of files) {
        const fullPath = path.join(sessionsDir, file);
        try {
          const stat = fs.statSync(fullPath);
          const raw = fs.readFileSync(fullPath, 'utf8');
          const lines = splitLines(raw.trim()).filter(Boolean);
          if (lines.length === 0) continue;

          let firstEvent: SessionEvent | null = null;
          let lastEvent: SessionEvent | null = null;

          try {
            firstEvent = JSON.parse(lines[0]) as SessionEvent;
          } catch { /* skip corrupted line */ }

          try {
            lastEvent = JSON.parse(lines[lines.length - 1]) as SessionEvent;
          } catch { /* skip corrupted line */ }

          const id = file.replace(/^session_/, '').replace(/\.jsonl$/, '');
          result.push({
            id,
            file: fullPath,
            timestamp: firstEvent?.timestamp || new Date(stat.mtimeMs).toISOString(),
            command: typeof firstEvent?.command === 'string' ? firstEvent.command : undefined,
            phaseId: typeof firstEvent?.phaseId === 'string' ? firstEvent.phaseId : undefined,
            status: typeof lastEvent?.status === 'string' ? lastEvent.status : (lastEvent?.type === 'session_end' ? 'completed' : 'in_progress'),
            sizeBytes: stat.size,
            eventCount: lines.length,
          });
        } catch {
          // Skip unreadable file
        }
      }
    } catch {
      // Skip directory scan error
    }

    return result.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }
}

export = {
  SessionLogger,
};
