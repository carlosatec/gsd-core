/**
 * Obsidian Interoperability & Bidirectional Wikilinks Engine — GSD Core Nexus 3.1
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

import fs from 'node:fs';
import path from 'node:path';
import { platformReadSync, platformWriteSync, platformEnsureDir } from './shell-command-projection.cjs';
import { stripInlineCode } from './markdown-sectionizer.cjs';

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface WikilinkReference {
  raw: string;
  target: string;
  alias?: string;
  sourceFile: string;
  line: number;
}

interface BacklinkNode {
  id: string;
  targetType: 'decision' | 'phase' | 'spec' | 'code' | 'doc' | 'unknown';
  filePath?: string;
  incoming: Array<{
    sourceFile: string;
    line: number;
    context: string;
  }>;
  outgoing: string[];
}

interface BacklinkIndexReport {
  timestamp: string;
  totalLinks: number;
  totalNodes: number;
  unresolvedTargets: string[];
  nodes: Record<string, BacklinkNode>;
}

// ─── Wikilink Parser Engine ───────────────────────────────────────────────────

// Global regex for [[target|alias]] patterns. Safe for concurrent matchAll iterators.
const WIKILINK_REGEX = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

/**
 * Extracts all `[[wikilink]]` references from a single Markdown text.
 */
function extractWikilinks(content: string, sourceFile: string): WikilinkReference[] {
  const links: WikilinkReference[] = [];
  const lines = content.split('\n');
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i];
    if (lineText.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const sanitizedLine = stripInlineCode(lineText);
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
function resolveTargetType(target: string): BacklinkNode['targetType'] {
  if (/^D-\d+$/i.test(target) || /^decision/i.test(target)) return 'decision';
  if (/^\d{2}-\d{2}-PLAN/i.test(target) || /^phase/i.test(target)) return 'phase';
  if (/SPEC/i.test(target)) return 'spec';
  if (/\.(ts|js|cts|cjs|py|go|rs|cs|c|h|kt|swift|dart)$/i.test(target)) return 'code';
  if (/\.md$/i.test(target) || /ARCHITECTURE|APIS|ROADMAP|STATE/i.test(target)) return 'doc';
  return 'unknown';
}

/**
 * Scans `.planning/` and root context markdown files to build a complete bidirectional backlink index.
 */
function buildBacklinkIndex(planningDir: string, rootDir?: string): BacklinkIndexReport {
  const root = rootDir ?? path.dirname(planningDir);
  const nodes: Record<string, BacklinkNode> = {};
  const unresolvedTargets = new Set<string>();
  let totalLinks = 0;

  const ensureNode = (id: string, filePath?: string): BacklinkNode => {
    if (!nodes[id]) {
      nodes[id] = {
        id,
        targetType: resolveTargetType(id),
        filePath,
        incoming: [],
        outgoing: [],
      };
    } else if (filePath && !nodes[id].filePath) {
      nodes[id].filePath = filePath;
    }
    return nodes[id];
  };

  // Find all relevant Markdown files
  const mdFiles: string[] = [];

  const scanDir = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!['node_modules', '.git', 'dist', 'coverage', '.dsh'].includes(entry.name)) {
          scanDir(fullPath);
        }
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        mdFiles.push(fullPath);
      }
    }
  };

  scanDir(planningDir);

  // Root context markdown files
  const rootMarkdownCandidates = ['GEMINI.md', 'AGENTS.md', 'README.md', 'TUTORIAL.md', 'TUTORIAL.pt-BR.md'];
  for (const rmc of rootMarkdownCandidates) {
    const full = path.join(root, rmc);
    if (fs.existsSync(full)) {
      mdFiles.push(full);
    }
  }

  // Process files
  for (const file of mdFiles) {
    const relPath = path.relative(root, file).replace(/\\/g, '/');
    const content = platformReadSync(file) || '';
    const fileId = path.basename(file, '.md');

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
function saveBacklinkIndex(planningDir: string, rootDir?: string): { report: BacklinkIndexReport; filePath: string } {
  const root = rootDir ?? path.dirname(planningDir);
  const report = buildBacklinkIndex(planningDir, root);

  const intelDir = path.join(planningDir, 'intel');
  platformEnsureDir(intelDir);

  const filePath = path.join(intelDir, 'backlinks.json');
  platformWriteSync(filePath, JSON.stringify(report, null, 2));

  return { report, filePath };
}

export = {
  extractWikilinks,
  resolveTargetType,
  buildBacklinkIndex,
  saveBacklinkIndex,
};
