/**
 * JIT Telemetry Engine — Records and aggregates token savings achieved via surgical JIT context injection.
 *
 * Persists invocation telemetry in `.planning/intel/telemetry.json` and produces
 * real-time efficiency metrics for /gsd:status and /gsd:stats.
 */

import fs from 'node:fs';
import path from 'node:path';
import { platformReadSync, platformWriteSync, platformEnsureDir } from './shell-command-projection.cjs';

// ─── Types ────────────────────────────────────────────────────────────────────

interface JitTelemetryRecord {
  timestamp: string;
  targetFiles: string[];
  jitTokens: number;
  fullRepoTokens: number;
  tokensSaved: number;
  efficiencyPct: number;
}

interface JitTelemetryData {
  version: string;
  totalInvocations: number;
  totalTokensSaved: number;
  totalJitTokensUsed: number;
  totalMonolithicTokensAvoided: number;
  averageEfficiencyPct: number;
  records: JitTelemetryRecord[];
}

interface JitTelemetrySummary {
  totalInvocations: number;
  totalTokensSaved: number;
  averageEfficiencyPct: number;
  lastInvocation?: JitTelemetryRecord;
}

// ─── Telemetry Functions ──────────────────────────────────────────────────────

/**
 * Loads telemetry data from `.planning/intel/telemetry.json`.
 */
function loadTelemetry(planningDir: string): JitTelemetryData {
  const telemetryPath = path.join(planningDir, 'intel', 'telemetry.json');
  try {
    const raw = platformReadSync(telemetryPath);
    if (!raw) throw new Error('Empty');
    return JSON.parse(raw) as JitTelemetryData;
  } catch {
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
function saveTelemetry(planningDir: string, data: JitTelemetryData): void {
  const intelDir = path.join(planningDir, 'intel');
  platformEnsureDir(intelDir);
  const telemetryPath = path.join(intelDir, 'telemetry.json');
  platformWriteSync(telemetryPath, JSON.stringify(data, null, 2));
}

/**
 * Records a single JIT invocation and updates aggregate efficiency metrics.
 */
function recordJitInvocation(
  planningDir: string,
  targetFiles: string[],
  jitTokens: number,
  fullRepoTokens: number
): JitTelemetryRecord {
  const data = loadTelemetry(planningDir);
  const effectiveFull = Math.max(fullRepoTokens, jitTokens);
  const tokensSaved = Math.max(0, effectiveFull - jitTokens);
  const efficiencyPct = effectiveFull > 0 ? Number(((tokensSaved / effectiveFull) * 100).toFixed(1)) : 0;

  const record: JitTelemetryRecord = {
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
    data.averageEfficiencyPct = Number(
      ((data.totalTokensSaved / data.totalMonolithicTokensAvoided) * 100).toFixed(1)
    );
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
    averageEfficiencyPct: data.averageEfficiencyPct,
    lastInvocation: data.records.length > 0 ? data.records[data.records.length - 1] : undefined,
  };
}

export = {
  loadTelemetry,
  saveTelemetry,
  recordJitInvocation,
  getTelemetrySummary,
};
