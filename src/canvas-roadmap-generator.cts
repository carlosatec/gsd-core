/**
 * Visual Canvas Roadmap Exporter — GSD Core Nexus 3.2
 *
 * Converts `.planning/ROADMAP.md` into the open `.canvas` JSON specification
 * supported by Obsidian Canvas, VS Code Canvas extensions, and visual board viewers.
 *
 * Capabilities:
 * - Deterministic visual grid positioning (Milestones horizontally, phases vertically/horizontally)
 * - Status-based color coding (4=Green for Complete, 3=Yellow for In-Progress, 5=Cyan/Gray for Planned)
 * - Directed dependency edges connecting sequential phases
 * - Atomically writes `.planning/ROADMAP.canvas`
 */

import fs from 'node:fs';
import path from 'node:path';
import { platformReadSync, platformWriteSync, platformEnsureDir } from './shell-command-projection.cjs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import planScanMod = require('./plan-scan.cjs');
const { scanPhasePlans } = planScanMod;
// eslint-disable-next-line @typescript-eslint/no-require-imports
import phaseLocatorMod = require('./phase-locator.cjs');
const { listMilestonePhaseDirs } = phaseLocatorMod;

// ─── Obsidian Canvas JSON Schema Interfaces ───────────────────────────────────

interface CanvasNode {
  id: string;
  type: 'text' | 'file' | 'link' | 'group';
  text?: string;
  file?: string;
  label?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string; // '1'=red, '2'=orange, '3'=yellow, '4'=green, '5'=cyan, '6'=purple
}

interface CanvasEdge {
  id: string;
  fromNode: string;
  fromSide: 'top' | 'right' | 'bottom' | 'left';
  toNode: string;
  toSide: 'top' | 'right' | 'bottom' | 'left';
  color?: string;
  label?: string;
}

