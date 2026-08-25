/**
 * Visual Knowledge Graph Exporter — GSD Core Nexus 2.8
 *
 * Generates an interactive, standalone, zero-dependency HTML/Canvas 2D visualization
 * of the repository knowledge graph stored in `.planning/intel/codebase-graph.json`.
 *
 * Capabilities:
 * - 100% Offline with zero external CDN dependencies
 * - Node categorization: Decisions (purple), Phases (blue), Code (green), Tests (yellow), Alerts (rose), Routes (blue)
 * - Mathematical node sizing proportional to PageRank centrality
 * - Interactive physics, pan/zoom, realtime search, filter toggles, sidebar inspector, and PNG snapshot export.
 */

import fs from 'node:fs';
import path from 'node:path';
import { platformWriteSync, platformEnsureDir } from './shell-command-projection.cjs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import codebaseAst = require('./codebase-ast-analyzer.cjs');

const { loadCodebaseGraph, buildCodebaseGraph } = codebaseAst;

// ─── Interfaces ───────────────────────────────────────────────────────────────

type VisualNodeType = 'decision' | 'phase' | 'code' | 'test' | 'alert' | 'route';

interface VisualGraphNode {
  id: string;
  label: string;
  type: VisualNodeType;
  pageRank: number;
  radius: number;
  color: string;
  filePath?: string;
  symbolsCount?: number;
  routesCount?: number;
  phaseId?: string;
  details?: Record<string, string | number | boolean>;
}

interface VisualGraphLink {
  source: string;
  target: string;
  type: 'import' | 'implements' | 'governs' | 'tests' | 'route';
  weight?: number;
}

interface VisualGraphPayload {
  title: string;
  generatedAt: string;
  stats: {
    totalNodes: number;
    totalLinks: number;
    totalDecisions: number;
    totalPhases: number;
    totalFiles: number;
  };
  nodes: VisualGraphNode[];
  links: VisualGraphLink[];
}

// ─── Node Color Palettes (Dark Futuristic Theme) ─────────────────────────────

const PALETTE: Record<VisualNodeType, string> = {
  decision: '#a855f7', // Purple
  phase: '#38bdf8',    // Blue/Cyan
  code: '#34d399',     // Emerald Green
  test: '#facc15',     // Amber Yellow
  alert: '#f43f5e',    // Rose/Red
  route: '#60a5fa',    // Light Blue
};

// ─── Graph Extraction Engine ──────────────────────────────────────────────────

/**
 * Extracts and categorizes visual nodes and links from CodebaseGraph and .planning metadata.
 */
