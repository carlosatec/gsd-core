'use strict';

/**
 * Phase 32 Wave 1 Unit Suite: Output Diet & Semantic Failure Digest
 *
 * Validates:
 * 1. Semantic truncation threshold (>100 lines or >8KB).
 * 2. Unconditional preservation of head (30 lines) and tail (50/120 lines).
 * 3. 100% retention of intermediate errors, assertion failures, and stack traces.
 * 4. Strict Failure Mode on exitCode !== 0 (expanded tail up to 120 lines, stderr preservation).
 * 5. Multi-framework Semantic Failure Digest extraction (Jest, Pytest, Go, Cargo).
 * 6. Offload log persistence in .planning/intel/output-logs/.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const outputDiet = require('../gsd-core/bin/lib/output-diet.cjs');
const {
  isDiagnosticOrErrorLine,
  parseFailureDigest,
  formatFailureDigest,
  persistRawOutputLog,
  processOutputDiet,
} = outputDiet;

describe('Phase 32 Wave 1 — Output Diet Truncation & Strict Failure Mode', () => {
  it('correctly identifies diagnostic and error lines', () => {
    assert.equal(isDiagnosticOrErrorLine('Error: unexpected token'), true);
    assert.equal(isDiagnosticOrErrorLine('   at Object.run (file.js:10:5)'), true);
    assert.equal(isDiagnosticOrErrorLine('Expected: 5'), true);
    assert.equal(isDiagnosticOrErrorLine('normal info message'), false);
  });

  it('does not truncate outputs below threshold (<= 100 lines and <= 8KB)', () => {
    const smallOutput = Array.from({ length: 40 }, (_, i) => `Normal line ${i}`).join('\n');
    const result = processOutputDiet(smallOutput, { exitCode: 0 });

    assert.equal(result.truncated, false);
    assert.equal(result.originalLineCount, 40);
    assert.equal(result.retainedLineCount, 40);
    assert.equal(result.savedTokensEstimate, 0);
    assert.equal(result.content, smallOutput);
  });

  it('truncates noisy outputs exceeding 100 lines while preserving head and tail', () => {
    const lines = [];
    for (let i = 0; i < 200; i++) {
      lines.push(`Routine noisy line ${i}`);
    }
    const rawOutput = lines.join('\n');
    const result = processOutputDiet(rawOutput, { exitCode: 0 });

    assert.equal(result.truncated, true);
    assert.equal(result.originalLineCount, 200);
    assert.ok(result.content.includes('Routine noisy line 0'));
    assert.ok(result.content.includes('Routine noisy line 29')); // head 30 lines
    assert.ok(result.content.includes('Routine noisy line 199')); // tail lines
    assert.ok(result.content.includes('[gsd output-diet: omitted'));
    assert.ok(result.savedTokensEstimate > 0);
  });

  it('preserves 100% of intermediate errors and stack traces in the middle section', () => {
    const lines = [];
    for (let i = 0; i < 200; i++) {
      if (i === 75) {
        lines.push('AssertionError: expected true to equal false');
      } else if (i === 76) {
        lines.push('    at Context.<anonymous> (tests/feature.test.cjs:42:10)');
      } else {
        lines.push(`Background process log ${i}`);
      }
    }
    const rawOutput = lines.join('\n');
    const result = processOutputDiet(rawOutput, { exitCode: 0 });

    assert.equal(result.truncated, true);
    assert.ok(result.content.includes('AssertionError: expected true to equal false'));
    assert.ok(result.content.includes('tests/feature.test.cjs:42:10'));
  });

  it('enforces Golden Rule of Exit Codes: exitCode !== 0 activates Strict Failure Mode', () => {
    const lines = [];
    for (let i = 0; i < 250; i++) {
      lines.push(`Log info step ${i}`);
    }
    const rawOutput = lines.join('\n');
    const stderrContent = 'FATAL: Process crashed with uncaught rejection\n  at runProcess (main.js:15:3)';

    const result = processOutputDiet(rawOutput, {
      exitCode: 1,
      stderr: stderrContent,
    });

    assert.equal(result.strictFailureMode, true);
    assert.ok(result.content.includes('--- STDERR ---'));
    assert.ok(result.content.includes('FATAL: Process crashed'));
    assert.ok(result.content.includes('main.js:15:3'));
  });
});

describe('Phase 32 Wave 1 — Semantic Failure Digest Synthesizer', () => {
  it('parses Jest/Vitest failure outputs into structured digest', () => {
    const jestLog = [
      'FAIL tests/user-service.test.ts',
      '● UserService › should authenticate valid user',
      '',
      '  Expected: "ACTIVE"',
      '  Received: "SUSPENDED"',
      '',
      '    at Object.<anonymous> (src/user-service.test.ts:88:21)',
    ].join('\n');

    const digest = parseFailureDigest(jestLog);
    assert.ok(digest);
    assert.equal(digest.framework, 'jest/vitest');
    assert.equal(digest.target, 'tests/user-service.test.ts');
    assert.equal(digest.testName, 'UserService › should authenticate valid user');
    assert.ok(digest.assertion && digest.assertion.includes('Expected: "ACTIVE"'));

    const formatted = formatFailureDigest(digest);
    assert.ok(formatted.includes('### [GSD Failure Digest]'));
    assert.ok(formatted.includes('tests/user-service.test.ts'));
  });

  it('parses Pytest failure outputs into structured digest', () => {
    const pytestLog = [
      '============================= FAILURES =============================',
      'FAILED tests/test_auth.py::test_login_invalid_password - AssertionError: 401 != 200',
      'E   assert response.status_code == 200',
    ].join('\n');

    const digest = parseFailureDigest(pytestLog);
    assert.ok(digest);
    assert.equal(digest.framework, 'pytest');
    assert.equal(digest.target, 'tests/test_auth.py');
    assert.equal(digest.testName, 'test_login_invalid_password');
    assert.ok(digest.assertion && digest.assertion.includes('assert response.status_code == 200'));
  });

  it('parses Go test failure outputs into structured digest', () => {
    const goLog = [
      '=== RUN   TestDatabaseConnection',
      '--- FAIL: TestDatabaseConnection (0.05s)',
      '    db_test.go:42: connection timeout exceeded',
      'FAIL',
    ].join('\n');

    const digest = parseFailureDigest(goLog);
    assert.ok(digest);
    assert.equal(digest.framework, 'go test');
    assert.equal(digest.testName, 'TestDatabaseConnection');
    assert.equal(digest.target, 'db_test.go:42');
    assert.equal(digest.rootCause, 'connection timeout exceeded');
  });

  it('parses Cargo test panic outputs into structured digest', () => {
    const cargoLog = [
      'running 1 test',
      'test parser::test_ast_parse ... FAILED',
      'failures:',
      '---- parser::test_ast_parse stdout ----',
      "thread 'parser::test_ast_parse' panicked at 'assertion failed: `(left == right)`', src/parser.rs:104:9",
    ].join('\n');

    const digest = parseFailureDigest(cargoLog);
    assert.ok(digest);
    assert.equal(digest.framework, 'cargo test');
    assert.equal(digest.testName, 'parser::test_ast_parse');
    assert.equal(digest.target, 'src/parser.rs:104:9');
    assert.ok(digest.rootCause && digest.rootCause.includes('assertion failed'));
  });
});

describe('Phase 32 Wave 1 — Raw Log Offload & Persistence', () => {
  it('directly persists raw log via persistRawOutputLog helper', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-direct-persist-'));
    const logPath = persistRawOutputLog('Test raw stream content', tmpDir);
    assert.ok(logPath);
    const fullLogPath = path.join(tmpDir, logPath);
    assert.ok(fs.existsSync(fullLogPath));
    assert.equal(fs.readFileSync(fullLogPath, 'utf8'), 'Test raw stream content');
  });

  it('persists raw log to .planning/intel/output-logs/ and links in result', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-output-diet-'));
    const noisyOutput = Array.from({ length: 150 }, (_, i) => `Heavy test log line ${i}`).join('\n');

    const result = processOutputDiet(noisyOutput, {
      projectRoot: tmpDir,
      exitCode: 0,
    });

    assert.equal(result.truncated, true);
    assert.ok(result.logFilePath);
    assert.ok(result.content.includes(result.logFilePath));

    const expectedFullPath = path.join(tmpDir, result.logFilePath);
    assert.ok(fs.existsSync(expectedFullPath));
    const savedContent = fs.readFileSync(expectedFullPath, 'utf8');
    assert.equal(savedContent, noisyOutput);
  });
});
