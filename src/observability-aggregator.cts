/**
 * Observability 360° Aggregator Core — GSD Core Nexus 3.4
 *
 * Unifies three core telemetry streams:
 * 1. JIT Context Token Compression (.planning/intel/telemetry.json)
 * 2. Operational Agent Sessions (.planning/intel/sessions/*.jsonl)
 * 3. Codebase AST Topology & Health (.planning/intel/codebase-graph.json)
 *
 * Produces consolidated financial cost estimations, operational reliability KPIs,
 * and PageRank centrality metrics for terminal dashboards and interactive offline HTML.
 */

import fs from 'node:fs';
import path from 'node:path';
import { splitLines } from './text-lines.cjs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import jitTelemetry = require('./jit-telemetry.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import codebaseAst = require('./codebase-ast-analyzer.cjs');

const { loadTelemetry, getTelemetrySummary } = jitTelemetry;
const { loadCodebaseGraph, queryTopCentralFiles } = codebaseAst;

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface ModelPricingTier {
  name: string;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
  blendedCostPerMillion: number;
}

interface FinancialMetrics {
  pricingModel: string;
  totalTokensUsed: number;
  totalTokensAvoided: number;
  actualCostUsd: number;
  avoidedCostUsd: number;
  netSavingsUsd: number;
  savingsPercentage: number;
  formattedActualCost: string;
  formattedAvoidedCost: string;
  formattedNetSavings: string;
  providerComparisons: Array<{
    modelKey: string;
    modelName: string;
    actualCostUsd: number;
    avoidedCostUsd: number;
    netSavingsUsd: number;
    formattedNetSavings: string;
  }>;
}

interface OperationalSessionSummary {
  id: string;
  command?: string;
  phaseId?: string;
  status: string;
  durationMs: number;
  timestamp: string;
  error?: string;
}

interface OperationalMetrics {
  totalSessions: number;
  completedSessions: number;
  failedSessions: number;
  successRatePct: number;
  totalDurationMs: number;
  avgDurationMs: number;
  peakDurationMs: number;
  totalToolsCalled: number;
  toolDistribution: Record<string, number>;
  totalMutations: number;
  mutatedFiles: string[];
  errorTaxonomy: Record<string, number>;
  recentSessions: OperationalSessionSummary[];
}

interface AstTopologyHub {
  file: string;
  score: number;
  symbolsCount?: number;
  linesCount?: number;
  language?: string;
}

interface AstTopologyMetrics {
  totalFiles: number;
  totalSymbols: number;
  totalExports: number;
  totalRoutes: number;
  languages: Record<string, number>;
  topHubs: AstTopologyHub[];
}

interface ObservabilitySnapshot {
  timestamp: string;
  telemetry: ReturnType<typeof getTelemetrySummary>;
  financial: FinancialMetrics;
  operational: OperationalMetrics;
  topology: AstTopologyMetrics;
}

interface RawSessionStartEvent {
  type: 'session_start';
  command?: string;
  phaseId?: string;
  timestamp?: string;
}

interface RawSessionEndEvent {
  type: 'session_end';
  status?: string;
  totalDurationMs?: number;
  totalToolsCalled?: number;
  totalMutations?: number;
  error?: string;
}

// ─── Standard Model Pricing ───────────────────────────────────────────────────

const STANDARD_PRICING_TABLE: Record<string, ModelPricingTier> = {
  'claude-3-7-sonnet': {
    name: 'Claude 3.7 Sonnet',
    inputCostPerMillion: 3.0,
    outputCostPerMillion: 15.0,
    blendedCostPerMillion: 3.0,
  },
  'claude-3-5-sonnet': {
    name: 'Claude 3.5 Sonnet',
    inputCostPerMillion: 3.0,
    outputCostPerMillion: 15.0,
    blendedCostPerMillion: 3.0,
  },
  'gpt-4o': {
    name: 'GPT-4o',
    inputCostPerMillion: 2.5,
    outputCostPerMillion: 10.0,
    blendedCostPerMillion: 2.5,
  },
  'gemini-2-0-pro': {
    name: 'Gemini 2.0 Pro',
    inputCostPerMillion: 1.25,
    outputCostPerMillion: 5.0,
    blendedCostPerMillion: 1.25,
  },
  'deepseek-chat': {
    name: 'DeepSeek V3/R1',
    inputCostPerMillion: 0.14,
    outputCostPerMillion: 0.28,
    blendedCostPerMillion: 0.14,
  },
  'local': {
    name: 'Local Models (Ollama/LM Studio)',
    inputCostPerMillion: 0.0,
    outputCostPerMillion: 0.0,
    blendedCostPerMillion: 0.0,
  },
};

