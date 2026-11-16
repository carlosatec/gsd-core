/**
 * Hybrid Semantic RAG Engine — Pure Node.js TF-IDF & Jaccard similarity engine.
 *
 * Persists an inverted index in `.planning/intel/semantic-index.json` with lazy loading,
 * ensuring fast semantic retrieval without native C++ / WASM dependencies (ADR D-01).
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { platformReadSync, platformWriteSync, platformEnsureDir, withFileLockSync } from './shell-command-projection.cjs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import codebaseAst = require('./codebase-ast-analyzer.cjs');
const { loadCodebaseGraph } = codebaseAst;

// ─── Types ────────────────────────────────────────────────────────────────────

interface DocTermStats {
  file: string;
  terms: Record<string, number>;
  totalTerms: number;
  termCount?: number;
  preview: string;
}

interface SemanticChunk extends DocTermStats {
  id: string;
  symbol?: string;
  section?: string;
  language: string;
  startLine: number;
  endLine: number;
  content: string;
}

interface IndexedFile {
  fingerprint: string;
  size: number;
  mtimeMs: number;
  chunkIds: string[];
}

interface SemanticIndexData {
  version: string;
  createdAt: string;
  totalDocs: number;
  avgdl: number;
  docFreq: Record<string, number>;
  docs: Record<string, DocTermStats>;
  chunks: Record<string, SemanticChunk>;
  files: Record<string, IndexedFile>;
  rootPath: string;
  diagnostics: { skippedFiles: number; truncatedFiles: number; indexedBytes: number };
}

interface SemanticQueryResult {
  file: string;
  score: number;
  preview: string;
}

interface SemanticChunkResult extends SemanticQueryResult {
  chunkId: string;
  content: string;
  startLine: number;
  endLine: number;
  language: string;
  symbol?: string;
  section?: string;
}

interface SemanticFilters {
  paths?: string[];
  languages?: string[];
  fileKinds?: Array<'source' | 'docs' | 'config' | 'styles' | 'database' | 'infra' | 'other'>;
  symbols?: string[];
  sections?: string[];
}

interface SemanticQueryOptions {
  limit?: number;
  topK?: number;
  filters?: SemanticFilters;
  diversity?: boolean | { lambda?: number };
  reranker?: (query: string, result: SemanticChunkResult) => number;
  semanticProvider?: { score: (query: string, chunk: SemanticChunkResult) => number };
  diagnostics?: (details: SemanticQueryDiagnostics) => void;
}

interface SemanticQueryDiagnostics {
  indexState: 'current' | 'stale' | 'missing';
  indexAgeMs: number | null;
  rebuilt: boolean;
  rebuildMs: number;
  queryMs: number;
  indexedChunks: number;
  filteredChunks: number;
  candidatePool: number;
  returnedChunks: number;
}

// ─── Tokenizer & Helpers ──────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'in', 'to', 'for', 'of',
  'with', 'as', 'by', 'from', 'const', 'let', 'var', 'function', 'return', 'if', 'else',
  'import', 'export', 'type', 'interface', 'class', 'struct', 'default', 'true', 'false',
  'null', 'undefined', 'this', 'self', 'public', 'private', 'async', 'await',
]);

function tokenize(text: string): string[] {
  // Tokenize words, camelCase, PascalCase, snake_case, and kebab-case
  const tokens: string[] = [];
  const rawWords = text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .toLowerCase()
    .split(/[^a-z0-9]+/);

  for (const w of rawWords) {
    if (w.length > 1 && !STOP_WORDS.has(w)) {
      tokens.push(w);
    }
  }
  return tokens;
}

const SUPPORTED_EXTS = new Set([
  // TypeScript & JavaScript
  '.ts', '.tsx', '.cts', '.mts', '.js', '.jsx', '.cjs', '.mjs',
  // Mobile & Swift
  '.swift', '.m', '.mm', '.dart',
  // Backend & Systems
  '.py', '.go', '.rs', '.cs', '.java', '.kt', '.php', '.rb',
  '.c', '.cpp', '.h', '.hpp',
  // Databases & Schemas
  '.sql', '.prisma', '.graphql', '.gql',
  // Styles & Templates
  '.css', '.scss', '.sass', '.less',
  '.html', '.htm', '.vue', '.svelte',
  // DevOps & Docs
  '.sh', '.bash', '.zsh', '.yaml', '.yml',
  '.json', '.md'
]);

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.turbo', '.planning', 'vendor',
  'Pods', '.gradle', 'DerivedData', '.build', 'xcuserdata', '.swiftpm', '__pycache__', '.venv', 'venv'
]);

const INDEX_VERSION = '3.0.0-chunks';
const MAX_FILE_BYTES = 256 * 1024;
const MAX_TOTAL_INDEXED_BYTES = 32 * 1024 * 1024;
const MAX_CHUNK_BYTES = 8 * 1024;
const MAX_CHUNK_LINES = 80;
const MAX_CHUNKS_PER_FILE = 64;

interface IgnoreRule { base: string; regex: RegExp; negate: boolean; }

function globToRegExp(pattern: string): RegExp {
  let source = '';
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === '*' && pattern[i + 1] === '*') {
      i++;
      if (pattern[i + 1] === '/') { i++; source += '(?:.*/)?'; }
      else source += '.*';
    } else if (char === '*') source += '[^/]*';
    else if (char === '?') source += '[^/]';
    else source += char.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
  }
  return new RegExp(source);
}

