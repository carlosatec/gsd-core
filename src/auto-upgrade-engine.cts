/**
 * Auto-Upgrade Engine — Seamless non-destructive upgrade from GSD 1.x to GSD Core 2.4.
 *
 * Scans the repository, creates the multi-language AST topology, materializes
 * living architecture & API contracts, and initializes telemetry.
 */

import fs from 'node:fs';
import path from 'node:path';
import { platformEnsureDir } from './shell-command-projection.cjs';
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

interface AutoUpgradeReport {
  success: boolean;
  version: string;
  isNewMigration: boolean;
  indexedFiles: number;
  detectedLanguages: string[];
  totalSymbols: number;
  totalRoutes: number;
  docsUpdated: number;
  generatedArtifacts: string[];
  message: string;
}

// ─── Core Implementation ──────────────────────────────────────────────────────

/**
 * Runs the non-destructive auto-upgrade pipeline on a project.
 */
function runAutoUpgrade(planningDir: string, rootDir?: string): AutoUpgradeReport {
  const resolvedPlanningDir = path.resolve(planningDir);
  const resolvedRoot = rootDir ? path.resolve(rootDir) : path.dirname(resolvedPlanningDir);

  platformEnsureDir(resolvedPlanningDir);
  const intelDir = path.join(resolvedPlanningDir, 'intel');
  const codebaseDir = path.join(resolvedPlanningDir, 'codebase');
  platformEnsureDir(intelDir);
  platformEnsureDir(codebaseDir);

  const graphPath = path.join(intelDir, 'codebase-graph.json');
  const isNewMigration = !fs.existsSync(graphPath);

  // 1. Build and persist Universal AST Graph
  const graph = buildCodebaseGraph(resolvedRoot);
  saveCodebaseGraph(resolvedPlanningDir, graph);

  // 2. Materialize Living Documentation
  const syncReport = syncLivingDocs(resolvedPlanningDir, resolvedRoot);

  // 3. Initialize Telemetry if missing
  const telemetryData = loadTelemetry(resolvedPlanningDir);
  saveTelemetry(resolvedPlanningDir, telemetryData);

  // 4. Extract detected languages
  const languageSet = new Set<string>();
  for (const f of Object.values(graph.files)) {
    if (f.language) {
      languageSet.add(f.language);
    }
  }

  const generatedArtifacts = [
    path.join(intelDir, 'codebase-graph.json'),
    path.join(codebaseDir, 'ARCHITECTURE.md'),
    path.join(codebaseDir, 'APIS.md'),
    path.join(intelDir, 'telemetry.json'),
  ];

  return {
    success: true,
    version: '2.5.0',
    isNewMigration,
    indexedFiles: graph.stats.totalFiles,
    detectedLanguages: Array.from(languageSet),
    totalSymbols: graph.stats.totalSymbols,
    totalRoutes: graph.stats.totalRoutes,
    docsUpdated: syncReport.generatedDocs.length,
    generatedArtifacts,
    message: isNewMigration
      ? `Successfully upgraded legacy project to GSD Core Nexus 2.5. Indexed ${graph.stats.totalFiles} files across [${Array.from(languageSet).join(', ')}]. Generated ${syncReport.generatedDocs.length} living doc(s).`
      : `Refreshed GSD Core Nexus 2.5 intelligence layer for ${graph.stats.totalFiles} files (${syncReport.generatedDocs.length} doc(s) updated).`,
  };
}

export = {
  runAutoUpgrade,
};