function buildVisualGraphPayload(planningDir: string, rootDir?: string): VisualGraphPayload {
  const root = rootDir ?? path.dirname(planningDir);
  const graph = loadCodebaseGraph(planningDir) || buildCodebaseGraph(root, { liteMode: true });

  const nodes: VisualGraphNode[] = [];
  const links: VisualGraphLink[] = [];
  const nodeMap = new Set<string>();

  const addNode = (node: VisualGraphNode) => {
    if (!nodeMap.has(node.id)) {
      nodeMap.add(node.id);
      nodes.push(node);
    }
  };

  let totalDecisions = 0;
  let totalPhases = 0;

  // 1. Process Code Files & Tests from CodebaseGraph
  const pageRankScores = graph.pageRankScores || {};
  for (const [fileRel, fileData] of Object.entries(graph.files)) {
    const isTest = fileRel.includes('test') || fileRel.includes('spec') || fileRel.endsWith('.test.cjs') || fileRel.endsWith('.test.js') || fileRel.endsWith('.test.ts');
    const type: VisualNodeType = isTest ? 'test' : 'code';
    const prScore = pageRankScores[fileRel] || 0.01;
    const radius = Math.min(22, Math.max(5, Math.round(prScore * 45 + 5)));

    addNode({
      id: fileRel,
      label: path.basename(fileRel),
      type,
      pageRank: Number(prScore.toFixed(4)),
      radius,
      color: PALETTE[type],
      filePath: fileRel,
      symbolsCount: fileData.symbols ? fileData.symbols.length : 0,
      routesCount: fileData.routes ? fileData.routes.length : 0,
      details: {
        language: fileData.language || 'generic',
        linesCount: fileData.linesCount || 0,
      },
    });

    // Add import links
    if (fileData.localDeps && Array.isArray(fileData.localDeps)) {
      for (const dep of fileData.localDeps) {
        links.push({
          source: fileRel,
          target: dep,
          type: 'import',
        });
      }
    }
  }

  // 2. Discover Phases from .planning/phases
  const phasesDir = path.join(planningDir, 'phases');
  if (fs.existsSync(phasesDir)) {
    try {
      const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
      for (const ent of entries) {
        if (ent.isDirectory()) {
          totalPhases++;
          const phaseId = ent.name;
          addNode({
            id: `phase:${phaseId}`,
            label: phaseId,
            type: 'phase',
            pageRank: 0.15,
            radius: 14,
            color: PALETTE.phase,
            phaseId,
            details: { isPhase: true },
          });

          // Check if phase directory has plan files targeting code files
          const planDir = path.join(phasesDir, phaseId);
          try {
            const planFiles = fs.readdirSync(planDir).filter(f => f.endsWith('-PLAN.md') || f === 'PLAN.md');
            for (const pf of planFiles) {
              const content = fs.readFileSync(path.join(planDir, pf), 'utf-8');
              for (const codeFile of Object.keys(graph.files)) {
                if (content.includes(codeFile) || content.includes(path.basename(codeFile))) {
                  links.push({
                    source: `phase:${phaseId}`,
                    target: codeFile,
                    type: 'implements',
                  });
                }
              }
            }
          } catch {
            // non-blocking
          }
        }
      }
    } catch {
      // non-blocking
    }
  }

  // 3. Discover Architectural Decisions from STATE.md / GEMINI.md / CONTEXT.md
  try {
    const searchFiles = [
      path.join(planningDir, 'STATE.md'),
      path.join(root, 'GEMINI.md'),
      path.join(root, 'AGENTS.md'),
    ];
    for (const sf of searchFiles) {
      if (fs.existsSync(sf)) {
        const content = fs.readFileSync(sf, 'utf-8');
        const decisionMatches = content.matchAll(/\b(D-\d+)\b/g);
        for (const m of decisionMatches) {
          const dId = m[1];
          if (!nodeMap.has(`decision:${dId}`)) {
            totalDecisions++;
            addNode({
              id: `decision:${dId}`,
              label: dId,
              type: 'decision',
              pageRank: 0.2,
              radius: 12,
              color: PALETTE.decision,
              details: { isDecision: true },
            });
          }
        }
      }
    }
  } catch {
    // non-blocking
  }

  // Filter links where both source and target exist
  const validLinks = links.filter(l => nodeMap.has(l.source) && nodeMap.has(l.target));

  return {
    title: `GSD Core Nexus — Visual Knowledge Graph (${path.basename(root)})`,
    generatedAt: new Date().toISOString(),
    stats: {
      totalNodes: nodes.length,
      totalLinks: validLinks.length,
      totalDecisions,
      totalPhases,
      totalFiles: Object.keys(graph.files).length,
    },
    nodes,
    links: validLinks,
  };
}

// ─── Standalone HTML Template Generator ───────────────────────────────────────

/**
 * Generates an ultra-fast, offline HTML5 Canvas 2D interactive force-graph application.
 */
