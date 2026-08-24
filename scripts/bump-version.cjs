#!/usr/bin/env node
'use strict';

/**
 * bump-version.cjs
 *
 * Single-command unified version management and release orchestrator for GSD Core Nexus.
 *
 * Synchronizes package.json, package-lock.json, vscode/package.json,
 * capability descriptors (capabilities/*), plugin manifests, markdown badges,
 * core TypeScript modules (src/*.cts), and runs the complete derived artifact
 * regeneration and validation pipeline.
 *
 * Usage:
 *   node scripts/bump-version.cjs 2.7.0          # bump to 2.7.0 and regenerate all derived files
 *   node scripts/bump-version.cjs --check        # verify 100% lockstep sync across repo
 *   node scripts/bump-version.cjs 2.7.0 --dry-run # preview changes without writing
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const {
  syncManifestVersions,
  syncCapabilityVersions,
  findDrift,
  findCapabilityDrift,
  getPackageVersion,
  listCapabilityManifests,
} = require('./sync-manifest-versions.cjs');

const SEMVER_RE = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;

function validateSemVer(version) {
  if (!version || typeof version !== 'string' || !SEMVER_RE.test(version.trim())) {
    throw new Error(`Invalid semantic version "${version}". Expected format X.Y.Z (e.g. 2.6.0, 2.7.0).`);
  }
  return version.trim();
}

function getMajorMinor(version) {
  const parts = version.split('.');
  return `${parts[0]}.${parts[1]}`;
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

/**
 * Updates package.json and package-lock.json version fields.
 */
function updatePackageManifests(root, version, dryRun = false) {
  const changed = [];

  // 1. package.json
  const pkgPath = path.join(root, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = readJson(pkgPath);
    if (pkg.version !== version) {
      pkg.version = version;
      if (!dryRun) writeJson(pkgPath, pkg);
      changed.push('package.json');
    }
  }

  // 2. package-lock.json
  const lockPath = path.join(root, 'package-lock.json');
  if (fs.existsSync(lockPath)) {
    const lock = readJson(lockPath);
    let lockModified = false;
    if (lock.version !== version) {
      lock.version = version;
      lockModified = true;
    }
    if (lock.packages && lock.packages[''] && lock.packages[''].version !== version) {
      lock.packages[''].version = version;
      lockModified = true;
    }
    if (lockModified) {
      if (!dryRun) writeJson(lockPath, lock);
      changed.push('package-lock.json');
    }
  }

  return changed;
}

/**
 * Updates documentation files (READMEs, TUTORIALs, COMMAND references) with new version & majorMinor.
 */
function updateDocumentationFiles(root, version, majorMinor, dryRun = false) {
  const changed = [];

  // 1. README badges & headers
  for (const rel of ['README.md', 'README.pt-BR.md']) {
    const abs = path.join(root, rel);
    if (fs.existsSync(abs)) {
      let content = fs.readFileSync(abs, 'utf8');
      const prev = content;
      content = content.replace(
        /img\.shields\.io\/badge\/version-([^-\s]+)-/g,
        `img.shields.io/badge/version-${version}-`
      );
      content = content.replace(/GSD Core Nexus \d+\.\d+/g, `GSD Core Nexus ${majorMinor}`);
      if (content !== prev) {
        if (!dryRun) fs.writeFileSync(abs, content, 'utf8');
        changed.push(rel);
      }
    }
  }

  // 2. TUTORIALs
  for (const rel of ['TUTORIAL.md', 'TUTORIAL.pt-BR.md']) {
    const abs = path.join(root, rel);
    if (fs.existsSync(abs)) {
      let content = fs.readFileSync(abs, 'utf8');
      const prev = content;
      content = content.replace(/GSD Core Nexus \d+\.\d+/g, `GSD Core Nexus ${majorMinor}`);
      content = content.replace(/GSD \d+\.\d+ CANONICAL INTERFACE/g, `GSD ${majorMinor} CANONICAL INTERFACE`);
      content = content.replace(/INTERFACE CANÔNICA GSD \d+\.\d+/g, `INTERFACE CANÔNICA GSD ${majorMinor}`);
      content = content.replace(/INTERFACE CANONICA GSD \d+\.\d+/g, `INTERFACE CANONICA GSD ${majorMinor}`);
      if (content !== prev) {
        if (!dryRun) fs.writeFileSync(abs, content, 'utf8');
        changed.push(rel);
      }
    }
  }

  // 3. Command References
  for (const rel of ['docs/COMMANDS.md', 'docs/pt-BR/COMMANDS.md']) {
    const abs = path.join(root, rel);
    if (fs.existsSync(abs)) {
      let content = fs.readFileSync(abs, 'utf8');
      const prev = content;
      content = content.replace(/Canonical Unified Interface \(GSD \d+\.\d+\)/g, `Canonical Unified Interface (GSD ${majorMinor})`);
      content = content.replace(/Interface Canônica Unificada \(GSD \d+\.\d+\)/g, `Interface Canônica Unificada (GSD ${majorMinor})`);
      content = content.replace(/Starting in GSD \d+\.\d+/g, `Starting in GSD ${majorMinor}`);
      content = content.replace(/A partir do GSD \d+\.\d+/g, `A partir do GSD ${majorMinor}`);
      if (content !== prev) {
        if (!dryRun) fs.writeFileSync(abs, content, 'utf8');
        changed.push(rel);
      }
    }
  }

  return changed;
}

