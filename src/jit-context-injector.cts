/**
 * JIT Context Injector — Surgical context assembly engine for AI agents.
 *
 * Ingests the codebase AST topology and injects only the strictly relevant
 * symbols, neighbor signatures, types, and architectural decisions for the
 * targeted files, avoiding massive monolithic prompt overhead.
 */

import fs from 'node:fs';
import path from 'node:path';
import { platformReadSync } from './shell-command-projection.cjs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import codebaseAst = require('./codebase-ast-analyzer.cjs');
const { loadCodebaseGraph, buildCodebaseGraph, queryFileDependencies } = codebaseAst;
// eslint-disable-next-line @typescript-eslint/no-require-imports
import jitTelemetry = require('./jit-telemetry.cjs');
const { recordJitInvocation } = jitTelemetry;
// eslint-disable-next-line @typescript-eslint/no-require-imports
import semanticRag = require('./hybrid-semantic-rag.cjs');
const { querySemanticSimilarFiles } = semanticRag;

// ─── Types ────────────────────────────────────────────────────────────────────

type CodebaseGraph = ReturnType<typeof buildCodebaseGraph>;

interface NeighborSymbolInfo {
  file: string;
  relation: 'import' | 'imported_by';
  exports: Array<{ name: string; kind: string }>;
}

interface JitContextPackage {
  targetFiles: string[];
  estimatedTokens: number;
  neighborSymbols: NeighborSymbolInfo[];
  applicableTypes: string[];
  applicableDecisions: string[];
  markdownBlock: string;
}

interface AssembleJitContextOptions {
  targetFiles: string[];
  planningDir: string;
  rootDir?: string;
  maxTokens?: number;
  maxDecisions?: number;
  modelProfile?: string;
  query?: string;
  command?: string;
  phaseId?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const LANGUAGE_CHAR_WEIGHTS: Record<string, number> = {
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

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ─── Core Implementation ──────────────────────────────────────────────────────

/**
 * Finds symbols from directly connected files (imports & callers) in the AST graph.
 */
function queryNeighboringSymbols(graph: CodebaseGraph, targetFile: string): NeighborSymbolInfo[] {
  const normalized = targetFile.replace(/\\/g, '/');
  const deps = queryFileDependencies(graph, normalized);
  const results: NeighborSymbolInfo[] = [];

  // Outgoing dependencies (files that targetFile imports)
  for (const imp of deps.imports) {
    const matchingKey = Object.keys(graph.files).find(
      k => k === imp || k.endsWith(imp) || k.endsWith(imp + '.ts') || k.endsWith(imp + '.cts') || k.endsWith(imp + '.js')
    );
    if (matchingKey && graph.files[matchingKey]) {
      const fileData = graph.files[matchingKey];
      results.push({
        file: matchingKey,
        relation: 'import',
        exports: fileData.exports.map((e: { name: string; kind: string }) => ({ name: e.name, kind: e.kind })),
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
        exports: fileData.exports.map((e: { name: string; kind: string }) => ({ name: e.name, kind: e.kind })),
      });
    }
  }

  return results;
}

/**
 * Assembles a surgical, token-budgeted JIT context package for specific target files.
 */
function assembleJitContext(options: AssembleJitContextOptions): JitContextPackage {
  const resolvedPlanningDir = path.resolve(options.planningDir);
  const root = options.rootDir ? path.resolve(options.rootDir) : path.dirname(resolvedPlanningDir);

  // Calibrate token budget based on model profile if provided
  let defaultTokenBudget = 3500;
  if (options.modelProfile) {
    const prof = options.modelProfile.toLowerCase();
    if (prof === 'quality' || prof === 'deep' || prof === 'pro') {
      defaultTokenBudget = 8000;
    } else if (prof === 'budget' || prof === 'fast' || prof === 'flash') {
      defaultTokenBudget = 2000;
    } else if (prof === 'balanced') {
      defaultTokenBudget = 4500;
    }
  }

  const maxTokens = options.maxTokens ?? defaultTokenBudget;
  const maxDecisions = options.maxDecisions ?? 5;
  const { targetFiles } = options;

  let graph = loadCodebaseGraph(resolvedPlanningDir);
  if (!graph) {
    graph = buildCodebaseGraph(root);
  }

  const allNeighbors: NeighborSymbolInfo[] = [];
  const applicableTypes: string[] = [];
  const applicableDecisions: string[] = [];

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
  const semanticallyRelated: Array<{ file: string; score: number; preview: string }> = [];
  if (options.query) {
    const hits = querySemanticSimilarFiles(options.query, resolvedPlanningDir, root, 3);
    for (const h of hits) {
      if (!targetFiles.includes(h.file) && !allNeighbors.some(n => n.file === h.file)) {
        semanticallyRelated.push(h);
      }
    }
  }

  // Load relevant decisions from STATE.md if available
  const statePath = path.join(resolvedPlanningDir, 'STATE.md');
  const stateContent = platformReadSync(statePath);
  if (stateContent) {
    const decisionMatches = stateContent.match(/-\s+\*\*D-\d+.*?\*\*:.*$/gm);
    if (decisionMatches) {
      applicableDecisions.push(...decisionMatches.slice(0, maxDecisions));
    }
  }

  // Build markdown representation
  const lines: string[] = [
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
  let outputLines: string[] = [];
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
  for (const f of Object.values(graph.files) as Array<{ linesCount?: number; language?: string }>) {
    const weight = (f.language && LANGUAGE_CHAR_WEIGHTS[f.language.toLowerCase()]) || 45;
    totalRepoChars += (f.linesCount || 10) * weight;
  }
  const fullRepoTokens = Math.max(estimateTokens(String(totalRepoChars)), estimatedTokensCount * 5);

  // Record Telemetry (Schema v2.0)
  try {
    recordJitInvocation(
      resolvedPlanningDir,
      targetFiles,
      estimatedTokensCount,
      fullRepoTokens,
      options.command || 'other',
      options.phaseId
    );
  } catch {
    // Non-blocking telemetry
  }

  return {
    targetFiles,
    estimatedTokens: estimatedTokensCount,
    neighborSymbols: allNeighbors,
    applicableTypes,
    applicableDecisions,
    markdownBlock,
  };
}

export = {
  assembleJitContext,
  queryNeighboringSymbols,
  estimateTokens,
};
