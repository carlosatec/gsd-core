"use strict";
/**
 * JIT Telemetry Engine — Records and aggregates token savings achieved via surgical JIT context injection.
 *
 * Persists invocation telemetry in `.planning/intel/telemetry.json` and produces
 * real-time efficiency metrics for /gsd:status and /gsd:stats.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const node_path_1 = __importDefault(require("node:path"));
const shell_command_projection_cjs_1 = require("./shell-command-projection.cjs");
// ─── Telemetry Functions ──────────────────────────────────────────────────────
/**
 * Loads telemetry data from `.planning/intel/telemetry.json`.
 */
function loadTelemetry(planningDir) {
    const telemetryPath = node_path_1.default.join(planningDir, 'intel', 'telemetry.json');
    try {
        const raw = (0, shell_command_projection_cjs_1.platformReadSync)(telemetryPath);
        if (!raw)
            throw new Error('Empty');
        return JSON.parse(raw);
    }
    catch {
        return {
            version: '1.0.0',
            totalInvocations: 0,
            totalTokensSaved: 0,
            totalJitTokensUsed: 0,
            totalMonolithicTokensAvoided: 0,
            averageEfficiencyPct: 0,
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
    (0, shell_command_projection_cjs_1.platformWriteSync)(telemetryPath, JSON.stringify(data, null, 2));
}
/**
 * Records a single JIT invocation and updates aggregate efficiency metrics.
 */
function recordJitInvocation(planningDir, targetFiles, jitTokens, fullRepoTokens) {
    const data = loadTelemetry(planningDir);
    const effectiveFull = Math.max(fullRepoTokens, jitTokens);
    const tokensSaved = Math.max(0, effectiveFull - jitTokens);
    const efficiencyPct = effectiveFull > 0 ? Number(((tokensSaved / effectiveFull) * 100).toFixed(1)) : 0;
    const record = {
        timestamp: new Date().toISOString(),
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
    if (data.totalMonolithicTokensAvoided > 0) {
        data.averageEfficiencyPct = Number(((data.totalTokensSaved / data.totalMonolithicTokensAvoided) * 100).toFixed(1));
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
        averageEfficiencyPct: data.averageEfficiencyPct,
        lastInvocation: data.records.length > 0 ? data.records[data.records.length - 1] : undefined,
    };
}
module.exports = {
    loadTelemetry,
    saveTelemetry,
    recordJitInvocation,
    getTelemetrySummary,
};
