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
import { withFileLockSync, platformWriteSync } from './shell-command-projection.cjs';

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
  permanent?: boolean;
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

const TECHNICAL_SHORT_TOKENS = new Set(['db', 'io', 'ui', 'ci', 'cd', 'ts', 'js', 'go', 'rs', 'os', 'fs']);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 || TECHNICAL_SHORT_TOKENS.has(t));
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

  // Temporal decay: halve weight every 20 days (permanent decisions are immune to temporal decay)
  const isPermanent = Boolean(entry.permanent || entry.category === 'architecture_decision');
  const now = Date.now();
  const ageDays = Math.max(0, (now - entry.timestamp) / (1000 * 60 * 60 * 24));
  const temporalFactor = isPermanent ? 1.0 : (1 / (1 + 0.05 * ageDays));
  const decisionBonus = isPermanent ? 1.5 : 0;

  return (tf * temporalFactor) + fileBonus + decisionBonus;
}

/**
 * Auto-compaction helper called within the active file lock transaction.
 * Uses atomic sibling write (platformWriteSync) for crash consistency.
 */
function tryCompactionLocked(root: string, filePath: string): void {
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

    // Retain all 'architecture_decision' and permanent entries permanently
    const toRetain: AgentMemoryEntry[] = [];
    const toArchive: AgentMemoryEntry[] = [];

    const cutoffIndex = entries.length - MAX_ACTIVE_ENTRIES;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (e.category === 'architecture_decision' || e.permanent || i >= cutoffIndex) {
        toRetain.push(e);
      } else {
        toArchive.push(e);
      }
    }

    if (toArchive.length > 0) {
      const archiveFile = path.join(archiveDir, `decisions-archive-${Date.now()}.jsonl`);
      platformWriteSync(archiveFile, toArchive.map(e => JSON.stringify(e)).join('\n') + '\n');
      platformWriteSync(filePath, toRetain.map(e => JSON.stringify(e)).join('\n') + '\n');
    }
  } catch {
    // Fail-open
  }
}

/**
 * Record a new memory entry append-only under `.planning/memory/decisions.jsonl`.
 * Refined in Phase 35: holds a single non-nested file lock across append and compaction.
 */
