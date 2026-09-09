"use strict";
/**
 * Token Dashboard Renderer — Formats real-time token telemetry into responsive ASCII CLI dashboard.
 *
 * Produces clean 65-column ASCII telemetry displays for /gsd:tokens and terminal status panes.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const jitTelemetry = require("./jit-telemetry.cjs");
const phase_lifecycle_cjs_1 = require("./phase-lifecycle.cjs");
const { getTelemetrySummary } = jitTelemetry;
const TARGET_WIDTH = 63;
const INNER_WIDTH = TARGET_WIDTH - 2; // 61
/**
 * Calculates terminal visual column width, accounting for 2-column wide characters and emojis.
 */
function getVisualWidth(str) {
    let width = 0;
    for (const char of str) {
        const code = char.codePointAt(0) || 0;
        if (code === 0xfe0f || (code >= 0x0300 && code <= 0x036f)) {
            continue;
        }
        if ((code >= 0x1100 && code <= 0x115f) ||
            (code >= 0x2600 && code <= 0x27bf) ||
            (code >= 0x2e80 && code <= 0xa4cf) ||
            (code >= 0xac00 && code <= 0xd7a3) ||
            (code >= 0xf900 && code <= 0xfaff) ||
            (code >= 0xfe10 && code <= 0xfe19) ||
            (code >= 0xfe30 && code <= 0xfe6f) ||
            (code >= 0xff00 && code <= 0xff60) ||
            (code >= 0xffe0 && code <= 0xffe6) ||
            (code >= 0x1f000 && code <= 0x1faff)) {
            width += 2;
        }
        else {
            width += 1;
        }
    }
    return width;
}
/**
 * Ensures any row content is padded to exactly fit inside the ASCII box borders (63 chars visual width).
 */
function formatBoxLine(content) {
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
            if (curWidth + charWidth > INNER_WIDTH)
                break;
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
function makeProgressBar(percentage, length = 16) {
    const clamped = Math.max(0, Math.min(100, percentage));
    const filledCount = Math.round((clamped / 100) * length);
    const emptyCount = Math.max(0, length - filledCount);
    return '█'.repeat(filledCount) + '░'.repeat(emptyCount);
}
/**
 * Formats a number with thousands separators (e.g. 84,500).
 */
function formatNumber(num) {
    return num.toLocaleString('en-US');
}
/**
 * Renders the full ASCII token telemetry dashboard (65 columns max width).
 */
function renderTokenDashboard(planningDir) {
    const summary = getTelemetrySummary(planningDir);
    const topBorder = `┌${'─'.repeat(INNER_WIDTH)}┐`;
    const midBorder = `├${'─'.repeat(INNER_WIDTH)}┤`;
    const botBorder = `└${'─'.repeat(INNER_WIDTH)}┘`;
    const lines = [
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
    lines.push(formatBoxLine(` • Total Invocations:     ${formatNumber(summary.totalInvocations).padEnd(6)} executions`));
    lines.push(formatBoxLine(` • Tokens Used (JIT):     ${formatNumber(summary.totalJitTokensUsed).padEnd(10)} tokens`));
    lines.push(formatBoxLine(` • Monolithic Avoided:    ${formatNumber(summary.totalMonolithicTokensAvoided).padEnd(10)} tokens`));
    lines.push(formatBoxLine(` • Tokens Saved:          ${formatNumber(summary.totalTokensSaved).padEnd(10)} tokens`));
    lines.push(formatBoxLine(` • Average Efficiency:    ${summary.averageEfficiencyPct.toFixed(1).padEnd(5)}% context saved`));
    const compRatio = (summary.averageCompressionRatio || 1.0).toFixed(1) + 'x';
    lines.push(formatBoxLine(` • Graph Compression:     ${compRatio.padEnd(6)} reduction factor`));
    lines.push(formatBoxLine(` • Peak Invocation:       ${formatNumber(summary.peakInvocationTokens).padEnd(6)} tokens`));
    lines.push(midBorder);
    lines.push(formatBoxLine(' 🔀 Distribution by Command:'));
    // Deterministic ordering (D-116): plan -> exec -> review -> verify -> auto
    const CANONICAL_ORDER = ['plan', 'exec', 'review', 'verify', 'auto'];
    const cmdKeys = Object.keys(summary.commandBreakdown).sort((a, b) => {
        const idxA = CANONICAL_ORDER.indexOf(a);
        const idxB = CANONICAL_ORDER.indexOf(b);
        if (idxA !== -1 && idxB !== -1)
            return idxA - idxB;
        if (idxA !== -1)
            return -1;
        if (idxB !== -1)
            return 1;
        return a.localeCompare(b);
    });
    if (cmdKeys.length === 0) {
        lines.push(formatBoxLine('   (none recorded)'));
    }
    else {
        const totalUsed = Math.max(1, summary.totalJitTokensUsed);
        for (const cmd of cmdKeys) {
            const stat = summary.commandBreakdown[cmd];
            const pct = (0, phase_lifecycle_cjs_1.clampPercent)(stat.tokensUsed, totalUsed);
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
        lines.push(formatBoxLine(`    Used: ${formatNumber(last.jitTokens)} tok | Avoided: ${formatNumber(last.fullRepoTokens)} tok | Saved: ${last.efficiencyPct}%`));
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
module.exports = {
    renderTokenDashboard,
    makeProgressBar,
    formatNumber,
};
