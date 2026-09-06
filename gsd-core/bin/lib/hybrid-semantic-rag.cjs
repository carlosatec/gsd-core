"use strict";
/**
 * Hybrid Semantic RAG Engine — Pure Node.js TF-IDF & Jaccard similarity engine.
 *
 * Persists an inverted index in `.planning/intel/semantic-index.json` with lazy loading,
 * ensuring fast semantic retrieval without native C++ / WASM dependencies (ADR D-01).
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const shell_command_projection_cjs_1 = require("./shell-command-projection.cjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const codebaseAst = require("./codebase-ast-analyzer.cjs");
const { loadCodebaseGraph } = codebaseAst;
// ─── Tokenizer & Helpers ──────────────────────────────────────────────────────
const STOP_WORDS = new Set([
    'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'in', 'to', 'for', 'of',
    'with', 'as', 'by', 'from', 'const', 'let', 'var', 'function', 'return', 'if', 'else',
    'import', 'export', 'type', 'interface', 'class', 'struct', 'default', 'true', 'false',
    'null', 'undefined', 'this', 'self', 'public', 'private', 'async', 'await',
]);
function tokenize(text) {
    // Tokenize words, camelCase, PascalCase, snake_case, and kebab-case
    const tokens = [];
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
// ─── Index Construction & Persistence ─────────────────────────────────────────
/**
 * Builds the BM25 inverted index across supported workspace files.
 */
function buildSemanticIndex(rootDir, planningDir) {
    const resolvedRoot = node_path_1.default.resolve(rootDir);
    const docs = Object.create(null);
    const docFreq = Object.create(null);
    let totalTermLength = 0;
    function scan(dir) {
        let entries = [];
        try {
            entries = node_fs_1.default.readdirSync(dir, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const e of entries) {
            if (IGNORED_DIRS.has(e.name))
                continue;
            const full = node_path_1.default.join(dir, e.name);
            const rel = node_path_1.default.relative(resolvedRoot, full).replace(/\\/g, '/');
            if (e.isDirectory()) {
                scan(full);
            }
            else if (e.isFile()) {
                const ext = node_path_1.default.extname(e.name).toLowerCase();
                if (SUPPORTED_EXTS.has(ext)) {
                    try {
                        const content = node_fs_1.default.readFileSync(full, 'utf8');
                        const tokens = tokenize(content);
                        if (tokens.length === 0)
                            continue;
                        const termCounts = Object.create(null);
                        const seenInDoc = new Set();
                        for (const t of tokens) {
                            termCounts[t] = (termCounts[t] || 0) + 1;
                            if (!seenInDoc.has(t)) {
                                seenInDoc.add(t);
                                docFreq[t] = (docFreq[t] || 0) + 1;
                            }
                        }
                        // Extract first 150 non-empty characters as summary preview
                        const preview = content.slice(0, 150).replace(/\s+/g, ' ').trim();
                        totalTermLength += tokens.length;
                        docs[rel] = {
                            file: rel,
                            terms: termCounts,
                            totalTerms: tokens.length,
                            termCount: Object.keys(termCounts).length,
                            preview,
                        };
                    }
                    catch {
                        // Ignore unreadable files
                    }
                }
            }
        }
    }
    scan(resolvedRoot);
    const totalDocs = Object.keys(docs).length;
    const avgdl = totalDocs > 0 ? Number((totalTermLength / totalDocs).toFixed(2)) : 50;
    const indexData = {
        version: '2.0.0-bm25',
        createdAt: new Date().toISOString(),
        totalDocs,
        avgdl,
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
function saveSemanticIndex(planningDir, data) {
    const intelDir = node_path_1.default.join(planningDir, 'intel');
    (0, shell_command_projection_cjs_1.platformEnsureDir)(intelDir);
    const outPath = node_path_1.default.join(intelDir, 'semantic-index.json');
    (0, shell_command_projection_cjs_1.platformWriteSync)(outPath, JSON.stringify(data));
}
/**
 * Loads index from `.planning/intel/semantic-index.json` (Lazy Load).
 */
function loadSemanticIndex(planningDir) {
    const indexPath = node_path_1.default.join(planningDir, 'intel', 'semantic-index.json');
    try {
        const raw = (0, shell_command_projection_cjs_1.platformReadSync)(indexPath);
        if (!raw)
            return null;
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
// ─── Query Engine ─────────────────────────────────────────────────────────────
/**
 * Queries the semantic index for files matching a natural language query or concept using Okapi BM25.
 */
function querySemanticSimilarFiles(query, planningDir, rootDir, limit = 5) {
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0)
        return [];
    let index = loadSemanticIndex(planningDir);
    if (!index && rootDir) {
        index = buildSemanticIndex(rootDir, planningDir);
    }
    if (!index || index.totalDocs === 0)
        return [];
    const N = index.totalDocs;
    const avgdl = index.avgdl || 50;
    const k1 = 1.5;
    const b = 0.75;
    // Load codebase graph for topological ranking enhancement
    let graph = null;
    try {
        graph = loadCodebaseGraph(planningDir);
    }
    catch {
        // Non-blocking
    }
    const pageRankScores = graph?.pageRankScores || {};
    const candidates = [];
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
    if (candidates.length === 0)
        return [];
    // 1) Rank candidates by lexical BM25 + Jaccard score (descending)
    candidates.sort((a, b) => b.lexicalScore - a.lexicalScore);
    const bm25Ranks = new Map();
    candidates.forEach((c, idx) => bm25Ranks.set(c.file, idx + 1));
    // 2) Rank candidates by topological PageRank score (descending)
    const topoRanks = new Map();
    const hasTopologicalGraph = Boolean(graph && Object.keys(pageRankScores).length > 0 && candidates.some(c => c.prScore > 0));
    if (hasTopologicalGraph) {
        const topoCandidates = [...candidates].sort((a, b) => b.prScore - a.prScore);
        topoCandidates.forEach((c, idx) => topoRanks.set(c.file, idx + 1));
    }
    else {
        // Salvaguarda de compatibilidade: neutralidade topológica quando grafo ausente
        candidates.forEach((c) => topoRanks.set(c.file, bm25Ranks.get(c.file) || 1));
    }
    // 3) Reciprocal Rank Fusion (k = 60, w_topo = 0.5)
    const k = 60;
    const wTopo = 0.5;
    const scoredFiles = candidates.map((c) => {
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
module.exports = {
    tokenize,
    buildSemanticIndex,
    saveSemanticIndex,
    loadSemanticIndex,
    querySemanticSimilarFiles,
};
