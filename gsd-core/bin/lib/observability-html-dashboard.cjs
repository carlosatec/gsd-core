"use strict";
/**
 * Observability 360° Offline HTML Dashboard Generator — GSD Core Nexus 3.4
 *
 * Generates a self-contained, 100% offline interactive dashboard in `.planning/intel/dashboard.html`.
 * Features responsive dark-mode glassmorphism cards, pure SVG charts, real-time client-side
 * model cost simulator, AST PageRank hub tables, and zero external CDN dependencies.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const node_path_1 = __importDefault(require("node:path"));
const shell_command_projection_cjs_1 = require("./shell-command-projection.cjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const aggregatorMod = require("./observability-aggregator.cjs");
const { getObservabilitySnapshot, STANDARD_PRICING_TABLE, } = aggregatorMod;
// ─── Sanitization & Helpers ───────────────────────────────────────────────────
function escapeHtml(str) {
    if (str === null || str === undefined)
        return '';
    const val = typeof str === 'string' ? str : (typeof str === 'number' || typeof str === 'boolean' ? String(str) : '');
    return val
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
function formatNumber(num) {
    return num.toLocaleString('en-US');
}
// ─── SVG Chart Generators ─────────────────────────────────────────────────────
/**
 * Generates pure SVG donut chart showing token distribution by command.
 */
function generateTokenDonutSvg(commandBreakdown, totalTokens) {
    if (!commandBreakdown || totalTokens <= 0) {
        return `<div class="empty-chart">No token distribution recorded yet.</div>`;
    }
    const COLORS = {
        plan: 'var(--accent)',
        exec: 'var(--success)',
        review: 'var(--primary)',
        verify: 'var(--warning)',
        auto: 'var(--pink)',
        other: 'var(--slate)',
    };
    const entries = Object.entries(commandBreakdown)
        .map(([cmd, stat]) => ({ cmd, tokens: stat.tokensUsed }))
        .filter(e => e.tokens > 0)
        .sort((a, b) => b.tokens - a.tokens);
    if (entries.length === 0) {
        return `<div class="empty-chart">No active command tokens to display.</div>`;
    }
    let cumulativeAngle = 0;
    const radius = 64;
    const cx = 80;
    const cy = 80;
    const strokeWidth = 24;
    const circumference = 2 * Math.PI * radius;
    const slicesSvg = entries.map(entry => {
        const fraction = entry.tokens / totalTokens;
        const strokeDash = fraction * circumference;
        const offset = circumference - cumulativeAngle;
        cumulativeAngle += strokeDash;
        const color = COLORS[entry.cmd] || 'var(--text-muted)';
        return `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-dasharray="${strokeDash} ${circumference}" stroke-dashoffset="${offset}" transform="rotate(-90 ${cx} ${cy})"><title>${escapeHtml(entry.cmd)}: ${formatNumber(entry.tokens)} tokens (${(fraction * 100).toFixed(1)}%)</title></circle>`;
    }).join('');
    const legendSvg = entries.map(entry => {
        const fraction = (entry.tokens / totalTokens) * 100;
        const color = COLORS[entry.cmd] || 'var(--text-muted)';
        return `
      <div class="legend-row">
        <span class="legend-dot" style="background:${color}"></span>
        <span class="legend-label">${escapeHtml(entry.cmd)}</span>
        <span class="legend-pct">${fraction.toFixed(1)}%</span>
        <span class="legend-tokens">${formatNumber(entry.tokens)}</span>
      </div>`;
    }).join('');
    return `
    <div class="donut-container">
      <svg width="160" height="160" viewBox="0 0 160 160" class="donut-svg">
        <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="${strokeWidth}" />
        ${slicesSvg}
      </svg>
      <div class="donut-legend">
        ${legendSvg}
      </div>
    </div>`;
}
/**
 * Generates pure SVG bar chart showing operational sessions timeline and latency.
 */
