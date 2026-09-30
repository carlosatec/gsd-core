/**
 * Token Dashboard Renderer — Formats real-time token telemetry into responsive ASCII CLI dashboard.
 *
 * Produces clean 65-column ASCII telemetry displays for /gsd:tokens and terminal status panes.
 * Supports modular sub-panels: default (JIT summary), --sessions (ops), --cost (financial), and --all.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
import jitTelemetry = require('./jit-telemetry.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import aggregatorMod = require('./observability-aggregator.cjs');
import { clampPercent } from './phase-lifecycle.cjs';

const { getTelemetrySummary } = jitTelemetry;
const { aggregateOperationalSessions, calculateFinancialMetrics } = aggregatorMod;

const TARGET_WIDTH = 63;
const INNER_WIDTH = TARGET_WIDTH - 2; // 61

/**
 * Calculates terminal visual column width, accounting for 2-column wide characters and emojis.
 */
function getVisualWidth(str: string): number {
  let width = 0;
  for (const char of str) {
    const code = char.codePointAt(0) || 0;
    if (code === 0xfe0f || (code >= 0x0300 && code <= 0x036f)) {
      continue;
    }
    if (
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2600 && code <= 0x27bf) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe10 && code <= 0xfe19) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x1f000 && code <= 0x1faff)
    ) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

/**
 * Ensures any row content is padded to exactly fit inside the ASCII box borders (63 chars visual width).
 */
function formatBoxLine(content: string): string {
  const vWidth = getVisualWidth(content);
  if (vWidth > INNER_WIDTH) {
    let acc = '';
    let curWidth = 0;
    for (const char of content) {
      const charCode = char.codePointAt(0) || 0;
      const charWidth = (charCode === 0xfe0f || (charCode >= 0x0300 && charCode <= 0x036f))
        ? 0
        : ((charCode >= 0x1100 && charCode <= 0x115f) ||
           (charCode >= 0x2600 && charCode <= 0x27bf) ||
           (charCode >= 0x2e80 && charCode <= 0xa4cf) ||
           (charCode >= 0xac00 && charCode <= 0xd7a3) ||
           (charCode >= 0xf900 && charCode <= 0xfaff) ||
           (charCode >= 0xfe10 && charCode <= 0xfe19) ||
           (charCode >= 0xfe30 && charCode <= 0xfe6f) ||
           (charCode >= 0xff00 && charCode <= 0xff60) ||
           (charCode >= 0xffe0 && charCode <= 0xffe6) ||
           (charCode >= 0x1f000 && charCode <= 0x1faff)) ? 2 : 1;
      if (curWidth + charWidth > INNER_WIDTH) break;
      acc += char;
      curWidth += charWidth;
    }
    return `│${acc}${' '.repeat(Math.max(0, INNER_WIDTH - curWidth))}│`;
  }
  return `│${content}${' '.repeat(Math.max(0, INNER_WIDTH - vWidth))}│`;
}

/**
 * Creates a visual ASCII progress bar of specified length.
 */
function makeProgressBar(percentage: number, length: number = 16): string {
  const clamped = Math.max(0, Math.min(100, percentage));
  const filledCount = Math.round((clamped / 100) * length);
  const emptyCount = Math.max(0, length - filledCount);
  return '█'.repeat(filledCount) + '░'.repeat(emptyCount);
}

/**
 * Formats a number with thousands separators (e.g. 84,500).
 */
function formatNumber(num: number): string {
  return num.toLocaleString('en-US');
}

type DashboardViewMode = 'default' | 'sessions' | 'cost' | 'all';

interface DashboardRenderOptions {
  view?: DashboardViewMode;
  model?: string;
  [key: string]: unknown;
}

function resolveViewMode(options?: string | DashboardRenderOptions | string[]): { mode: DashboardViewMode; model?: string } {
  if (!options) return { mode: 'default' };

  if (typeof options === 'string') {
    const clean = options.trim().toLowerCase().replace(/^--/, '');
    if (clean === 'sessions') return { mode: 'sessions' };
    if (clean === 'cost' || clean === 'finance' || clean === 'financial') return { mode: 'cost' };
    if (clean === 'all' || clean === 'full') return { mode: 'all' };
    return { mode: 'default' };
  }

  if (Array.isArray(options)) {
    if (options.includes('--all') || options.includes('all')) return { mode: 'all' };
    if (options.includes('--sessions') || options.includes('sessions')) return { mode: 'sessions' };
    if (options.includes('--cost') || options.includes('cost')) return { mode: 'cost' };
    return { mode: 'default' };
  }

  if (typeof options === 'object') {
    if (options.view === 'sessions' || options['sessions'] === true) return { mode: 'sessions', model: options.model };
    if (options.view === 'cost' || options['cost'] === true) return { mode: 'cost', model: options.model };
    if (options.view === 'all' || options['all'] === true) return { mode: 'all', model: options.model };
  }

  return { mode: 'default' };
}

