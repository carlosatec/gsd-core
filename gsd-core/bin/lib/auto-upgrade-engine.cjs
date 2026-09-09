"use strict";
/**
 * Auto-Upgrade Engine — Seamless non-destructive upgrade from legacy projects to GSD Core Nexus 3.3.
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
// ─── Framework Detection & Bootstrap Helpers ─────────────────────────────────
function detectProjectFrameworks(rootDir) {
    const frameworks = [];
    // Node.js package.json
    const pkgPath = node_path_1.default.join(rootDir, 'package.json');
    if (node_fs_1.default.existsSync(pkgPath)) {
        try {
            const rawPkg = node_fs_1.default.readFileSync(pkgPath, 'utf-8');
            const parsedPkg = JSON.parse(rawPkg);
            const deps = parsedPkg?.dependencies ?? {};
            const devDeps = parsedPkg?.devDependencies ?? {};
            const allDeps = { ...deps, ...devDeps };
            if (allDeps['next'])
                frameworks.push('Next.js');
            if (allDeps['react'])
                frameworks.push('React');
            if (allDeps['vue'])
                frameworks.push('Vue');
            if (allDeps['svelte'])
                frameworks.push('Svelte');
            if (allDeps['express'])
                frameworks.push('Express');
            if (allDeps['@nestjs/core'])
                frameworks.push('NestJS');
            if (allDeps['fastify'])
                frameworks.push('Fastify');
            if (allDeps['vite'])
                frameworks.push('Vite');
        }
        catch {
            // safe fallback
        }
    }
    // Python
    const pyproject = node_path_1.default.join(rootDir, 'pyproject.toml');
    const reqs = node_path_1.default.join(rootDir, 'requirements.txt');
    const pyText = (node_fs_1.default.existsSync(pyproject) ? node_fs_1.default.readFileSync(pyproject, 'utf-8') : '') +
        (node_fs_1.default.existsSync(reqs) ? node_fs_1.default.readFileSync(reqs, 'utf-8') : '');
    if (pyText) {
        if (pyText.includes('django'))
            frameworks.push('Django');
        if (pyText.includes('fastapi'))
            frameworks.push('FastAPI');
        if (pyText.includes('flask'))
            frameworks.push('Flask');
        if (pyText.includes('torch') || pyText.includes('pytorch'))
            frameworks.push('PyTorch');
    }
    // Go
    const goMod = node_path_1.default.join(rootDir, 'go.mod');
    if (node_fs_1.default.existsSync(goMod)) {
        const modText = node_fs_1.default.readFileSync(goMod, 'utf-8');
        if (modText.includes('gin-gonic/gin'))
            frameworks.push('Gin');
        if (modText.includes('gofiber/fiber'))
            frameworks.push('Fiber');
        if (modText.includes('labstack/echo'))
            frameworks.push('Echo');
    }
    // Rust
    const cargoToml = node_path_1.default.join(rootDir, 'Cargo.toml');
    if (node_fs_1.default.existsSync(cargoToml)) {
        const cargoText = node_fs_1.default.readFileSync(cargoToml, 'utf-8');
        if (cargoText.includes('actix-web'))
            frameworks.push('Actix');
        if (cargoText.includes('axum'))
            frameworks.push('Axum');
        if (cargoText.includes('tokio'))
            frameworks.push('Tokio');
        if (cargoText.includes('tauri'))
            frameworks.push('Tauri');
    }
    return [...new Set(frameworks)];
}
function bootstrapPlanningDefaults(planningDir, rootDir, frameworks, languages) {
    const statePath = node_path_1.default.join(planningDir, 'STATE.md');
    const roadmapPath = node_path_1.default.join(planningDir, 'ROADMAP.md');
    const configPath = node_path_1.default.join(planningDir, 'config.json');
    if (!node_fs_1.default.existsSync(configPath)) {
        const configData = {
            runtime: 'antigravity',
            model_profile: 'balanced',
            telemetry: true,
            phase_locking: true,
        };
        (0, shell_command_projection_cjs_1.platformWriteSync)(configPath, JSON.stringify(configData, null, 2));
    }
    if (!node_fs_1.default.existsSync(statePath)) {
        const projectName = node_path_1.default.basename(rootDir) || 'Project';
        const fwBadge = frameworks.length > 0 ? ` (${frameworks.join(', ')})` : '';
        const stateContent = `# Project State: ${projectName}

## Position
- **Milestone:** v1.0.0-Initial-Architecture
- **Current Phase:** Phase 1 (Project Onboarding & Architecture Mapping)
- **Status:** In Progress
- **Active Plan:** .planning/phases/01-project-onboarding-and-architecture-mapping/01-01-PLAN.md
- **Summary:** .planning/phases/01-project-onboarding-and-architecture-mapping/01-SUMMARY.md
- **Context:** .planning/phases/01-project-onboarding-and-architecture-mapping/CONTEXT.md

## Detected Stack
- **Primary Languages:** ${languages.join(', ') || 'Auto-detected'}
- **Frameworks:** ${frameworks.join(', ') || 'Standard'}${fwBadge}

## Completed Phases
(None yet — initialize with /gsd-plan)
`;
        (0, shell_command_projection_cjs_1.platformWriteSync)(statePath, stateContent);
    }
    if (!node_fs_1.default.existsSync(roadmapPath)) {
        const projectName = node_path_1.default.basename(rootDir) || 'Project';
        const roadmapContent = `# Roadmap: ${projectName}

## Phases
- [ ] **Phase 1: Project Onboarding & Architecture Mapping** - Analyze codebase topology, verify tests and establish GSD Core workflow.

## Phase Details

### Phase 1: Project Onboarding & Architecture Mapping
**Goal**: Establish complete codebase knowledge graph, verify test baseline, and create execution plans.
**Status**: In Progress

## Progress

| Phase | Plans Complete | Status | Completed |
|---|---|---|---|
| 1. Project Onboarding & Architecture Mapping | 0/1 | In Progress | - |
`;
        (0, shell_command_projection_cjs_1.platformWriteSync)(roadmapPath, roadmapContent);
    }
}
// ─── Core Implementation ──────────────────────────────────────────────────────
/**
 * Runs the non-destructive auto-upgrade pipeline on a project.
 */
