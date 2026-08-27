/**
 * JIT Telemetry Engine — Records and aggregates token savings achieved via surgical JIT context injection.
 *
 * Persists invocation telemetry in `.planning/intel/telemetry.json` (Schema v2.0) and produces
 * real-time efficiency metrics and multidimensional breakdown for /gsd:tokens, /gsd:status, and /gsd:stats.
 */

import path from 'node:path';
import { platformReadSync, platformWriteSync, platformEnsureDir } from './shell-command-projection.cjs';

// ─── Types ────────────────────────────────────────────────────────────────────

interface JitTelemetryRecord {
  timestamp: string;
  command: string;
  phaseId?: string;
  targetFiles: string[];
  jitTokens: number;
  fullRepoTokens: number;
  tokensSaved: number;
  efficiencyPct: number;
  compressionRatio?: number;
}

interface CommandUsageStat {
  invocations: number;
  tokensUsed: number;
  tokensSaved: number;
}

interface PhaseUsageStat {
  invocations: number;
  tokensUsed: number;
  tokensSaved: number;
}

interface JitTelemetryData {
  version: string;
  totalInvocations: number;
  totalTokensSaved: number;
  totalJitTokensUsed: number;
  totalMonolithicTokensAvoided: number;
  averageEfficiencyPct: number;
  averageCompressionRatio?: number;
  peakInvocationTokens: number;
  commandBreakdown: Record<string, CommandUsageStat>;
  phaseBreakdown: Record<string, PhaseUsageStat>;
  records: JitTelemetryRecord[];
}

interface JitTelemetrySummary {
  totalInvocations: number;
  totalTokensSaved: number;
  totalJitTokensUsed: number;
  totalMonolithicTokensAvoided: number;
  averageEfficiencyPct: number;
  averageCompressionRatio?: number;
  peakInvocationTokens: number;
  commandBreakdown: Record<string, CommandUsageStat>;
  phaseBreakdown: Record<string, PhaseUsageStat>;
  lastInvocation?: JitTelemetryRecord;
}

// ─── Telemetry Functions ──────────────────────────────────────────────────────

/**
 * Loads telemetry data from `.planning/intel/telemetry.json` with seamless v1.0 -> v2.0 migration.
 */
function loadTelemetry(planningDir: string): JitTelemetryData {
  const telemetryPath = path.join(planningDir, 'intel', 'telemetry.json');
  try {
    const raw = platformReadSync(telemetryPath);
    if (!raw) throw new Error('Empty');
    const parsed = JSON.parse(raw) as Partial<JitTelemetryData>;

    const records: JitTelemetryRecord[] = (parsed.records || []).map(r => ({
      timestamp: r.timestamp || new Date().toISOString(),
      command: (r as unknown as { command?: string }).command || 'other',
      phaseId: (r as unknown as { phaseId?: string }).phaseId,
      targetFiles: r.targetFiles || [],
      jitTokens: r.jitTokens || 0,
      fullRepoTokens: r.fullRepoTokens || 0,
      tokensSaved: r.tokensSaved || 0,
      efficiencyPct: r.efficiencyPct || 0,
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
  } catch {
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
function saveTelemetry(planningDir: string, data: JitTelemetryData): void {
  const intelDir = path.join(planningDir, 'intel');
  platformEnsureDir(intelDir);
  const telemetryPath = path.join(intelDir, 'telemetry.json');
  data.version = '2.0.0';
  platformWriteSync(telemetryPath, JSON.stringify(data, null, 2));
}

/**
 * Records a single JIT invocation and updates aggregate efficiency metrics.
 * Parameters command and phaseId are optional to preserve 100% backward compatibility.
 */
function recordJitInvocation(
  planningDir: string,
  targetFiles: string[],
  jitTokens: number,
  fullRepoTokens: number,
  command: string = 'other',
  phaseId?: string
): JitTelemetryRecord {
  const data = loadTelemetry(planningDir);
  const effectiveFull = Math.max(fullRepoTokens, jitTokens);
  const tokensSaved = Math.max(0, effectiveFull - jitTokens);
  const efficiencyPct = effectiveFull > 0 ? Number(((tokensSaved / effectiveFull) * 100).toFixed(1)) : 0;
  const compressionRatio = Number(Math.max(1.0, effectiveFull / Math.max(1, jitTokens)).toFixed(1));

  const record: JitTelemetryRecord = {
    timestamp: new Date().toISOString(),
    command: command || 'other',
    phaseId,
    targetFiles,
    jitTokens,
    fullRepoTokens: effectiveFull,
    tokensSaved,
    efficiencyPct,
    compressionRatio,
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
    data.averageEfficiencyPct = Number(
      ((data.totalTokensSaved / data.totalMonolithicTokensAvoided) * 100).toFixed(1)
    );
  }

  if (data.totalJitTokensUsed > 0) {
    data.averageCompressionRatio = Number(
      Math.max(1.0, data.totalMonolithicTokensAvoided / data.totalJitTokensUsed).toFixed(1)
    );
  }

  // Update command breakdown
  const cmdKey = record.command;
  if (!data.commandBreakdown[cmdKey]) {
    data.commandBreakdown[cmdKey] = { invocations: 0, tokensUsed: 0, tokensSaved: 0 };
  }
  data.commandBreakdown[cmdKey].invocations += 1;
  data.commandBreakdown[cmdKey].tokensUsed += jitTokens;
  data.commandBreakdown[cmdKey].tokensSaved += tokensSaved;

  // Prune commandBreakdown to max 50 keys
  const cmdKeys = Object.keys(data.commandBreakdown);
  if (cmdKeys.length > 50) {
    cmdKeys.sort((a, b) => data.commandBreakdown[b].invocations - data.commandBreakdown[a].invocations);
    const pruned: Record<string, CommandUsageStat> = {};
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
    data.phaseBreakdown[phaseId].tokensUsed += jitTokens;
    data.phaseBreakdown[phaseId].tokensSaved += tokensSaved;

    // Prune phaseBreakdown to max 50 keys
    const phaseKeys = Object.keys(data.phaseBreakdown);
    if (phaseKeys.length > 50) {
      phaseKeys.sort((a, b) => data.phaseBreakdown[b].invocations - data.phaseBreakdown[a].invocations);
      const pruned: Record<string, PhaseUsageStat> = {};
      for (const k of phaseKeys.slice(0, 50)) {
        pruned[k] = data.phaseBreakdown[k];
      }
      data.phaseBreakdown = pruned;
    }
  }

  saveTelemetry(planningDir, data);
  return record;
}

/**
 * Returns a high-level summary of token savings.
 */
function getTelemetrySummary(planningDir: string): JitTelemetrySummary {
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

export = {
  loadTelemetry,
  saveTelemetry,
  recordJitInvocation,
  getTelemetrySummary,
};