interface CanvasPayload {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

interface ParsedPhase {
  id: string;
  number: number | string;
  title: string;
  status: 'complete' | 'in_progress' | 'planned';
  description: string;
}

// ─── Roadmap Parser & Serializer ──────────────────────────────────────────────

function formatPhaseId(numStr: string): string {
  const clean = numStr.trim();
  const n = parseFloat(clean);
  if (!isNaN(n) && Number.isInteger(n)) {
    return `phase-${String(n).padStart(2, '0')}`;
  }
  return `phase-${clean.replace(/[^a-zA-Z0-9._-]/g, '')}`;
}

/**
 * Parses phases from ROADMAP.md or .planning/phases directory.
 */
function parseRoadmapPhases(planningDir: string): ParsedPhase[] {
  const roadmapPath = path.join(planningDir, 'ROADMAP.md');
  const phases: ParsedPhase[] = [];
  const seenIds = new Set<string>();

  if (fs.existsSync(roadmapPath)) {
    const content = platformReadSync(roadmapPath) || '';
    const phaseHeaderRegex = /(?:###?\s*(?:Phase\s*)?([0-9]+(?:\.[0-9]+)?|[0-9]+[A-Za-z]?)[.:\s-]+([^\n]+))/gi;
    const matches = Array.from(content.matchAll(phaseHeaderRegex));

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const rawNum = match[1].trim();
      const num = isNaN(Number(rawNum)) ? rawNum : parseFloat(rawNum);
      const id = formatPhaseId(rawNum);
      const title = match[2].trim();
      const nextIndex = i < matches.length - 1 ? (matches[i + 1].index ?? content.length) : content.length;
      const snippet = content.substring(match.index ?? 0, nextIndex);

      let status: ParsedPhase['status'] = 'planned';
      if (/complete|concluíd|done|finished|✅/i.test(snippet)) {
        status = 'complete';
      } else if (/in progress|em progresso|active|ativo|⏳|executando/i.test(snippet)) {
        status = 'in_progress';
      }

      seenIds.add(id);
      phases.push({
        id,
        number: num,
        title,
        status,
        description: snippet.split('\n').slice(1, 4).join('\n').trim(),
      });
    }

    // Also parse checkbox list items if any were not captured in headers
    const checkboxRegex = /(?:-\s*\[([ xX])\]\s*\*\*Phase\s*([0-9]+(?:\.[0-9]+)?|[0-9]+[A-Za-z]?)\s*[:*]\s*([^\n]+))/gi;
    const cbMatches = Array.from(content.matchAll(checkboxRegex));
    for (const m of cbMatches) {
      const isChecked = m[1].toLowerCase() === 'x';
      const rawNum = m[2].trim();
      const num = isNaN(Number(rawNum)) ? rawNum : parseFloat(rawNum);
      const id = formatPhaseId(rawNum);
      if (!seenIds.has(id)) {
        seenIds.add(id);
        const rawTitle = m[3].replace(/\*\*/g, '').trim();
        phases.push({
          id,
          number: num,
          title: rawTitle,
          status: isChecked ? 'complete' : 'planned',
          description: `Phase ${rawNum}: ${rawTitle}`,
        });
      }
    }
  }

  // Fallback / Supplement: inspect .planning/phases/ directory
  const phasesDir = path.join(planningDir, 'phases');
  if (fs.existsSync(phasesDir)) {
    try {
      const phaseDirs = listMilestonePhaseDirs(phasesDir, { cwd: path.dirname(planningDir) }).value;
      for (const entName of phaseDirs) {
        const match = entName.match(/^(\d+(?:\.\d+)?|\d+[A-Za-z]?)[-_](.+)$/);
        if (match) {
          const rawNum = match[1].trim();
          const num = isNaN(Number(rawNum)) ? rawNum : parseFloat(rawNum);
          const id = formatPhaseId(rawNum);
          if (!seenIds.has(id) && !phases.some(p => p.id === id)) {
            seenIds.add(id);
            const phaseFolderPath = path.join(phasesDir, entName);
            const summaryExists = scanPhasePlans(phaseFolderPath).summaryFiles.length > 0;
            phases.push({
              id,
              number: num,
              title: match[2].replace(/[-_]/g, ' '),
              status: summaryExists ? 'complete' : 'in_progress',
              description: `Directory: .planning/phases/${entName}`,
            });
          }
        }
      }
    } catch {
      // non-blocking
    }
  }

  return phases.sort((a, b) => {
    const numA = typeof a.number === 'number' ? a.number : parseFloat(a.number) || 0;
    const numB = typeof b.number === 'number' ? b.number : parseFloat(b.number) || 0;
    if (numA !== numB) return numA - numB;
    return String(a.number).localeCompare(String(b.number));
  });
}

/**
 * Builds the Obsidian Canvas JSON structure from parsed phases.
 */
function buildRoadmapCanvas(phases: ParsedPhase[]): CanvasPayload {
  const nodes: CanvasNode[] = [];
  const edges: CanvasEdge[] = [];

  const CARD_WIDTH = 340;
  const CARD_HEIGHT = 180;
  const GAP_X = 80;
  const GAP_Y = 60;
  const COLS = 4;

  const STATUS_COLORS: Record<ParsedPhase['status'], string> = {
    complete: '4',    // Green
    in_progress: '3', // Yellow
    planned: '5',     // Cyan
  };

  const STATUS_BADGES: Record<ParsedPhase['status'], string> = {
    complete: '✅ Complete',
    in_progress: '⏳ In Progress',
    planned: '📋 Planned',
  };

  for (let i = 0; i < phases.length; i++) {
    const p = phases[i];
    const col = i % COLS;
    const row = Math.floor(i / COLS);

    const x = col * (CARD_WIDTH + GAP_X);
    const y = row * (CARD_HEIGHT + GAP_Y);

    const text = `### Phase ${p.number}: ${p.title}\n\n**Status:** ${STATUS_BADGES[p.status]}\n\n${p.description || ''}`;

    nodes.push({
      id: p.id,
      type: 'text',
      text,
      x,
      y,
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      color: STATUS_COLORS[p.status],
    });

    // Add sequential dependency edge
    if (i > 0) {
      const prev = phases[i - 1];
      const isSameRow = Math.floor((i - 1) / COLS) === row;

      edges.push({
        id: `edge-${prev.id}->${p.id}`,
        fromNode: prev.id,
        fromSide: isSameRow ? 'right' : 'bottom',
        toNode: p.id,
        toSide: isSameRow ? 'left' : 'top',
        color: prev.status === 'complete' ? '4' : '5',
      });
    }
  }

  return { nodes, edges };
}

/**
 * Exports the roadmap canvas to `.planning/ROADMAP.canvas`.
 */
function exportRoadmapCanvas(planningDir: string): { canvasPath: string; payload: CanvasPayload } {
  platformEnsureDir(planningDir);
  const phases = parseRoadmapPhases(planningDir);
  const payload = buildRoadmapCanvas(phases);

  const canvasPath = path.join(planningDir, 'ROADMAP.canvas');
  platformWriteSync(canvasPath, JSON.stringify(payload, null, 2));

  return { canvasPath, payload };
}

export = {
  parseRoadmapPhases,
  buildRoadmapCanvas,
  exportRoadmapCanvas,
};
