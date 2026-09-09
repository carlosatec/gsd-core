"use strict";
/**
 * Living Docs Engine — Synchronizes and verifies documentation against real AST code.
 *
 * Automatically keeps `.planning/intel/` and `.planning/codebase/` in sync with
 * active code changes, preventing stale documentation and context drift.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const node_path_1 = __importDefault(require("node:path"));
const shell_command_projection_cjs_1 = require("./shell-command-projection.cjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const codebaseAst = require("./codebase-ast-analyzer.cjs");
const { buildCodebaseGraph, saveCodebaseGraph, loadCodebaseGraph } = codebaseAst;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const visualGraph = require("./visual-graph-exporter.cjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const obsidianInterop = require("./obsidian-interop.cjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const canvasGenerator = require("./canvas-roadmap-generator.cjs");
// ─── Markdown Generators ──────────────────────────────────────────────────────
/**
 * Generates an up-to-date Markdown document summarizing the project architecture from the AST graph.
 */
function generateArchitectureDoc(graph) {
    const lines = [
        '# Codebase Architecture & Topology (Living Document)',
        '',
        `> Auto-generated and verified by GSD Core Nexus 3.2 Living Docs on ${new Date().toISOString()}.`,
        '',
        '## System Metrics',
        '',
        `- **Total Source Files:** ${graph.stats.totalFiles}`,
        `- **Total Tracked Symbols:** ${graph.stats.totalSymbols}`,
        `- **Total Exported Interfaces & Functions:** ${graph.stats.totalExports}`,
        `- **Total Discovered API Routes:** ${graph.stats.totalRoutes}`,
        `- **AST Scan Duration:** ${graph.stats.scanDurationMs}ms`,
        '',
        '## Discovered HTTP Routes',
        '',
    ];
    if (graph.routes.length === 0) {
        lines.push('_No explicit HTTP routes detected._');
    }
    else {
        lines.push('| Method | Route Path | Line |');
        lines.push('|---|---|---|');
        for (const r of graph.routes) {
            lines.push(`| \`${r.method}\` | \`${r.path}\` | ${r.line} |`);
        }
    }
    lines.push('', '## Core Modules & Exported Surfaces', '');
    lines.push('| Module File | Exports | Top-level Symbols | Lines |');
    lines.push('|---|---|---|---|');
    const sortedFiles = Object.entries(graph.files).sort(([a], [b]) => a.localeCompare(b));
    for (const [filePath, fileData] of sortedFiles) {
        if (fileData.exports.length > 0) {
            const exportList = fileData.exports.map(e => `\`${e.name}\``).join(', ');
            lines.push(`| \`${filePath}\` | ${exportList} | ${fileData.symbols.length} | ${fileData.linesCount} |`);
        }
    }
    return lines.join('\n');
}
/**
 * Generates an API & Interface contract reference document from AST exports.
 */
function generateApiSurfaceDoc(graph) {
    const lines = [
        '# API & Interface Contracts (Living Document)',
        '',
        `> Generated from AST definitions on ${new Date().toISOString()}.`,
        '',
        '## Exported Types, Interfaces & Classes',
        '',
    ];
    const sortedFiles = Object.entries(graph.files).sort(([a], [b]) => a.localeCompare(b));
    for (const [filePath, fileData] of sortedFiles) {
        const typeExports = fileData.symbols.filter(s => s.exported && (s.kind === 'interface' || s.kind === 'type' || s.kind === 'class'));
        if (typeExports.length > 0) {
            lines.push(`### \`${filePath}\``, '');
            lines.push('| Symbol Name | Kind | Line |');
            lines.push('|---|---|---|');
            for (const s of typeExports) {
                lines.push(`| \`${s.name}\` | \`${s.kind}\` | ${s.line} |`);
            }
            lines.push('');
        }
    }
    return lines.join('\n');
}
// ─── Sync & Verification Engine ───────────────────────────────────────────────
/**
 * Synchronizes the living documentation in `.planning/codebase/` and `.planning/intel/` against the active codebase AST.
 */
