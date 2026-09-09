"use strict";
/**
 * JIT Telemetry Engine — Records and aggregates token savings achieved via surgical JIT context injection.
 *
 * Persists invocation telemetry in `.planning/intel/telemetry.json` (Schema v2.0) and produces
 * real-time efficiency metrics and multidimensional breakdown for /gsd:tokens, /gsd:status, and /gsd:stats.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const node_path_1 = __importDefault(require("node:path"));
const shell_command_projection_cjs_1 = require("./shell-command-projection.cjs");
// ─── Constants & Helpers ──────────────────────────────────────────────────────
const CANONICAL_TELEMETRY_COMMANDS = ['plan', 'exec', 'review', 'verify', 'auto', 'status', 'other'];
const LANGUAGE_CHAR_WEIGHTS = {
    typescript: 45,
    javascript: 45,
    python: 40,
    go: 55,
    rust: 55,
    sql: 35,
    csharp: 50,
    java: 50,
    ruby: 40,
    php: 45,
    dart: 45,
    html: 40,
    css: 35,
    yaml: 35,
    json: 30,
};
function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}
function normalizeTelemetryCommand(cmd) {
    if (!cmd)
        return 'other';
    const clean = cmd.trim().toLowerCase().replace(/^[/\\$]/, '').replace(/^gsd[:-]/, '').replace(/^gsd\s+/, '');
    if (CANONICAL_TELEMETRY_COMMANDS.includes(clean)) {
        return clean;
    }
    return 'other';
}
// ─── Telemetry Functions ──────────────────────────────────────────────────────
/**
 * Loads telemetry data from `.planning/intel/telemetry.json` with seamless v1.0 -> v2.0 migration.
 */
function loadTelemetry(planningDir) {
    const telemetryPath = node_path_1.default.join(planningDir, 'intel', 'telemetry.json');
    try {
        const raw = (0, shell_command_projection_cjs_1.platformReadSync)(telemetryPath);
        if (!raw)
            throw new Error('Empty');
        const parsed = JSON.parse(raw);
        const records = (parsed.records || []).map(r => ({
            timestamp: r.timestamp || new Date().toISOString(),
            command: r.command || 'other',
            phaseId: r.phaseId,
            targetFiles: r.targetFiles || [],
            jitTokens: r.jitTokens || 0,
            fullRepoTokens: r.fullRepoTokens || 0,
            tokensSaved: r.tokensSaved || 0,
            efficiencyPct: r.efficiencyPct || 0,
            compressionRatio: r.compressionRatio,
            invocationId: r.invocationId,
            scopeMode: r.scopeMode,
        }));
        const compressionRatio = parsed.averageCompressionRatio ||
            (parsed.totalJitTokensUsed && parsed.totalJitTokensUsed > 0 && parsed.totalMonolithicTokensAvoided
                ? Number(Math.max(1.0, parsed.totalMonolithicTokensAvoided / parsed.totalJitTokensUsed).toFixed(1))
                : 1.0);
        return {
            version: '2.0.0',
            totalInvocations: parsed.totalInvocations || records.length || 0,
            totalTokensSaved: parsed.totalTokensSaved || 0,
            totalJitTokensUsed: parsed.totalJitTokensUsed || 0,
            totalMonolithicTokensAvoided: parsed.totalMonolithicTokensAvoided || 0,
            averageEfficiencyPct: parsed.averageEfficiencyPct || 0,
            averageCompressionRatio: compressionRatio,
            peakInvocationTokens: parsed.peakInvocationTokens || 0,
            commandBreakdown: parsed.commandBreakdown || {},
            phaseBreakdown: parsed.phaseBreakdown || {},
            records,
        };
    }
    catch {
        return {
            version: '2.0.0',
            totalInvocations: 0,
            totalTokensSaved: 0,
            totalJitTokensUsed: 0,
            totalMonolithicTokensAvoided: 0,
            averageEfficiencyPct: 0,
            averageCompressionRatio: 1.0,
            peakInvocationTokens: 0,
            commandBreakdown: {},
            phaseBreakdown: {},
            records: [],
        };
    }
}
/**
 * Persists telemetry data to `.planning/intel/telemetry.json`.
 */
function saveTelemetry(planningDir, data) {
    const intelDir = node_path_1.default.join(planningDir, 'intel');
    (0, shell_command_projection_cjs_1.platformEnsureDir)(intelDir);
    const telemetryPath = node_path_1.default.join(intelDir, 'telemetry.json');
    data.version = '2.0.0';
    (0, shell_command_projection_cjs_1.platformWriteSync)(telemetryPath, JSON.stringify(data, null, 2));
}
/**
 * Records a single JIT invocation and updates aggregate efficiency metrics.
 * Parameters command, phaseId, invocationId, and scopeMode are optional to preserve 100% backward compatibility.
 * All mutations are wrapped in an atomic cooperative file lock (withFileLockSync).
 */
