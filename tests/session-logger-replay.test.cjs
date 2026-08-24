'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { runNode } = require('./helpers/process-seam.cjs');
const { cleanup } = require('./helpers.cjs');
const { splitLines } = require('../gsd-core/bin/lib/text-lines.cjs');

const { SessionLogger } = require('../gsd-core/bin/lib/session-logger.cjs');
const { SessionReplay } = require('../gsd-core/bin/lib/session-replay.cjs');

function makeTempPlanningDir() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-session-test-'));
  const planningDir = path.join(tmp, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
  return { tmp, planningDir };
}

test('SessionLogger writes structured append-only JSONL events', () => {
  const { tmp, planningDir } = makeTempPlanningDir();
  try {
    const logger = new SessionLogger({ planningDir, sessionId: 'test_session_1' });
    logger.startSession({ command: 'exec', phaseId: '14' });
    logger.logToolCall('run_command', { CommandLine: 'npm test' });
    logger.logToolResult('run_command', 'All 10 tests passed', true, undefined, 120);
    logger.logFileMutation('src/example.ts', 'update', '+ new line\n- old line');
    logger.endSession('completed', { finalCheck: true });

    assert.ok(fs.existsSync(logger.sessionFile), 'session file must exist');
    const content = fs.readFileSync(logger.sessionFile, 'utf8');
    const lines = splitLines(content.trim()).filter(Boolean);
    assert.equal(lines.length, 5, 'must contain 5 JSONL events');

    const ev0 = JSON.parse(lines[0]);
    assert.equal(ev0.type, 'session_start');
    assert.equal(ev0.command, 'exec');
    assert.equal(ev0.phaseId, '14');

    const ev1 = JSON.parse(lines[1]);
    assert.equal(ev1.type, 'tool_call');
    assert.equal(ev1.toolName, 'run_command');

    const ev4 = JSON.parse(lines[4]);
    assert.equal(ev4.type, 'session_end');
    assert.equal(ev4.status, 'completed');
    assert.equal(ev4.totalToolsCalled, 1);
    assert.equal(ev4.totalMutations, 1);
  } finally {
    cleanup(tmp);
  }
});

test('SessionLogger trims outputs larger than maxBytes (32 KB smart trimming)', () => {
  const hugeOutput = 'A'.repeat(40000) + 'CRITICAL_ERROR_AT_END';
  const trimmed = SessionLogger.trimOutput(hugeOutput, 1000);
  assert.ok(trimmed.length < 2000, 'must be constrained around max limit');
  assert.ok(trimmed.includes('... [truncated'), 'must have truncation marker');
  assert.ok(trimmed.startsWith('AAAAA'), 'must preserve head');
  assert.ok(trimmed.endsWith('CRITICAL_ERROR_AT_END'), 'must preserve tail');
});

test('SessionLogger redacts sensitive secrets and credentials', () => {
  const secretText = 'Here is the key: ANTHROPIC_API_KEY=sk-ant-api03-1234567890abcdef1234567890 and Bearer eyJhbGciOi...';
  const redacted = SessionLogger.redactSecrets(secretText);
  assert.ok(!redacted.includes('sk-ant-api03'), 'API key must be redacted');
  assert.ok(!redacted.includes('Bearer eyJhbGciOi'), 'Bearer token must be redacted');
  assert.ok(redacted.includes('[REDACTED_SECRET]'), 'redaction marker must be present');
});

test('SessionLogger rotates ring buffer and respects session retention limits', () => {
  const { tmp, planningDir } = makeTempPlanningDir();
  try {
    const sessionsDir = path.join(planningDir, 'intel', 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });

    // Create 10 mock sessions
    for (let i = 1; i <= 10; i++) {
      const file = path.join(sessionsDir, `session_2026082400000${i}_abcd.jsonl`);
      fs.writeFileSync(file, JSON.stringify({ type: 'session_start', sessionId: `2026082400000${i}` }) + '\n');
    }

    const initial = fs.readdirSync(sessionsDir).filter((f) => f.endsWith('.jsonl'));
    assert.equal(initial.length, 10);

    // Rotate with maxSessions = 5
    const deleted = SessionLogger.rotateSessions(sessionsDir, 5, 30);
    assert.equal(deleted, 5);

    const remaining = fs.readdirSync(sessionsDir).filter((f) => f.endsWith('.jsonl'));
    assert.equal(remaining.length, 5);
  } finally {
    cleanup(tmp);
  }
});

