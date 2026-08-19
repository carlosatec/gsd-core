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
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  const maxTokens = options.maxTokens ?? 3500;
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

    // Extract types/interfaces from target file if present in graph
    const normalized = file.replace(/\\/g, '/');
    if (graph.files[normalized]) {
      for (const s of graph.files[normalized].symbols) {
        if (s.kind === 'interface' || s.kind === 'type') {
          applicableTypes.push(`${s.name} (${s.kind} at line ${s.line})`);
        }
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

  return {
    targetFiles,
    estimatedTokens: estimateTokens(markdownBlock),
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
