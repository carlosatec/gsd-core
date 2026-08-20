"use strict";
/**
 * Canonical Examples Finder — Selects optimal reference files for few-shot prompting.
 *
 * Discovers high-centrality, representative architectural modules to inject
 * into AI context as canonical coding style anchors.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const codebaseAst = require("./codebase-ast-analyzer.cjs");
const { loadCodebaseGraph, buildCodebaseGraph } = codebaseAst;
// ─── Core Logic ───────────────────────────────────────────────────────────────
/**
 * Discovers the highest-quality reference module in the codebase.
 */
function findCanonicalExample(rootDir, planningDir, targetExt) {
    const resolvedRoot = node_path_1.default.resolve(rootDir);
    const resolvedPlanningDir = planningDir ? node_path_1.default.resolve(planningDir) : node_path_1.default.join(resolvedRoot, '.planning');
    let graph = loadCodebaseGraph(resolvedPlanningDir);
    if (!graph) {
        graph = buildCodebaseGraph(resolvedRoot);
    }
    const scores = graph.pageRankScores || {};
    const candidates = [];
    for (const [fName, fData] of Object.entries(graph.files)) {
        // Exclude test files, generated files, index-only files or files under .planning
        const lower = fName.toLowerCase();
        if (lower.includes('.test.') ||
            lower.includes('_test.') ||
            lower.includes('test_') ||
            lower.includes('.spec.') ||
            lower.startsWith('.planning') ||
            lower.includes('node_modules') ||
            fData.exports.length === 0) {
            continue;
        }
        if (targetExt && !lower.endsWith(targetExt.toLowerCase())) {
            continue;
        }
        const prScore = scores[fName] || 0;
        candidates.push({
            file: fName,
            score: prScore,
            exportsCount: fData.exports.length,
        });
    }
    if (candidates.length === 0)
        return null;
    // Rank by composite score (PageRank + export richness)
    candidates.sort((a, b) => b.score * 10 + b.exportsCount - (a.score * 10 + a.exportsCount));
    const best = candidates[0];
    const fullPath = node_path_1.default.join(resolvedRoot, best.file);
    try {
        const rawContent = node_fs_1.default.readFileSync(fullPath, 'utf8');
        // Truncate to first 40 lines (signatures/types) to prevent prompt explosion
        const truncated = rawContent.split('\n').slice(0, 40).join('\n');
        return {
            file: best.file,
            content: truncated,
            reason: `Ranked top canonical architecture pattern (PageRank: ${best.score}, public exports: ${best.exportsCount})`,
            language: graph.files[best.file]?.language || 'typescript',
        };
    }
    catch {
        return null;
    }
}
module.exports = {
    findCanonicalExample,
};