function syncLivingDocs(planningDir, rootDir) {
    const root = rootDir ?? node_path_1.default.dirname(planningDir);
    // Check existing discrepancies before sync
    const preCheck = verifyDocsAgainstCode(planningDir, root);
    const graph = buildCodebaseGraph(root);
    // 1. Persist AST graph in intel
    const graphPath = saveCodebaseGraph(planningDir, graph);
    // 2. Ensure .planning/codebase directory exists
    const codebaseDir = node_path_1.default.join(planningDir, 'codebase');
    (0, shell_command_projection_cjs_1.platformEnsureDir)(codebaseDir);
    const generatedDocs = [graphPath];
    // 3. Write Living Architecture Doc
    const archDoc = generateArchitectureDoc(graph);
    const archPath = node_path_1.default.join(codebaseDir, 'ARCHITECTURE.md');
    (0, shell_command_projection_cjs_1.platformWriteSync)(archPath, archDoc);
    generatedDocs.push(archPath);
    // 4. Write Living API Contracts Doc
    const apiDoc = generateApiSurfaceDoc(graph);
    const apiPath = node_path_1.default.join(codebaseDir, 'APIS.md');
    (0, shell_command_projection_cjs_1.platformWriteSync)(apiPath, apiDoc);
    generatedDocs.push(apiPath);
    const errors = [];
    // 5. Generate Standalone Visual Knowledge Graph HTML
    try {
        const { htmlPath } = visualGraph.exportVisualGraph(planningDir, root);
        generatedDocs.push(htmlPath);
    }
    catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        errors.push({ artifact: 'graph-view.html', error: errMsg });
    }
    // 6. Generate Obsidian Backlink Index
    try {
        const { filePath } = obsidianInterop.saveBacklinkIndex(planningDir, root);
        generatedDocs.push(filePath);
    }
    catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        errors.push({ artifact: 'backlinks.json', error: errMsg });
    }
    // 7. Generate Visual Canvas Roadmap
    try {
        const { canvasPath } = canvasGenerator.exportRoadmapCanvas(planningDir);
        generatedDocs.push(canvasPath);
    }
    catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        errors.push({ artifact: 'ROADMAP.canvas', error: errMsg });
    }
    return {
        timestamp: new Date().toISOString(),
        syncedFiles: Object.keys(graph.files),
        totalSymbols: graph.stats.totalSymbols,
        totalRoutes: graph.stats.totalRoutes,
        totalFiles: graph.stats.totalFiles,
        discrepancies: preCheck.discrepancies,
        generatedDocs,
        errors: errors.length > 0 ? errors : undefined,
        partial: errors.length > 0,
    };
}
/**
 * Validates whether the existing documentation matches the active code symbols.
 */
function verifyDocsAgainstCode(planningDir, rootDir) {
    const root = rootDir ?? node_path_1.default.dirname(planningDir);
    const savedGraph = loadCodebaseGraph(planningDir);
    const liveGraph = buildCodebaseGraph(root, { previousGraph: savedGraph, liteMode: true });
    const discrepancies = [];
    if (!savedGraph) {
        discrepancies.push({
            type: 'stale_doc',
            file: '.planning/intel/codebase-graph.json',
            detail: 'No codebase graph found on disk. Run living docs sync.',
        });
        return { valid: false, discrepancies };
    }
    // Check for deleted or modified symbols
    for (const [file, oldData] of Object.entries(savedGraph.files)) {
        const currentData = liveGraph.files[file];
        if (!currentData) {
            discrepancies.push({
                type: 'removed_symbol',
                file,
                detail: `File ${file} exists in documentation graph but was removed or renamed in code.`,
            });
            continue;
        }
        const currentExportNames = new Set(currentData.exports.map(e => e.name));
        for (const exp of oldData.exports) {
            if (!currentExportNames.has(exp.name)) {
                discrepancies.push({
                    type: 'missing_symbol',
                    file,
                    detail: `Exported symbol '${exp.name}' was documented in ${file} but is no longer present.`,
                });
            }
        }
    }
    // Check for new files added to live code that were not in saved doc graph
    for (const file of Object.keys(liveGraph.files)) {
        if (!savedGraph.files[file]) {
            discrepancies.push({
                type: 'stale_doc',
                file,
                detail: `File ${file} was added to codebase but is not indexed in documentation graph.`,
            });
        }
    }
    return {
        valid: discrepancies.length === 0,
        discrepancies,
    };
}
module.exports = {
    generateArchitectureDoc,
    generateApiSurfaceDoc,
    syncLivingDocs,
    verifyDocsAgainstCode,
};
