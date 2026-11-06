'use strict';

/**
 * Continuous Memory Engine — Claude-Mem Native TypeScript Implementation (Phase 34)
 *
 * Provides cross-session memory persistence for agent decisions, self-healing lessons,
 * and tool quirks under `.planning/memory/decisions.jsonl`. Operates with zero external
 * Python/ChromaDB dependencies, fail-open resilience, PII sanitization, and automatic
 * log compaction archiving.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import textLines = require('./text-lines.cjs');
const { splitLines } = textLines;

export interface AgentMemoryEntry {
  id: string;
  timestamp: number;
  phase?: string;
  command?: string;
  category: string;
  summary: string;
  details?: string;
  relevantFiles?: string[];
  keywords?: string[];
}

export interface MemoryQueryOptions {
  files?: string[];
  limit?: number;
  category?: string;
}

const MEMORY_DIR_NAME = 'memory';
const DECISIONS_FILE_NAME = 'decisions.jsonl';
const ARCHIVE_DIR_NAME = 'archive';
const MAX_ACTIVE_ENTRIES = 1000;
const COMPACT_TRIGGER_THRESHOLD = 1500;
const _COMPACT_BATCH_SIZE = 500;

/**
 * Sanitize local system paths to eliminate PII (e.g. C:\Users\Carlos\... -> <repo-root>/...)
 */
export function sanitizePii(text: string, root: string): string {
  if (!text) return text;
  const normalizedRoot = root.replace(/\\/g, '/');
  let result = text.replace(/\\/g, '/');
  // Strip absolute project root
  result = result.split(normalizedRoot).join('.');
  // Strip user home directories (Windows and POSIX)
  result = result.replace(/(?:\/Users|\/home|[A-Za-z]:\/Users)\/[^/\s"'\\]+/g, '~');
  return result;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2);
}

/**
 * Simple in-memory BM25 ranker with temporal decay and file proximity bonus
 */
function scoreEntry(entry: AgentMemoryEntry, queryTokens: string[], targetFiles: Set<string>): number {
  const content = `${entry.summary} ${entry.details || ''} ${(entry.relevantFiles || []).join(' ')} ${(entry.keywords || []).join(' ')}`;
  const entryTokens = tokenize(content);
  if (entryTokens.length === 0) return 0;

  let termMatches = 0;
  for (const q of queryTokens) {
    if (entryTokens.includes(q)) {
      termMatches++;
    }
  }

  // File proximity bonus: boost if entry touches target files
  let fileBonus = 0;
  if (entry.relevantFiles) {
    for (const f of entry.relevantFiles) {
      const normalized = f.replace(/\\/g, '/');
      if (targetFiles.has(normalized) || targetFiles.has(path.basename(normalized))) {
        fileBonus += 2.0;
        break;
      }
    }
  }

  if (termMatches === 0 && fileBonus === 0) return 0;

  // BM25-like TF component
  const tf = queryTokens.length > 0 ? termMatches / (termMatches + 1.2) : 0;

  // Temporal decay: halve weight every 20 days
  const now = Date.now();
  const ageDays = Math.max(0, (now - entry.timestamp) / (1000 * 60 * 60 * 24));
  const temporalFactor = 1 / (1 + 0.05 * ageDays);

  return (tf * temporalFactor) + fileBonus;
}

/**
 * Record a new memory entry append-only under `.planning/memory/decisions.jsonl`
 */
export function recordMemoryEntry(root: string, input: Omit<AgentMemoryEntry, 'id' | 'timestamp'>): AgentMemoryEntry {
  const memoryDir = path.join(root, '.planning', MEMORY_DIR_NAME);
  const filePath = path.join(memoryDir, DECISIONS_FILE_NAME);

  const entry: AgentMemoryEntry = {
    id: `mem-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    timestamp: Date.now(),
    phase: input.phase,
    command: input.command,
    category: input.category,
    summary: sanitizePii(input.summary, root),
    details: input.details ? sanitizePii(input.details, root) : undefined,
    relevantFiles: input.relevantFiles?.map(f => sanitizePii(f, root)),
    keywords: input.keywords,
  };

  try {
    fs.mkdirSync(memoryDir, { recursive: true });
    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(filePath, line, 'utf8');
  } catch {
    // Fail-open: do not crash agent if storage fails
  }

  // Trigger compaction if threshold reached
  tryCompaction(root, filePath);

  return entry;
}

/**
 * Query memories by text query and optional target file list
 */
export function queryMemory(root: string, query: string, options: MemoryQueryOptions = {}): AgentMemoryEntry[] {
  const filePath = path.join(root, '.planning', MEMORY_DIR_NAME, DECISIONS_FILE_NAME);
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const limit = options.limit || 5;
  const queryTokens = tokenize(query);
  const targetFiles = new Set((options.files || []).map(f => f.replace(/\\/g, '/')));

  const entries: AgentMemoryEntry[] = [];
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const lines = splitLines(raw);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const item = JSON.parse(trimmed) as AgentMemoryEntry;
        if (options.category && item.category !== options.category) continue;
        entries.push(item);
      } catch {
        // Skip corrupted line
      }
    }
  } catch {
    return [];
  }

  if (queryTokens.length === 0 && targetFiles.size === 0) {
    return entries.slice(-limit).reverse();
  }

  const scored = entries
    .map(e => ({ entry: e, score: scoreEntry(e, queryTokens, targetFiles) }))
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map(s => s.entry);
}

/**
 * Auto-compaction: archive older entries if count exceeds COMPACT_TRIGGER_THRESHOLD
 */
function tryCompaction(root: string, filePath: string): void {
  if (!fs.existsSync(filePath)) return;

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const lines = splitLines(raw).filter(l => l.trim().length > 0);
    if (lines.length <= COMPACT_TRIGGER_THRESHOLD) {
      return;
    }

    const archiveDir = path.join(root, '.planning', MEMORY_DIR_NAME, ARCHIVE_DIR_NAME);
    fs.mkdirSync(archiveDir, { recursive: true });

    const entries: AgentMemoryEntry[] = [];
    for (const l of lines) {
      try {
        entries.push(JSON.parse(l) as AgentMemoryEntry);
      } catch {
        // Skip
      }
    }

    // Retain all 'architecture_decision' permanently
    const toRetain: AgentMemoryEntry[] = [];
    const toArchive: AgentMemoryEntry[] = [];

    const cutoffIndex = entries.length - MAX_ACTIVE_ENTRIES;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (e.category === 'architecture_decision' || i >= cutoffIndex) {
        toRetain.push(e);
      } else {
        toArchive.push(e);
      }
    }

    if (toArchive.length > 0) {
      const archiveFile = path.join(archiveDir, `decisions-archive-${Date.now()}.jsonl`);
      fs.writeFileSync(archiveFile, toArchive.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf8');
      fs.writeFileSync(filePath, toRetain.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf8');
    }
  } catch {
    // Fail-open
  }
}