function readIgnoreRules(dir: string, root: string, inherited: IgnoreRule[]): IgnoreRule[] {
  const ignorePath = path.join(dir, '.gitignore');
  let content = '';
  try { content = fs.readFileSync(ignorePath, 'utf8'); } catch { return inherited; }
  const base = path.relative(root, dir).replace(/\\/g, '/');
  const rules = [...inherited];
  for (const raw of content.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const negate = trimmed.startsWith('!');
    let pattern = negate ? trimmed.slice(1) : trimmed;
    if (!pattern) continue;
    if (pattern.startsWith('\\#') || pattern.startsWith('\\!')) pattern = pattern.slice(1);
    pattern = pattern.replace(/\\ /g, ' ').replace(/\/$/, '');
    const anchored = pattern.startsWith('/');
    if (anchored) pattern = pattern.slice(1);
    const hasSlash = pattern.includes('/');
    const glob = globToRegExp(pattern).source;
    const regex = hasSlash || anchored ? new RegExp(`^${glob}(?:/.*)?$`) : new RegExp(`(?:^|/)${glob}(?:/.*)?$`);
    rules.push({ base, regex, negate });
  }
  return rules;
}

function isIgnored(relPath: string, rules: IgnoreRule[]): boolean {
  const normalized = relPath.replace(/\\/g, '/');
  let ignored = false;
  for (const rule of rules) {
    const relative = rule.base ? path.posix.relative(rule.base, normalized) : normalized;
    if (relative === '..' || relative.startsWith('../')) continue;
    if (rule.regex.test(relative)) ignored = !rule.negate;
  }
  return ignored;
}

