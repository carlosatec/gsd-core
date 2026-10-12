'use strict';

/**
 * Phase 32 Wave 2 Unit Suite: Compact-Keeper & Task Drift Anchor
 *
 * Validates:
 * 1. Extraction of active position, phase, and decisions from STATE.md.
 * 2. Parsing of active wave and task from PLAN.md.
 * 3. High-fidelity Markdown formatting of CompactDossier.
 * 4. Persistence and retrieval of dossier in .planning/intel/compact-dossier.json.
 * 5. Task Drift Anchor: soft warning emission when edits target undeclared files.
 * 6. Integration with PreFlight Guardrails: SCOPE_VIOLATION warnings on task drift.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const compactKeeper = require('../gsd-core/bin/lib/compact-keeper.cjs');
const preFlight = require('../gsd-core/bin/lib/preflight-guardrails.cjs');

const {
  buildCompactDossier,
  formatCompactDossier,
  saveCompactDossier,
  loadLatestCompactDossier,
  checkTaskDrift,
  parseStatePosition,
  parseActiveWaveAndTask,
} = compactKeeper;

const { runPreFlightChecks } = preFlight;

describe('Phase 32 Wave 2 — Compact-Keeper State & Plan Parsers', () => {
  it('parses active position and phase correctly from STATE.md content', () => {
    const mockState = [
      '# Project State',
      '- **Current Phase:** Phase 32 (In-Process Mod Architecture, Output Diet & Command Blast Radius)',
      '- **Status:** In Progress',
      '- **Active Plan:** .planning/phases/32-in-process/32-01-PLAN.md',
    ].join('\n');

    const pos = parseStatePosition(mockState);
    assert.ok(pos);
    assert.equal(pos.number, '32');
    assert.ok(pos.name.includes('In-Process Mod Architecture'));
    assert.equal(pos.status, 'In Progress');
    assert.equal(pos.plan, '.planning/phases/32-in-process/32-01-PLAN.md');
  });

  it('parses active wave and first uncompleted task from PLAN.md content', () => {
    const mockPlan = [
      '# Phase 32 Plan',
      '### Wave 1: Output Diet',
      '- [x] **Task 1.1: Completed task**',
      '### Wave 2: Compact-Keeper & Task Drift Anchor',
      '- [ ] **Task 2.1: Micro-Dossier de Fidelidade Pós-Compactação**',
      '- [ ] **Task 2.2: Task Drift Anchor no Pre-Tool Use**',
    ].join('\n');

    const waveTask = parseActiveWaveAndTask(mockPlan);
    assert.ok(waveTask);
    assert.ok(waveTask.wave && waveTask.wave.includes('Wave 2'));
    assert.ok(waveTask.task && waveTask.task.includes('Task 2.1'));
  });
});

describe('Phase 32 Wave 2 — CompactDossier Generation, Formatting & Persistence', () => {
  it('builds, saves and reloads a CompactDossier in a fixture environment', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-dossier-'));
    const planningDir = path.join(tmpDir, '.planning');
    const intelDir = path.join(planningDir, 'intel');
    fs.mkdirSync(intelDir, { recursive: true });

    const stateMd = [
      '# Project State',
      '- **Current Phase:** Phase 32 — Output Diet',
      '- **Status:** Executing Wave 2',
      '## Decisions',
      '- **D-01:** Native AST analysis without external runtime.',
      '- **D-02:** Living docs synchronized with code.',
    ].join('\n');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), stateMd, 'utf8');

    // Create a dummy file in src/
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'sample.ts'), 'export const a = 1;\n', 'utf8');

    const dossier = buildCompactDossier(tmpDir, { planningDir });
    assert.ok(dossier);
    assert.equal(dossier.activePhase?.number, '32');
    assert.ok(dossier.canonicalDecisions.length >= 2);
    assert.ok(dossier.recentModifiedFiles.length > 0);

    const formattedMd = formatCompactDossier(dossier);
    assert.ok(formattedMd.includes('### [GSD Compact-Keeper: Micro-Dossier de Fidelidade Pós-Compactação]'));
    assert.ok(formattedMd.includes('Phase 32'));
    assert.ok(formattedMd.includes('D-01'));

    const savedPath = saveCompactDossier(dossier, tmpDir);
    assert.ok(fs.existsSync(savedPath));

    const loaded = loadLatestCompactDossier(tmpDir);
    assert.ok(loaded);
    assert.equal(loaded.activePhase?.number, '32');
    assert.equal(loaded.canonicalDecisions.length, dossier.canonicalDecisions.length);
  });
});

describe('Phase 32 Wave 2 — Task Drift Anchor & PreFlight Guardrails', () => {
  it('identifies in-scope edits without emitting drift warnings', () => {
    const declared = ['src/output-diet.cts', 'tests/output-diet.test.cjs'];
    const report1 = checkTaskDrift('src/output-diet.cts', declared);
    assert.equal(report1.isDrift, false);

    // .planning control files are exempt by default
    const reportPlanning = checkTaskDrift('.planning/STATE.md', declared);
    assert.equal(reportPlanning.isDrift, false);
  });

  it('detects undeclared target files as task drift and formats soft warning', () => {
    const declared = ['src/output-diet.cts'];
    const report = checkTaskDrift('src/unrelated-module.cts', declared);

    assert.equal(report.isDrift, true);
    assert.ok(report.warning);
    assert.ok(report.warning.includes('Task Drift Warning'));
    assert.ok(report.warning.includes('src/unrelated-module.cts'));
  });

  it('emits SCOPE_VIOLATION warning in runPreFlightChecks when task drift occurs', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-preflight-drift-'));
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });

    const report = runPreFlightChecks({
      taskId: 'task-test-drift',
      filesToModify: ['src/random-file.ts'],
      declaredScopeFiles: ['src/allowed-file.ts'],
      planningDir,
      rootDir: tmpDir,
    });

    const scopeViolations = report.violations.filter(v => v.rule === 'SCOPE_VIOLATION');
    assert.ok(scopeViolations.length > 0);
    assert.equal(scopeViolations[0].severity, 'warning');
    assert.ok(scopeViolations[0].message.includes('random-file.ts'));
  });
});