function recordJitInvocation(planningDir, targetFiles, jitTokens, fullRepoTokens, command = 'other', phaseId, invocationId, scopeMode, workflowContext) {
    const intelDir = node_path_1.default.join(planningDir, 'intel');
    const telemetryPath = node_path_1.default.join(intelDir, 'telemetry.json');
    return (0, shell_command_projection_cjs_1.withFileLockSync)(telemetryPath, () => {
        const data = loadTelemetry(planningDir);
        // D-112: Idempotency deduplication via invocationId
        if (invocationId) {
            const existing = data.records.find(r => r.invocationId === invocationId);
            if (existing) {
                return existing;
            }
        }
        // D-115: Strict Sanitization
        const sanitizedCmd = normalizeTelemetryCommand(command);
        const sanitizedJit = Math.max(0, Math.floor(Number(jitTokens) || 0));
        const sanitizedFull = Math.max(0, Math.floor(Number(fullRepoTokens) || 0));
        let effectiveFull;
        let tokensSaved;
        let efficiencyPct;
        let compressionRatio;
        // D-113 & D-121: Dual-mode review / targeted vs full-repo
        const resolvedScopeMode = scopeMode || (sanitizedFull > sanitizedJit ? 'targeted' : (sanitizedFull > 0 ? 'full-repo' : 'targeted'));
        if (resolvedScopeMode === 'full-repo') {
            effectiveFull = sanitizedFull > 0 ? sanitizedFull : sanitizedJit;
            tokensSaved = 0;
            efficiencyPct = 0;
            compressionRatio = 1.0;
        }
        else {
            effectiveFull = Math.max(sanitizedFull, sanitizedJit);
            tokensSaved = Math.max(0, effectiveFull - sanitizedJit);
            efficiencyPct = effectiveFull > 0 ? Number(((tokensSaved / effectiveFull) * 100).toFixed(1)) : 0;
            compressionRatio = Number(Math.max(1.0, effectiveFull / Math.max(1, sanitizedJit)).toFixed(1));
        }
        const record = {
            timestamp: new Date().toISOString(),
            command: sanitizedCmd,
            phaseId,
            targetFiles,
            jitTokens: sanitizedJit,
            fullRepoTokens: effectiveFull,
            tokensSaved,
            efficiencyPct,
            compressionRatio,
            invocationId,
            scopeMode: resolvedScopeMode,
            ...(workflowContext ? { workflowContext } : {}),
        };
        data.records.push(record);
        // Keep last 100 records
        if (data.records.length > 100) {
            data.records = data.records.slice(-100);
        }
        data.totalInvocations += 1;
        data.totalTokensSaved += tokensSaved;
        data.totalJitTokensUsed += sanitizedJit;
        data.totalMonolithicTokensAvoided += effectiveFull;
        if (sanitizedJit > data.peakInvocationTokens) {
            data.peakInvocationTokens = sanitizedJit;
        }
        if (data.totalMonolithicTokensAvoided > 0) {
            data.averageEfficiencyPct = Number(((data.totalTokensSaved / data.totalMonolithicTokensAvoided) * 100).toFixed(1));
        }
        if (data.totalJitTokensUsed > 0) {
            data.averageCompressionRatio = Number(Math.max(1.0, data.totalMonolithicTokensAvoided / data.totalJitTokensUsed).toFixed(1));
        }
        // Update command breakdown
        const cmdKey = record.command;
        if (!data.commandBreakdown[cmdKey]) {
            data.commandBreakdown[cmdKey] = { invocations: 0, tokensUsed: 0, tokensSaved: 0 };
        }
        data.commandBreakdown[cmdKey].invocations += 1;
        data.commandBreakdown[cmdKey].tokensUsed += sanitizedJit;
        data.commandBreakdown[cmdKey].tokensSaved += tokensSaved;
        // Prune commandBreakdown to max 50 keys
        const cmdKeys = Object.keys(data.commandBreakdown);
        if (cmdKeys.length > 50) {
            cmdKeys.sort((a, b) => data.commandBreakdown[b].invocations - data.commandBreakdown[a].invocations);
            const pruned = {};
            for (const k of cmdKeys.slice(0, 50)) {
                pruned[k] = data.commandBreakdown[k];
            }
            data.commandBreakdown = pruned;
        }
        // Update phase breakdown if available
        if (phaseId) {
            if (!data.phaseBreakdown[phaseId]) {
                data.phaseBreakdown[phaseId] = { invocations: 0, tokensUsed: 0, tokensSaved: 0 };
            }
            data.phaseBreakdown[phaseId].invocations += 1;
            data.phaseBreakdown[phaseId].tokensUsed += sanitizedJit;
            data.phaseBreakdown[phaseId].tokensSaved += tokensSaved;
            // Prune phaseBreakdown to max 50 keys
            const phaseKeys = Object.keys(data.phaseBreakdown);
            if (phaseKeys.length > 50) {
                phaseKeys.sort((a, b) => data.phaseBreakdown[b].invocations - data.phaseBreakdown[a].invocations);
                const pruned = {};
                for (const k of phaseKeys.slice(0, 50)) {
                    pruned[k] = data.phaseBreakdown[k];
                }
                data.phaseBreakdown = pruned;
            }
        }
        saveTelemetry(planningDir, data);
        return record;
    });
}
/**
 * Returns a high-level summary of token savings.
 */
function getTelemetrySummary(planningDir) {
    const data = loadTelemetry(planningDir);
    return {
        totalInvocations: data.totalInvocations,
        totalTokensSaved: data.totalTokensSaved,
        totalJitTokensUsed: data.totalJitTokensUsed,
        totalMonolithicTokensAvoided: data.totalMonolithicTokensAvoided,
        averageEfficiencyPct: data.averageEfficiencyPct,
        averageCompressionRatio: data.averageCompressionRatio || (data.totalJitTokensUsed > 0 ? Number(Math.max(1.0, data.totalMonolithicTokensAvoided / data.totalJitTokensUsed).toFixed(1)) : 1.0),
        peakInvocationTokens: data.peakInvocationTokens,
        commandBreakdown: data.commandBreakdown,
        phaseBreakdown: data.phaseBreakdown,
        lastInvocation: data.records.length > 0 ? data.records[data.records.length - 1] : undefined,
    };
}
module.exports = {
    loadTelemetry,
    saveTelemetry,
    recordJitInvocation,
    getTelemetrySummary,
    LANGUAGE_CHAR_WEIGHTS,
    estimateTokens,
    CANONICAL_TELEMETRY_COMMANDS,
    normalizeTelemetryCommand,
};
