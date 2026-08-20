/**
 * Anti-Pattern Store — Persistent memory of self-healing repairs and architectural mistakes.
 *
 * Stores validated error-repair lessons in `.planning/intel/anti-patterns.json`
 * to prevent recurring regressions across agent sessions.
 */

import path from 'node:path';
import { platformReadSync, platformWriteSync, platformEnsureDir } from './shell-command-projection.cjs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import learningsMod = require('./learnings.cjs');
const { learningsList } = learningsMod;

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
 * Persists anti-patterns to `.planning/intel/anti-patterns.json`.
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
  const data = loadAntiPatterns(planningDir);
  const record: AntiPatternRecord = {
    id: `ap-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    rule: entry.rule,
    file: entry.file,
    error: entry.error,
    repairedAction: entry.repairedAction,
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
    results = results.filter(p => p.error.toLowerCase().includes(q) || p.lesson.toLowerCase().includes(q));
  }

  const limit = opts.limit ?? 10;
  return results.slice(-limit);
}

export = {
  loadAntiPatterns,
  saveAntiPatterns,
  recordAntiPattern,
  queryAntiPatterns,
};
