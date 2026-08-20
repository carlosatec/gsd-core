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
        }));
        return {
            version: '2.0.0',
            totalInvocations: parsed.totalInvocations || records.length || 0,
            totalTokensSaved: parsed.totalTokensSaved || 0,
            totalJitTokensUsed: parsed.totalJitTokensUsed || 0,
            totalMonolithicTokensAvoided: parsed.totalMonolithicTokensAvoided || 0,
            averageEfficiencyPct: parsed.averageEfficiencyPct || 0,
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
 * Parameters command and phaseId are optional to preserve 100% backward compatibility.
 */
function recordJitInvocation(planningDir, targetFiles, jitTokens, fullRepoTokens, command = 'other', phaseId) {
    const data = loadTelemetry(planningDir);
    const effectiveFull = Math.max(fullRepoTokens, jitTokens);
    const tokensSaved = Math.max(0, effectiveFull - jitTokens);
    const efficiencyPct = effectiveFull > 0 ? Number(((tokensSaved / effectiveFull) * 100).toFixed(1)) : 0;
    const record = {
        timestamp: new Date().toISOString(),
        command: command || 'other',
        phaseId,
        targetFiles,
        jitTokens,
        fullRepoTokens: effectiveFull,
        tokensSaved,
        efficiencyPct,
    };
    data.records.push(record);
    // Keep last 100 records
    if (data.records.length > 100) {
        data.records = data.records.slice(-100);
    }
    data.totalInvocations += 1;
    data.totalTokensSaved += tokensSaved;
    data.totalJitTokensUsed += jitTokens;
    data.totalMonolithicTokensAvoided += effectiveFull;
    if (jitTokens > data.peakInvocationTokens) {
        data.peakInvocationTokens = jitTokens;
    }
    if (data.totalMonolithicTokensAvoided > 0) {
        data.averageEfficiencyPct = Number(((data.totalTokensSaved / data.totalMonolithicTokensAvoided) * 100).toFixed(1));
    }
    // Update command breakdown
    const cmdKey = record.command;
    if (!data.commandBreakdown[cmdKey]) {
        data.commandBreakdown[cmdKey] = { invocations: 0, tokensUsed: 0, tokensSaved: 0 };
    }
    data.commandBreakdown[cmdKey].invocations += 1;
    data.commandBreakdown[cmdKey].tokensUsed += jitTokens;
    data.commandBreakdown[cmdKey].tokensSaved += tokensSaved;
    // Update phase breakdown if available
    if (phaseId) {
        if (!data.phaseBreakdown[phaseId]) {
            data.phaseBreakdown[phaseId] = { invocations: 0, tokensUsed: 0, tokensSaved: 0 };
        }
        data.phaseBreakdown[phaseId].invocations += 1;
        data.phaseBreakdown[phaseId].tokensUsed += jitTokens;
        data.phaseBreakdown[phaseId].tokensSaved += tokensSaved;
    }
    saveTelemetry(planningDir, data);
    return record;
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
};