function generateSessionsTimelineSvg(recentSessions) {
    if (!recentSessions || recentSessions.length === 0) {
        return `<div class="empty-chart">No session timeline recorded yet.</div>`;
    }
    // Reverse so oldest of the recent is on the left
    const sessions = recentSessions.slice(0, 10).reverse();
    const maxDuration = Math.max(...sessions.map(s => s.durationMs), 1000);
    const chartHeight = 110;
    const barWidth = 24;
    const gap = 16;
    const totalWidth = sessions.length * (barWidth + gap);
    const barsSvg = sessions.map((s, idx) => {
        const height = Math.max(8, Math.round((s.durationMs / maxDuration) * chartHeight));
        const x = idx * (barWidth + gap);
        const y = chartHeight - height;
        const isSuccess = s.status === 'completed';
        const color = isSuccess ? 'var(--success)' : 'var(--danger)';
        const durSec = (s.durationMs / 1000).toFixed(1) + 's';
        const cmd = s.command || 'run';
        return `
      <g class="bar-group">
        <rect x="${x}" y="${y}" width="${barWidth}" height="${height}" rx="4" fill="${color}" opacity="0.85">
          <title>${escapeHtml(s.id)} [${escapeHtml(cmd)}] ${escapeHtml(s.status)}: ${durSec}</title>
        </rect>
        <text x="${x + barWidth / 2}" y="${chartHeight + 14}" font-size="9" fill="var(--text-muted)" text-anchor="middle">${escapeHtml(cmd)}</text>
        <text x="${x + barWidth / 2}" y="${Math.max(12, y - 4)}" font-size="8" fill="var(--text)" text-anchor="middle">${durSec}</text>
      </g>`;
    }).join('');
    return `
    <div class="timeline-container">
      <svg width="${totalWidth}" height="${chartHeight + 20}" viewBox="0 0 ${totalWidth} ${chartHeight + 20}" class="timeline-svg">
        ${barsSvg}
      </svg>
    </div>`;
}
// ─── Main HTML Generator ──────────────────────────────────────────────────────
/**
 * Generates the complete, standalone offline HTML document.
 */
