"use strict";
/**
 * Visual Canvas Roadmap Exporter — GSD Core Nexus 2.8
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const shell_command_projection_cjs_1 = require("./shell-command-projection.cjs");
// ─── Roadmap Parser & Serializer ──────────────────────────────────────────────
/**
 * Parses phases from ROADMAP.md or .planning/phases directory.
 */
function parseRoadmapPhases(planningDir) {
    const roadmapPath = node_path_1.default.join(planningDir, 'ROADMAP.md');
    const phases = [];
    if (node_fs_1.default.existsSync(roadmapPath)) {
        const content = (0, shell_command_projection_cjs_1.platformReadSync)(roadmapPath) || '';
        const phaseHeaderRegex = /(?:###?\s*(?:Phase\s*)?(\d+)[.:\s-]+([^\n]+))/gi;
        const matches = Array.from(content.matchAll(phaseHeaderRegex));
        for (let i = 0; i < matches.length; i++) {
            const match = matches[i];
            const num = parseInt(match[1], 10);
            const title = match[2].trim();
            const nextIndex = i < matches.length - 1 ? (matches[i + 1].index ?? content.length) : content.length;
            const snippet = content.substring(match.index ?? 0, nextIndex);
            let status = 'planned';
            if (/complete|concluíd|done|finished|✅/i.test(snippet)) {
                status = 'complete';
            }
            else if (/in progress|em progresso|active|ativo|⏳|executando/i.test(snippet)) {
                status = 'in_progress';
            }
            phases.push({
                id: `phase-${String(num).padStart(2, '0')}`,
                number: num,
                title,
                status,
                description: snippet.split('\n').slice(1, 4).join('\n').trim(),
            });
        }
    }
    // Fallback / Supplement: inspect .planning/phases/ directory
    const phasesDir = node_path_1.default.join(planningDir, 'phases');
    if (node_fs_1.default.existsSync(phasesDir)) {
        try {
            const entries = node_fs_1.default.readdirSync(phasesDir, { withFileTypes: true });
            for (const ent of entries) {
                if (ent.isDirectory()) {
                    const match = ent.name.match(/^(\d+)[-_](.+)$/);
                    if (match) {
                        const num = parseInt(match[1], 10);
                        const id = `phase-${String(num).padStart(2, '0')}`;
                        if (!phases.some(p => p.id === id)) {
                            const phaseFolderPath = node_path_1.default.join(phasesDir, ent.name);
                            const summaryExists = node_fs_1.default.existsSync(node_path_1.default.join(phaseFolderPath, 'SUMMARY.md')) ||
                                (node_fs_1.default.existsSync(phaseFolderPath) && node_fs_1.default.readdirSync(phaseFolderPath).some(f => f.endsWith('-SUMMARY.md')));
                            phases.push({
                                id,
                                number: num,
                                title: match[2].replace(/[-_]/g, ' '),
                                status: summaryExists ? 'complete' : 'in_progress',
                                description: `Directory: .planning/phases/${ent.name}`,
                            });
                        }
                    }
                }
            }
        }
        catch {
            // non-blocking
        }
    }
    return phases.sort((a, b) => a.number - b.number);
}
/**
 * Builds the Obsidian Canvas JSON structure from parsed phases.
 */
function buildRoadmapCanvas(phases) {
    const nodes = [];
    const edges = [];
    const CARD_WIDTH = 340;
    const CARD_HEIGHT = 180;
    const GAP_X = 80;
    const GAP_Y = 60;
    const COLS = 4;
    const STATUS_COLORS = {
        complete: '4', // Green
        in_progress: '3', // Yellow
        planned: '5', // Cyan
    };
    const STATUS_BADGES = {
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
function exportRoadmapCanvas(planningDir) {
    (0, shell_command_projection_cjs_1.platformEnsureDir)(planningDir);
    const phases = parseRoadmapPhases(planningDir);
    const payload = buildRoadmapCanvas(phases);
    const canvasPath = node_path_1.default.join(planningDir, 'ROADMAP.canvas');
    (0, shell_command_projection_cjs_1.platformWriteSync)(canvasPath, JSON.stringify(payload, null, 2));
    return { canvasPath, payload };
}
module.exports = {
    parseRoadmapPhases,
    buildRoadmapCanvas,
    exportRoadmapCanvas,
};
