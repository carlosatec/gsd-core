"use strict";
/**
 * JIT Context Injector — Surgical context assembly engine for AI agents.
 *
 * Ingests the codebase AST topology and injects only the strictly relevant
 * symbols, neighbor signatures, types, and architectural decisions for the
 * targeted files, avoiding massive monolithic prompt overhead.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const node_path_1 = __importDefault(require("node:path"));
const shell_command_projection_cjs_1 = require("./shell-command-projection.cjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const codebaseAst = require("./codebase-ast-analyzer.cjs");
const { loadCodebaseGraph, buildCodebaseGraph, queryFileDependencies } = codebaseAst;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const jitTelemetry = require("./jit-telemetry.cjs");
const { recordJitInvocation } = jitTelemetry;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const semanticRag = require("./hybrid-semantic-rag.cjs");
const { querySemanticSimilarFiles } = semanticRag;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const hostDetection = require("./host-runtime-detection.cjs");
const { detectHostRuntime } = hostDetection;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const decisionsMod = require("./decisions.cjs");
const { parseDecisions } = decisionsMod;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const canonicalMod = require("./canonical-examples-finder.cjs");
const { findCanonicalExample } = canonicalMod;
// ─── Helpers ──────────────────────────────────────────────────────────────────
const LANGUAGE_CHAR_WEIGHTS = {
    typescript: 45,
    javascript: 45,
    python: 40,
    go: 55,
    rust: 55,
    sql: 35,
    csharp: 50,
    java: 50,
    ruby: 40,
    php: 45,
    dart: 45,
    html: 40,
    css: 35,
    yaml: 35,
    json: 30,
};
function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}
// ─── Core Implementation ──────────────────────────────────────────────────────
/**
 * Finds symbols from directly connected files (imports & callers) in the AST graph.
 */
function queryNeighboringSymbols(graph, targetFile) {
    const normalized = targetFile.replace(/\\/g, '/');
    const deps = queryFileDependencies(graph, normalized);
    const results = [];
    const scores = graph.pageRankScores || {};
    // Outgoing dependencies (files that targetFile imports)
    for (const imp of deps.imports) {
        const matchingKey = Object.keys(graph.files).find(k => k === imp || k.endsWith(imp) || k.endsWith(imp + '.ts') || k.endsWith(imp + '.cts') || k.endsWith(imp + '.js'));
        if (matchingKey && graph.files[matchingKey]) {
            const fileData = graph.files[matchingKey];
            results.push({
                file: matchingKey,
                relation: 'import',
                exports: fileData.exports.map((e) => ({ name: e.name, kind: e.kind })),
                pageRank: scores[matchingKey] || 0,
            });
        }
    }
    // Incoming dependencies (files that import targetFile)
    for (const caller of deps.importedBy) {
        if (graph.files[caller]) {
            const fileData = graph.files[caller];
            results.push({
                file: caller,
                relation: 'imported_by',
                exports: fileData.exports.map((e) => ({ name: e.name, kind: e.kind })),
                pageRank: scores[caller] || 0,
            });
        }
    }
    // Sort neighbors by PageRank importance
    results.sort((a, b) => (b.pageRank || 0) - (a.pageRank || 0));
    return results;
}
/**
 * Assembles a surgical, token-budgeted JIT context package for specific target files.
 */
