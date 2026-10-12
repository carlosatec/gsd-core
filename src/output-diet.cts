/**
 * GSD Output Diet & Semantic Failure Digest (Phase 32 — Wave 1)
 *
 * Intercepts high-volume terminal outputs (>100 lines or >8KB). Rather than a blind
 * truncation, extracts a high-density Semantic Failure Digest at the top, preserves 100% of
 * errors, stack traces, and test assertions, enforces the Golden Rule of Exit Codes
 * (exitCode !== 0 -> Strict Failure Mode with expanded tail up to 120 lines), and offloads
 * the raw complete output to `.planning/intel/output-logs/`.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

interface OutputDietOptions {
  exitCode?: number;
  stderr?: string;
  projectRoot?: string;
  maxHeadLines?: number;
  maxTailLines?: number;
  maxThresholdLines?: number;
  maxThresholdChars?: number;
  persistLog?: boolean;
  command?: string;
}

interface FailureDigestInfo {
  target?: string;
  testName?: string;
  assertion?: string;
  rootCause?: string;
  framework?: string;
}

interface OutputDietResult {
  content: string;
  truncated: boolean;
  originalLineCount: number;
  retainedLineCount: number;
  originalCharCount: number;
  retainedCharCount: number;
  savedTokensEstimate: number;
  logFilePath?: string;
  failureDigest?: string;
  strictFailureMode: boolean;
}

const ERROR_LINE_PATTERN = /(?:error|fail(?:ed|ure)?|exception|fatal|panic|assert(?:ion)?|warning|reject(?:ed)?)/i;
const STACK_OR_TRACE_PATTERN = /^\s*(?:at\s+|File\s+".*",\s*line\s+\d+|#\d+\s+0x|[A-Za-z0-9_.-]+:\d+:\d+:)/i;
const TEST_DIFF_PATTERN = /^\s*(?:[-+]|Expected:|Received:|Diff:|\(Diff\)|●|✕|✖)/;

/**
 * Check if a single line represents an error, assertion, or stack trace.
 */
function isDiagnosticOrErrorLine(line: string): boolean {
  return ERROR_LINE_PATTERN.test(line) || STACK_OR_TRACE_PATTERN.test(line) || TEST_DIFF_PATTERN.test(line);
}

/**
 * Extract structured failure information from diverse test runner outputs.
 */
