/**
 * Tests for Auto-Upgrade Engine and /gsd:migrate.
 */

'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { cleanup } = require('./helpers.cjs');
const upgradeEngine = require('../gsd-core/bin/lib/auto-upgrade-engine.cjs');
const hub = require('../gsd-core/bin/lib/unified-workflow-hub.cjs');

const { runAutoUpgrade } = upgradeEngine;
const { dispatchUnifiedCommand } = hub;

describe('auto-upgrade-engine', () => {
  test('upgrades a simulated legacy project and creates universal intelligence artifacts', () => {
    const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'upgrade-test-'));

    try {
      // 1. Create simulated legacy project with multiple languages
      const planningDir = path.join(tmpProject, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });
      fs.writeFileSync(
        path.join(planningDir, 'STATE.md'),
        `# Project State\n- Current Phase: Phase 1\n`
      );

      // Create code in Python and TypeScript
      fs.mkdirSync(path.join(tmpProject, 'src'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpProject, 'src', 'server.ts'),
        `export function startServer() { return true; }\n`
      );
      fs.writeFileSync(
        path.join(tmpProject, 'src', 'app.py'),
        `class PyService:\n    pass\n`
      );

      // 2. Run Auto-Upgrade
      const report = runAutoUpgrade(planningDir, tmpProject);
      assert.strictEqual(report.success, true);
      assert.strictEqual(report.isNewMigration, true);
      assert.ok(report.indexedFiles >= 2);
      assert.ok(fs.existsSync(path.join(planningDir, 'intel', 'codebase-graph.json')));
      assert.ok(fs.existsSync(path.join(planningDir, 'codebase', 'ARCHITECTURE.md')));
      assert.ok(fs.existsSync(path.join(planningDir, 'codebase', 'APIS.md')));
      assert.ok(fs.existsSync(path.join(planningDir, 'intel', 'telemetry.json')));

      // 3. Dispatch via hub /gsd:migrate
      const hubRes = dispatchUnifiedCommand('/gsd:migrate', {
        args: [],
        cwd: tmpProject,
      });
      assert.strictEqual(hubRes.command, 'migrate');
      assert.strictEqual(hubRes.action, 'UPGRADE_LEGACY_PROJECT');
      assert.ok(hubRes.message.length > 0);
    } finally {
      cleanup(tmpProject);
    }
  });
});
