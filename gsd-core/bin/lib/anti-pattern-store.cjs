"use strict";
/**
 * Anti-Pattern Store — Persistent memory of self-healing repairs and architectural mistakes.
 *
 * Stores validated error-repair lessons in `.planning/intel/anti-patterns.json`
 * to prevent recurring regressions across agent sessions.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const shell_command_projection_cjs_1 = require("./shell-command-projection.cjs");
const clock_cjs_1 = require("./clock.cjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const learningsMod = require("./learnings.cjs");
const { learningsList } = learningsMod;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const semanticRag = require("./hybrid-semantic-rag.cjs");
const { tokenize } = semanticRag;
// ─── Helpers ──────────────────────────────────────────────────────────────────
/**
 * Sanitizes stack traces by replacing local paths with <PATH>, line numbers with <LINE>,
 * and hex memory addresses with <HEX> to canonicalize recurring errors.
 */
function sanitizeStackTrace(text) {
    if (!text)
        return '';
    return text
        .replace(/0x[a-fA-F0-9]{4,16}/g, '<HEX>')
        .replace(/(?:[a-zA-Z]:[/\\]|[/~])[^\s:()]+(?::\d+){1,2}/g, '<PATH>:<LINE>')
        .replace(/(?:[a-zA-Z]:[/\\]|[/~])[^\s:()]+/g, '<PATH>');
}
// ─── Functions ────────────────────────────────────────────────────────────────
/**
 * Loads anti-patterns from `.planning/intel/anti-patterns.json`.
 */
function loadAntiPatterns(planningDir) {
    const storePath = node_path_1.default.join(planningDir, 'intel', 'anti-patterns.json');
    try {
        const raw = (0, shell_command_projection_cjs_1.platformReadSync)(storePath);
        if (!raw)
            throw new Error('Empty');
        return JSON.parse(raw);
    }
    catch {
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
function saveAntiPatterns(planningDir, data) {
    const intelDir = node_path_1.default.join(planningDir, 'intel');
    (0, shell_command_projection_cjs_1.platformEnsureDir)(intelDir);
    const storePath = node_path_1.default.join(intelDir, 'anti-patterns.json');
    const tmpPath = `${storePath}.${process.pid}.tmp`;
    (0, shell_command_projection_cjs_1.platformWriteSync)(tmpPath, JSON.stringify(data, null, 2));
    let renamed = false;
    for (let attempt = 0; attempt < 5; attempt++) {
        try {
            node_fs_1.default.renameSync(tmpPath, storePath);
            renamed = true;
            break;
        }
        catch (err) {
            const code = err?.code;
            if ((code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') && attempt < 4) {
                clock_cjs_1.realClock.sleep(25 * (attempt + 1));
                continue;
            }
            break;
        }
    }
    if (!renamed) {
        (0, shell_command_projection_cjs_1.platformWriteSync)(storePath, JSON.stringify(data, null, 2));
        try {
            node_fs_1.default.unlinkSync(tmpPath);
        }
        catch { /* ignore */ }
    }
}
/**
 * Records an anti-pattern or repair lesson into durable storage.
 */
function recordAntiPattern(planningDir, entry) {
    const data = loadAntiPatterns(planningDir);
    const record = {
        id: `ap-${Date.now()}-${node_crypto_1.default.randomBytes(4).toString('hex')}`,
        timestamp: new Date().toISOString(),
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
}
/**
 * Queries stored anti-patterns matching given criteria.
 */
function queryAntiPatterns(planningDir, opts = {}) {
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
        }
        catch {
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
            if (errLower.includes(q) || lessonLower.includes(q))
                return true;
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
    return opts.errorQuery ? results.slice(0, limit) : results.slice(-limit);
}
module.exports = {
    sanitizeStackTrace,
    loadAntiPatterns,
    saveAntiPatterns,
    recordAntiPattern,
    queryAntiPatterns,
};