function assembleJitContext(options) {
    const resolvedPlanningDir = node_path_1.default.resolve(options.planningDir);
    const root = options.rootDir ? node_path_1.default.resolve(options.rootDir) : node_path_1.default.dirname(resolvedPlanningDir);
    // Calibrate token budget based on explicit windowTier, model profile, or detected runtime environment
    let effectiveProfile = options.modelProfile;
    if (!effectiveProfile && !options.windowTier) {
        const detected = detectHostRuntime();
        if (detected.runtime === 'codex') {
            effectiveProfile = 'pro';
        }
        else {
            effectiveProfile = 'balanced';
        }
    }
    let defaultTokenBudget = 8000; // Standard 128k-200k baseline (Claude, GPT-4o)
    if (options.windowTier === 'small') {
        defaultTokenBudget = 2500; // 32k window (Mistral Small, Qwen, local Ollama)
    }
    else if (options.windowTier === 'large') {
        defaultTokenBudget = 24000; // 1M+ window (Gemini Pro/Flash)
    }
    else if (options.windowTier === 'standard') {
        defaultTokenBudget = 8000;
    }
    else if (effectiveProfile) {
        const prof = effectiveProfile.toLowerCase();
        if (prof === 'quality' || prof === 'deep' || prof === 'pro' || prof === 'large') {
            defaultTokenBudget = 8000;
        }
        else if (prof === 'budget' || prof === 'fast' || prof === 'flash' || prof === 'small') {
            defaultTokenBudget = 2500;
        }
        else if (prof === 'ultra' || prof === 'mega') {
            defaultTokenBudget = 24000;
        }
        else if (prof === 'balanced') {
            defaultTokenBudget = 5000;
        }
    }
    const maxTokens = options.maxTokens ?? defaultTokenBudget;
    const maxDecisions = options.maxDecisions ?? 5;
    const { targetFiles } = options;
    let graph = loadCodebaseGraph(resolvedPlanningDir);
    if (!graph) {
        graph = buildCodebaseGraph(root);
    }
    const allNeighbors = [];
    const applicableTypes = [];
    const applicableDecisions = [];
    for (const file of targetFiles) {
        const neighbors = queryNeighboringSymbols(graph, file);
        for (const n of neighbors) {
            if (!allNeighbors.some(existing => existing.file === n.file)) {
                allNeighbors.push(n);
            }
        }
        // Extract type contracts (interfaces, types, structs, classes, traits, models, widgets, tables, enums)
        const normalized = file.replace(/\\/g, '/');
        const TARGET_TYPE_KINDS = new Set([
            'interface',
            'type',
            'struct',
            'class',
            'trait',
            'model',
            'widget',
            'table',
            'enum',
        ]);
        if (graph.files[normalized]) {
            for (const s of graph.files[normalized].symbols) {
                if (TARGET_TYPE_KINDS.has(s.kind)) {
                    applicableTypes.push(`${s.name} (${s.kind} at line ${s.line})`);
                }
            }
        }
    }
    // Query semantic RAG if a query or task prompt was provided
    const semanticallyRelated = [];
    if (options.query) {
        const hits = querySemanticSimilarFiles(options.query, resolvedPlanningDir, root, 3);
        for (const h of hits) {
            if (!targetFiles.includes(h.file) && !allNeighbors.some(n => n.file === h.file)) {
                semanticallyRelated.push(h);
            }
        }
    }
    // Load relevant decisions using native decisions parser with regex fallback
    const statePath = node_path_1.default.join(resolvedPlanningDir, 'STATE.md');
    const stateContent = (0, shell_command_projection_cjs_1.platformReadSync)(statePath);
    if (stateContent) {
        try {
            const parsed = parseDecisions(stateContent);
            for (const d of parsed) {
                if (d.id && d.text) {
                    applicableDecisions.push(`- **${d.id}${d.category ? ' [' + d.category + ']' : ''}**: ${d.text}`);
                    if (applicableDecisions.length >= maxDecisions)
                        break;
                }
            }
        }
        catch {
            // Non-blocking
        }
        if (applicableDecisions.length === 0) {
            const decisionMatches = stateContent.match(/-\s+\*\*D-[A-Za-z0-9_-]+(?:\[[^\]]+\])?(?:\s*\[[^\]]+\])?(?::\*\*|\*\*:)\s*.*$/gm);
            if (decisionMatches) {
                applicableDecisions.push(...decisionMatches.slice(0, maxDecisions));
            }
        }
    }
    // Discover canonical example file for coding style anchor
    const firstTargetExt = targetFiles[0] ? node_path_1.default.extname(targetFiles[0]) : undefined;
    const canonicalExample = findCanonicalExample(root, resolvedPlanningDir, firstTargetExt);
    // Build markdown representation
    const lines = [
        '<jit_context>',
        `### Surgical Context for: ${targetFiles.join(', ')}`,
        '',
    ];
    if (applicableDecisions.length > 0) {
        lines.push('#### Active Architectural Decisions:');
        for (const d of applicableDecisions) {
            lines.push(d);
        }
        lines.push('');
    }
    if (allNeighbors.length > 0) {
        lines.push('#### Neighboring Modules & Exported Signatures:');
        for (const n of allNeighbors) {
            const exportList = n.exports.map(e => `${e.name} (${e.kind})`).join(', ');
            lines.push(`- **${n.file}** (${n.relation === 'import' ? 'imported by target' : 'imports target'}): ${exportList || 'no public exports'}`);
        }
        lines.push('');
    }
    if (canonicalExample) {
        lines.push(`#### Canonical Architecture Anchor (${canonicalExample.file}):`);
        lines.push('```' + canonicalExample.language);
        lines.push(canonicalExample.content);
        lines.push('```');
        lines.push('');
    }
    if (semanticallyRelated.length > 0) {
        lines.push('#### Semantically Related Modules:');
        for (const r of semanticallyRelated) {
            lines.push(`- **${r.file}** (similarity: ${r.score}): ${r.preview}`);
        }
        lines.push('');
    }
    if (applicableTypes.length > 0) {
        lines.push('#### Target Type Contracts:');
        for (const t of applicableTypes) {
            lines.push(`- ${t}`);
        }
        lines.push('');
    }
    lines.push('</jit_context>');
    // Enforce token budget with line-aware truncation
    const outputLines = [];
    let currentTokens = 0;
    const maxCharBudget = maxTokens * 4;
    let isTruncated = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (currentTokens + line.length > maxCharBudget && i > 3 && i < lines.length - 1) {
            isTruncated = true;
            break;
        }
        outputLines.push(line);
        currentTokens += line.length + 1;
    }
    if (isTruncated) {
        outputLines.push('... [JIT Context Truncated to fit budget]');
        outputLines.push('</jit_context>');
    }
    const markdownBlock = outputLines.join('\n');
    const estimatedTokensCount = estimateTokens(markdownBlock);
    // Estimate full repository monolithic token weight with language-calibrated density
    let totalRepoChars = 0;
    for (const f of Object.values(graph.files)) {
        const weight = (f.language && LANGUAGE_CHAR_WEIGHTS[f.language.toLowerCase()]) || 45;
        totalRepoChars += (f.linesCount || 10) * weight;
    }
    const fullRepoTokens = Math.max(Math.ceil(totalRepoChars / 4), estimatedTokensCount * 5);
    // Record Telemetry (Schema v2.0)
    try {
        recordJitInvocation(resolvedPlanningDir, targetFiles, estimatedTokensCount, fullRepoTokens, options.command || 'other', options.phaseId);
    }
    catch {
        // Non-blocking telemetry
    }
    return {
        targetFiles,
        estimatedTokens: estimatedTokensCount,
        neighborSymbols: allNeighbors,
        applicableTypes,
        applicableDecisions,
        canonicalExample,
        markdownBlock,
    };
}
module.exports = {
    assembleJitContext,
    queryNeighboringSymbols,
    estimateTokens,
};
