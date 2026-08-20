/**
 * Hybrid Semantic RAG Engine — Pure Node.js TF-IDF & Jaccard similarity engine.
 *
 * Persists an inverted index in `.planning/intel/semantic-index.json` with lazy loading,
 * ensuring fast semantic retrieval without native C++ / WASM dependencies (ADR D-01).
 */

import fs from 'node:fs';
import path from 'node:path';
import { platformReadSync, platformWriteSync, platformEnsureDir } from './shell-command-projection.cjs';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DocTermStats {
  file: string;
  terms: Record<string, number>;
  totalTerms: number;
  preview: string;
}

interface SemanticIndexData {
  version: string;
  createdAt: string;
  totalDocs: number;
  docFreq: Record<string, number>;
  docs: Record<string, DocTermStats>;
}

interface SemanticQueryResult {
  file: string;
  score: number;
  preview: string;
}

// ─── Tokenizer & Helpers ──────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'in', 'to', 'for', 'of',
  'with', 'as', 'by', 'from', 'const', 'let', 'var', 'function', 'return', 'if', 'else',
  'import', 'export', 'type', 'interface', 'class', 'struct', 'default', 'true', 'false',
  'null', 'undefined', 'this', 'self', 'public', 'private', 'async', 'await',
]);

function tokenize(text: string): string[] {
  // Tokenize words, camelCase and snake_case split
  const tokens: string[] = [];
  const rawWords = text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9_]+/);

  for (const w of rawWords) {
    if (w.length > 2 && !STOP_WORDS.has(w)) {
      tokens.push(w);
    }
  }
  return tokens;
}

const SUPPORTED_EXTS = new Set([
  '.ts', '.tsx', '.cts', '.mts', '.js', '.jsx', '.cjs', '.mjs',
  '.py', '.go', '.rs', '.dart', '.sql', '.prisma', '.graphql', '.json', '.md'
]);

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.turbo', '.planning', 'vendor'
]);

// ─── Index Construction & Persistence ─────────────────────────────────────────

/**
 * Builds the TF-IDF inverted index across supported workspace files.
 */
function buildSemanticIndex(rootDir: string, planningDir?: string): SemanticIndexData {
  const resolvedRoot = path.resolve(rootDir);
  const docs: Record<string, DocTermStats> = Object.create(null);
  const docFreq: Record<string, number> = Object.create(null);

  function scan(dir: string): void {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const e of entries) {
      if (IGNORED_DIRS.has(e.name)) continue;
      const full = path.join(dir, e.name);
      const rel = path.relative(resolvedRoot, full).replace(/\\/g, '/');

      if (e.isDirectory()) {
        scan(full);
      } else if (e.isFile()) {
        const ext = path.extname(e.name).toLowerCase();
        if (SUPPORTED_EXTS.has(ext)) {
          try {
            const content = fs.readFileSync(full, 'utf8');
            const tokens = tokenize(content);
            if (tokens.length === 0) continue;

            const termCounts: Record<string, number> = Object.create(null);
            const seenInDoc = new Set<string>();

            for (const t of tokens) {
              termCounts[t] = (termCounts[t] || 0) + 1;
              if (!seenInDoc.has(t)) {
                seenInDoc.add(t);
                docFreq[t] = (docFreq[t] || 0) + 1;
              }
            }

            // Extract first 150 non-empty characters as summary preview
            const preview = content.slice(0, 150).replace(/\s+/g, ' ').trim();

            docs[rel] = {
              file: rel,
              terms: termCounts,
              totalTerms: tokens.length,
              preview,
            };
          } catch {
            // Ignore unreadable files
          }
        }
      }
    }
  }

  scan(resolvedRoot);

  const indexData: SemanticIndexData = {
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    totalDocs: Object.keys(docs).length,
    docFreq,
    docs,
  };

  if (planningDir) {
    saveSemanticIndex(planningDir, indexData);
  }

  return indexData;
}

/**
 * Persists index to `.planning/intel/semantic-index.json`.
 */
function saveSemanticIndex(planningDir: string, data: SemanticIndexData): void {
  const intelDir = path.join(planningDir, 'intel');
  platformEnsureDir(intelDir);
  const outPath = path.join(intelDir, 'semantic-index.json');
  platformWriteSync(outPath, JSON.stringify(data));
}

/**
 * Loads index from `.planning/intel/semantic-index.json` (Lazy Load).
 */
function loadSemanticIndex(planningDir: string): SemanticIndexData | null {
  const indexPath = path.join(planningDir, 'intel', 'semantic-index.json');
  try {
    const raw = platformReadSync(indexPath);
    if (!raw) return null;
    return JSON.parse(raw) as SemanticIndexData;
  } catch {
    return null;
  }
}

// ─── Query Engine ─────────────────────────────────────────────────────────────

/**
 * Queries the semantic index for files matching a natural language query or concept.
 */
function querySemanticSimilarFiles(
  query: string,
  planningDir: string,
  rootDir?: string,
  limit: number = 5
): SemanticQueryResult[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  let index = loadSemanticIndex(planningDir);
  if (!index && rootDir) {
    index = buildSemanticIndex(rootDir, planningDir);
  }
  if (!index || index.totalDocs === 0) return [];

  const N = index.totalDocs;
  const scoredFiles: SemanticQueryResult[] = [];

  for (const doc of Object.values(index.docs)) {
    let score = 0;
    let matchingTokens = 0;

    for (const q of queryTokens) {
      const tf = (doc.terms[q] || 0) / (doc.totalTerms || 1);
      if (tf > 0) {
        matchingTokens++;
        const df = index.docFreq[q] || 1;
        const idf = Math.log(1 + N / df);
        score += tf * idf;
      }
    }

    // Blend in Jaccard token overlap boost
    if (matchingTokens > 0) {
      const jaccard = matchingTokens / (queryTokens.length + Object.keys(doc.terms).length - matchingTokens);
      const finalScore = Number((score * 100 + jaccard * 10).toFixed(4));
      if (finalScore > 0) {
        scoredFiles.push({
          file: doc.file,
          score: finalScore,
          preview: doc.preview,
        });
      }
    }
  }

  return scoredFiles.sort((a, b) => b.score - a.score).slice(0, limit);
}

export = {
  tokenize,
  buildSemanticIndex,
  saveSemanticIndex,
  loadSemanticIndex,
  querySemanticSimilarFiles,
};