function parseFailureDigest(output: string): FailureDigestInfo | null {
  const lines = output.split(/\r?\n/);
  const info: FailureDigestInfo = {};

  // 1. Jest / Vitest format
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const jestSuiteFail = line.match(/^FAIL\s+([^\s]+)/);
    if (jestSuiteFail && !info.target) {
      info.target = jestSuiteFail[1];
      info.framework = 'jest/vitest';
    }

    const testFailMark = line.match(/^[●✕✖]\s+(.+)/);
    if (testFailMark && !info.testName) {
      info.testName = testFailMark[1].trim();
    }

    if (line.includes('Expected:') || line.includes('Received:')) {
      const assertionParts: string[] = [];
      let j = i;
      while (j < lines.length && (lines[j].includes('Expected:') || lines[j].includes('Received:') || lines[j].trim().startsWith('-') || lines[j].trim().startsWith('+'))) {
        assertionParts.push(lines[j].trim());
        j++;
        if (assertionParts.length >= 4) break;
      }
      if (assertionParts.length > 0 && !info.assertion) {
        info.assertion = assertionParts.join(' | ');
      }
    }

    const stackMatch = line.match(/^\s*at\s+.*?\(([^)]+:\d+:\d+)\)/) || line.match(/^\s*at\s+([^)]+:\d+:\d+)/);
    if (stackMatch && !info.target) {
      info.target = stackMatch[1];
    }
  }

  // 2. Pytest format
  if (!info.framework) {
    for (const line of lines) {
      const pytestFail = line.match(/^FAILED\s+([^:]+)::([^\s-]+)(?:\s+-\s+(.+))?/);
      if (pytestFail && !info.target) {
        info.target = pytestFail[1];
        info.testName = pytestFail[2];
        if (pytestFail[3]) info.rootCause = pytestFail[3];
        info.framework = 'pytest';
      }
      const pytestAssert = line.match(/^E\s+(assert\s+.+)/);
      if (pytestAssert && !info.assertion) {
        info.assertion = pytestAssert[1];
      }
    }
  }

  // 3. Go test format
  if (!info.framework) {
    for (let i = 0; i < lines.length; i++) {
      const goFail = lines[i].match(/^--- FAIL:\s+([^\s]+)/);
      if (goFail) {
        info.testName = goFail[1];
        info.framework = 'go test';
        if (i + 1 < lines.length) {
          const locMatch = lines[i + 1].match(/^\s*([A-Za-z0-9_.-]+_test\.go:\d+):\s*(.+)/);
          if (locMatch) {
            info.target = locMatch[1];
            info.rootCause = locMatch[2];
          }
        }
        break;
      }
    }
  }

  // 4. Cargo / Rust test format
  if (!info.framework) {
    for (const line of lines) {
      const cargoPanic = line.match(/thread\s+'([^']+)'\s+panicked\s+at\s+'([^']+)',\s+([^\s]+:\d+:\d+)/);
      if (cargoPanic) {
        info.testName = cargoPanic[1];
        info.rootCause = cargoPanic[2];
        info.target = cargoPanic[3];
        info.framework = 'cargo test';
        break;
      }
    }
  }

  // 5. Generic fallback when exit code indicates error
  if (!info.rootCause) {
    for (const line of lines) {
      const trimmed = line.trim();
      if (/^(?:Error|AssertionError|TypeError|ReferenceError|Panic|Fatal):\s*(.+)/i.test(trimmed)) {
        info.rootCause = trimmed;
        break;
      }
    }
  }

  if (info.target || info.testName || info.assertion || info.rootCause) {
    return info;
  }
  return null;
}

/**
 * Format a FailureDigestInfo into markdown.
 */
function formatFailureDigest(digest: FailureDigestInfo): string {
  const lines: string[] = ['### [GSD Failure Digest]'];
  if (digest.framework) {
    lines.push(`- **Framework**: \`${digest.framework}\``);
  }
  if (digest.target) {
    lines.push(`- **Target**: \`${digest.target}\``);
  }
  if (digest.testName) {
    lines.push(`- **Test / Context**: \`${digest.testName}\``);
  }
  if (digest.assertion) {
    lines.push(`- **Assertion**: \`${digest.assertion}\``);
  }
  if (digest.rootCause) {
    lines.push(`- **Root Cause**: \`${digest.rootCause}\``);
  }
  return lines.join('\n');
}

/**
 * Persist full un-truncated log in `.planning/intel/output-logs/<timestamp>-<hash>.log`.
 */
function persistRawOutputLog(rawOutput: string, projectRoot?: string): string {
  const root = projectRoot || process.cwd();
  const dir = path.join(root, '.planning', 'intel', 'output-logs');
  fs.mkdirSync(dir, { recursive: true });

  const hash = crypto.createHash('sha256').update(rawOutput).digest('hex').slice(0, 12);
  const fileName = `${Date.now()}-${hash}.log`;
  const fullPath = path.join(dir, fileName);
  fs.writeFileSync(fullPath, rawOutput, 'utf8');

  // Return posix-friendly relative or normalized path
  const rel = path.relative(root, fullPath).replace(/\\/g, '/');
  return rel.startsWith('.') ? rel : `./${rel}`;
}

/**
 * Main Output Diet processing function.
 */