function generateDashboardHtml(snapshot) {
    const { telemetry, financial, operational, topology, timestamp } = snapshot;
    const donutHtml = generateTokenDonutSvg(telemetry.commandBreakdown, telemetry.totalJitTokensUsed);
    const timelineHtml = generateSessionsTimelineSvg(operational.recentSessions);
    // Model Options for Dynamic Simulator
    const modelOptions = Object.entries(STANDARD_PRICING_TABLE).map(([key, tier]) => {
        const isSelected = financial.pricingModel === tier.name ? 'selected' : '';
        return `<option value="${escapeHtml(key)}" ${isSelected}>${escapeHtml(tier.name)} ($${tier.blendedCostPerMillion.toFixed(2)}/M)</option>`;
    }).join('');
    // Top PageRank Hubs Rows
    const hubsRows = topology.topHubs.length > 0
        ? topology.topHubs.map(h => `
        <tr>
          <td class="file-name" title="${escapeHtml(h.file)}"><code>${escapeHtml(h.file)}</code></td>
          <td><span class="badge badge-pr">${h.score.toFixed(4)}</span></td>
          <td>${h.symbolsCount ?? 0}</td>
          <td>${h.linesCount ?? 0}</td>
          <td><span class="badge badge-lang">${escapeHtml(h.language || 'ts')}</span></td>
        </tr>`).join('')
        : `<tr><td colspan="5" class="empty-cell">No AST graph loaded yet.</td></tr>`;
    // Languages distribution bars
    const langEntries = Object.entries(topology.languages).sort((a, b) => b[1] - a[1]);
    const totalLangFiles = topology.totalFiles || 1;
    const langBarsHtml = langEntries.map(([lang, count]) => {
        const pct = ((count / totalLangFiles) * 100).toFixed(1);
        return `
      <div class="lang-row">
        <span class="lang-name">${escapeHtml(lang)}</span>
        <div class="lang-bar-bg"><div class="lang-bar-fill" style="width:${pct}%"></div></div>
        <span class="lang-count">${count} (${pct}%)</span>
      </div>`;
    }).join('');
    const pricingTableJson = JSON.stringify(STANDARD_PRICING_TABLE);
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GSD Observability 360° — Telemetry & Financial Dashboard</title>
  <style>
    :root {
      --bg: rgb(9, 13, 22);
      --bg-gradient: radial-gradient(circle at 50% 0%, rgb(23, 37, 84) 0%, rgb(9, 13, 22) 75%);
      --card-bg: rgba(26, 38, 62, 0.65);
      --card-border: rgba(255, 255, 255, 0.08);
      --text: rgb(248, 250, 252);
      --text-muted: rgb(148, 163, 184);
      --primary: rgb(139, 92, 246);
      --accent: rgb(56, 189, 248);
      --success: rgb(16, 185, 129);
      --danger: rgb(244, 63, 94);
      --warning: rgb(245, 158, 11);
      --pink: rgb(236, 72, 153);
      --slate: rgb(100, 116, 139);
      --radius: 12px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      background-image: var(--bg-gradient);
      background-attachment: fixed;
      color: var(--text);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-height: 100vh;
      padding: 2rem 1.5rem;
      line-height: 1.5;
    }
    .container { max-width: 1280px; margin: 0 auto; }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
      margin-bottom: 2rem;
      padding-bottom: 1.5rem;
      border-bottom: 1px solid var(--card-border);
    }
    .header-title h1 {
      font-size: 1.6rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .header-title p { color: var(--text-muted); font-size: 0.88rem; margin-top: 0.2rem; }
    .header-controls { display: flex; align-items: center; gap: 0.75rem; }
    .select-label { font-size: 0.85rem; color: var(--text-muted); }
    select {
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid var(--card-border);
      color: var(--text);
      padding: 0.5rem 0.85rem;
      border-radius: 8px;
      font-size: 0.88rem;
      cursor: pointer;
      outline: none;
    }
    select:focus { border-color: var(--accent); }

    /* Top KPI Grid */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 1.25rem;
      margin-bottom: 1.5rem;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: var(--radius);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      padding: 1.25rem 1.5rem;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
    }
    .kpi-card .card-title {
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.4rem;
    }
    .kpi-value {
      font-size: 1.75rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--text);
    }
    .kpi-value.green { color: var(--success); }
    .kpi-value.blue { color: var(--accent); }
    .kpi-sub {
      font-size: 0.82rem;
      color: var(--text-muted);
      margin-top: 0.25rem;
    }

    /* Layout Grids */
    .grid-2 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(480px, 1fr));
      gap: 1.25rem;
      margin-bottom: 1.25rem;
    }
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }
    .section-title { font-size: 1rem; font-weight: 600; display: flex; align-items: center; gap: 0.5rem; }

    /* SVG Donut */
    .donut-container { display: flex; align-items: center; gap: 1.5rem; flex-wrap: wrap; }
    .donut-svg { flex-shrink: 0; }
    .donut-legend { display: flex; flex-direction: column; gap: 0.5rem; flex-grow: 1; }
    .legend-row { display: flex; align-items: center; font-size: 0.84rem; gap: 0.5rem; }
    .legend-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
    .legend-label { font-weight: 600; min-width: 60px; }
    .legend-pct { color: var(--text-muted); min-width: 45px; }
    .legend-tokens { margin-left: auto; color: var(--text); font-family: monospace; }

    /* Timeline */
    .timeline-container { overflow-x: auto; padding: 0.5rem 0; }
    .timeline-svg { min-width: 100%; }

    /* Tables */
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th { text-align: left; padding: 0.6rem 0.75rem; color: var(--text-muted); font-weight: 600; border-bottom: 1px solid var(--card-border); }
    td { padding: 0.6rem 0.75rem; border-bottom: 1px solid rgba(255, 255, 255, 0.03); }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 0.82rem; color: var(--accent); }
    .badge {
      display: inline-block;
      padding: 0.15rem 0.45rem;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .badge-pr { background: rgba(139, 92, 246, 0.2); color: var(--primary); border: 1px solid rgba(139, 92, 246, 0.3); }
    .badge-lang { background: rgba(56, 189, 248, 0.15); color: var(--accent); }

    /* Language Bars */
    .lang-row { display: flex; align-items: center; gap: 0.75rem; font-size: 0.82rem; margin-bottom: 0.5rem; }
    .lang-name { min-width: 80px; font-weight: 500; }
    .lang-bar-bg { flex-grow: 1; height: 8px; background: rgba(255, 255, 255, 0.06); border-radius: 4px; overflow: hidden; }
    .lang-bar-fill { height: 100%; background: var(--accent); border-radius: 4px; }
    .lang-count { color: var(--text-muted); min-width: 75px; text-align: right; }

    /* Empty states */
    .empty-chart, .empty-cell { color: var(--text-muted); font-size: 0.85rem; font-style: italic; padding: 1rem 0; text-align: center; }

    /* Footer */
    footer {
      margin-top: 2rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--card-border);
      text-align: center;
      color: var(--text-muted);
      font-size: 0.8rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="header-title">
        <h1>⚡ GSD Observability 360°</h1>
        <p>Real-Time Operational Sessions, AST Topology & Financial Savings Telemetry</p>
      </div>
      <div class="header-controls">
        <span class="select-label">Cost Model:</span>
        <select id="modelSelector">
          ${modelOptions}
        </select>
      </div>
    </header>

    <!-- Top KPI Cards -->
    <div class="kpi-grid">
      <div class="card kpi-card">
        <div class="card-title">JIT Context Injected</div>
        <div class="kpi-value blue" id="kpiTokensUsed">${formatNumber(telemetry.totalJitTokensUsed)}</div>
        <div class="kpi-sub">Avoided: ${formatNumber(telemetry.totalMonolithicTokensAvoided)} tok (${(telemetry.averageEfficiencyPct).toFixed(1)}% savings)</div>
      </div>

      <div class="card kpi-card">
        <div class="card-title">Net Dollar Savings</div>
        <div class="kpi-value green" id="kpiNetSavings">${escapeHtml(financial.formattedNetSavings)}</div>
        <div class="kpi-sub" id="kpiSavingsPct">${financial.savingsPercentage}% cost reduction</div>
      </div>

      <div class="card kpi-card">
        <div class="card-title">Estimated API Spend</div>
        <div class="kpi-value" id="kpiActualCost">${escapeHtml(financial.formattedActualCost)}</div>
        <div class="kpi-sub" id="kpiPricingModel">Active tier: ${escapeHtml(financial.pricingModel)}</div>
      </div>

      <div class="card kpi-card">
        <div class="card-title">Agent Reliability</div>
        <div class="kpi-value green">${operational.successRatePct.toFixed(1)}%</div>
        <div class="kpi-sub">${operational.totalSessions} sessions (${(operational.avgDurationMs / 1000).toFixed(1)}s avg latency)</div>
      </div>
    </div>

    <!-- Charts Row -->
    <div class="grid-2">
      <div class="card">
        <div class="section-header">
          <div class="section-title">🔀 Tokens by Command</div>
          <span style="font-size:0.8rem; color:var(--text-muted);">${formatNumber(telemetry.totalInvocations)} runs</span>
        </div>
        ${donutHtml}
      </div>

      <div class="card">
        <div class="section-header">
          <div class="section-title">📊 Operational Sessions Latency</div>
          <span style="font-size:0.8rem; color:var(--text-muted);">Last 10 executions</span>
        </div>
        ${timelineHtml}
      </div>
    </div>

    <!-- Tables Row -->
    <div class="grid-2">
      <div class="card">
        <div class="section-header">
          <div class="section-title">🏛️ Top PageRank Centrality Hubs</div>
          <span style="font-size:0.8rem; color:var(--text-muted);">Topology weight</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>File</th>
              <th>PageRank</th>
              <th>Symbols</th>
              <th>Lines</th>
              <th>Language</th>
            </tr>
          </thead>
          <tbody>
            ${hubsRows}
          </tbody>
        </table>
      </div>

      <div class="card">
        <div class="section-header">
          <div class="section-title">📦 Codebase Topology & Languages</div>
          <span style="font-size:0.8rem; color:var(--text-muted);">${formatNumber(topology.totalFiles)} files / ${formatNumber(topology.totalSymbols)} symbols</span>
        </div>
        <div style="margin-top: 0.5rem;">
          ${langBarsHtml}
        </div>
      </div>
    </div>

    <footer>
      ⚡ GSD Core Nexus 3.4 • Generated ${escapeHtml(timestamp)} • 100% Offline Standalone Architecture
    </footer>
  </div>

  <!-- Dynamic Client-Side Model Price Simulator -->
  <script>
    (function() {
      const PRICING_TABLE = ${pricingTableJson};
      const totalUsed = ${telemetry.totalJitTokensUsed || 0};
      const totalAvoided = ${telemetry.totalMonolithicTokensAvoided || 0};

      function formatMoney(amount) {
        if (amount === 0) return '$ 0.00';
        if (amount >= 1.0) return '$ ' + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        if (amount >= 0.01) return '$ ' + amount.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
        return '$ ' + amount.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
      }

      const selector = document.getElementById('modelSelector');
      if (selector) {
        selector.addEventListener('change', function(e) {
          const modelKey = e.target.value;
          const tier = PRICING_TABLE[modelKey];
          if (!tier) return;

          const rate = tier.blendedCostPerMillion / 1000000;
          const actualCost = totalUsed * rate;
          const avoidedCost = totalAvoided * rate;
          const netSavings = Math.max(0, avoidedCost - actualCost);
          const savingsPct = avoidedCost > 0 ? ((netSavings / avoidedCost) * 100).toFixed(1) : '0.0';

          const elNetSavings = document.getElementById('kpiNetSavings');
          const elActualCost = document.getElementById('kpiActualCost');
          const elSavingsPct = document.getElementById('kpiSavingsPct');
          const elPricingModel = document.getElementById('kpiPricingModel');

          if (elNetSavings) elNetSavings.textContent = formatMoney(netSavings);
          if (elActualCost) elActualCost.textContent = formatMoney(actualCost);
          if (elSavingsPct) elSavingsPct.textContent = savingsPct + '% cost reduction';
          if (elPricingModel) elPricingModel.textContent = 'Active tier: ' + tier.name;
        });
      }
    })();
  </script>
</body>
</html>`;
}
/**
 * Exports the complete HTML dashboard to `.planning/intel/dashboard.html`.
 */
function exportObservabilityDashboard(planningDir, modelOverride) {
    const snapshot = getObservabilitySnapshot(planningDir, modelOverride);
    const htmlContent = generateDashboardHtml(snapshot);
    const intelDir = node_path_1.default.join(planningDir, 'intel');
    (0, shell_command_projection_cjs_1.platformEnsureDir)(intelDir);
    const htmlPath = node_path_1.default.join(intelDir, 'dashboard.html');
    (0, shell_command_projection_cjs_1.platformWriteSync)(htmlPath, htmlContent);
    return { htmlPath, snapshot };
}
module.exports = {
    escapeHtml,
    generateDashboardHtml,
    exportObservabilityDashboard,
};
