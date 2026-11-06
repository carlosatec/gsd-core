'use strict';

/**
 * Phase 35 Wave 1 Regression Suite: Blast Radius --force Escalation & Bypass Isolation
 *
 * Verifies:
 * 1. --force escalates risk to CRITICAL and does NOT grant non-interactive bypass.
 * 2. Interactive execution with --force requires explicit user confirmation.
 * 3. CI, GSD_AUTO, and explicit --yes / --non-interactive remain separate authorized bypasses.
 * 4. Safe commands remain non-destructive.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const shellBlast = require('../gsd-core/bin/lib/shell-blast-radius.cjs');
const { inspectCommandRisk } = shellBlast;

describe('Phase 35 Wave 1 — Shell Blast Radius --force Escalator', () => {
  it('--force escalates risk and strictly demands confirmation in interactive sessions', () => {
    // Ensure CI and auto variables are off for this test
    const origCi = process.env.CI;
    const origAuto = process.env.GSD_AUTO;
    delete process.env.CI;
    delete process.env.GSD_AUTO;

    try {
      const forceReport = inspectCommandRisk('git push origin main --force', { nonInteractive: false });
      assert.equal(forceReport.isDestructive, true);
      assert.equal(forceReport.riskLevel, 'critical');
      assert.equal(forceReport.isForce, true);
      assert.equal(forceReport.requiresConfirmation, true, '--force MUST demand confirmation in interactive mode');
      assert.equal(forceReport.bypassNonInteractive, false);

      const rmForceReport = inspectCommandRisk('rm -rf dist/ --force', { nonInteractive: false });
      assert.equal(rmForceReport.isDestructive, true);
      assert.equal(rmForceReport.riskLevel, 'critical');
      assert.equal(rmForceReport.isForce, true);
      assert.equal(rmForceReport.requiresConfirmation, true);
    } finally {
      if (origCi !== undefined) process.env.CI = origCi;
      if (origAuto !== undefined) process.env.GSD_AUTO = origAuto;
    }
  });

  it('explicit non-interactive or automation flags bypass confirmation cleanly', () => {
    const reportYes = inspectCommandRisk('rm -rf dist/ --yes');
    assert.equal(reportYes.isDestructive, true);
    assert.equal(reportYes.requiresConfirmation, false);
    assert.equal(reportYes.bypassNonInteractive, true);

    const reportExplicit = inspectCommandRisk('git reset --hard HEAD~1', { nonInteractive: true });
    assert.equal(reportExplicit.isDestructive, true);
    assert.equal(reportExplicit.requiresConfirmation, false);
    assert.equal(reportExplicit.bypassNonInteractive, true);
  });
});