function processOutputDiet(rawOutput: string, options: OutputDietOptions = {}): OutputDietResult {
  const exitCode = options.exitCode ?? 0;
  const isFailure = exitCode !== 0;
  const strictFailureMode = isFailure;

  const defaultHead = options.maxHeadLines ?? 30;
  const defaultTail = options.maxTailLines ?? (strictFailureMode ? 120 : 50);
  const thresholdLines = options.maxThresholdLines ?? 100;
  const thresholdChars = options.maxThresholdChars ?? 8000;

  // Append stderr if present
  let combinedOutput = rawOutput;
  if (options.stderr && options.stderr.trim().length > 0) {
    combinedOutput = `${rawOutput}\n--- STDERR ---\n${options.stderr}`;
  }

  const allLines = combinedOutput.split(/\r?\n/);
  const originalLineCount = allLines.length;
  const originalCharCount = combinedOutput.length;

  const needsDiet = originalLineCount > thresholdLines || originalCharCount > thresholdChars;

  // Extract failure digest if failure or test run
  let digestMarkdown = '';
  const parsedDigest = parseFailureDigest(combinedOutput);
  if (parsedDigest) {
    digestMarkdown = formatFailureDigest(parsedDigest) + '\n\n';
  }

  // If output is within limits and not requiring special treatment
  if (!needsDiet) {
    const finalContent = digestMarkdown ? `${digestMarkdown}${combinedOutput}` : combinedOutput;
    return {
      content: finalContent,
      truncated: false,
      originalLineCount,
      retainedLineCount: originalLineCount,
      originalCharCount,
      retainedCharCount: finalContent.length,
      savedTokensEstimate: 0,
      failureDigest: digestMarkdown || undefined,
      strictFailureMode,
    };
  }

  // Persist raw output offload
  let logFilePath: string | undefined;
  if (options.persistLog !== false) {
    try {
      logFilePath = persistRawOutputLog(combinedOutput, options.projectRoot);
    } catch {
      // Fallback silently if disk write fails
    }
  }

  // Perform semantic slicing
  const headLinesCount = Math.min(defaultHead, allLines.length);
  const tailLinesCount = Math.min(defaultTail, Math.max(0, allLines.length - headLinesCount));

  const head = allLines.slice(0, headLinesCount);
  const tail = allLines.slice(allLines.length - tailLinesCount);

  // Middle section: keep diagnostic/error lines
  const middle = allLines.slice(headLinesCount, allLines.length - tailLinesCount);
  const retainedMiddle: string[] = [];
  let omittedMiddleLines = 0;

  for (let i = 0; i < middle.length; i++) {
    const line = middle[i];
    if (isDiagnosticOrErrorLine(line)) {
      retainedMiddle.push(line);
    } else {
      omittedMiddleLines++;
    }
  }

  const assembledLines: string[] = [...head];

  if (omittedMiddleLines > 0) {
    const logNotice = logFilePath ? `; full log saved to ${logFilePath}` : '';
    assembledLines.push(
      `\n... [gsd output-diet: omitted ${omittedMiddleLines} non-diagnostic lines${logNotice}] ...\n`
    );
  }

  if (retainedMiddle.length > 0) {
    assembledLines.push(...retainedMiddle);
    if (omittedMiddleLines > 0) {
      assembledLines.push(`\n... [gsd output-diet: resuming tail (${tail.length} lines)] ...\n`);
    }
  }

  assembledLines.push(...tail);

  const retainedText = assembledLines.join('\n');
  const finalContent = digestMarkdown ? `${digestMarkdown}${retainedText}` : retainedText;
  const retainedCharCount = finalContent.length;
  const savedTokensEstimate = Math.max(0, Math.ceil((originalCharCount - retainedCharCount) / 4));

  return {
    content: finalContent,
    truncated: omittedMiddleLines > 0,
    originalLineCount,
    retainedLineCount: assembledLines.length,
    originalCharCount,
    retainedCharCount,
    savedTokensEstimate,
    logFilePath,
    failureDigest: digestMarkdown || undefined,
    strictFailureMode,
  };
}

export = {
  isDiagnosticOrErrorLine,
  parseFailureDigest,
  formatFailureDigest,
  persistRawOutputLog,
  processOutputDiet,
};
