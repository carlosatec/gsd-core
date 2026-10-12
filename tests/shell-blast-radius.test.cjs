'use strict';

/**
 * Phase 32 Wave 4 Unit Suite: Shell Command Blast Radius
 *
 * Validates:
 * 1. Lexical detection of destructive shell commands (rm -rf, git reset --hard, git clean, force push).
 * 2. Whitelisting of routine developer commands (npm test, git status, git diff, tsc).
 * 3. Dry-run simulation of affected file counts.
 * 4. Interactive confirmation requirement vs non-interactive bypass.
 * 5. Formatting of Command Risk Reports.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const shellBlast = require('../gsd-core/bin/lib/shell-blast-radius.cjs');
const { inspectCommandRisk, formatRiskReport, simulateCommandImpact } = shellBlast;

describe('Phase 32 Wave 4 — Command Risk Lexer & Detection', () => {
  it('classifies safe development commands with zero destructive risk', () => {
    const safeCommands = [
      'npm test',
      'git status',
      'git diff',
      'tsc --noEmit',
      'node scripts/run-tests.cjs',
    ];

    for (const cmd of safeCommands) {
      const report = inspectCommandRisk(cmd);
      assert.equal(report.isDestructive, false, `Expected ${cmd} to be safe`);
      assert.equal(report.riskLevel, 'safe');
      assert.equal(report.requiresConfirmation, false);
    }
  });

  it('detects rm -rf commands as critical destructive operations', () => {
    const report = inspectCommandRisk('rm -rf dist/ build/', { nonInteractive: false });
    assert.equal(report.isDestructive, true);
    assert.equal(report.category, 'file_deletion');
    assert.equal(report.riskLevel, 'critical');
    assert.equal(report.requiresConfirmation, true);
    assert.ok(report.warning && report.warning.includes('CRITICAL'));
  });

  it('detects git reset --hard and git clean as high/critical operations', () => {
    const resetReport = inspectCommandRisk('git reset --hard HEAD~1', { nonInteractive: false });
    assert.equal(resetReport.isDestructive, true);
    assert.equal(resetReport.category, 'git_reset');
    assert.equal(resetReport.riskLevel, 'critical');
    assert.equal(resetReport.requiresConfirmation, true);

    const cleanReport = inspectCommandRisk('git clean -fd', { nonInteractive: false });
    assert.equal(cleanReport.isDestructive, true);
    assert.equal(cleanReport.category, 'git_clean');
    assert.equal(cleanReport.riskLevel, 'high');
  });

  it('detects git push --force as critical operation', () => {
    const pushReport = inspectCommandRisk('git push origin main --force', { nonInteractive: false });
    assert.equal(pushReport.isDestructive, true);
    assert.equal(pushReport.category, 'git_force_push');
    assert.equal(pushReport.riskLevel, 'critical');
  });
});

describe('Phase 32 Wave 4 — Dry-Run Simulation & Blast Radius Impact', () => {
  it('simulates file impact count for recursive directory removal', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-blast-rm-'));
    const targetDir = path.join(tmpDir, 'build-artifacts');
    fs.mkdirSync(targetDir, { recursive: true });

    // Populate dummy files
    for (let i = 0; i < 5; i++) {
      fs.writeFileSync(path.join(targetDir, `file-${i}.tmp`), `content ${i}`);
    }

    const report = inspectCommandRisk(`rm -rf ${targetDir}`, { cwd: tmpDir });
    assert.equal(report.isDestructive, true);
    assert.ok(report.affectedCount >= 5);
    assert.ok(report.affectedResources.some(f => f.includes('file-0.tmp')));
  });

  it('directly invokes simulateCommandImpact helper', () => {
    const sim = simulateCommandImpact('git push --force origin main', 'git_force_push');
    assert.ok(sim.details.includes('Remote git branch history'));
  });
});

describe('Phase 32 Wave 4 — Non-Interactive Bypass & Markdown Reporting', () => {
  it('enforces non-interactive bypass without requiring confirmation', () => {
    const report = inspectCommandRisk('rm -rf temp/', { nonInteractive: true });
    assert.equal(report.isDestructive, true);
    assert.equal(report.requiresConfirmation, false);
    assert.equal(report.bypassNonInteractive, true);
  });

  it('formats risk report into clear markdown representation', () => {
    const report = inspectCommandRisk('rm -rf target/', { nonInteractive: false });
    const formatted = formatRiskReport(report);

    assert.ok(formatted.includes('### [GSD Command Blast Radius: CRITICAL]'));
    assert.ok(formatted.includes('file_deletion'));
    assert.ok(formatted.includes('Ação Requerida'));
  });
});
