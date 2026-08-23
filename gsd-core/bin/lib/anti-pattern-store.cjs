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
// eslint-disable-next-line @typescript-eslint/no-require-imports
const learningsMod = require("./learnings.cjs");
const { learningsList } = learningsMod;
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
    try {
        node_fs_1.default.renameSync(tmpPath, storePath);
    }
    catch {
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
        results = results.filter(p => p.error.toLowerCase().includes(q) || p.lesson.toLowerCase().includes(q));
    }
    const limit = opts.limit ?? 10;
    return results.slice(-limit);
}
module.exports = {
    loadAntiPatterns,
    saveAntiPatterns,
    recordAntiPattern,
    queryAntiPatterns,
};
