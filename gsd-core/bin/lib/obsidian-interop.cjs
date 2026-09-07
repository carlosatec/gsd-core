"use strict";
/**
 * Obsidian Interoperability & Bidirectional Wikilinks Engine — GSD Core Nexus 3.2
 *
 * Implements native parsing, resolution, and bidirectional backlink indexing
 * for Obsidian-style `[[wikilinks]]` in `.planning/` Markdown documents.
 *
 * Key Capabilities:
 * - Extracts `[[target]]` and `[[target|alias]]` references
 * - Resolves targets against Decisions (D-XX), Phases (XX-YY-PLAN), Specs, and Codebase files
 * - Builds and saves the bidirectional graph index to `.planning/intel/backlinks.json`
 * - Guarantees `.planning/` functions seamlessly as an Obsidian Vault
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const shell_command_projection_cjs_1 = require("./shell-command-projection.cjs");
const markdown_sectionizer_cjs_1 = require("./markdown-sectionizer.cjs");
// ─── Wikilink Parser Engine ───────────────────────────────────────────────────
// Global regex for [[target|alias]] patterns. Safe for concurrent matchAll iterators.
const WIKILINK_REGEX = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
/**
 * Extracts all `[[wikilink]]` references from a single Markdown text.
 */
function extractWikilinks(content, sourceFile) {
    const links = [];
    const lines = content.split('\n');
    let inCodeBlock = false;
    for (let i = 0; i < lines.length; i++) {
        const lineText = lines[i];
        if (lineText.trim().startsWith('```')) {
            inCodeBlock = !inCodeBlock;
            continue;
        }
        if (inCodeBlock)
            continue;
        const sanitizedLine = (0, markdown_sectionizer_cjs_1.stripInlineCode)(lineText);
        const matches = sanitizedLine.matchAll(WIKILINK_REGEX);
        for (const match of matches) {
            const target = match[1].trim();
            const alias = match[2] ? match[2].trim() : undefined;
            links.push({
                raw: match[0],
                target,
                alias,
                sourceFile,
                line: i + 1,
            });
        }
    }
    return links;
}
/**
 * Resolves the target type of a given wikilink.
 */
function resolveTargetType(target) {
    if (/^D-\d+$/i.test(target) || /^decision/i.test(target))
        return 'decision';
    if (/^\d{2}-\d{2}-PLAN/i.test(target) || /^phase/i.test(target))
        return 'phase';
    if (/SPEC/i.test(target))
        return 'spec';
    if (/\.(ts|js|cts|cjs|py|go|rs|cs|c|h|kt|swift|dart)$/i.test(target))
        return 'code';
    if (/\.md$/i.test(target) || /ARCHITECTURE|APIS|ROADMAP|STATE/i.test(target))
        return 'doc';
    return 'unknown';
}
/**
 * Scans `.planning/` and root context markdown files to build a complete bidirectional backlink index.
 */
function buildBacklinkIndex(planningDir, rootDir) {
    const root = rootDir ?? node_path_1.default.dirname(planningDir);
    const nodes = {};
    const unresolvedTargets = new Set();
    let totalLinks = 0;
    const ensureNode = (id, filePath) => {
        if (!nodes[id]) {
            nodes[id] = {
                id,
                targetType: resolveTargetType(id),
                filePath,
                incoming: [],
                outgoing: [],
            };
        }
        else if (filePath && !nodes[id].filePath) {
            nodes[id].filePath = filePath;
        }
        return nodes[id];
    };
    // Find all relevant Markdown files
    const mdFiles = [];
    const scanDir = (dir) => {
        if (!node_fs_1.default.existsSync(dir))
            return;
        const entries = node_fs_1.default.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = node_path_1.default.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (!['node_modules', '.git', 'dist', 'coverage', '.dsh'].includes(entry.name)) {
                    scanDir(fullPath);
                }
            }
            else if (entry.isFile() && entry.name.endsWith('.md')) {
                mdFiles.push(fullPath);
            }
        }
    };
    scanDir(planningDir);
    // Root context markdown files
    const rootMarkdownCandidates = ['GEMINI.md', 'AGENTS.md', 'README.md', 'TUTORIAL.md', 'TUTORIAL.pt-BR.md'];
    for (const rmc of rootMarkdownCandidates) {
        const full = node_path_1.default.join(root, rmc);
        if (node_fs_1.default.existsSync(full)) {
            mdFiles.push(full);
        }
    }
    // Process files
    for (const file of mdFiles) {
        const relPath = node_path_1.default.relative(root, file).replace(/\\/g, '/');
        const content = (0, shell_command_projection_cjs_1.platformReadSync)(file) || '';
        const fileId = node_path_1.default.basename(file, '.md');
        ensureNode(fileId, relPath);
        const extracted = extractWikilinks(content, relPath);
        const lines = content.split('\n');
        for (const link of extracted) {
            totalLinks++;
            const targetId = link.target;
            const targetNode = ensureNode(targetId);
            const sourceNode = ensureNode(fileId, relPath);
            if (!sourceNode.outgoing.includes(targetId)) {
                sourceNode.outgoing.push(targetId);
            }
            const context = lines[link.line - 1] ? lines[link.line - 1].trim() : '';
            targetNode.incoming.push({
                sourceFile: relPath,
                line: link.line,
                context,
            });
            if (targetNode.targetType === 'unknown') {
                unresolvedTargets.add(targetId);
            }
        }
    }
    return {
        timestamp: new Date().toISOString(),
        totalLinks,
        totalNodes: Object.keys(nodes).length,
        unresolvedTargets: Array.from(unresolvedTargets),
        nodes,
    };
}
/**
 * Persists the backlink index into `.planning/intel/backlinks.json`.
 */
function saveBacklinkIndex(planningDir, rootDir) {
    const root = rootDir ?? node_path_1.default.dirname(planningDir);
    const report = buildBacklinkIndex(planningDir, root);
    const intelDir = node_path_1.default.join(planningDir, 'intel');
    (0, shell_command_projection_cjs_1.platformEnsureDir)(intelDir);
    const filePath = node_path_1.default.join(intelDir, 'backlinks.json');
    (0, shell_command_projection_cjs_1.platformWriteSync)(filePath, JSON.stringify(report, null, 2));
    return { report, filePath };
}
module.exports = {
    extractWikilinks,
    resolveTargetType,
    buildBacklinkIndex,
    saveBacklinkIndex,
};