/**
 * Renders the ASCII token telemetry dashboard (65 columns max width).
 * Modularized for --sessions, --cost, --all, or standard default JIT summary.
 */
function renderTokenDashboard(planningDir: string, options?: string | DashboardRenderOptions | string[]): string {
  const { mode, model } = resolveViewMode(options);
  const summary = getTelemetrySummary(planningDir);

  const topBorder = `┌${'─'.repeat(INNER_WIDTH)}┐`;
  const midBorder = `├${'─'.repeat(INNER_WIDTH)}┤`;
  const botBorder = `└${'─'.repeat(INNER_WIDTH)}┘`;

  // ─── Mode: --sessions (Operational Health Pane) ────────────────────────────
  if (mode === 'sessions') {
    const ops = aggregateOperationalSessions(planningDir);
    const lines: string[] = [
      topBorder,
      formatBoxLine(' 📊 GSD Agent Operational Sessions (Reliability & Latency)'),
      formatBoxLine(' ℹ️ Telemetry aggregated from .planning/intel/sessions/'),
      midBorder,
    ];

    if (ops.totalSessions === 0) {
      lines.push(formatBoxLine(' No session logs found in .planning/intel/sessions/.'));
      lines.push(formatBoxLine(' Run /gsd:plan, /gsd:exec, or /gsd:review to trace runs.'));
      lines.push(botBorder);
      return lines.join('\n');
    }

    lines.push(formatBoxLine(` • Total Sessions:     ${formatNumber(ops.totalSessions).padEnd(6)} executions`));
    lines.push(formatBoxLine(` • Success Rate:       ${ops.successRatePct.toFixed(1).padEnd(5)}% (${ops.completedSessions} passed / ${ops.failedSessions} failed)`));
    lines.push(formatBoxLine(` • Average Duration:   ${(ops.avgDurationMs / 1000).toFixed(1).padEnd(4)}s (Peak: ${(ops.peakDurationMs / 1000).toFixed(1)}s)`));
    lines.push(formatBoxLine(` • Total Runtime:      ${(ops.totalDurationMs / 1000).toFixed(1).padEnd(6)}s agent compute time`));
    lines.push(formatBoxLine(` • Tool Calls:         ${formatNumber(ops.totalToolsCalled).padEnd(6)} invocations`));
    lines.push(formatBoxLine(` • File Mutations:     ${formatNumber(ops.totalMutations).padEnd(6)} writes (${ops.mutatedFiles.length} files modified)`));

    if (Object.keys(ops.toolDistribution).length > 0) {
      lines.push(midBorder);
      lines.push(formatBoxLine(' 🛠️ Tool Distribution:'));
      for (const [tool, count] of Object.entries(ops.toolDistribution).slice(0, 4)) {
        const tPad = tool.slice(0, 24).padEnd(24);
        const cPad = `${count} calls`.padStart(12);
        lines.push(formatBoxLine(` • ${tPad} ${cPad}`));
      }
    }

    if (ops.recentSessions.length > 0) {
      const recent = ops.recentSessions[0];
      lines.push(midBorder);
      const cmdStr = recent.command ? `[${recent.command}]` : '[run]';
      lines.push(formatBoxLine(` 🕒 Last Session: ${cmdStr} ${recent.status} (${(recent.durationMs / 1000).toFixed(1)}s)`));
      if (recent.error) {
        const errPreview = recent.error.slice(0, 50).replace(/\r?\n/g, ' ');
        lines.push(formatBoxLine(`    Error: ${errPreview}`));
      }
    }

    lines.push(botBorder);
    return lines.join('\n');
  }

  // ─── Mode: --cost (Financial Cost Pane) ───────────────────────────────────
  if (mode === 'cost') {
    const fin = calculateFinancialMetrics(summary, planningDir, model);
    const lines: string[] = [
      topBorder,
      formatBoxLine(` 💵 GSD Financial Telemetry (${fin.pricingModel})`),
      formatBoxLine(' ℹ️ Estimated API costs & gross dollar savings'),
      midBorder,
    ];

    if (fin.totalTokensUsed === 0 && fin.totalTokensAvoided === 0) {
      lines.push(formatBoxLine(' No token usage records found for cost estimation.'));
      lines.push(formatBoxLine(' Run /gsd:plan or /gsd:review to generate savings.'));
      lines.push(botBorder);
      return lines.join('\n');
    }

    lines.push(formatBoxLine(` • Actual Cost:        ${fin.formattedActualCost.padEnd(10)} (${formatNumber(fin.totalTokensUsed)} tokens used)`));
    lines.push(formatBoxLine(` • Avoided Cost:       ${fin.formattedAvoidedCost.padEnd(10)} (${formatNumber(fin.totalTokensAvoided)} baseline tokens)`));
    lines.push(formatBoxLine(` • Net Dollar Savings: ${fin.formattedNetSavings.padEnd(10)} (${fin.savingsPercentage}% cost reduction)`));
    lines.push(midBorder);
    lines.push(formatBoxLine(' 🏷️ Savings by Model Provider:'));

    for (const comp of fin.providerComparisons) {
      const namePad = comp.modelName.slice(0, 22).padEnd(22);
      const savedPad = `${comp.formattedNetSavings} saved`.padStart(16);
      lines.push(formatBoxLine(` • ${namePad} ${savedPad}`));
    }

    lines.push(botBorder);
    return lines.join('\n');
  }

  // ─── Mode: --all or default (Unified / Standard JIT Summary) ───────────────
  const lines: string[] = [
    topBorder,
    formatBoxLine(' ⚡ GSD Core Nexus Token Telemetry (Observability)'),
    formatBoxLine(' ℹ️ JIT Context & AST Savings (Cloud quotas are external)'),
    midBorder,
  ];

  if (summary.totalInvocations === 0) {
    lines.push(formatBoxLine(' No telemetry records found yet.'));
    lines.push(formatBoxLine(' Run /gsd:plan, /gsd:exec, or /gsd:review to record tokens.'));
    lines.push(botBorder);
    return lines.join('\n');
  }

  if (typeof summary.averageRelevanceScore === 'number') {
    const relBar = makeProgressBar(summary.averageRelevanceScore, 12);
    lines.push(formatBoxLine(` • Context Relevance:    [${relBar}] ${summary.averageRelevanceScore.toFixed(1)}% (Quality)`));
  }
  lines.push(formatBoxLine(` • Total Invocations:     ${formatNumber(summary.totalInvocations).padEnd(6)} executions`));
  lines.push(formatBoxLine(` • Tokens Used (JIT):     ${formatNumber(summary.totalJitTokensUsed).padEnd(10)} tokens`));
  lines.push(formatBoxLine(` • Monolithic Avoided:    ${formatNumber(summary.totalMonolithicTokensAvoided).padEnd(10)} tokens`));
  lines.push(formatBoxLine(` • Tokens Saved:          ${formatNumber(summary.totalTokensSaved).padEnd(10)} tokens`));
  lines.push(formatBoxLine(` • Average Efficiency:    ${summary.averageEfficiencyPct.toFixed(1).padEnd(5)}% context saved`));
  const compRatio = (summary.averageCompressionRatio || 1.0).toFixed(1) + 'x';
  lines.push(formatBoxLine(` • Graph Compression:     ${compRatio.padEnd(6)} reduction factor`));
  lines.push(formatBoxLine(` • Peak Invocation:       ${formatNumber(summary.peakInvocationTokens).padEnd(6)} tokens`));

  // If in --all mode, inject Operational and Financial summary rows
  if (mode === 'all') {
    const fin = calculateFinancialMetrics(summary, planningDir, model);
    const ops = aggregateOperationalSessions(planningDir);

    lines.push(midBorder);
    lines.push(formatBoxLine(' 💵 Financial Impact:'));
    lines.push(formatBoxLine(` • Net Savings (USD):     ${fin.formattedNetSavings.padEnd(10)} (${fin.savingsPercentage}% savings)`));
    lines.push(formatBoxLine(` • Estimated Spend:       ${fin.formattedActualCost.padEnd(10)} (Model: ${fin.pricingModel.slice(0, 14)})`));

    lines.push(midBorder);
    lines.push(formatBoxLine(' 📊 Operational Sessions:'));
    lines.push(formatBoxLine(` • Total Runs / Success:  ${ops.totalSessions} runs (${ops.successRatePct}% success)`));
    lines.push(formatBoxLine(` • Avg Runtime / Tools:   ${(ops.avgDurationMs / 1000).toFixed(1)}s avg (${ops.totalToolsCalled} tool calls)`));
  }

  lines.push(midBorder);
  lines.push(formatBoxLine(' 🔀 Distribution by Command:'));

  const CANONICAL_ORDER = ['plan', 'exec', 'review', 'verify', 'auto'];
  const cmdKeys = Object.keys(summary.commandBreakdown).sort((a, b) => {
    const idxA = CANONICAL_ORDER.indexOf(a);
    const idxB = CANONICAL_ORDER.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b);
  });

  if (cmdKeys.length === 0) {
    lines.push(formatBoxLine('   (none recorded)'));
  } else {
    const totalUsed = Math.max(1, summary.totalJitTokensUsed);
    for (const cmd of cmdKeys) {
      const stat = summary.commandBreakdown[cmd];
      const pct = clampPercent(stat.tokensUsed, totalUsed);
      const bar = makeProgressBar(pct, 12);
      const cmdPad = cmd.padEnd(8);
      const pctPad = `${pct}%`.padStart(4);
      const tokensPad = `(${formatNumber(stat.tokensUsed)} tokens)`.padEnd(18);
      lines.push(formatBoxLine(` • ${cmdPad} [${bar}] ${pctPad} ${tokensPad}`));
    }
  }

  const phaseKeys = Object.keys(summary.phaseBreakdown);
  if (phaseKeys.length > 0) {
    lines.push(midBorder);
    lines.push(formatBoxLine(' 📁 Breakdown by Phase:'));
    for (const phase of phaseKeys.slice(-5)) {
      const pStat = summary.phaseBreakdown[phase];
      const phasePad = phase.slice(0, 16).padEnd(16);
      const pTokensPad = `${formatNumber(pStat.tokensUsed)} tokens`.padStart(16);
      const pInvsPad = `(${pStat.invocations} runs)`.padStart(12);
      lines.push(formatBoxLine(` • ${phasePad} ${pTokensPad} ${pInvsPad}`));
    }
  }

  if (summary.lastInvocation) {
    const last = summary.lastInvocation;
    lines.push(midBorder);
    const isFullRepo = last.command === 'review' && last.scopeMode === 'full-repo';
    const cmdLabel = isFullRepo ? 'review (full-repo)' : last.command;
    const targetPreview = last.targetFiles.slice(0, 2).join(', ');
    const targetStr = targetPreview.length > 28 ? targetPreview.slice(0, 25) + '...' : targetPreview;
    lines.push(formatBoxLine(` 🕒 Last Run (${cmdLabel}): ${targetStr}`));
    if (typeof last.relevanceScore === 'number') {
      const confTag = last.systemOneConfidence ? ` | ${last.systemOneConfidence.toUpperCase()}` : '';
      lines.push(
        formatBoxLine(`    Used: ${formatNumber(last.jitTokens)} tok | Relevance: ${last.relevanceScore.toFixed(0)}%${confTag} | Saved: ${last.efficiencyPct}%`)
      );
    } else {
      lines.push(
        formatBoxLine(`    Used: ${formatNumber(last.jitTokens)} tok | Avoided: ${formatNumber(last.fullRepoTokens)} tok | Saved: ${last.efficiencyPct}%`)
      );
    }
  }

  const execInvocations = summary.commandBreakdown['exec'] ? summary.commandBreakdown['exec'].invocations : 0;
  const hasPlanOrReview = (summary.commandBreakdown['plan']?.invocations || 0) > 0 || (summary.commandBreakdown['review']?.invocations || 0) > 0;
  if (summary.totalInvocations > 0 && execInvocations === 0 && hasPlanOrReview) {
    lines.push(midBorder);
    lines.push(formatBoxLine(' 💡 Lifecycle note: Plan/Review active. Next: run /gsd:exec'));
  }

  lines.push(botBorder);
  return lines.join('\n');
}

export = {
  renderTokenDashboard,
  formatBoxLine,
  makeProgressBar,
  getVisualWidth,
  formatNumber,
};
