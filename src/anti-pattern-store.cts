/**
 * Anti-Pattern Store — Persistent memory of self-healing repairs and architectural mistakes.
 *
 * Stores validated error-repair lessons in `.planning/intel/anti-patterns.json`
 * to prevent recurring regressions across agent sessions.
 */

import path from 'node:path';
import crypto from 'node:crypto';
import { platformReadSync, platformWriteSync, platformEnsureDir, withFileLockSync } from './shell-command-projection.cjs';
import { realClock } from './clock.cjs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import learningsMod = require('./learnings.cjs');
const { learningsList } = learningsMod;
// eslint-disable-next-line @typescript-eslint/no-require-imports
import semanticRag = require('./hybrid-semantic-rag.cjs');
const { tokenize } = semanticRag;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Sanitizes stack traces by replacing local paths with <PATH>, line numbers with <LINE>,
 * and hex memory addresses with <HEX> to canonicalize recurring errors.
 */
function sanitizeStackTrace(text: string): string {
  if (!text) return '';
  return text
    .replace(/0x[a-fA-F0-9]{4,16}/g, '<HEX>')
    .replace(/(?:[a-zA-Z]:[/\\]|[/~])[^\s:()]+(?::\d+){1,2}/g, '<PATH>:<LINE>')
    .replace(/(?:[a-zA-Z]:[/\\]|[/~])[^\s:()]+\.[a-zA-Z0-9]{2,4}/g, '<PATH>')
    .replace(/\bline \d+\b/gi, 'line <LINE>')
    .replace(/:\d+:\d+/g, ':<LINE>')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface AntiPatternRecord {
  id: string;
  timestamp: string;
  rule?: string;
  file?: string;
  error: string;
  repairedAction?: string;
  lesson: string;
}

interface AntiPatternStoreData {
  version: string;
  totalRecorded: number;
  patterns: AntiPatternRecord[];
}

interface QueryAntiPatternOptions {
  file?: string;
  rule?: string;
  errorQuery?: string;
  includeGlobalLearnings?: boolean;
  limit?: number;
}

// ─── Functions ────────────────────────────────────────────────────────────────

/**
 * Loads anti-patterns from `.planning/intel/anti-patterns.json`.
 */
function loadAntiPatterns(planningDir: string): AntiPatternStoreData {
  const storePath = path.join(planningDir, 'intel', 'anti-patterns.json');
  try {
    const raw = platformReadSync(storePath);
    if (!raw) throw new Error('Empty');
    return JSON.parse(raw) as AntiPatternStoreData;
  } catch {
    return {
      version: '1.0.0',
      totalRecorded: 0,
      patterns: [],
    };
  }
}

/**
 * Persists anti-patterns to `.planning/intel/anti-patterns.json` atomically.
 */
function saveAntiPatterns(planningDir: string, data: AntiPatternStoreData): void {
  const intelDir = path.join(planningDir, 'intel');
  platformEnsureDir(intelDir);
  const storePath = path.join(intelDir, 'anti-patterns.json');
  platformWriteSync(storePath, JSON.stringify(data, null, 2));
}

/**
 * Records an anti-pattern or repair lesson into durable storage.
 */
function recordAntiPattern(
  planningDir: string,
  entry: Omit<AntiPatternRecord, 'id' | 'timestamp'>
): AntiPatternRecord {
  const intelDir = path.join(planningDir, 'intel');
  platformEnsureDir(intelDir);
  const storePath = path.join(intelDir, 'anti-patterns.json');

  return withFileLockSync(storePath, () => {
    const data = loadAntiPatterns(planningDir);
    const record: AntiPatternRecord = {
      id: `ap-${realClock.now()}-${crypto.randomBytes(4).toString('hex')}`,
      timestamp: realClock.nowIso(),
      rule: entry.rule,
      file: entry.file,
      error: sanitizeStackTrace(entry.error),
      repairedAction: entry.repairedAction ? sanitizeStackTrace(entry.repairedAction) : undefined,
      lesson: entry.lesson,
    };

    data.patterns.push(record);
    // Cap at 200 durable patterns to prevent unbounded growth
    if (data.patterns.length > 200) {
      data.patterns = data.patterns.slice(-200);
    }
    data.totalRecorded += 1;

    saveAntiPatterns(planningDir, data);
    return record;
  });
}

/**
 * Queries stored anti-patterns matching given criteria.
 */
function queryAntiPatterns(planningDir: string, opts: QueryAntiPatternOptions = {}): AntiPatternRecord[] {
  const data = loadAntiPatterns(planningDir);
  let results = [...data.patterns];

  if (opts.includeGlobalLearnings) {
    try {
      const globalLearnings = learningsList();
      for (const gl of globalLearnings) {
        results.push({
          id: `global-${gl.id}`,
          timestamp: gl.date,
          error: gl.context || 'global-learning',
          lesson: gl.learning,
        });
      }
    } catch {
      // Non-blocking
    }
  }

  if (opts.file) {
    const norm = opts.file.replace(/\\/g, '/');
    results = results.filter(p => !p.file || p.file.replace(/\\/g, '/').includes(norm));
  }

  if (opts.rule) {
    results = results.filter(p => p.rule === opts.rule);
  }

  if (opts.errorQuery) {
    const q = opts.errorQuery.toLowerCase();
    const qTokens = typeof tokenize === 'function' ? tokenize(opts.errorQuery) : [];

    results = results.filter(p => {
      const errLower = p.error.toLowerCase();
      const lessonLower = p.lesson.toLowerCase();
      if (errLower.includes(q) || lessonLower.includes(q)) return true;
      if (qTokens.length > 0) {
        const docTokens = new Set(tokenize(`${errLower} ${lessonLower}`));
        const matched = qTokens.filter(t => docTokens.has(t));
        const minMatch = Math.max(1, Math.ceil(qTokens.length * 0.4));
        return matched.length >= minMatch;
      }
      return false;
    });

    if (qTokens.length > 0) {
      const qTokenSet = new Set(qTokens);
      results.sort((a, b) => {
        const aTokens = tokenize(`${a.error} ${a.lesson}`);
        const bTokens = tokenize(`${b.error} ${b.lesson}`);
        const aMatches = aTokens.filter(t => qTokenSet.has(t)).length;
        const bMatches = bTokens.filter(t => qTokenSet.has(t)).length;
        return bMatches - aMatches;
      });
    }
  }

  const limit = opts.limit ?? 10;
  // If errorQuery is supplied, results are pre-sorted by similarity score descending (most relevant first: slice(0, limit)).
  // If unqueried, results remain in chronological order of recording (most recent first: slice(-limit)).
  return opts.errorQuery ? results.slice(0, limit) : results.slice(-limit);
}

export = {
  sanitizeStackTrace,
  loadAntiPatterns,
  saveAntiPatterns,
  recordAntiPattern,
  queryAntiPatterns,
};
