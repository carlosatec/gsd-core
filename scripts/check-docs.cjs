#!/usr/bin/env node
'use strict';

/**
 * check-docs.cjs
 *
 * Documentation Integrity, Link Auditor & AI Guidance Reporter for GSD Core Nexus.
 *
 * Capabilities:
 * - Scans all markdown files (Root, docs/, docs/pt-BR/) for broken relative links (zero 404).
 * - Automatically fixes renamed/moved file links and subfolder depth offsets with --fix.
 * - Audits i18n parity between English docs/ and Portuguese docs/pt-BR/.
 * - Verifies SemVer version consistency across READMEs, USER-GUIDE, and package.json.
 * - Generates structured, actionable checklists and prompts to guide AI agents in updating docs.
 *
 * Usage:
 *   node scripts/check-docs.cjs           # audit link health and parity
 *   node scripts/check-docs.cjs --fix     # auto-rewrite links to moved/renamed docs
 *   node scripts/check-docs.cjs --prompt  # generate structured AI update instructions
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(ROOT, 'docs');
const PT_BR_DIR = path.join(DOCS_DIR, 'pt-BR');

// ─── Known Renamed & Moved File Map ──────────────────────────────────────────

const RENAMED_TARGET_MAP = {
  'TUTORIAL.md': 'docs/tutorials/practical-tutorial.md',
  'TUTORIAL.pt-BR.md': 'docs/pt-BR/tutorials/tutorial-pratico.md',
  'TEST-EXAMPLES.md': 'docs/reference/test-examples.md',
  'TESTING-STANDARDS.md': 'docs/contributing/testing-standards.md',
  'VERSIONING.md': 'docs/reference/versioning.md',
  'CLI-TOOLS.md': 'docs/reference/CLI-TOOLS.md',
  'TESTING-SUITES.md': 'docs/reference/TESTING-SUITES.md',
  'json-errors.md': 'docs/reference/json-errors.md',
  'installer-migrations.md': 'docs/reference/installer-migrations.md',
  'BETA.md': 'docs/reference/BETA.md',
  'CANARY.md': 'docs/reference/CANARY.md',
  'ship-pr-body-sections.md': 'docs/reference/ship-pr-body-sections.md',
  'workflow-discuss-mode.md': 'docs/reference/workflow-discuss-mode.md',
  'context-monitor.md': 'docs/how-to/monitor-context.md',
  'branching.md': 'docs/how-to/git-branching.md',
  'branch-protection.md': 'docs/how-to/setup-branch-protection.md',
  'manual-update.md': 'docs/how-to/manual-update.md',
  'issue-driven-orchestration.md': 'docs/how-to/issue-driven-orchestration.md',
  'contributor-standards.md': 'docs/contributing/contributor-standards.md',
  'RELEASE-NOTES-LEGACY.md': 'docs/archive/RELEASE-NOTES-LEGACY.md',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPackageVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    return pkg.version || '2.8.1';
  } catch {
    return '2.8.1';
  }
}

function getAllMarkdownFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'dist') {
        getAllMarkdownFiles(fullPath, fileList);
      }
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      fileList.push(fullPath);
    }
  }

  return fileList;
}

// ─── 1. Relative Link Auditor & Smart Fixer ───────────────────────────────────

function auditAndFixMarkdownLinks(files, autoFix = false) {
  const brokenLinks = [];
  let totalFixed = 0;

  for (const file of files) {
    let content = fs.readFileSync(file, 'utf8');
    const originalContent = content;
    const fileDir = path.dirname(file);
    const relFromRoot = path.relative(ROOT, file).replace(/\\/g, '/');

    // Skip ADRs, historical archives, discussions, and internal inventory manifests from hard fail
    const isHistorical =
      relFromRoot.startsWith('docs/adr/') ||
      relFromRoot.startsWith('docs/archive/') ||
      relFromRoot.startsWith('docs/discussions/') ||
      relFromRoot.startsWith('docs/prd/') ||
      relFromRoot.startsWith('docs/design/') ||
      relFromRoot.startsWith('docs/research/') ||
      relFromRoot.includes('INVENTORY.md') ||
      relFromRoot === 'CHANGELOG.md' ||
      relFromRoot === 'CONTEXT.md';

    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

    content = content.replace(linkRegex, (fullMatch, text, target) => {
      if (!target) return fullMatch;
      const rawTarget = target.trim();

      // Skip external, anchors, mailto, template expressions, code samples
      if (
        rawTarget.startsWith('http://') ||
        rawTarget.startsWith('https://') ||
        rawTarget.startsWith('mailto:') ||
        rawTarget.startsWith('#') ||
        rawTarget.includes('${') ||
        rawTarget.startsWith('{') ||
        rawTarget.startsWith('//') ||
        rawTarget.startsWith('/home/') ||
        rawTarget.startsWith('C:') ||
        rawTarget.includes('`')
      ) {
        return fullMatch;
      }

      const [cleanPath, anchor] = rawTarget.split('#');
      const [cleanTarget] = cleanPath.split('?');
      if (!cleanTarget) return fullMatch;

      let resolvedPath;
      if (cleanTarget.startsWith('/')) {
        resolvedPath = path.join(ROOT, cleanTarget.slice(1));
      } else {
        resolvedPath = path.resolve(fileDir, cleanTarget);
      }

      if (fs.existsSync(resolvedPath)) {
        return fullMatch;
      }

      // Check if candidate matches a known renamed target
      const targetBase = path.basename(cleanTarget);
      if (RENAMED_TARGET_MAP[targetBase]) {
        const canonicalRel = RENAMED_TARGET_MAP[targetBase];
        const isPtBr = relFromRoot.startsWith('docs/pt-BR/');
        let targetAbs = path.join(ROOT, canonicalRel);

        if (isPtBr && canonicalRel.startsWith('docs/')) {
          const ptCandidate = path.join(ROOT, 'docs', 'pt-BR', canonicalRel.slice(5));
          if (fs.existsSync(ptCandidate)) {
            targetAbs = ptCandidate;
          }
        }

        if (fs.existsSync(targetAbs)) {
          if (autoFix) {
            let newTarget = path.relative(fileDir, targetAbs).replace(/\\/g, '/');
            if (anchor) newTarget += `#${anchor}`;
            totalFixed++;
            return `[${text}](${newTarget})`;
          }
        }
      }

      // Smart Depth Heuristic: Was the link written relative to docs/ or ROOT?
      const candidates = [
        path.resolve(DOCS_DIR, cleanTarget),
        path.resolve(PT_BR_DIR, cleanTarget),
        path.resolve(ROOT, cleanTarget),
      ];

      for (const cand of candidates) {
        if (fs.existsSync(cand)) {
          if (autoFix) {
            let newTarget = path.relative(fileDir, cand).replace(/\\/g, '/');
            if (anchor) newTarget += `#${anchor}`;
            totalFixed++;
            return `[${text}](${newTarget})`;
          }
        }
      }

      if (!isHistorical) {
        brokenLinks.push({
          sourceFile: relFromRoot,
          linkText: text,
          target: rawTarget,
          resolvedPath: path.relative(ROOT, resolvedPath).replace(/\\/g, '/'),
        });
      }

      return fullMatch;
    });

    if (autoFix && content !== originalContent) {
      fs.writeFileSync(file, content, 'utf8');
    }
  }

  return { brokenLinks, totalFixed };
}

// ─── 2. i18n Parity Auditor ──────────────────────────────────────────────────

function auditI18nParity() {
  const missingInPtBr = [];
  const enFiles = getAllMarkdownFiles(DOCS_DIR).filter(f => !f.includes(path.sep + 'pt-BR' + path.sep));

  for (const enFile of enFiles) {
    const relFromDocs = path.relative(DOCS_DIR, enFile);
    // Focus on primary Diataxis documentation
    if (
      relFromDocs.startsWith('archive') ||
      relFromDocs.startsWith('adr') ||
      relFromDocs.startsWith('design') ||
      relFromDocs.startsWith('prd') ||
      relFromDocs.startsWith('research') ||
      relFromDocs.startsWith('discussions') ||
      relFromDocs.startsWith('issueevidence') ||
      relFromDocs.startsWith('proposals') ||
      relFromDocs.startsWith('agents') ||
      relFromDocs.startsWith('skills') ||
      relFromDocs.startsWith('registries')
    ) {
      continue;
    }

    const ptBrFile = path.join(PT_BR_DIR, relFromDocs);
    if (!fs.existsSync(ptBrFile)) {
      missingInPtBr.push(relFromDocs.replace(/\\/g, '/'));
    }
  }

  return missingInPtBr;
}

// ─── 3. Version Consistency Checker ──────────────────────────────────────────

function auditVersionConsistency(pkgVersion) {
  const discrepancies = [];
  const majorMinor = pkgVersion.split('.').slice(0, 2).join('.');

  const keyFiles = [
    { path: 'README.md', pattern: new RegExp(`version-${pkgVersion}`, 'i') },
    { path: 'README.pt-BR.md', pattern: new RegExp(`version-${pkgVersion}`, 'i') },
    { path: 'docs/USER-GUIDE.md', pattern: new RegExp(`GSD Core Nexus ${majorMinor}`, 'i') },
    { path: 'docs/pt-BR/USER-GUIDE.md', pattern: new RegExp(`GSD Core Nexus ${majorMinor}`, 'i') },
  ];

  for (const item of keyFiles) {
    const abs = path.join(ROOT, item.path);
    if (fs.existsSync(abs)) {
      const content = fs.readFileSync(abs, 'utf8');
      if (!item.pattern.test(content)) {
        discrepancies.push({
          file: item.path,
          expected: `Match for version ${pkgVersion} / ${majorMinor}`,
        });
      }
    }
  }

  return discrepancies;
}

// ─── 4. AI Guidance Generator ────────────────────────────────────────────────

function generateAiGuidanceReport(pkgVersion, brokenLinks, missingI18n, versionDiscrepancies, totalFixed) {
  const lines = [
    '┌────────────────────────────────────────────────────────────────────────┐',
    '│ 📋 GSD Documentation Audit & AI Guidance Report                        │',
    '├────────────────────────────────────────────────────────────────────────┤',
    `│ • Repository Version:     ${pkgVersion.padEnd(44)} │`,
    `│ • Broken Links (404):     ${String(brokenLinks.length).padEnd(44)} │`,
    `│ • Auto-Fixed Links:       ${String(totalFixed).padEnd(44)} │`,
    `│ • Missing Core i18n Docs: ${String(missingI18n.length).padEnd(44)} │`,
    `│ • Version Discrepancies:  ${String(versionDiscrepancies.length).padEnd(44)} │`,
    '└────────────────────────────────────────────────────────────────────────┘',
  ];

  if (brokenLinks.length > 0) {
    lines.push('', '🔴 BROKEN RELATIVE LINKS FOUND:');
    for (const b of brokenLinks.slice(0, 15)) {
      lines.push(`  - In [${b.sourceFile}]: Target "${b.target}" -> Missing "${b.resolvedPath}"`);
    }
    if (brokenLinks.length > 15) {
      lines.push(`  ... and ${brokenLinks.length - 15} more broken links.`);
    }
  }

  if (versionDiscrepancies.length > 0) {
    lines.push('', '⚠️ VERSION DISCREPANCIES DETECTED:');
    for (const v of versionDiscrepancies) {
      lines.push(`  - [${v.file}]: Expected version ${pkgVersion}`);
    }
  }

  if (missingI18n.length > 0) {
    lines.push('', '🌐 MISSING PORTUGUESE (pt-BR) TRANSLATIONS (Core Diataxis):');
    for (const m of missingI18n.slice(0, 10)) {
      lines.push(`  - docs/${m} -> Missing in docs/pt-BR/${m}`);
    }
    if (missingI18n.length > 10) {
      lines.push(`  ... and ${missingI18n.length - 10} more untranslated docs.`);
    }
  }

  lines.push('', '🤖 ACTIONABLE GUIDANCE FOR AI ASSISTANT / DEVELOPER:');
  if (brokenLinks.length === 0 && versionDiscrepancies.length === 0) {
    lines.push('  ✅ Documentation is 100% healthy, synchronized and ready for release!');
  } else {
    lines.push('  1. Review and fix the relative links listed above to match the new Diataxis structure (or run with --fix).');
    lines.push('  2. Sychronize version headers to match package.json version ' + pkgVersion + '.');
    lines.push('  3. Ensure translations in docs/pt-BR/ reflect recent architecture updates.');
  }

  return lines.join('\n');
}

// ─── Main Execution ──────────────────────────────────────────────────────────

function runAudit() {
  const args = process.argv.slice(2);
  const autoFix = args.includes('--fix');
  const pkgVersion = getPackageVersion();

  const allMdFiles = [
    ...getAllMarkdownFiles(ROOT).filter(f => {
      const rel = path.relative(ROOT, f);
      return !rel.includes(path.sep) && rel.endsWith('.md');
    }),
    ...getAllMarkdownFiles(DOCS_DIR),
  ];

  const { brokenLinks, totalFixed } = auditAndFixMarkdownLinks(allMdFiles, autoFix);
  const missingI18n = auditI18nParity();
  const versionDiscrepancies = auditVersionConsistency(pkgVersion);

  const report = generateAiGuidanceReport(pkgVersion, brokenLinks, missingI18n, versionDiscrepancies, totalFixed);
  console.log(report);

  if (brokenLinks.length > 0) {
    process.exitCode = 1;
  } else {
    process.exitCode = 0;
  }
}

runAudit();