export function recordMemoryEntry(root: string, input: Omit<AgentMemoryEntry, 'id' | 'timestamp'> & { id?: string; permanent?: boolean }): AgentMemoryEntry {
  const memoryDir = path.join(root, '.planning', MEMORY_DIR_NAME);
  const filePath = path.join(memoryDir, DECISIONS_FILE_NAME);

  const entry: AgentMemoryEntry = {
    id: input.id || `mem-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    timestamp: Date.now(),
    phase: input.phase,
    command: input.command,
    category: input.category,
    summary: sanitizePii(input.summary, root),
    details: input.details ? sanitizePii(input.details, root) : undefined,
    relevantFiles: input.relevantFiles?.map(f => sanitizePii(f, root)),
    keywords: input.keywords,
    permanent: input.permanent ?? (input.category === 'architecture_decision'),
  };

  try {
    fs.mkdirSync(memoryDir, { recursive: true });
    withFileLockSync(filePath, () => {
      const line = JSON.stringify(entry) + '\n';
      fs.appendFileSync(filePath, line, 'utf8');
      tryCompactionLocked(root, filePath);
    });
  } catch {
    // Fail-open: do not crash agent if storage fails
  }

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
 * Auto-compaction: archive older entries if count exceeds COMPACT_TRIGGER_THRESHOLD.
 * Refined in Phase 35: wraps compaction in withFileLockSync and uses platformWriteSync.
 */
export function tryCompaction(root: string, filePath: string): void {
  try {
    withFileLockSync(filePath, () => {
      tryCompactionLocked(root, filePath);
    });
  } catch {
    // Fail-open
  }
}

/**
 * Syncs all architectural decisions (D-01 to D-NNN) from STATE.md into
 * .planning/memory/decisions.jsonl with permanent retention (REQ-37-02).
 */
export function syncDecisionsToMemory(planningDir: string, rootDir?: string): { synced: number; total: number } {
  const root = rootDir ?? path.dirname(planningDir);
  const statePath = path.join(planningDir, 'STATE.md');
  if (!fs.existsSync(statePath)) {
    return { synced: 0, total: 0 };
  }

  let rawState = '';
  try {
    rawState = fs.readFileSync(statePath, 'utf8');
  } catch {
    return { synced: 0, total: 0 };
  }

  const lines = splitLines(rawState);
  // Pattern 1: - **D-01 [Architecture]:** Analisador AST nativo...
  const DECISION_REGEX = /^-\s+\*\*(D-\d+)\s+\[([^\]]+)\]:\*\*\s*(.+)$/i;
  // Pattern 2: - [Phase 37]: Summary or - [Phase 37]: D-999 [Category]: Summary
  const PHASE_DECISION_REGEX = /^-\s+\[(?:Phase\s+)?([^\]]+)\]:\s*(.+)$/i;
  const extractedDecisions: AgentMemoryEntry[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(DECISION_REGEX);
    if (match) {
      const id = match[1].toUpperCase();
      const rawCategory = match[2].trim();
      const summary = match[3].trim();

      // Extract referenced files from summary (e.g. `src/state.cts`, `ARCHITECTURE.md`)
      const fileMatches = summary.match(/(?:`|\b)([a-zA-Z0-9_./\\-]+\.[a-zA-Z0-9]+)(?:`|\b)/g) || [];
      const relevantFiles: string[] = [];
      for (const fm of fileMatches) {
        const cleanFile = fm.replace(/`/g, '').replace(/\\/g, '/');
        if (cleanFile.includes('/') || cleanFile.endsWith('.md') || cleanFile.endsWith('.json') || cleanFile.endsWith('.cts') || cleanFile.endsWith('.cjs')) {
          if (!relevantFiles.includes(cleanFile)) relevantFiles.push(cleanFile);
        }
      }

      const keywords = tokenize(`${rawCategory} ${summary}`);

      extractedDecisions.push({
        id,
        timestamp: Date.now(),
        category: 'architecture_decision',
        summary: sanitizePii(summary, root),
        details: `Category: ${rawCategory} | Decision ID: ${id}`,
        relevantFiles,
        keywords,
        permanent: true,
      });
    } else {
      const phaseMatch = trimmed.match(PHASE_DECISION_REGEX);
      if (phaseMatch) {
        const phaseTag = phaseMatch[1].trim();
        const body = phaseMatch[2].trim();
        const dMatch = body.match(/^(D-\d+)\s*(?:\[([^\]]+)\])?[:\s]*(.+)$/i);
        const id = dMatch ? dMatch[1].toUpperCase() : `DEC-${phaseTag}-${extractedDecisions.length + 1}`;
        const rawCategory = dMatch && dMatch[2] ? dMatch[2].trim() : `Phase ${phaseTag}`;
        const summary = dMatch ? dMatch[3].trim() : body;

        const fileMatches = summary.match(/(?:`|\b)([a-zA-Z0-9_./\\-]+\.[a-zA-Z0-9]+)(?:`|\b)/g) || [];
        const relevantFiles: string[] = [];
        for (const fm of fileMatches) {
          const cleanFile = fm.replace(/`/g, '').replace(/\\/g, '/');
          if (cleanFile.includes('/') || cleanFile.endsWith('.md') || cleanFile.endsWith('.json') || cleanFile.endsWith('.cts') || cleanFile.endsWith('.cjs')) {
            if (!relevantFiles.includes(cleanFile)) relevantFiles.push(cleanFile);
          }
        }

        const keywords = tokenize(`${rawCategory} ${summary}`);

        extractedDecisions.push({
          id,
          timestamp: Date.now(),
          category: 'architecture_decision',
          phase: phaseTag,
          summary: sanitizePii(summary, root),
          details: `Category: ${rawCategory} | Phase: ${phaseTag} | Decision ID: ${id}`,
          relevantFiles,
          keywords,
          permanent: true,
        });
      }
    }
  }

  if (extractedDecisions.length === 0) {
    return { synced: 0, total: 0 };
  }

  const memoryDir = path.join(planningDir, MEMORY_DIR_NAME);
  const filePath = path.join(memoryDir, DECISIONS_FILE_NAME);

  let synced = 0;
  fs.mkdirSync(memoryDir, { recursive: true });

  withFileLockSync(filePath, () => {
    const existingEntries: AgentMemoryEntry[] = [];
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      for (const l of splitLines(raw)) {
        if (!l.trim()) continue;
        try {
          existingEntries.push(JSON.parse(l) as AgentMemoryEntry);
        } catch {
          // Skip corrupt line
        }
      }
    }

    const existingById = new Map<string, AgentMemoryEntry>();
    for (const e of existingEntries) {
      existingById.set(e.id, e);
    }

    let modified = false;
    for (const dec of extractedDecisions) {
      const existing = existingById.get(dec.id);
      if (!existing || existing.summary !== dec.summary) {
        existingById.set(dec.id, dec);
        synced++;
        modified = true;
      }
    }

    if (modified) {
      const updatedLines = Array.from(existingById.values()).map(e => JSON.stringify(e)).join('\n') + '\n';
      platformWriteSync(filePath, updatedLines);
    }
  });

  return { synced, total: extractedDecisions.length };
}