test('SessionReplay loads session by ID and latest alias', () => {
  const { tmp, planningDir } = makeTempPlanningDir();
  try {
    const logger1 = new SessionLogger({ planningDir, sessionId: '20260824100000_1111' });
    logger1.startSession({ command: 'status' });
    logger1.endSession('completed');

    const logger2 = new SessionLogger({ planningDir, sessionId: '20260824120000_2222' });
    logger2.startSession({ command: 'exec' });
    logger2.logToolCall('replace_file_content', { path: 'file.txt' });
    logger2.logToolResult('replace_file_content', 'Error: target not found', false, 'target not found');
    logger2.endSession('failed');

    const latest = SessionReplay.loadSession('latest', planningDir);
    assert.ok(latest, 'must load latest session');
    assert.equal(latest.sessionId, '20260824120000_2222');
    assert.equal(latest.command, 'exec');
    assert.equal(latest.status, 'failed');
    assert.equal(latest.errorCount, 1);

    const specific = SessionReplay.loadSession('20260824100000_1111', planningDir);
    assert.ok(specific, 'must load specific session');
    assert.equal(specific.sessionId, '20260824100000_1111');
    assert.equal(specific.command, 'status');
  } finally {
    cleanup(tmp);
  }
});

test('SessionReplay renders timeline with filters and generates Markdown export', () => {
  const { tmp, planningDir } = makeTempPlanningDir();
  try {
    const logger = new SessionLogger({ planningDir, sessionId: '20260824150000_3333' });
    logger.startSession({ command: 'exec', phaseId: '14' });
    logger.logToolCall('view_file', { path: 'a.txt' });
    logger.logToolResult('view_file', 'content of a.txt', true);
    logger.logGuardrailIntercept('REDOS_RULE', 'regex.ts', 'Potential ReDoS quantifier', 'blocked');
    logger.endSession('completed');

    const timeline = SessionReplay.loadSession('latest', planningDir);
    assert.ok(timeline);

    const fullRender = SessionReplay.renderReplay(timeline, { noColor: true });
    assert.ok(fullRender.includes('GSD Session Replay'));
    assert.ok(fullRender.includes('GUARDRAIL INTERCEPT'));

    const summaryRender = SessionReplay.renderReplay(timeline, { summaryOnly: true, noColor: true });
    assert.ok(summaryRender.includes('TOOL view_file'));
    assert.ok(summaryRender.includes('GUARD REDOS_RULE on regex.ts'));

    const md = SessionReplay.exportMarkdown(timeline);
    assert.ok(md.includes('# GSD Session Diagnostic Report'));
    assert.ok(md.includes('Guardrail Intercept'));
  } finally {
    cleanup(tmp);
  }
});

test('SessionReplay extracts anti-pattern candidate on failed sessions', () => {
  const { tmp, planningDir } = makeTempPlanningDir();
  try {
    const logger = new SessionLogger({ planningDir, sessionId: '20260824160000_4444' });
    logger.startSession({ command: 'exec' });
    logger.logToolCall('run_command', { CommandLine: 'node broken.js' });
    logger.logToolResult('run_command', 'SyntaxError: Unexpected token', false, 'SyntaxError: Unexpected token');
    logger.endSession('failed');

    const timeline = SessionReplay.loadSession('latest', planningDir);
    assert.ok(timeline);

    const candidate = SessionReplay.extractAntiPatternCandidate(timeline);
    assert.ok(candidate, 'must generate anti-pattern candidate');
    assert.equal(candidate.category, 'session-failure-replay');
    assert.ok(candidate.antiPattern.includes('SyntaxError'));
  } finally {
    cleanup(tmp);
  }
});

test('gsd-tools CLI session subcommands (list, replay, export, clean) execute correctly', () => {
  const { tmp, planningDir } = makeTempPlanningDir();
  const toolsScript = path.join(__dirname, '..', 'gsd-core', 'bin', 'gsd-tools.cjs');
  try {
    const logger = new SessionLogger({ planningDir, sessionId: '20260824170000_5555' });
    logger.startSession({ command: 'plan', phaseId: '14' });
    logger.endSession('completed');

    // session list --raw
    const listRes = runNode([toolsScript, 'session', 'list', '--raw', '--cwd', tmp]);
    assert.equal(listRes.exitCode, 0, 'session list must exit 0');
    const parsedList = JSON.parse(listRes.stdout);
    assert.ok(Array.isArray(parsedList));
    assert.equal(parsedList.length, 1);
    assert.equal(parsedList[0].id, '20260824170000_5555');

    // session replay latest
    const replayRes = runNode([toolsScript, 'session', 'replay', 'latest', '--no-color', '--cwd', tmp]);
    assert.equal(replayRes.exitCode, 0, 'session replay must exit 0');
    assert.ok(replayRes.stdout.includes('GSD Session Replay'));

    // session export latest
    const exportRes = runNode([toolsScript, 'session', 'export', 'latest', '--cwd', tmp]);
    assert.equal(exportRes.exitCode, 0, 'session export must exit 0');
    assert.ok(exportRes.stdout.includes('# GSD Session Diagnostic Report'));

    // session clean --raw
    const cleanRes = runNode([toolsScript, 'session', 'clean', '--max', '0', '--raw', '--cwd', tmp]);
    assert.equal(cleanRes.exitCode, 0, 'session clean must exit 0');
    const cleanData = JSON.parse(cleanRes.stdout);
    assert.equal(cleanData.ok, true);
    assert.equal(cleanData.deleted, 1);
  } finally {
    cleanup(tmp);
  }
});
