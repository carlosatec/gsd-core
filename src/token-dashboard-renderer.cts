/**
 * Token Dashboard Renderer — Formats real-time token telemetry into responsive ASCII CLI dashboard.
 *
 * Produces clean 65-column ASCII telemetry displays for /gsd:tokens and terminal status panes.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
import jitTelemetry = require('./jit-telemetry.cjs');
import { clampPercent } from './phase-lifecycle.cjs';
const { getTelemetrySummary } = jitTelemetry;

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

  const lines: string[] = [
    '┌─────────────────────────────────────────────────────────────┐',
    '│ ⚡ GSD Core Nexus Token Telemetry (Observability)            │',
    '├─────────────────────────────────────────────────────────────┤',
  ];

  if (summary.totalInvocations === 0) {
    lines.push('│ No telemetry records found yet.                             │');
    lines.push('│ Run /gsd:plan, /gsd:exec, or /gsd:review to record tokens.  │');
    lines.push('└─────────────────────────────────────────────────────────────┘');
    return lines.join('\n');
  }

  lines.push(
    `│ • Total Invocations:     ${formatNumber(summary.totalInvocations).padEnd(6)} executions             │`
  );
  lines.push(
    `│ • Tokens Used (JIT):     ${formatNumber(summary.totalJitTokensUsed).padEnd(10)} tokens                 │`
  );
  lines.push(
    `│ • Monolithic Avoided:    ${formatNumber(summary.totalMonolithicTokensAvoided).padEnd(10)} tokens                 │`
  );
  lines.push(
    `│ • Tokens Saved:          ${formatNumber(summary.totalTokensSaved).padEnd(10)} tokens                 │`
  );
  lines.push(
    `│ • Average Efficiency:    ${summary.averageEfficiencyPct.toFixed(1).padEnd(5)}% context saved           │`
  );
  const compRatio = (summary.averageCompressionRatio || 1.0).toFixed(1) + 'x';
  lines.push(
    `│ • Graph Compression:     ${compRatio.padEnd(6)} reduction factor       │`
  );
  lines.push(
    `│ • Peak Invocation:       ${formatNumber(summary.peakInvocationTokens).padEnd(6)} tokens                     │`
  );
  lines.push('├─────────────────────────────────────────────────────────────┤');
  lines.push('│ 🔀 Distribution by Command:                                │');

  const cmdKeys = Object.keys(summary.commandBreakdown);
  if (cmdKeys.length === 0) {
    lines.push('│   (none recorded)                                           │');
  } else {
    const totalUsed = Math.max(1, summary.totalJitTokensUsed);
    for (const cmd of cmdKeys) {
      const stat = summary.commandBreakdown[cmd];
      const pct = clampPercent(stat.tokensUsed, totalUsed);
      const bar = makeProgressBar(pct, 12);
      const cmdPad = cmd.padEnd(8);
      const pctPad = `${pct}%`.padStart(4);
      const tokensPad = `(${formatNumber(stat.tokensUsed)} tokens)`.padEnd(18);
      lines.push(`│ • ${cmdPad} [${bar}] ${pctPad} ${tokensPad}│`);
    }
  }

  const phaseKeys = Object.keys(summary.phaseBreakdown);
  if (phaseKeys.length > 0) {
    lines.push('├─────────────────────────────────────────────────────────────┤');
    lines.push('│ 📁 Breakdown by Phase:                                      │');
    for (const phase of phaseKeys.slice(-5)) {
      const pStat = summary.phaseBreakdown[phase];
      const phasePad = phase.slice(0, 16).padEnd(16);
      const pTokensPad = `${formatNumber(pStat.tokensUsed)} tokens`.padStart(16);
      const pInvsPad = `(${pStat.invocations} runs)`.padStart(12);
      lines.push(`│ • ${phasePad} ${pTokensPad} ${pInvsPad}    │`);
    }
  }

  if (summary.lastInvocation) {
    const last = summary.lastInvocation;
    lines.push('├─────────────────────────────────────────────────────────────┤');
    const targetPreview = last.targetFiles.slice(0, 2).join(', ');
    const targetStr = (targetPreview.length > 30 ? targetPreview.slice(0, 27) + '...' : targetPreview).padEnd(30);
    lines.push(`│ 🕒 Last Run (${last.command}): ${targetStr}│`);
    lines.push(
      `│    Used: ${formatNumber(last.jitTokens)} tok | Avoided: ${formatNumber(last.fullRepoTokens)} tok | Saved: ${last.efficiencyPct}%   │`
    );
  }

  lines.push('└─────────────────────────────────────────────────────────────┘');
  return lines.join('\n');
}

export = {
  renderTokenDashboard,
  makeProgressBar,
  formatNumber,
};