function generateVisualGraphHtml(payload: VisualGraphPayload): string {
  const safeTitle = (payload.title || 'GSD Graph')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const safeJsonPayload = JSON.stringify(payload).replace(/<\/script/gi, '<\\/script');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
  <style>
    :root {
      --bg: #0b0f19;
      --card-bg: rgba(17, 24, 39, 0.85);
      --border: #1f293d;
      --text: #e2e8f0;
      --text-muted: #94a3b8;
      --primary: #38bdf8;
      --accent: #a855f7;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      overflow: hidden;
      width: 100vw;
      height: 100vh;
      display: flex;
    }
    #canvas-container {
      flex: 1;
      height: 100%;
      position: relative;
      background: radial-gradient(circle at center, #131b2e 0%, #0b0f19 80%);
    }
    canvas { display: block; width: 100%; height: 100%; cursor: grab; }
    canvas:active { cursor: grabbing; }

    /* Top Control Bar */
    .top-bar {
      position: absolute;
      top: 16px;
      left: 16px;
      right: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      pointer-events: none;
      z-index: 10;
    }
    .panel {
      background: var(--card-bg);
      backdrop-filter: blur(12px);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 10px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      pointer-events: auto;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    }
    .brand-title {
      font-weight: 700;
      font-size: 14px;
      color: var(--primary);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    input[type="text"] {
      background: #1e293b;
      border: 1px solid #334155;
      color: #fff;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 13px;
      outline: none;
      width: 200px;
      transition: all 0.2s;
    }
    input[type="text"]:focus {
      border-color: var(--primary);
      width: 260px;
      box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.2);
    }
    .btn {
      background: #1e293b;
      color: var(--text);
      border: 1px solid #334155;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s;
    }
    .btn:hover {
      background: #334155;
      border-color: var(--primary);
      color: #fff;
    }
    .btn.active {
      background: rgba(56, 189, 248, 0.2);
      border-color: var(--primary);
      color: var(--primary);
    }

    /* Filter Toggles */
    .filter-group {
      display: flex;
      gap: 6px;
    }
    .pill {
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 12px;
      border: 1px solid var(--border);
      cursor: pointer;
      font-weight: 600;
      user-select: none;
      transition: opacity 0.2s;
    }
    .pill.off { opacity: 0.35; filter: grayscale(0.8); }

    /* Sidebar Inspector */
    #sidebar {
      position: absolute;
      top: 80px;
      right: 16px;
      width: 320px;
      max-height: calc(100vh - 100px);
      overflow-y: auto;
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px;
      display: none;
      flex-direction: column;
      gap: 12px;
      z-index: 10;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    }
    #sidebar.open { display: flex; }
    .sidebar-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border);
      padding-bottom: 8px;
    }
    .sidebar-title { font-weight: 700; font-size: 15px; word-break: break-all; }
    .close-btn { cursor: pointer; color: var(--text-muted); font-size: 18px; }
    .close-btn:hover { color: #fff; }
    .meta-row {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      padding: 4px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }
    .meta-label { color: var(--text-muted); }
    .meta-val { font-weight: 600; color: #fff; }

    /* Legend / Stats overlay */
    .legend-overlay {
      position: absolute;
      bottom: 16px;
      left: 16px;
      font-size: 12px;
      color: var(--text-muted);
      display: flex;
      gap: 16px;
    }
    .legend-item { display: flex; align-items: center; gap: 6px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
  </style>
</head>
<body>
  <div id="canvas-container">
    <div class="top-bar">
      <div class="panel">
        <div class="brand-title">🌐 GSD Graph</div>
        <input type="text" id="search-box" placeholder="Search node or symbol..." />
        <div class="filter-group">
          <span class="pill" style="background:#a855f722; color:#a855f7; border-color:#a855f7;" onclick="toggleFilter('decision', this)">Decisions</span>
          <span class="pill" style="background:#38bdf822; color:#38bdf8; border-color:#38bdf8;" onclick="toggleFilter('phase', this)">Phases</span>
          <span class="pill" style="background:#34d39922; color:#34d399; border-color:#34d399;" onclick="toggleFilter('code', this)">Code</span>
          <span class="pill" style="background:#facc1522; color:#facc15; border-color:#facc15;" onclick="toggleFilter('test', this)">Tests</span>
          <span class="pill" style="background:#60a5fa22; color:#60a5fa; border-color:#60a5fa;" onclick="toggleFilter('route', this)">Routes</span>
          <span class="pill" style="background:#f43f5e22; color:#f43f5e; border-color:#f43f5e;" onclick="toggleFilter('alert', this)">Alerts</span>
        </div>
      </div>

      <div class="panel">
        <button class="btn" id="btn-physics" onclick="togglePhysics()">⏸ Pause Physics</button>
        <button class="btn" onclick="resetZoom()">⟲ Reset View</button>
        <button class="btn active" onclick="exportSnapshot()">📸 Save Image</button>
      </div>
    </div>

    <div id="sidebar">
      <div class="sidebar-header">
        <div class="sidebar-title" id="node-title">Node Title</div>
        <div class="close-btn" onclick="closeSidebar()">×</div>
      </div>
      <div id="node-details"></div>
      <button class="btn" style="margin-top:8px; justify-content:center;" onclick="copyNodePath()">📋 Copy Path</button>
    </div>

    <div class="legend-overlay">
      <div class="legend-item"><span class="dot" style="background:#a855f7;"></span> Decisions (${payload.stats.totalDecisions})</div>
      <div class="legend-item"><span class="dot" style="background:#38bdf8;"></span> Phases (${payload.stats.totalPhases})</div>
      <div class="legend-item"><span class="dot" style="background:#34d399;"></span> Code (${payload.stats.totalFiles})</div>
      <div class="legend-item"><span class="dot" style="background:#facc15;"></span> Tests</div>
      <div class="legend-item" style="margin-left:16px;">Total Nodes: ${payload.stats.totalNodes} | Links: ${payload.stats.totalLinks}</div>
    </div>

    <canvas id="graphCanvas"></canvas>
  </div>

  <script>
    const DATA = ${safeJsonPayload};

    const canvas = document.getElementById('graphCanvas');
    const ctx = canvas.getContext('2d');
    let width, height;

    let nodes = DATA.nodes.map(n => ({
      ...n,
      x: (Math.random() - 0.5) * 600,
      y: (Math.random() - 0.5) * 600,
      vx: 0,
      vy: 0,
      visible: true
    }));

    const nodeIndex = new Map(nodes.map(n => [n.id, n]));
    const links = DATA.links
      .map(l => ({
        source: nodeIndex.get(l.source),
        target: nodeIndex.get(l.target),
        type: l.type
      }))
      .filter(l => l.source && l.target);

    // Transform State (Pan / Zoom)
    let scale = 1;
    let offsetX = 0;
    let offsetY = 0;
    let isDragging = false;
    let dragStartX = 0, dragStartY = 0;
    let physicsActive = true;
    let selectedNode = null;
    let hoveredNode = null;
    let activeFilters = { decision: true, phase: true, code: true, test: true, route: true, alert: true };

    function resize() {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      if (offsetX === 0 && offsetY === 0) {
        offsetX = width / 2;
        offsetY = height / 2;
      }
    }
    window.addEventListener('resize', resize);
    resize();

    // Physics Simulation Loop (Force-Directed Graph)
    function simulate() {
      if (!physicsActive) return;

      const kRepulsion = 450;
      const kSpring = 0.04;
      const centerGravity = 0.015;

      // 1. Node Repulsion
      for (let i = 0; i < nodes.length; i++) {
        const n1 = nodes[i];
        if (!n1.visible) continue;

        // Center gravity
        n1.vx -= n1.x * centerGravity;
        n1.vy -= n1.y * centerGravity;

        for (let j = i + 1; j < nodes.length; j++) {
          const n2 = nodes[j];
          if (!n2.visible) continue;

          const dx = n2.x - n1.x;
          const dy = n2.y - n1.y;
          const distSq = dx * dx + dy * dy + 1;
          const dist = Math.sqrt(distSq);

          if (dist < 300) {
            const force = kRepulsion / distSq;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            n1.vx -= fx;
            n1.vy -= fy;
            n2.vx += fx;
            n2.vy += fy;
          }
        }
      }

      // 2. Link Spring Force
      for (const link of links) {
        if (!link.source.visible || !link.target.visible) continue;
        const dx = link.target.x - link.source.x;
        const dy = link.target.y - link.source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const targetDist = 60 + (link.source.radius + link.target.radius);
        const delta = dist - targetDist;
        const force = delta * kSpring;

        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        link.source.vx += fx;
        link.source.vy += fy;
        link.target.vx -= fx;
        link.target.vy -= fy;
      }

      // 3. Position Update & Damping
      for (const n of nodes) {
        if (n === selectedNode && isDragging) continue;
        n.vx *= 0.88;
        n.vy *= 0.88;
        n.x += n.vx;
        n.y += n.vy;
      }
    }

    // Render Loop
    function render() {
      simulate();

      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.translate(offsetX, offsetY);
      ctx.scale(scale, scale);

      // Render Links
      ctx.lineWidth = 1;
      for (const link of links) {
        if (!link.source.visible || !link.target.visible) continue;
        ctx.strokeStyle = (link.source === selectedNode || link.target === selectedNode)
          ? 'rgba(56, 189, 248, 0.8)'
          : 'rgba(255, 255, 255, 0.12)';
        ctx.beginPath();
        ctx.moveTo(link.source.x, link.source.y);
        ctx.lineTo(link.target.x, link.target.y);
        ctx.stroke();
      }

      // Render Nodes
      for (const node of nodes) {
        if (!node.visible) continue;

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = node.color;
        ctx.fill();

        // Highlight selected or hovered
        if (node === selectedNode || node === hoveredNode) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2.5;
          ctx.stroke();

          // Glow ring
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius + 4, 0, Math.PI * 2);
          ctx.strokeStyle = node.color;
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Label
        ctx.font = '10px -apple-system, sans-serif';
        ctx.fillStyle = (node === selectedNode || node === hoveredNode) ? '#fff' : '#cbd5e1';
        ctx.textAlign = 'center';
        ctx.fillText(node.label, node.x, node.y + node.radius + 12);
      }

      ctx.restore();
      requestAnimationFrame(render);
    }
    requestAnimationFrame(render);

    // Mouse & Touch Controls
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
      scale = Math.min(Math.max(0.2, scale * zoomFactor), 4);
    }, { passive: false });

    canvas.addEventListener('mousedown', (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left - offsetX) / scale;
      const my = (e.clientY - rect.top - offsetY) / scale;

      const clicked = nodes.find(n => n.visible && Math.hypot(n.x - mx, n.y - my) <= n.radius + 4);
      if (clicked) {
        selectedNode = clicked;
        showSidebar(clicked);
      } else {
        isDragging = true;
        dragStartX = e.clientX - offsetX;
        dragStartY = e.clientY - offsetY;
      }
    });

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left - offsetX) / scale;
      const my = (e.clientY - rect.top - offsetY) / scale;

      if (isDragging) {
        offsetX = e.clientX - dragStartX;
        offsetY = e.clientY - dragStartY;
      } else if (selectedNode && e.buttons === 1) {
        selectedNode.x = mx;
        selectedNode.y = my;
      } else {
        hoveredNode = nodes.find(n => n.visible && Math.hypot(n.x - mx, n.y - my) <= n.radius + 4) || null;
      }
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    });

    // Control Functions
    function togglePhysics() {
      physicsActive = !physicsActive;
      document.getElementById('btn-physics').innerText = physicsActive ? '⏸ Pause Physics' : '▶ Resume Physics';
    }

    function resetZoom() {
      scale = 1;
      offsetX = width / 2;
      offsetY = height / 2;
    }

    function toggleFilter(type, el) {
      activeFilters[type] = !activeFilters[type];
      el.classList.toggle('off', !activeFilters[type]);
      nodes.forEach(n => {
        if (n.type === type) n.visible = activeFilters[type];
      });
    }

    function showSidebar(node) {
      document.getElementById('node-title').innerText = node.label;
      const details = document.getElementById('node-details');
      let html = \`
        <div class="meta-row"><span class="meta-label">Type</span><span class="meta-val">\${node.type.toUpperCase()}</span></div>
        <div class="meta-row"><span class="meta-label">PageRank</span><span class="meta-val">\${node.pageRank}</span></div>
      \`;
      if (node.filePath) {
        html += \`<div class="meta-row"><span class="meta-label">Path</span><span class="meta-val">\${node.filePath}</span></div>\`;
      }
      if (node.symbolsCount !== undefined) {
        html += \`<div class="meta-row"><span class="meta-label">Symbols</span><span class="meta-val">\${node.symbolsCount}</span></div>\`;
      }
      if (node.routesCount !== undefined && node.routesCount > 0) {
        html += \`<div class="meta-row"><span class="meta-label">Routes</span><span class="meta-val">\${node.routesCount}</span></div>\`;
      }
      details.innerHTML = html;
      document.getElementById('sidebar').classList.add('open');
    }

    function closeSidebar() {
      document.getElementById('sidebar').classList.remove('open');
      selectedNode = null;
    }

    function copyNodePath() {
      if (selectedNode && selectedNode.filePath) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(selectedNode.filePath).catch(() => {});
        }
        alert('Copied path to clipboard: ' + selectedNode.filePath);
      }
    }

    function exportSnapshot() {
      const link = document.createElement('a');
      link.download = 'gsd-knowledge-graph.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    }

    // Search Box Real-Time Filter
    document.getElementById('search-box').addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      if (!q) {
        nodes.forEach(n => { n.visible = activeFilters[n.type]; });
        return;
      }
      nodes.forEach(n => {
        const match = n.label.toLowerCase().includes(q) || (n.filePath && n.filePath.toLowerCase().includes(q));
        n.visible = match && activeFilters[n.type];
        if (match && !selectedNode) {
          selectedNode = n;
        }
      });
    });
  </script>
</body>
</html>`;
}

/**
 * Exports the visual graph HTML to `.planning/intel/graph-view.html`.
 */
function exportVisualGraph(planningDir: string, rootDir?: string): { htmlPath: string; payload: VisualGraphPayload } {
  const root = rootDir ?? path.dirname(planningDir);
  const payload = buildVisualGraphPayload(planningDir, root);
  const htmlContent = generateVisualGraphHtml(payload);

  const intelDir = path.join(planningDir, 'intel');
  platformEnsureDir(intelDir);

  const htmlPath = path.join(intelDir, 'graph-view.html');
  platformWriteSync(htmlPath, htmlContent);

  return { htmlPath, payload };
}

export = {
  buildVisualGraphPayload,
  generateVisualGraphHtml,
  exportVisualGraph,
};