function runAutoUpgrade(planningDir, rootDir, options) {
    const resolvedPlanningDir = node_path_1.default.resolve(planningDir);
    const resolvedRoot = rootDir ? node_path_1.default.resolve(rootDir) : node_path_1.default.dirname(resolvedPlanningDir);
    const intelDir = node_path_1.default.join(resolvedPlanningDir, 'intel');
    const codebaseDir = node_path_1.default.join(resolvedPlanningDir, 'codebase');
    const graphPath = node_path_1.default.join(intelDir, 'codebase-graph.json');
    const isNewMigration = !node_fs_1.default.existsSync(graphPath);
    // 1. Build Universal AST Graph
    const graph = buildCodebaseGraph(resolvedRoot);
    // 2. Extract detected languages & frameworks
    const languageSet = new Set();
    for (const f of Object.values(graph.files)) {
        if (f.language) {
            languageSet.add(f.language);
        }
    }
    const detectedLanguages = Array.from(languageSet);
    const detectedFrameworks = detectProjectFrameworks(resolvedRoot);
    const fwText = detectedFrameworks.length > 0 ? ` + [${detectedFrameworks.join(', ')}]` : '';
    if (options?.dryRun) {
        return {
            success: true,
            version: '3.3.2',
            isNewMigration,
            indexedFiles: graph.stats.totalFiles,
            detectedLanguages,
            detectedFrameworks,
            totalSymbols: graph.stats.totalSymbols,
            totalRoutes: graph.stats.totalRoutes,
            docsUpdated: 0,
            generatedArtifacts: [],
            message: `[Dry-Run] Projected upgrade to GSD Core Nexus 3.3: would index ${graph.stats.totalFiles} files across [${detectedLanguages.join(', ')}]${fwText}. No files were written.`,
        };
    }
    (0, shell_command_projection_cjs_1.platformEnsureDir)(resolvedPlanningDir);
    (0, shell_command_projection_cjs_1.platformEnsureDir)(intelDir);
    (0, shell_command_projection_cjs_1.platformEnsureDir)(codebaseDir);
    saveCodebaseGraph(resolvedPlanningDir, graph);
    // 3. Materialize Living Documentation
    const syncReport = syncLivingDocs(resolvedPlanningDir, resolvedRoot);
    // 4. Initialize Telemetry with Lock & Baseline Seeding
    const telemetryPath = node_path_1.default.join(intelDir, 'telemetry.json');
    (0, shell_command_projection_cjs_1.withFileLockSync)(telemetryPath, () => {
        const telemetryData = loadTelemetry(resolvedPlanningDir);
        const rawData = telemetryData;
        if (telemetryData.totalInvocations === 0 && !rawData['migratedAt']) {
            rawData['migratedAt'] = new Date().toISOString();
            let totalRepoChars = 0;
            const weights = jitTelemetry.LANGUAGE_CHAR_WEIGHTS || {};
            for (const f of Object.values(graph.files)) {
                const langKey = f.language ? f.language.toLowerCase() : '';
                const weight = (langKey && weights[langKey]) || 45;
                totalRepoChars += (f.linesCount || 10) * weight;
            }
            rawData['baselineRepoTokens'] = Math.max(1000, Math.ceil(totalRepoChars / 4));
            rawData['initialFilesCount'] = graph.stats.totalFiles;
        }
        saveTelemetry(resolvedPlanningDir, telemetryData);
    });
    // 5. Bootstrap default planning files on greenfield projects
    bootstrapPlanningDefaults(resolvedPlanningDir, resolvedRoot, detectedFrameworks, detectedLanguages);
    const generatedArtifacts = [
        node_path_1.default.join(intelDir, 'codebase-graph.json'),
        node_path_1.default.join(codebaseDir, 'ARCHITECTURE.md'),
        node_path_1.default.join(codebaseDir, 'APIS.md'),
        node_path_1.default.join(intelDir, 'telemetry.json'),
    ];
    return {
        success: true,
        version: '3.3.2',
        isNewMigration,
        indexedFiles: graph.stats.totalFiles,
        detectedLanguages,
        detectedFrameworks,
        totalSymbols: graph.stats.totalSymbols,
        totalRoutes: graph.stats.totalRoutes,
        docsUpdated: syncReport.generatedDocs.length,
        generatedArtifacts,
        errors: syncReport.errors,
        partial: syncReport.partial,
        message: isNewMigration
            ? `Successfully upgraded project to GSD Core Nexus 3.3. Indexed ${graph.stats.totalFiles} files across [${detectedLanguages.join(', ')}]${fwText}. Generated ${syncReport.generatedDocs.length} living doc(s).`
            : `Refreshed GSD Core Nexus 3.3 intelligence layer for ${graph.stats.totalFiles} files (${syncReport.generatedDocs.length} doc(s) updated).`,
    };
}
module.exports = {
    runAutoUpgrade,
};
