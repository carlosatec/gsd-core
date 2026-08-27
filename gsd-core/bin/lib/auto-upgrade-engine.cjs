"use strict";
/**
 * Auto-Upgrade Engine — Seamless non-destructive upgrade from legacy projects to GSD Core Nexus 2.9.
 *
 * Scans the repository, creates the multi-language AST topology, materializes
 * living architecture & API contracts, and initializes telemetry.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const shell_command_projection_cjs_1 = require("./shell-command-projection.cjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const codebaseAst = require("./codebase-ast-analyzer.cjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const livingDocs = require("./living-docs-engine.cjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const jitTelemetry = require("./jit-telemetry.cjs");
const { buildCodebaseGraph, saveCodebaseGraph } = codebaseAst;
const { syncLivingDocs } = livingDocs;
const { loadTelemetry, saveTelemetry } = jitTelemetry;
// ─── Core Implementation ──────────────────────────────────────────────────────
/**
 * Runs the non-destructive auto-upgrade pipeline on a project.
 */
function runAutoUpgrade(planningDir, rootDir) {
    const resolvedPlanningDir = node_path_1.default.resolve(planningDir);
    const resolvedRoot = rootDir ? node_path_1.default.resolve(rootDir) : node_path_1.default.dirname(resolvedPlanningDir);
    (0, shell_command_projection_cjs_1.platformEnsureDir)(resolvedPlanningDir);
    const intelDir = node_path_1.default.join(resolvedPlanningDir, 'intel');
    const codebaseDir = node_path_1.default.join(resolvedPlanningDir, 'codebase');
    (0, shell_command_projection_cjs_1.platformEnsureDir)(intelDir);
    (0, shell_command_projection_cjs_1.platformEnsureDir)(codebaseDir);
    const graphPath = node_path_1.default.join(intelDir, 'codebase-graph.json');
    const isNewMigration = !node_fs_1.default.existsSync(graphPath);
    // 1. Build and persist Universal AST Graph
    const graph = buildCodebaseGraph(resolvedRoot);
    saveCodebaseGraph(resolvedPlanningDir, graph);
    // 2. Materialize Living Documentation
    const syncReport = syncLivingDocs(resolvedPlanningDir, resolvedRoot);
    // 3. Initialize Telemetry if missing
    const telemetryData = loadTelemetry(resolvedPlanningDir);
    saveTelemetry(resolvedPlanningDir, telemetryData);
    // 4. Extract detected languages
    const languageSet = new Set();
    for (const f of Object.values(graph.files)) {
        if (f.language) {
            languageSet.add(f.language);
        }
    }
    const generatedArtifacts = [
        node_path_1.default.join(intelDir, 'codebase-graph.json'),
        node_path_1.default.join(codebaseDir, 'ARCHITECTURE.md'),
        node_path_1.default.join(codebaseDir, 'APIS.md'),
        node_path_1.default.join(intelDir, 'telemetry.json'),
    ];
    return {
        success: true,
        version: '2.9.0',
        isNewMigration,
        indexedFiles: graph.stats.totalFiles,
        detectedLanguages: Array.from(languageSet),
        totalSymbols: graph.stats.totalSymbols,
        totalRoutes: graph.stats.totalRoutes,
        docsUpdated: syncReport.generatedDocs.length,
        generatedArtifacts,
        message: isNewMigration
            ? `Successfully upgraded legacy project to GSD Core Nexus 2.9. Indexed ${graph.stats.totalFiles} files across [${Array.from(languageSet).join(', ')}]. Generated ${syncReport.generatedDocs.length} living doc(s).`
            : `Refreshed GSD Core Nexus 2.9 intelligence layer for ${graph.stats.totalFiles} files (${syncReport.generatedDocs.length} doc(s) updated).`,
    };
}
module.exports = {
    runAutoUpgrade,
};
