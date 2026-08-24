"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const text_lines_cjs_1 = require("./text-lines.cjs");
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
    sessionId;
    planningDir;
    sessionsDir;
    sessionFile;
    maxOutputBytes;
    maxSessions;
    maxAgeDays;
    isClosed = false;
    toolCallsCount = 0;
    mutationsCount = 0;
    startTime;
    constructor(opts = {}) {
        this.planningDir = opts.planningDir || node_path_1.default.resolve('.planning');
        this.sessionsDir = node_path_1.default.join(this.planningDir, 'intel', 'sessions');
        this.sessionId = opts.sessionId || SessionLogger.generateSessionId();
        this.sessionFile = node_path_1.default.join(this.sessionsDir, `session_${this.sessionId}.jsonl`);
        this.maxOutputBytes = opts.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
        this.maxSessions = opts.maxSessions ?? DEFAULT_MAX_SESSIONS;
        this.maxAgeDays = opts.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS;
        this.startTime = Date.now();
        this.ensureDirectory();
    }
    static generateSessionId() {
        const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
        const rand = node_crypto_1.default.randomBytes(3).toString('hex');
        return `${timestamp}_${rand}`;
    }
    ensureDirectory() {
        try {
            if (!node_fs_1.default.existsSync(this.sessionsDir)) {
                node_fs_1.default.mkdirSync(this.sessionsDir, { recursive: true });
            }
        }
        catch {
            // Ignored for environments where filesystem permissions are managed externally
        }
    }
    static trimOutput(output, maxBytes = DEFAULT_MAX_OUTPUT_BYTES) {
        if (output === null || output === undefined)
            return '';
        const str = typeof output === 'string' ? output : JSON.stringify(output);
        const buf = Buffer.from(str, 'utf8');
        if (buf.length <= maxBytes)
            return str;
        const half = Math.floor((maxBytes - 100) / 2);
        const head = buf.subarray(0, half).toString('utf8');
        const tail = buf.subarray(buf.length - half).toString('utf8');
        const truncatedBytes = buf.length - (half * 2);
        return `${head}\n\n... [truncated ${truncatedBytes} bytes] ...\n\n${tail}`;
    }
    static redactSecrets(text) {
        if (typeof text !== 'string') {
            if (text && typeof text === 'object') {
                if (Array.isArray(text)) {
                    const arr = [];
                    for (let i = 0; i < text.length; i++) {
                        arr.push(SessionLogger.redactSecrets(text[i]));
                    }
                    return arr;
                }
                const copy = {};
                for (const [k, v] of Object.entries(text)) {
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
    log(event) {
        if (this.isClosed)
            return;
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
            node_fs_1.default.appendFileSync(this.sessionFile, line, 'utf8');
        }
        catch {
            // Non-blocking log emission (fail-safe)
        }
    }
    startSession(metadata = {}) {
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
    logToolCall(toolName, params = {}, callId) {
        this.toolCallsCount++;
        this.log({
            type: 'tool_call',
            toolName,
            callId: callId || `call_${this.toolCallsCount}`,
            params: SessionLogger.redactSecrets(params),
        });
    }
    logToolResult(toolName, output, success = true, error, durationMs, callId) {
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
    logFileMutation(filePath, changeType, diff, beforeHash, afterHash) {
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
    logGuardrailIntercept(ruleId, target, reason, action = 'blocked') {
        this.log({
            type: 'guardrail_intercept',
            ruleId,
            target,
            reason,
            action,
        });
    }
    logTestResult(suite, passed, failed, durationMs, failureSummary) {
        this.log({
            type: 'test_result',
            suite,
            passed,
            failed,
            durationMs,
            failureSummary: failureSummary ? SessionLogger.trimOutput(failureSummary, 8192) : undefined,
        });
    }
    endSession(status = 'completed', summary = {}) {
        if (this.isClosed)
            return;
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
    static rotateSessions(sessionsDir, maxSessions = DEFAULT_MAX_SESSIONS, maxAgeDays = DEFAULT_MAX_AGE_DAYS) {
        if (!node_fs_1.default.existsSync(sessionsDir))
            return 0;
        let deletedCount = 0;
        try {
            const files = node_fs_1.default
                .readdirSync(sessionsDir)
                .filter((f) => f.startsWith('session_') && f.endsWith('.jsonl'))
                .map((f) => {
                const fullPath = node_path_1.default.join(sessionsDir, f);
                try {
                    const stat = node_fs_1.default.statSync(fullPath);
                    return { file: f, path: fullPath, mtime: stat.mtimeMs };
                }
                catch {
                    return null;
                }
            })
                .filter((entry) => entry !== null)
                .sort((a, b) => b.mtime - a.mtime); // Newest first
            const now = Date.now();
            const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
            for (let i = 0; i < files.length; i++) {
                const item = files[i];
                const isPastCount = i >= maxSessions;
                const isPastAge = now - item.mtime > maxAgeMs;
                if (isPastCount || isPastAge) {
                    try {
                        node_fs_1.default.unlinkSync(item.path);
                        deletedCount++;
                    }
                    catch {
                        // Transient Windows locks / permissions ignored
                    }
                }
            }
        }
        catch {
            // Rotation failures are non-fatal
        }
        return deletedCount;
    }
    static listSessions(planningDir = '.planning') {
        const sessionsDir = node_path_1.default.join(planningDir, 'intel', 'sessions');
        if (!node_fs_1.default.existsSync(sessionsDir))
            return [];
        const result = [];
        try {
            const files = node_fs_1.default
                .readdirSync(sessionsDir)
                .filter((f) => f.startsWith('session_') && f.endsWith('.jsonl'));
            for (const file of files) {
                const fullPath = node_path_1.default.join(sessionsDir, file);
                try {
                    const stat = node_fs_1.default.statSync(fullPath);
                    const raw = node_fs_1.default.readFileSync(fullPath, 'utf8');
                    const lines = (0, text_lines_cjs_1.splitLines)(raw.trim()).filter(Boolean);
                    if (lines.length === 0)
                        continue;
                    let firstEvent = null;
                    let lastEvent = null;
                    try {
                        firstEvent = JSON.parse(lines[0]);
                    }
                    catch { /* skip corrupted line */ }
                    try {
                        lastEvent = JSON.parse(lines[lines.length - 1]);
                    }
                    catch { /* skip corrupted line */ }
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
                }
                catch {
                    // Skip unreadable file
                }
            }
        }
        catch {
            // Skip directory scan error
        }
        return result.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    }
}
module.exports = {
    SessionLogger,
};
