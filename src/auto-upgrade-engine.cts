/**
 * Auto-Upgrade Engine — Seamless non-destructive upgrade from legacy projects to GSD Core Nexus 3.3.
 *
 * Scans the repository, creates the multi-language AST topology, materializes
 * living architecture & API contracts, and initializes telemetry.
 */

import fs from 'node:fs';
import path from 'node:path';
import { platformEnsureDir, platformWriteSync, withFileLockSync } from './shell-command-projection.cjs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import codebaseAst = require('./codebase-ast-analyzer.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import livingDocs = require('./living-docs-engine.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import jitTelemetry = require('./jit-telemetry.cjs');

const { buildCodebaseGraph, saveCodebaseGraph } = codebaseAst;
const { syncLivingDocs } = livingDocs;
const { loadTelemetry, saveTelemetry } = jitTelemetry;

// ─── Types ────────────────────────────────────────────────────────────────────

interface AutoUpgradeOptions {
  dryRun?: boolean;
  force?: boolean;
}

interface AutoUpgradeReport {
  success: boolean;
  version: string;
  isNewMigration: boolean;
  indexedFiles: number;
  detectedLanguages: string[];
  detectedFrameworks?: string[];
  totalSymbols: number;
  totalRoutes: number;
  docsUpdated: number;
  generatedArtifacts: string[];
  message: string;
  errors?: Array<{ artifact: string; error: string }>;
  partial?: boolean;
}

// ─── Framework Detection & Bootstrap Helpers ─────────────────────────────────

function detectProjectFrameworks(rootDir: string): string[] {
  const frameworks: string[] = [];

  // Node.js package.json
  const pkgPath = path.join(rootDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const rawPkg = fs.readFileSync(pkgPath, 'utf-8');
      const parsedPkg = JSON.parse(rawPkg) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps: Record<string, string> = parsedPkg?.dependencies ?? {};
      const devDeps: Record<string, string> = parsedPkg?.devDependencies ?? {};
      const allDeps: Record<string, string> = { ...deps, ...devDeps };
      if (allDeps['next']) frameworks.push('Next.js');
      if (allDeps['react']) frameworks.push('React');
      if (allDeps['vue']) frameworks.push('Vue');
      if (allDeps['svelte']) frameworks.push('Svelte');
      if (allDeps['express']) frameworks.push('Express');
      if (allDeps['@nestjs/core']) frameworks.push('NestJS');
      if (allDeps['fastify']) frameworks.push('Fastify');
      if (allDeps['vite']) frameworks.push('Vite');
    } catch {
      // safe fallback
    }
  }

  // Python
  const pyproject = path.join(rootDir, 'pyproject.toml');
  const reqs = path.join(rootDir, 'requirements.txt');
  const pyText = (fs.existsSync(pyproject) ? fs.readFileSync(pyproject, 'utf-8') : '') +
                 (fs.existsSync(reqs) ? fs.readFileSync(reqs, 'utf-8') : '');
  if (pyText) {
    if (pyText.includes('django')) frameworks.push('Django');
    if (pyText.includes('fastapi')) frameworks.push('FastAPI');
    if (pyText.includes('flask')) frameworks.push('Flask');
    if (pyText.includes('torch') || pyText.includes('pytorch')) frameworks.push('PyTorch');
  }

  // Go
  const goMod = path.join(rootDir, 'go.mod');
  if (fs.existsSync(goMod)) {
    const modText = fs.readFileSync(goMod, 'utf-8');
    if (modText.includes('gin-gonic/gin')) frameworks.push('Gin');
    if (modText.includes('gofiber/fiber')) frameworks.push('Fiber');
    if (modText.includes('labstack/echo')) frameworks.push('Echo');
  }

  // Rust
  const cargoToml = path.join(rootDir, 'Cargo.toml');
  if (fs.existsSync(cargoToml)) {
    const cargoText = fs.readFileSync(cargoToml, 'utf-8');
    if (cargoText.includes('actix-web')) frameworks.push('Actix');
    if (cargoText.includes('axum')) frameworks.push('Axum');
    if (cargoText.includes('tokio')) frameworks.push('Tokio');
    if (cargoText.includes('tauri')) frameworks.push('Tauri');
  }

  return [...new Set(frameworks)];
}

function bootstrapPlanningDefaults(planningDir: string, rootDir: string, frameworks: string[], languages: string[]): void {
  const statePath = path.join(planningDir, 'STATE.md');
  const roadmapPath = path.join(planningDir, 'ROADMAP.md');
  const configPath = path.join(planningDir, 'config.json');

  if (!fs.existsSync(configPath)) {
    const configData = {
      runtime: 'antigravity',
      model_profile: 'balanced',
      telemetry: true,
      phase_locking: true,
    };
    platformWriteSync(configPath, JSON.stringify(configData, null, 2));
  }

  if (!fs.existsSync(statePath)) {
    const projectName = path.basename(rootDir) || 'Project';
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
    platformWriteSync(statePath, stateContent);
  }

  if (!fs.existsSync(roadmapPath)) {
    const projectName = path.basename(rootDir) || 'Project';
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
    platformWriteSync(roadmapPath, roadmapContent);
  }
}

// ─── Core Implementation ──────────────────────────────────────────────────────

/**
 * Runs the non-destructive auto-upgrade pipeline on a project.
 */
function runAutoUpgrade(planningDir: string, rootDir?: string, options?: AutoUpgradeOptions): AutoUpgradeReport {
  const resolvedPlanningDir = path.resolve(planningDir);
  const resolvedRoot = rootDir ? path.resolve(rootDir) : path.dirname(resolvedPlanningDir);

  const intelDir = path.join(resolvedPlanningDir, 'intel');
  const codebaseDir = path.join(resolvedPlanningDir, 'codebase');
  const graphPath = path.join(intelDir, 'codebase-graph.json');
  const isNewMigration = !fs.existsSync(graphPath);

  // 1. Build Universal AST Graph
  const graph = buildCodebaseGraph(resolvedRoot);

  // 2. Extract detected languages & frameworks
  const languageSet = new Set<string>();
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
      version: '3.3.0',
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

  platformEnsureDir(resolvedPlanningDir);
  platformEnsureDir(intelDir);
  platformEnsureDir(codebaseDir);

  saveCodebaseGraph(resolvedPlanningDir, graph);

  // 3. Materialize Living Documentation
  const syncReport = syncLivingDocs(resolvedPlanningDir, resolvedRoot);

  // 4. Initialize Telemetry with Lock & Baseline Seeding
  const telemetryPath = path.join(intelDir, 'telemetry.json');
  withFileLockSync(telemetryPath, () => {
    const telemetryData = loadTelemetry(resolvedPlanningDir);
    const rawData = (telemetryData as unknown) as Record<string, unknown>;
    if (telemetryData.totalInvocations === 0 && !rawData['migratedAt']) {
      rawData['migratedAt'] = new Date().toISOString();
      let totalRepoChars = 0;
      const weights = (jitTelemetry as { LANGUAGE_CHAR_WEIGHTS?: Record<string, number> }).LANGUAGE_CHAR_WEIGHTS || {};
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
    path.join(intelDir, 'codebase-graph.json'),
    path.join(codebaseDir, 'ARCHITECTURE.md'),
    path.join(codebaseDir, 'APIS.md'),
    path.join(intelDir, 'telemetry.json'),
  ];

  return {
    success: true,
    version: '3.3.0',
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

export = {
  runAutoUpgrade,
};