function contentFingerprint(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function languageFor(file: string): string {
  return path.extname(file).slice(1).toLowerCase() || 'text';
}

function makeChunks(file: string, content: string): Array<Omit<SemanticChunk, 'terms' | 'totalTerms' | 'termCount'>> {
  const lines = content.split(/\r?\n/);
  const ext = path.extname(file).toLowerCase();
  const structural: Array<{ name: string; line: number }> = [];
  if (ext === '.md') {
    lines.forEach((line, i) => {
      const heading = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
      if (heading) structural.push({ name: heading[1], line: i + 1 });
    });
  } else if (SUPPORTED_EXTS.has(ext)) {
    try {
      const analysis = codebaseAst.analyzeSourceFile(file, content);
      for (const symbol of analysis.symbols || []) {
        if (Number.isInteger(symbol.line) && symbol.line > 0 && symbol.line <= lines.length) {
          structural.push({ name: symbol.name, line: symbol.line });
        }
      }
    } catch { /* bounded line fallback below */ }
  }

  structural.sort((a, b) => a.line - b.line || a.name.localeCompare(b.name));
  const boundaries = structural.filter((item, i) => i === 0 || structural[i - 1].line !== item.line);
  const units: Array<{ start: number; end: number; label?: string; isSymbol?: boolean }> = [];
  if (boundaries.length > 0) {
    const prefixEnd = Math.max(0, boundaries[0].line - 1);
    if (prefixEnd > 0) units.push({ start: 1, end: prefixEnd });
    boundaries.forEach((item, i) => {
      units.push({ start: item.line, end: (boundaries[i + 1]?.line || lines.length + 1) - 1, label: item.name, isSymbol: ext !== '.md' });
    });
  } else if (ext === '.md') {
    const headingLines = lines.map((line, i) => /^\s{0,3}#{1,6}\s+/.test(line) ? i + 1 : 0).filter(Boolean);
    if (headingLines.length) {
      const prefixEnd = headingLines[0] - 1;
      if (prefixEnd > 0) units.push({ start: 1, end: prefixEnd });
      headingLines.forEach((start, i) => units.push({ start, end: (headingLines[i + 1] || lines.length + 1) - 1, label: lines[start - 1].replace(/^\s*#+\s*/, '').trim() }));
    }
  }
  if (units.length === 0) {
    for (let start = 1; start <= lines.length; start += MAX_CHUNK_LINES) {
      units.push({ start, end: Math.min(lines.length, start + MAX_CHUNK_LINES - 1) });
    }
  }

  const chunks: Array<Omit<SemanticChunk, 'terms' | 'totalTerms' | 'termCount'>> = [];
  for (const unit of units) {
    let start = unit.start;
    while (start <= unit.end && chunks.length < MAX_CHUNKS_PER_FILE) {
      let end = Math.min(unit.end, start + MAX_CHUNK_LINES - 1);
      while (end > start && Buffer.byteLength(lines.slice(start - 1, end).join('\n'), 'utf8') > MAX_CHUNK_BYTES) end--;
      if (end === start && Buffer.byteLength(lines[start - 1] || '', 'utf8') > MAX_CHUNK_BYTES) {
        const line = lines[start - 1];
        const pieces: string[] = [];
        let piece = '';
        for (const char of line) {
          if (piece && Buffer.byteLength(piece + char, 'utf8') > MAX_CHUNK_BYTES) { pieces.push(piece); piece = ''; }
          piece += char;
        }
        if (piece) pieces.push(piece);
        pieces.forEach((part, index) => {
          const startLine = start;
          const id = contentFingerprint(`${file}\0${startLine}\0${part}`).slice(0, 24);
          chunks.push({ id, file, symbol: unit.isSymbol ? unit.label : undefined, section: unit.isSymbol ? undefined : unit.label, language: languageFor(file), startLine, endLine: startLine, content: part, preview: part.slice(0, 150).replace(/\s+/g, ' ').trim() });
        });
        start++;
        continue;
      }
      const text = lines.slice(start - 1, end).join('\n');
      if (text.trim()) {
        const id = contentFingerprint(`${file}\0${start}\0${text}`).slice(0, 24);
        chunks.push({ id, file, symbol: unit.isSymbol ? unit.label : undefined, section: unit.isSymbol ? undefined : unit.label, language: languageFor(file), startLine: start, endLine: end, content: text, preview: text.slice(0, 150).replace(/\s+/g, ' ').trim() });
      }
      start = end + 1;
    }
    if (chunks.length >= MAX_CHUNKS_PER_FILE) break;
  }
  return chunks;
}

// ─── Index Construction & Persistence ─────────────────────────────────────────

/**
 * Builds the BM25 inverted index across supported workspace files.
 */
function buildSemanticIndex(rootDir: string, planningDir?: string): SemanticIndexData {
  const resolvedRoot = path.resolve(rootDir);
  const previous = planningDir ? loadSemanticIndex(planningDir) : null;
  const docs: Record<string, DocTermStats> = Object.create(null) as Record<string, DocTermStats>;
  const chunks: Record<string, SemanticChunk> = Object.create(null) as Record<string, SemanticChunk>;
  const files: Record<string, IndexedFile> = Object.create(null) as Record<string, IndexedFile>;
  const docFreq: Record<string, number> = Object.create(null) as Record<string, number>;
  let totalTermLength = 0;
  let indexedBytes = 0;
  let skippedFiles = 0;
  let truncatedFiles = 0;

  function scan(dir: string, inheritedRules: IgnoreRule[] = []): void {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));
    const ignoreRules = readIgnoreRules(dir, resolvedRoot, inheritedRules);
    for (const e of entries) {
      if (IGNORED_DIRS.has(e.name)) continue;
      const full = path.join(dir, e.name);
      const rel = path.relative(resolvedRoot, full).replace(/\\/g, '/');
      if (rel.startsWith('../') || path.isAbsolute(rel)) continue;
      if (isIgnored(rel, ignoreRules)) continue;

      if (e.isDirectory()) {
        scan(full, ignoreRules);
      } else if (e.isFile()) {
        const ext = path.extname(e.name).toLowerCase();
        if (SUPPORTED_EXTS.has(ext)) {
          try {
            const stat = fs.statSync(full);
            if (!stat.isFile() || stat.size > MAX_FILE_BYTES || indexedBytes + stat.size > MAX_TOTAL_INDEXED_BYTES) {
              skippedFiles++;
              continue;
            }
            const content = fs.readFileSync(full, 'utf8');
            const fingerprint = contentFingerprint(content);
            const priorFile = previous?.rootPath === resolvedRoot ? previous.files?.[rel] : undefined;
            let fileChunks: SemanticChunk[] = [];
            if (priorFile?.fingerprint === fingerprint && priorFile.size === stat.size) {
              fileChunks = priorFile.chunkIds.map(id => previous?.chunks?.[id]).filter((chunk): chunk is SemanticChunk => Boolean(chunk));
            }
            if (fileChunks.length === 0 && tokenize(content).length > 0) {
              const contentChunks = makeChunks(rel, content);
              fileChunks = contentChunks.map(chunk => {
                const tokens = tokenize(chunk.content);
                const terms: Record<string, number> = Object.create(null) as Record<string, number>;
                for (const token of tokens) terms[token] = (terms[token] || 0) + 1;
                return { ...chunk, terms, totalTerms: tokens.length, termCount: Object.keys(terms).length };
              });
            }
            if (fileChunks.length >= MAX_CHUNKS_PER_FILE) truncatedFiles++;
            if (fileChunks.length === 0) continue;

            const fileTerms: Record<string, number> = Object.create(null) as Record<string, number>;
            const fileSeen = new Set<string>();
            let fileLength = 0;
            for (const chunk of fileChunks) {
              chunks[chunk.id] = chunk;
              fileLength += chunk.totalTerms;
              for (const [term, count] of Object.entries(chunk.terms)) {
                fileTerms[term] = (fileTerms[term] || 0) + count;
                if (!fileSeen.has(term)) {
                  fileSeen.add(term);
                  docFreq[term] = (docFreq[term] || 0) + 1;
                }
              }
            }
            docs[rel] = { file: rel, terms: fileTerms, totalTerms: fileLength, termCount: Object.keys(fileTerms).length, preview: fileChunks[0].preview };
            files[rel] = { fingerprint, size: stat.size, mtimeMs: stat.mtimeMs, chunkIds: fileChunks.map(chunk => chunk.id) };
            indexedBytes += stat.size;
            totalTermLength += fileLength;
          } catch {
            // Ignore unreadable files
          }
        }
      }
    }
  }

  scan(resolvedRoot);

  const totalDocs = Object.keys(docs).length;
  const avgdl = totalDocs > 0 ? Number((totalTermLength / totalDocs).toFixed(2)) : 50;

  const indexData: SemanticIndexData = {
    version: INDEX_VERSION,
    createdAt: new Date().toISOString(),
    totalDocs,
    avgdl,
    docFreq,
    docs,
    chunks,
    files,
    rootPath: resolvedRoot,
    diagnostics: { skippedFiles, truncatedFiles, indexedBytes },
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
  withFileLockSync(outPath, () => platformWriteSync(outPath, JSON.stringify(data)));
}

/**
 * Loads index from `.planning/intel/semantic-index.json` (Lazy Load).
 */
function loadSemanticIndex(planningDir: string): SemanticIndexData | null {
  const indexPath = path.join(planningDir, 'intel', 'semantic-index.json');
  try {
    const raw = platformReadSync(indexPath);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SemanticIndexData;
    if (parsed.version !== INDEX_VERSION || !parsed.docs || !parsed.chunks || !parsed.files || !Number.isFinite(parsed.totalDocs)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function indexIsFresh(rootDir: string, index: SemanticIndexData): boolean {
  const root = path.resolve(rootDir);
  if (index.rootPath !== root) return false;
  const current = new Map<string, { fingerprint: string; size: number }>();
  let bytes = 0;
  function scan(dir: string, inheritedRules: IgnoreRule[] = []): void {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    const ignoreRules = readIgnoreRules(dir, root, inheritedRules);
    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full).replace(/\\/g, '/');
      if (rel.startsWith('../') || path.isAbsolute(rel)) continue;
      if (isIgnored(rel, ignoreRules)) continue;
      if (entry.isDirectory()) { scan(full, ignoreRules); continue; }
      if (!entry.isFile() || !SUPPORTED_EXTS.has(path.extname(entry.name).toLowerCase())) continue;
      try {
        const stat = fs.statSync(full);
        if (stat.size > MAX_FILE_BYTES || bytes + stat.size > MAX_TOTAL_INDEXED_BYTES) continue;
        const content = fs.readFileSync(full, 'utf8');
        if (!tokenize(content).length) continue;
        current.set(rel, { fingerprint: contentFingerprint(content), size: stat.size });
        bytes += stat.size;
      } catch { /* unreadable inputs stay out of the freshness manifest */ }
    }
  }
  scan(root);
  const indexedPaths = Object.keys(index.files || {});
  if (current.size !== indexedPaths.length) return false;
  for (const [file, value] of current) {
    const indexed = index.files[file];
    if (!indexed || indexed.fingerprint !== value.fingerprint || indexed.size !== value.size) return false;
  }
  return true;
}

function getFileKind(file: string): NonNullable<SemanticFilters['fileKinds']>[number] {
  const ext = path.extname(file).toLowerCase();
  if (['.md', '.mdx', '.txt', '.rst'].includes(ext)) return 'docs';
  if (['.css', '.scss', '.sass', '.less'].includes(ext)) return 'styles';
  if (['.sql', '.prisma', '.graphql', '.gql'].includes(ext)) return 'database';
  if (['.yaml', '.yml', '.sh', '.bash', '.zsh', '.dockerfile'].includes(ext) || /(^|\/)(Dockerfile|Makefile|Justfile)$/i.test(file)) return 'infra';
  if (['.json', '.toml', '.ini', '.xml'].includes(ext)) return 'config';
  if (['.ts', '.tsx', '.cts', '.mts', '.js', '.jsx', '.cjs', '.mjs', '.swift', '.m', '.mm', '.dart', '.py', '.go', '.rs', '.cs', '.java', '.kt', '.php', '.rb', '.c', '.cpp', '.h', '.hpp', '.html', '.htm', '.vue', '.svelte'].includes(ext)) return 'source';
  return 'other';
}

function validateFilters(filters: SemanticFilters | undefined): SemanticFilters {
  if (!filters) return {};
  const validKinds = new Set(['source', 'docs', 'config', 'styles', 'database', 'infra', 'other']);
  for (const key of ['paths', 'languages', 'symbols', 'sections'] as const) {
    const values = filters[key];
    if (values !== undefined && (!Array.isArray(values) || values.length > 100 || values.some(value => typeof value !== 'string' || value.length > 256))) {
      throw new TypeError(`Invalid RAG ${key} filter: expected up to 100 strings of at most 256 characters`);
    }
  }
  if (filters.fileKinds !== undefined && (!Array.isArray(filters.fileKinds) || filters.fileKinds.some(kind => !validKinds.has(kind)))) {
    throw new TypeError('Invalid RAG fileKinds filter');
  }
  return filters;
}

// ─── Query Engine ─────────────────────────────────────────────────────────────

/**
 * Queries the semantic index for files matching a natural language query or concept using Okapi BM25.
 */
function querySemanticSimilarFilesLegacy(
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
  const avgdl = index.avgdl || 50;
  const k1 = 1.5;
  const b = 0.75;
  // Load codebase graph for topological ranking enhancement
  let graph: ReturnType<typeof loadCodebaseGraph> = null;
  try {
    graph = loadCodebaseGraph(planningDir);
  } catch {
    // Non-blocking
  }
  const pageRankScores = graph?.pageRankScores || {};

  interface CandidateMatch {
    file: string;
    preview: string;
    lexicalScore: number;
    prScore: number;
  }
  const candidates: CandidateMatch[] = [];

  for (const doc of Object.values(index.docs)) {
    let bm25Score = 0;
    let matchingTokens = 0;
    const dl = doc.totalTerms || 1;

    for (const q of queryTokens) {
      const tf = doc.terms[q] || 0;
      if (tf > 0) {
        matchingTokens++;
        const df = index.docFreq[q] || 1;
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        const num = tf * (k1 + 1);
        const denom = tf + k1 * (1 - b + b * (dl / avgdl));
        bm25Score += idf * (num / denom);
      }
    }

    if (matchingTokens > 0) {
      const uniqueCount = doc.termCount || Object.keys(doc.terms).length;
      const jaccard = matchingTokens / (queryTokens.length + uniqueCount - matchingTokens);
      const prScore = pageRankScores[doc.file] || 0;
      const fileData = graph?.files[doc.file];
      const exportBonus = fileData && fileData.exports.length > 0 ? Math.min(2, fileData.exports.length * 0.2) : 0;
      const lexicalScore = bm25Score * 10 + jaccard * 10 + exportBonus;

      candidates.push({
        file: doc.file,
        preview: doc.preview,
        lexicalScore,
        prScore,
      });
    }
  }

  if (candidates.length === 0) return [];

  // 1) Rank candidates by lexical BM25 + Jaccard score (descending)
  candidates.sort((a, b) => b.lexicalScore - a.lexicalScore);
  const bm25Ranks = new Map<string, number>();
  candidates.forEach((c, idx) => bm25Ranks.set(c.file, idx + 1));

  // 2) Rank candidates by topological PageRank score (descending)
  const topoRanks = new Map<string, number>();
  const hasTopologicalGraph = Boolean(graph && Object.keys(pageRankScores).length > 0 && candidates.some(c => c.prScore > 0));
  if (hasTopologicalGraph) {
    const topoCandidates = [...candidates].sort((a, b) => b.prScore - a.prScore);
    topoCandidates.forEach((c, idx) => topoRanks.set(c.file, idx + 1));
  } else {
    // Salvaguarda de compatibilidade: neutralidade topológica quando grafo ausente
    candidates.forEach((c) => topoRanks.set(c.file, bm25Ranks.get(c.file) || 1));
  }

  // 3) Reciprocal Rank Fusion (k = 60, w_topo = 0.5)
  const k = 60;
  const wTopo = 0.5;
  const scoredFiles: SemanticQueryResult[] = candidates.map((c) => {
    const rBm25 = bm25Ranks.get(c.file) || 1;
    const rTopo = topoRanks.get(c.file) || 1;
    const rrfScore = Number(((1 / (k + rBm25)) + (wTopo / (k + rTopo))).toFixed(4));
    return {
      file: c.file,
      score: rrfScore,
      preview: c.preview,
    };
  });

  return scoredFiles.sort((a, b) => b.score - a.score).slice(0, limit);
}

function querySemanticChunks(
  query: string,
  planningDir: string,
  rootDir?: string,
  options: SemanticQueryOptions = {}
): SemanticChunkResult[] {
  const queryStarted = Date.now();
  const queryTokens = [...new Set(tokenize(query))].slice(0, 24);
  if (queryTokens.length === 0) return [];
  let index = loadSemanticIndex(planningDir);
  const previousIndex = index;
  const fresh = Boolean(index && rootDir && indexIsFresh(rootDir, index));
  const indexState: SemanticQueryDiagnostics['indexState'] = !index ? 'missing' : (rootDir && !fresh ? 'stale' : 'current');
  let rebuildMs = 0;
  if (rootDir && (!index || !fresh)) {
    const rebuildStarted = Date.now();
    index = buildSemanticIndex(rootDir, planningDir);
    rebuildMs = Date.now() - rebuildStarted;
  }
  const diagnostics = (filteredChunks: number, candidatePool: number, returnedChunks: number) => {
    if (!options.diagnostics) return;
    const createdAt = Date.parse(index?.createdAt || '');
    options.diagnostics({
      indexState, indexAgeMs: Number.isFinite(createdAt) ? Math.max(0, Date.now() - createdAt) : null,
      rebuilt: Boolean(rootDir && (!previousIndex || !fresh)), rebuildMs, queryMs: Date.now() - queryStarted,
      indexedChunks: Object.keys(index?.chunks || {}).length, filteredChunks, candidatePool, returnedChunks,
    });
  };
  if (!index || !Object.keys(index.chunks).length) { diagnostics(0, 0, 0); return []; }

  const filters = validateFilters(options.filters);
  const matchesFilters = (chunk: SemanticChunk) => {
    if (filters.paths?.length && !filters.paths.some(prefix => chunk.file === prefix || chunk.file.startsWith(prefix.replace(/\\/g, '/').replace(/\/$/, '') + '/'))) return false;
    if (filters.languages?.length && !filters.languages.some(language => language.toLowerCase() === chunk.language)) return false;
    if (filters.fileKinds?.length && !filters.fileKinds.includes(getFileKind(chunk.file))) return false;
    if (filters.symbols?.length && !filters.symbols.some(symbol => chunk.symbol?.toLowerCase().includes(symbol.toLowerCase()))) return false;
    if (filters.sections?.length && !filters.sections.some(section => chunk.section?.toLowerCase().includes(section.toLowerCase()))) return false;
    return true;
  };
  const allChunks = Object.values(index.chunks).filter(matchesFilters);
  if (allChunks.length === 0) { diagnostics(0, 0, 0); return []; }
  const N = allChunks.length;
  const avgdl = allChunks.reduce((sum, chunk) => sum + Math.max(1, chunk.totalTerms), 0) / N;
  const df: Record<string, number> = Object.create(null) as Record<string, number>;
  for (const chunk of allChunks) for (const term of new Set(Object.keys(chunk.terms))) df[term] = (df[term] || 0) + 1;

  let graph: ReturnType<typeof loadCodebaseGraph> = null;
  try { graph = loadCodebaseGraph(planningDir); } catch { /* local lexical fallback */ }
  const pageRank = graph?.pageRankScores || {};
  const candidates = allChunks.map(chunk => {
    let bm25 = 0;
    let matching = 0;
    for (const term of queryTokens) {
      const tf = chunk.terms[term] || 0;
      if (!tf) continue;
      matching++;
      const termDf = df[term] || 0;
      const idf = Math.log(1 + (N - termDf + 0.5) / (termDf + 0.5));
      const k1 = 1.5; const b = 0.75; const dl = Math.max(1, chunk.totalTerms);
      bm25 += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * dl / avgdl));
    }
    if (!matching) return null;
    const jaccard = matching / Math.max(1, queryTokens.length + Object.keys(chunk.terms).length - matching);
    const graphFile = graph?.files[chunk.file];
    const exportBonus = graphFile && graphFile.exports.length ? Math.min(2, graphFile.exports.length * 0.2) : 0;
    return { chunk, lexicalScore: bm25 * 10 + jaccard * 10 + exportBonus, pageRank: pageRank[chunk.file] || 0 };
  }).filter((item): item is NonNullable<typeof item> => item !== null);
  if (!candidates.length) { diagnostics(allChunks.length, 0, 0); return []; }
  const lexical = [...candidates].sort((a, b) => b.lexicalScore - a.lexicalScore || a.chunk.file.localeCompare(b.chunk.file) || a.chunk.startLine - b.chunk.startLine || a.chunk.id.localeCompare(b.chunk.id));
  const topK = Math.max(1, Math.min(200, Math.floor(options.topK ?? 80)));
  const pool = lexical.slice(0, topK);
  const topo = [...pool].sort((a, b) => b.pageRank - a.pageRank || a.chunk.file.localeCompare(b.chunk.file) || a.chunk.startLine - b.chunk.startLine);
  const topoRank = new Map(topo.map((item, i) => [item.chunk.id, i + 1]));
  const lexicalRank = new Map(pool.map((item, i) => [item.chunk.id, i + 1]));
  let results: SemanticChunkResult[] = pool.map(item => {
    const lexRank = lexicalRank.get(item.chunk.id) || 1;
    const graphRank = item.pageRank > 0 ? (topoRank.get(item.chunk.id) || lexRank) : lexRank;
    const result: SemanticChunkResult = {
      file: item.chunk.file, score: 1 / (60 + lexRank) + 0.5 / (60 + graphRank),
      preview: item.chunk.preview, chunkId: item.chunk.id, content: item.chunk.content,
      startLine: item.chunk.startLine, endLine: item.chunk.endLine, language: item.chunk.language,
      symbol: item.chunk.symbol, section: item.chunk.section,
    };
    let score = result.score;
    if (options.semanticProvider) {
      try { const value = options.semanticProvider.score(query, result); if (Number.isFinite(value)) score += Math.max(-1, Math.min(1, value)) * 0.01; } catch { /* deterministic fallback */ }
    }
    if (options.reranker) {
      try { const value = options.reranker(query, result); if (Number.isFinite(value)) score = value; } catch { /* deterministic fallback */ }
    }
    return { ...result, score };
  }).sort((a, b) => b.score - a.score || a.file.localeCompare(b.file) || a.startLine - b.startLine || a.chunkId.localeCompare(b.chunkId));

  if (options.diversity) {
    const lambda = typeof options.diversity === 'object' && Number.isFinite(options.diversity.lambda) ? Math.max(0, Math.min(1, options.diversity.lambda as number)) : 0.72;
    const remaining = [...results]; const selected: SemanticChunkResult[] = [];
    const tokens = new Map(remaining.map(hit => [hit.chunkId, new Set(tokenize(hit.content))]));
    const similarity = (a: SemanticChunkResult, b: SemanticChunkResult) => {
      if (a.file === b.file && a.startLine <= b.endLine && b.startLine <= a.endLine) return 1;
      const left = tokens.get(a.chunkId) || new Set<string>(); const right = tokens.get(b.chunkId) || new Set<string>();
      let intersection = 0; for (const term of left) if (right.has(term)) intersection++;
      return intersection / Math.max(1, left.size + right.size - intersection);
    };
    const count = Math.max(0, Math.min(200, Math.floor(options.limit ?? 5)));
    while (remaining.length && selected.length < count) {
      let best = 0; let bestValue = -Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const relevance = remaining[i].score / Math.max(...results.map(item => item.score), 1e-9);
        const redundancy = selected.length ? Math.max(...selected.map(item => similarity(remaining[i], item))) : 0;
        const value = lambda * relevance - (1 - lambda) * redundancy;
        if (value > bestValue) { bestValue = value; best = i; }
      }
      selected.push(remaining.splice(best, 1)[0]);
    }
    results = selected;
  }
  const output = results.slice(0, Math.max(0, Math.min(200, Math.floor(options.limit ?? 5))));
  diagnostics(allChunks.length, pool.length, output.length);
  return output;
}

function querySemanticSimilarFiles(
  query: string,
  planningDir: string,
  rootDir?: string,
  limit = 5,
): SemanticQueryResult[] {
  const hits = querySemanticChunks(query, planningDir, rootDir, { limit: Math.max(80, limit), topK: Math.max(80, limit) });
  const unique = new Map<string, SemanticQueryResult>();
  for (const hit of hits) if (!unique.has(hit.file)) unique.set(hit.file, { file: hit.file, score: hit.score, preview: hit.preview });
  return [...unique.values()].slice(0, Math.max(0, limit));
}

export = {
  tokenize,
  buildSemanticIndex,
  saveSemanticIndex,
  loadSemanticIndex,
  querySemanticSimilarFiles,
  querySemanticChunks,
  indexIsFresh,
  querySemanticSimilarFilesLegacy,
};
