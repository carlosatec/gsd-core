'use strict';
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizePii = sanitizePii;
exports.recordMemoryEntry = recordMemoryEntry;
exports.queryMemory = queryMemory;
exports.tryCompaction = tryCompaction;
/**
 * Continuous Memory Engine — Claude-Mem Native TypeScript Implementation (Phase 34)
 *
 * Provides cross-session memory persistence for agent decisions, self-healing lessons,
 * and tool quirks under `.planning/memory/decisions.jsonl`. Operates with zero external
 * Python/ChromaDB dependencies, fail-open resilience, PII sanitization, and automatic
 * log compaction archiving.
 */
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const crypto = __importStar(require("node:crypto"));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const textLines = require("./text-lines.cjs");
const { splitLines } = textLines;
const shell_command_projection_cjs_1 = require("./shell-command-projection.cjs");
const MEMORY_DIR_NAME = 'memory';
const DECISIONS_FILE_NAME = 'decisions.jsonl';
const ARCHIVE_DIR_NAME = 'archive';
const MAX_ACTIVE_ENTRIES = 1000;
const COMPACT_TRIGGER_THRESHOLD = 1500;
const _COMPACT_BATCH_SIZE = 500;
/**
 * Sanitize local system paths to eliminate PII (e.g. C:\Users\Carlos\... -> <repo-root>/...)
 */
function sanitizePii(text, root) {
    if (!text)
        return text;
    const normalizedRoot = root.replace(/\\/g, '/');
    let result = text.replace(/\\/g, '/');
    // Strip absolute project root
    result = result.split(normalizedRoot).join('.');
    // Strip user home directories (Windows and POSIX)
    result = result.replace(/(?:\/Users|\/home|[A-Za-z]:\/Users)\/[^/\s"'\\]+/g, '~');
    return result;
}
const TECHNICAL_SHORT_TOKENS = new Set(['db', 'io', 'ui', 'ci', 'cd', 'ts', 'js', 'go', 'rs', 'os', 'fs']);
function tokenize(text) {
    return text
        .toLowerCase()
        .replace(/[^\w\s-]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length > 2 || TECHNICAL_SHORT_TOKENS.has(t));
}
/**
 * Simple in-memory BM25 ranker with temporal decay and file proximity bonus
 */
function scoreEntry(entry, queryTokens, targetFiles) {
    const content = `${entry.summary} ${entry.details || ''} ${(entry.relevantFiles || []).join(' ')} ${(entry.keywords || []).join(' ')}`;
    const entryTokens = tokenize(content);
    if (entryTokens.length === 0)
        return 0;
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
    if (termMatches === 0 && fileBonus === 0)
        return 0;
    // BM25-like TF component
    const tf = queryTokens.length > 0 ? termMatches / (termMatches + 1.2) : 0;
    // Temporal decay: halve weight every 20 days
    const now = Date.now();
    const ageDays = Math.max(0, (now - entry.timestamp) / (1000 * 60 * 60 * 24));
    const temporalFactor = 1 / (1 + 0.05 * ageDays);
    return (tf * temporalFactor) + fileBonus;
}
/**
 * Auto-compaction helper called within the active file lock transaction.
 * Uses atomic sibling write (platformWriteSync) for crash consistency.
 */
function tryCompactionLocked(root, filePath) {
    if (!fs.existsSync(filePath))
        return;
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const lines = splitLines(raw).filter(l => l.trim().length > 0);
        if (lines.length <= COMPACT_TRIGGER_THRESHOLD) {
            return;
        }
        const archiveDir = path.join(root, '.planning', MEMORY_DIR_NAME, ARCHIVE_DIR_NAME);
        fs.mkdirSync(archiveDir, { recursive: true });
        const entries = [];
        for (const l of lines) {
            try {
                entries.push(JSON.parse(l));
            }
            catch {
                // Skip
            }
        }
        // Retain all 'architecture_decision' permanently
        const toRetain = [];
        const toArchive = [];
        const cutoffIndex = entries.length - MAX_ACTIVE_ENTRIES;
        for (let i = 0; i < entries.length; i++) {
            const e = entries[i];
            if (e.category === 'architecture_decision' || i >= cutoffIndex) {
                toRetain.push(e);
            }
            else {
                toArchive.push(e);
            }
        }
        if (toArchive.length > 0) {
            const archiveFile = path.join(archiveDir, `decisions-archive-${Date.now()}.jsonl`);
            (0, shell_command_projection_cjs_1.platformWriteSync)(archiveFile, toArchive.map(e => JSON.stringify(e)).join('\n') + '\n');
            (0, shell_command_projection_cjs_1.platformWriteSync)(filePath, toRetain.map(e => JSON.stringify(e)).join('\n') + '\n');
        }
    }
    catch {
        // Fail-open
    }
}
/**
 * Record a new memory entry append-only under `.planning/memory/decisions.jsonl`.
 * Refined in Phase 35: holds a single non-nested file lock across append and compaction.
 */
function recordMemoryEntry(root, input) {
    const memoryDir = path.join(root, '.planning', MEMORY_DIR_NAME);
    const filePath = path.join(memoryDir, DECISIONS_FILE_NAME);
    const entry = {
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
        (0, shell_command_projection_cjs_1.withFileLockSync)(filePath, () => {
            const line = JSON.stringify(entry) + '\n';
            fs.appendFileSync(filePath, line, 'utf8');
            tryCompactionLocked(root, filePath);
        });
    }
    catch {
        // Fail-open: do not crash agent if storage fails
    }
    return entry;
}
/**
 * Query memories by text query and optional target file list
 */
function queryMemory(root, query, options = {}) {
    const filePath = path.join(root, '.planning', MEMORY_DIR_NAME, DECISIONS_FILE_NAME);
    if (!fs.existsSync(filePath)) {
        return [];
    }
    const limit = options.limit || 5;
    const queryTokens = tokenize(query);
    const targetFiles = new Set((options.files || []).map(f => f.replace(/\\/g, '/')));
    const entries = [];
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const lines = splitLines(raw);
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed)
                continue;
            try {
                const item = JSON.parse(trimmed);
                if (options.category && item.category !== options.category)
                    continue;
                entries.push(item);
            }
            catch {
                // Skip corrupted line
            }
        }
    }
    catch {
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
function tryCompaction(root, filePath) {
    try {
        (0, shell_command_projection_cjs_1.withFileLockSync)(filePath, () => {
            tryCompactionLocked(root, filePath);
        });
    }
    catch {
        // Fail-open
    }
}