// ─── Formatting Helpers ───────────────────────────────────────────────────────

/**
 * Formats a dollar amount adaptively, preventing false $0.00 zeros for micro-runs.
 */
function formatCurrency(amount: number): string {
  if (amount === 0) return '$ 0.00';
  if (amount >= 1.0) {
    return `$ ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (amount >= 0.01) {
    return `$ ${amount.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
  }
  return `$ ${amount.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
}

// ─── Config Loader ────────────────────────────────────────────────────────────

interface ObservabilityConfigJson {
  observability?: {
    pricing_model?: string;
    pricingModel?: string;
    custom_rates?: Record<string, Partial<ModelPricingTier>>;
    customRates?: Record<string, Partial<ModelPricingTier>>;
  };
}

interface ObservabilityConfig {
  pricingModel?: string;
  customRates?: Record<string, Partial<ModelPricingTier>>;
}

function loadObservabilityConfig(planningDir: string): ObservabilityConfig {
  const configPath = path.join(planningDir, 'config.json');
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8');
      const parsed = JSON.parse(raw) as ObservabilityConfigJson;
      if (parsed && typeof parsed === 'object' && parsed.observability) {
        return {
          pricingModel: parsed.observability.pricing_model || parsed.observability.pricingModel,
          customRates: parsed.observability.custom_rates || parsed.observability.customRates,
        };
      }
    }
  } catch {
    // Non-blocking config read
  }
  return {};
}

// ─── Operational Sessions Aggregation ─────────────────────────────────────────

/**
 * Resilient two-tier parser for agent execution sessions in `.planning/intel/sessions/*.jsonl`.
 * Combines summary counters from session_end with fine-grained tool_call and file_mutation events.
 */
function aggregateOperationalSessions(planningDir: string): OperationalMetrics {
  const sessionsDir = path.join(planningDir, 'intel', 'sessions');
  const emptyResult: OperationalMetrics = {
    totalSessions: 0,
    completedSessions: 0,
    failedSessions: 0,
    successRatePct: 0,
    totalDurationMs: 0,
    avgDurationMs: 0,
    peakDurationMs: 0,
    totalToolsCalled: 0,
    toolDistribution: {},
    totalMutations: 0,
    mutatedFiles: [],
    errorTaxonomy: {},
    recentSessions: [],
  };

  if (!fs.existsSync(sessionsDir)) return emptyResult;

  try {
    const files = fs.readdirSync(sessionsDir)
      .filter((f) => f.startsWith('session_') && f.endsWith('.jsonl'));

    if (files.length === 0) return emptyResult;

    let totalDurationMs = 0;
    let peakDurationMs = 0;
    let completedCount = 0;
    let failedCount = 0;
    let totalToolsCalled = 0;
    let totalMutations = 0;
    const toolDist: Record<string, number> = {};
    const mutatedFilesSet = new Set<string>();
    const errorTaxonomy: Record<string, number> = {};
    const sessionSummaries: Array<OperationalSessionSummary & { mtime: number }> = [];

    for (const f of files) {
      const fullPath = path.join(sessionsDir, f);
      try {
        const stat = fs.statSync(fullPath);
        const content = fs.readFileSync(fullPath, 'utf8');
        const lines = splitLines(content.trim()).filter(Boolean);
        if (lines.length === 0) continue;

        let startEv: RawSessionStartEvent | null = null;
        let endEv: RawSessionEndEvent | null = null;
        let sessionTools = 0;
        let sessionMuts = 0;

        for (const line of lines) {
          try {
            const ev = JSON.parse(line) as Record<string, unknown>;
            if (!ev || typeof ev !== 'object') continue;

            const type = typeof ev['type'] === 'string' ? ev['type'] : '';
            if (type === 'session_start') {
              startEv = {
                type: 'session_start',
                command: typeof ev['command'] === 'string' ? ev['command'] : undefined,
                phaseId: typeof ev['phaseId'] === 'string' ? ev['phaseId'] : undefined,
                timestamp: typeof ev['timestamp'] === 'string' ? ev['timestamp'] : undefined,
              };
            } else if (type === 'session_end') {
              endEv = {
                type: 'session_end',
                status: typeof ev['status'] === 'string' ? ev['status'] : undefined,
                totalDurationMs: typeof ev['totalDurationMs'] === 'number' ? ev['totalDurationMs'] : undefined,
                totalToolsCalled: typeof ev['totalToolsCalled'] === 'number' ? ev['totalToolsCalled'] : undefined,
                totalMutations: typeof ev['totalMutations'] === 'number' ? ev['totalMutations'] : undefined,
                error: typeof ev['error'] === 'string' ? ev['error'] : undefined,
              };
            } else if (type === 'tool_call') {
              sessionTools++;
              const tName = typeof ev['toolName'] === 'string' ? ev['toolName'] : 'unknown';
              toolDist[tName] = (toolDist[tName] || 0) + 1;
            } else if (type === 'file_mutation') {
              sessionMuts++;
              if (typeof ev['filePath'] === 'string') {
                mutatedFilesSet.add(ev['filePath']);
              }
            }
          } catch {
            // Non-fatal: ignore single malformed line
          }
        }

        const id = f.replace(/^session_/, '').replace(/\.jsonl$/, '');
        const status = endEv?.status || (endEv ? 'completed' : 'in_progress');
        const duration = Number(endEv?.totalDurationMs) || 0;

        if (status === 'completed') {
          completedCount++;
        } else if (status === 'failed' || status === 'aborted') {
          failedCount++;
          if (endEv?.error) {
            const errKey = endEv.error.slice(0, 70).replace(/\r?\n/g, ' ');
            errorTaxonomy[errKey] = (errorTaxonomy[errKey] || 0) + 1;
          }
        }

        totalDurationMs += duration;
        if (duration > peakDurationMs) peakDurationMs = duration;

        // Fallback to session_end counters if detailed events weren't emitted
        const tools = sessionTools > 0 ? sessionTools : (Number(endEv?.totalToolsCalled) || 0);
        const muts = sessionMuts > 0 ? sessionMuts : (Number(endEv?.totalMutations) || 0);
        totalToolsCalled += tools;
        totalMutations += muts;

        sessionSummaries.push({
          id,
          command: startEv?.command,
          phaseId: startEv?.phaseId,
          status,
          durationMs: duration,
          timestamp: startEv?.timestamp || new Date(stat.mtimeMs).toISOString(),
          error: endEv?.error,
          mtime: stat.mtimeMs,
        });
      } catch {
        // Skip unreadable file
      }
    }

    const totalValid = sessionSummaries.length;
    if (totalValid === 0) return emptyResult;

    // Sort newest first
    sessionSummaries.sort((a, b) => b.mtime - a.mtime || b.timestamp.localeCompare(a.timestamp));

    const successRatePct = totalValid > 0 ? Number(((completedCount / totalValid) * 100).toFixed(1)) : 0;
    const avgDurationMs = totalValid > 0 ? Math.round(totalDurationMs / totalValid) : 0;

    return {
      totalSessions: totalValid,
      completedSessions: completedCount,
      failedSessions: failedCount,
      successRatePct,
      totalDurationMs,
      avgDurationMs,
      peakDurationMs,
      totalToolsCalled,
      toolDistribution: toolDist,
      totalMutations,
      mutatedFiles: Array.from(mutatedFilesSet),
      errorTaxonomy,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      recentSessions: sessionSummaries.slice(0, 10).map(({ mtime, ...rest }) => rest),
    };
  } catch {
    return emptyResult;
  }
}

// ─── Financial Estimation Engine ──────────────────────────────────────────────

/**
 * Calculates estimated dollar costs and net savings across model providers.
 */
function calculateFinancialMetrics(
  telemetrySummary: ReturnType<typeof getTelemetrySummary>,
  planningDir: string,
  modelOverride?: string
): FinancialMetrics {
  const config = loadObservabilityConfig(planningDir);
  const selectedModel = modelOverride || config.pricingModel || 'claude-3-7-sonnet';

  const pricingTable: Record<string, ModelPricingTier> = { ...STANDARD_PRICING_TABLE };
  if (config.customRates) {
    for (const [k, v] of Object.entries(config.customRates)) {
      pricingTable[k] = {
        name: v.name || k,
        inputCostPerMillion: v.inputCostPerMillion ?? 3.0,
        outputCostPerMillion: v.outputCostPerMillion ?? 15.0,
        blendedCostPerMillion: v.blendedCostPerMillion ?? 3.0,
      };
    }
  }

  const activeTier = pricingTable[selectedModel] || pricingTable['claude-3-7-sonnet'] || {
    name: selectedModel,
    inputCostPerMillion: 3.0,
    outputCostPerMillion: 15.0,
    blendedCostPerMillion: 3.0,
  };

  const usedTokens = telemetrySummary.totalJitTokensUsed || 0;
  const avoidedTokens = telemetrySummary.totalMonolithicTokensAvoided || 0;

  const rate = activeTier.blendedCostPerMillion / 1_000_000;
  const actualCostUsd = usedTokens * rate;
  const avoidedCostUsd = avoidedTokens * rate;
  const netSavingsUsd = Math.max(0, avoidedCostUsd - actualCostUsd);
  const savingsPercentage = avoidedCostUsd > 0
    ? Number(((netSavingsUsd / avoidedCostUsd) * 100).toFixed(1))
    : 0;

  const providerComparisons = Object.entries(pricingTable).map(([key, tier]) => {
    const tierRate = tier.blendedCostPerMillion / 1_000_000;
    const tActual = usedTokens * tierRate;
    const tAvoided = avoidedTokens * tierRate;
    const tSaved = Math.max(0, tAvoided - tActual);
    return {
      modelKey: key,
      modelName: tier.name,
      actualCostUsd: Number(tActual.toFixed(4)),
      avoidedCostUsd: Number(tAvoided.toFixed(4)),
      netSavingsUsd: Number(tSaved.toFixed(4)),
      formattedNetSavings: formatCurrency(tSaved),
    };
  });

  return {
    pricingModel: activeTier.name,
    totalTokensUsed: usedTokens,
    totalTokensAvoided: avoidedTokens,
    actualCostUsd: Number(actualCostUsd.toFixed(4)),
    avoidedCostUsd: Number(avoidedCostUsd.toFixed(4)),
    netSavingsUsd: Number(netSavingsUsd.toFixed(4)),
    savingsPercentage,
    formattedActualCost: formatCurrency(actualCostUsd),
    formattedAvoidedCost: formatCurrency(avoidedCostUsd),
    formattedNetSavings: formatCurrency(netSavingsUsd),
    providerComparisons,
  };
}

// ─── AST Topology Extraction ──────────────────────────────────────────────────

/**
 * Extracts high-level AST metrics and top PageRank centrality hubs.
 */
function extractAstTopologyMetrics(planningDir: string): AstTopologyMetrics {
  const emptyTopology: AstTopologyMetrics = {
    totalFiles: 0,
    totalSymbols: 0,
    totalExports: 0,
    totalRoutes: 0,
    languages: {},
    topHubs: [],
  };

  try {
    const graph = loadCodebaseGraph(planningDir);
    if (!graph) return emptyTopology;

    const stats = graph.stats || {};
    const topHubsRaw = typeof queryTopCentralFiles === 'function' ? queryTopCentralFiles(graph, 5) : [];
    const topHubs: AstTopologyHub[] = topHubsRaw.map((h: { file: string; score: number }) => {
      const fData = graph.files?.[h.file];
      return {
        file: h.file,
        score: Number(h.score.toFixed(4)),
        symbolsCount: fData?.symbols?.length || 0,
        linesCount: fData?.linesCount || 0,
        language: fData?.language || 'unknown',
      };
    });

    return {
      totalFiles: stats.totalFiles || Object.keys(graph.files || {}).length,
      totalSymbols: stats.totalSymbols || 0,
      totalExports: stats.totalExports || 0,
      totalRoutes: stats.totalRoutes || 0,
      languages: stats.filesByLanguage || {},
      topHubs,
    };
  } catch {
    return emptyTopology;
  }
}

// ─── Unified Snapshot ─────────────────────────────────────────────────────────

/**
 * Assembles a comprehensive 360° observability snapshot across all streams.
 */
function getObservabilitySnapshot(
  planningDir: string,
  modelOverride?: string
): ObservabilitySnapshot {
  const telemetry = getTelemetrySummary(planningDir);
  const financial = calculateFinancialMetrics(telemetry, planningDir, modelOverride);
  const operational = aggregateOperationalSessions(planningDir);
  const topology = extractAstTopologyMetrics(planningDir);

  return {
    timestamp: new Date().toISOString(),
    telemetry,
    financial,
    operational,
    topology,
  };
}

export = {
  STANDARD_PRICING_TABLE,
  formatCurrency,
  aggregateOperationalSessions,
  calculateFinancialMetrics,
  extractAstTopologyMetrics,
  getObservabilitySnapshot,
  loadTelemetry,
  getTelemetrySummary,
};