/**
 * Updates core TypeScript source files in src/*.cts with the new version / majorMinor.
 */
function updateCoreSourceModules(root, version, majorMinor, dryRun = false) {
  const changed = [];

  // 1. src/auto-upgrade-engine.cts
  const autoUpgradePath = path.join(root, 'src', 'auto-upgrade-engine.cts');
  if (fs.existsSync(autoUpgradePath)) {
    let content = fs.readFileSync(autoUpgradePath, 'utf8');
    const prev = content;
    content = content.replace(/version:\s*['"]\d+\.\d+\.\d+['"]/g, `version: '${version}'`);
    content = content.replace(/GSD Core Nexus \d+\.\d+/g, `GSD Core Nexus ${majorMinor}`);
    if (content !== prev) {
      if (!dryRun) fs.writeFileSync(autoUpgradePath, content, 'utf8');
      changed.push('src/auto-upgrade-engine.cts');
    }
  }

  // 2. src/living-docs-engine.cts
  const livingDocsPath = path.join(root, 'src', 'living-docs-engine.cts');
  if (fs.existsSync(livingDocsPath)) {
    let content = fs.readFileSync(livingDocsPath, 'utf8');
    const prev = content;
    content = content.replace(/GSD Core Nexus \d+\.\d+ Living Docs/g, `GSD Core Nexus ${majorMinor} Living Docs`);
    if (content !== prev) {
      if (!dryRun) fs.writeFileSync(livingDocsPath, content, 'utf8');
      changed.push('src/living-docs-engine.cts');
    }
  }

  // 3. src/i18n-descriptions.cts
  const i18nPath = path.join(root, 'src', 'i18n-descriptions.cts');
  if (fs.existsSync(i18nPath)) {
    let content = fs.readFileSync(i18nPath, 'utf8');
    const prev = content;
    content = content.replace(/GSD Nexus \d+\.\d+/g, `GSD Nexus ${majorMinor}`);
    content = content.replace(/GSD Core Nexus \d+\.\d+/g, `GSD Core Nexus ${majorMinor}`);
    if (content !== prev) {
      if (!dryRun) fs.writeFileSync(i18nPath, content, 'utf8');
      changed.push('src/i18n-descriptions.cts');
    }
  }

  // 4. src/unified-workflow-hub.cts
  const hubPath = path.join(root, 'src', 'unified-workflow-hub.cts');
  if (fs.existsSync(hubPath)) {
    let content = fs.readFileSync(hubPath, 'utf8');
    const prev = content;
    content = content.replace(/GSD Core Nexus \d+\.\d+/g, `GSD Core Nexus ${majorMinor}`);
    if (content !== prev) {
      if (!dryRun) fs.writeFileSync(hubPath, content, 'utf8');
      changed.push('src/unified-workflow-hub.cts');
    }
  }

  return changed;
}

/**
 * Checks if repository artifacts are in sync with the specified (or package.json) version.
 */
function checkRepositoryVersionSync(opts = {}) {
  const root = opts.root || ROOT;
  const version = opts.version || getPackageVersion(root);
  const majorMinor = getMajorMinor(version);
  const drift = [];

  // Check manifest drifts
  drift.push(...findDrift({ root, version }));
  drift.push(...findCapabilityDrift({ root, version }));

  // Check README badges
  for (const rel of ['README.md', 'README.pt-BR.md']) {
    const abs = path.join(root, rel);
    if (fs.existsSync(abs)) {
      const content = fs.readFileSync(abs, 'utf8');
      const m = content.match(/img\.shields\.io\/badge\/version-([^-\s]+)-/);
      if (m && m[1] !== version) {
        drift.push({ manifest: rel, found: m[1], expected: version });
      }
    }
  }

  // Check TUTORIALs
  for (const rel of ['TUTORIAL.md', 'TUTORIAL.pt-BR.md']) {
    const abs = path.join(root, rel);
    if (fs.existsSync(abs)) {
      const content = fs.readFileSync(abs, 'utf8');
      const m = content.match(/GSD Core Nexus (\d+\.\d+)/);
      if (m && m[1] !== majorMinor) {
        drift.push({ manifest: rel, found: m[1], expected: majorMinor });
      }
    }
  }

  // Check src/auto-upgrade-engine.cts
  const autoUpgradePath = path.join(root, 'src', 'auto-upgrade-engine.cts');
  if (fs.existsSync(autoUpgradePath)) {
    const content = fs.readFileSync(autoUpgradePath, 'utf8');
    const m = content.match(/version:\s*['"]([^'"]+)['"]/);
    if (m && m[1] !== version) {
      drift.push({ manifest: 'src/auto-upgrade-engine.cts', found: m[1], expected: version });
    }
  }

  return drift;
}

/**
 * Orchestrates full bump pipeline.
 */
function bumpVersion(targetVersion, opts = {}) {
  const root = opts.root || ROOT;
  const version = validateSemVer(targetVersion);
  const majorMinor = getMajorMinor(version);
  const dryRun = Boolean(opts.dryRun);
  const skipRegen = Boolean(opts.skipRegen);
  const skipLint = Boolean(opts.skipLint);

  const report = {
    targetVersion,
    majorMinor,
    manifestsUpdated: [],
    docsUpdated: [],
    coreModulesUpdated: [],
    capabilitiesUpdated: [],
  };

  // 1. Update package.json and package-lock.json
  report.manifestsUpdated.push(...updatePackageManifests(root, version, dryRun));

  // 2. Update Documentation (README, TUTORIAL, COMMANDS)
  report.docsUpdated.push(...updateDocumentationFiles(root, version, majorMinor, dryRun));

  // 3. Update Core TypeScript modules
  report.coreModulesUpdated.push(...updateCoreSourceModules(root, version, majorMinor, dryRun));

  // 4. Update Registered Manifests and Capabilities
  if (!dryRun) {
    report.manifestsUpdated.push(...syncManifestVersions({ root, version }));
    report.capabilitiesUpdated.push(...syncCapabilityVersions({ root, version }));
  }

  if (dryRun) {
    return report;
  }

  // 5. Run Derived Regeneration Pipeline
  if (!skipRegen) {
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    execFileSync(npmCmd, ['run', 'regen:derived'], { cwd: root, stdio: 'inherit' });
  }

  // 6. Run Quality Verification Gates
  if (!skipLint) {
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    execFileSync(npmCmd, ['run', 'lint:generated-sync'], { cwd: root, stdio: 'inherit' });
    execFileSync(npmCmd, ['run', 'lint'], { cwd: root, stdio: 'inherit' });
  }

  return report;
}

module.exports = {
  validateSemVer,
  getMajorMinor,
  updatePackageManifests,
  updateDocumentationFiles,
  updateCoreSourceModules,
  checkRepositoryVersionSync,
  bumpVersion,
};

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
GSD Core Nexus — Unified Version Manager

Usage:
  node scripts/bump-version.cjs <version>       Bump version across all 49+ manifests, core modules, badges, and regen derived files
  node scripts/bump-version.cjs --check         Check if all files are in 100% lockstep sync with package.json
  node scripts/bump-version.cjs <version> --dry-run  Preview all files that would be modified

Examples:
  node scripts/bump-version.cjs 2.6.0
  node scripts/bump-version.cjs 2.7.0
  node scripts/bump-version.cjs --check
`);
  } else if (args.includes('--check')) {
    const drift = checkRepositoryVersionSync();
    if (drift.length > 0) {
      console.error('❌ Version drift detected:');
      for (const d of drift) {
        console.error(`  - ${d.manifest}: found ${d.found}, expected ${d.expected}`);
      }
      console.error('\nRun `node scripts/bump-version.cjs <version>` to fix.');
      process.exitCode = 1;
    } else {
      const totalCaps = listCapabilityManifests().length;
      console.log(`✅ All package manifests, ${totalCaps} capability descriptors, core modules, and documentation files are in 100% lockstep sync at version ${getPackageVersion()}.`);
    }
  } else {
    const targetVersion = args[0];
    const dryRun = args.includes('--dry-run');
    const skipRegen = args.includes('--skip-regen');
    const skipLint = args.includes('--skip-lint');

    try {
      console.log(`🚀 ${dryRun ? '[DRY-RUN] ' : ''}Bumping GSD Core Nexus version to ${targetVersion}...`);
      const report = bumpVersion(targetVersion, { dryRun, skipRegen, skipLint });

      console.log(`\n✨ Version bump to ${report.targetVersion} (Nexus ${report.majorMinor}) complete!`);
      console.log(`  - Package Manifests: ${report.manifestsUpdated.length} files`);
      console.log(`  - Capabilities: ${report.capabilitiesUpdated.length} descriptors`);
      console.log(`  - Core Modules: ${report.coreModulesUpdated.length} modules`);
      console.log(`  - Documentation Files: ${report.docsUpdated.length} files`);
    } catch (err) {
      console.error(`❌ Error during version bump: ${err.message}`);
      process.exitCode = 1;
    }
  }
}
