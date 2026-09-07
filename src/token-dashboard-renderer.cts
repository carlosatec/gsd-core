/**
 * Token Dashboard Renderer — Formats real-time token telemetry into responsive ASCII CLI dashboard.
 *
 * Produces clean 65-column ASCII telemetry displays for /gsd:tokens and terminal status panes.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
import jitTelemetry = require('./jit-telemetry.cjs');
import { clampPercent } from './phase-lifecycle.cjs';
const { getTelemetrySummary } = jitTelemetry;

const TARGET_WIDTH = 63;
const INNER_WIDTH = TARGET_WIDTH - 2; // 61

/**
 * Ensures any row content is padded to exactly fit inside the ASCII box borders (63 chars total).
 */
function formatBoxLine(content: string): string {
  const truncated = content.length > INNER_WIDTH ? content.slice(0, INNER_WIDTH) : content;
  return `│${truncated.padEnd(INNER_WIDTH)}│`;
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

/**
 * Renders the full ASCII token telemetry dashboard (65 columns max width).
 */
function renderTokenDashboard(planningDir: string): string {
  const summary = getTelemetrySummary(planningDir);

  const topBorder = `┌${'─'.repeat(INNER_WIDTH)}┐`;
  const midBorder = `├${'─'.repeat(INNER_WIDTH)}┤`;
  const botBorder = `└${'─'.repeat(INNER_WIDTH)}┘`;

  const lines: string[] = [
    topBorder,
    formatBoxLine(' ⚡ GSD Core Nexus Token Telemetry (Observability)'),
    midBorder,
  ];

  if (summary.totalInvocations === 0) {
    lines.push(formatBoxLine(' No telemetry records found yet.'));
    lines.push(formatBoxLine(' Run /gsd:plan, /gsd:exec, or /gsd:review to record tokens.'));
    lines.push(botBorder);
    return lines.join('\n');
  }

  lines.push(
    formatBoxLine(` • Total Invocations:     ${formatNumber(summary.totalInvocations).padEnd(6)} executions`)
  );
  lines.push(
    formatBoxLine(` • Tokens Used (JIT):     ${formatNumber(summary.totalJitTokensUsed).padEnd(10)} tokens`)
  );
  lines.push(
    formatBoxLine(` • Monolithic Avoided:    ${formatNumber(summary.totalMonolithicTokensAvoided).padEnd(10)} tokens`)
  );
  lines.push(
    formatBoxLine(` • Tokens Saved:          ${formatNumber(summary.totalTokensSaved).padEnd(10)} tokens`)
  );
  lines.push(
    formatBoxLine(` • Average Efficiency:    ${summary.averageEfficiencyPct.toFixed(1).padEnd(5)}% context saved`)
  );
  const compRatio = (summary.averageCompressionRatio || 1.0).toFixed(1) + 'x';
  lines.push(
    formatBoxLine(` • Graph Compression:     ${compRatio.padEnd(6)} reduction factor`)
  );
  lines.push(
    formatBoxLine(` • Peak Invocation:       ${formatNumber(summary.peakInvocationTokens).padEnd(6)} tokens`)
  );
  lines.push(midBorder);
  lines.push(formatBoxLine(' 🔀 Distribution by Command:'));

  // Deterministic ordering (D-116): plan -> review -> exec -> other
  const CANONICAL_ORDER = ['plan', 'review', 'exec'];
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
    lines.push(
      formatBoxLine(`    Used: ${formatNumber(last.jitTokens)} tok | Avoided: ${formatNumber(last.fullRepoTokens)} tok | Saved: ${last.efficiencyPct}%`)
    );
  }

  // Pre-exec state diagnostic note (D-116)
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
  makeProgressBar,
  formatNumber,
};
