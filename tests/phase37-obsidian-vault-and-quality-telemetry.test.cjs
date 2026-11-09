const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const helpers = require('./helpers.cjs');

const secondBrainMod = require('../gsd-core/bin/lib/obsidian-second-brain.cjs');
const obsidianInterop = require('../gsd-core/bin/lib/obsidian-interop.cjs');
const tokenDashboard = require('../gsd-core/bin/lib/token-dashboard-renderer.cjs');
const jitTelemetry = require('../gsd-core/bin/lib/jit-telemetry.cjs');

const GSD_TOOLS_CLI = path.resolve(__dirname, '../gsd-core/bin/gsd-tools.cjs');

test('Phase 37 — Plan 02: Obsidian Second Brain Vault & Quality Telemetry Suite', async (t) => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-phase37-p02-'));
  const planningDir = path.join(tmpRoot, '.planning');
  const phasesDir = path.join(planningDir, 'phases', '37-second-brain');
  const srcDir = path.join(tmpRoot, 'src');

  fs.mkdirSync(phasesDir, { recursive: true });
  fs.mkdirSync(srcDir, { recursive: true });

  // 1. Create mock STATE.md
  const mockState = [
    '# Active State',
    '- **D-01 [Architecture]:** Analisador AST nativo em TypeScript.',
    '- **D-02 [Docs]:** Documentacao viva incremental sincronizada.',
    '- **D-03 [Context]:** JIT context injection cirurgico.',
  ].join('\n');
  fs.writeFileSync(path.join(planningDir, 'STATE.md'), mockState, 'utf8');

  // 2. Create mock source file
  const mockSrc = [
    'export class KnowledgeOrchestrator {',
    '  computeBrain(): boolean { return true; }',
    '}',
  ].join('\n');
  fs.writeFileSync(path.join(srcDir, 'brain-core.ts'), mockSrc, 'utf8');

  // 3. Create mock phase spec
  fs.writeFileSync(path.join(phasesDir, '37-SPEC.md'), '# Phase 37 Spec\nDetails.', 'utf8');
  fs.writeFileSync(path.join(phasesDir, '37-01-PLAN.md'), '# Plan 37-01\nDetails.', 'utf8');

  try {
    await t.test('1. generateSecondBrainVault generates full Obsidian Vault hierarchy under .planning/vault/', () => {
      const report = secondBrainMod.generateSecondBrainVault(planningDir, tmpRoot);

      assert.ok(report, 'Report should be returned');
      assert.strictEqual(report.totalDecisions, 3, 'Should index 3 architectural decisions');
      assert.ok(fs.existsSync(report.homePath), '00-Home.md must exist');
      assert.ok(fs.existsSync(report.canvasPath), '00-Vault.canvas must exist');

      // Verify 00-Home.md content
      const homeContent = fs.readFileSync(report.homePath, 'utf8');
      assert.ok(homeContent.includes('00-Vault.canvas'), '00-Home.md must link to canvas');
      assert.ok(homeContent.includes('D-01'), '00-Home.md must link to D-01');

      // Verify 00-Vault.canvas content
      const canvasRaw = fs.readFileSync(report.canvasPath, 'utf8');
      const canvasJson = JSON.parse(canvasRaw);
      assert.ok(Array.isArray(canvasJson.nodes), 'Canvas must contain nodes array');
      assert.ok(canvasJson.nodes.length >= 4, 'Canvas must have active phase, decisions, and modules nodes');
      assert.ok(Array.isArray(canvasJson.edges), 'Canvas must contain edges array');

      // Verify Decisions note
      const d01Path = path.join(planningDir, 'vault', 'Decisions', 'D-01.md');
      assert.ok(fs.existsSync(d01Path), 'D-01.md note must exist');
      const d01Content = fs.readFileSync(d01Path, 'utf8');
      assert.ok(d01Content.includes('tags: [gsd, decision,'), 'D-01 frontmatter must include tags');

      // Verify .obsidian config
      const graphConfig = path.join(planningDir, 'vault', '.obsidian', 'graph.json');
      assert.ok(fs.existsSync(graphConfig), 'graph.json configuration must exist');
    });

    await t.test('2. backlinks.json reports zero unknown/unresolved targets after vault generation', () => {
      const backlinkReport = obsidianInterop.buildBacklinkIndex(planningDir, tmpRoot);

      assert.ok(backlinkReport.totalLinks > 0, 'Backlink report must contain links');
      assert.strictEqual(backlinkReport.unresolvedTargets.length, 0, `Should have 0 unresolved targets, got: ${JSON.stringify(backlinkReport.unresolvedTargets)}`);
    });

    await t.test('3. jitTelemetry records and loads Quality-First metrics', () => {
      jitTelemetry.recordJitInvocation(
        planningDir,
        ['src/brain-core.ts'],
        1200,
        15000,
        'plan',
        '37',
        'inv-test-p37',
        'targeted',
        'unit-test',
        98.5,
        'high'
      );

      const summary = jitTelemetry.getTelemetrySummary(planningDir);
      assert.strictEqual(summary.totalInvocations, 1);
      assert.ok(typeof summary.averageContextRecallPct === 'number', 'averageContextRecallPct must be numeric');
      assert.ok(summary.averageContextRecallPct > 0, 'averageContextRecallPct must be > 0');
      assert.ok(['LOW', 'MED', 'HIGH'].includes(summary.currentAmnesiaRisk), 'currentAmnesiaRisk must be valid level');
      assert.ok(typeof summary.brainCoveragePct === 'number', 'brainCoveragePct must be numeric');
    });

    await t.test('4. tokenDashboard renders Quality & Anti-Amnesia section at the top of the box layout', () => {
      const output = tokenDashboard.renderTokenDashboard(planningDir);

      assert.ok(output.includes('Second Brain & Context Quality (Zero Amnesia):'), 'Must include Quality header');
      assert.ok(output.includes('Context Recall:'), 'Must include Context Recall row');
      assert.ok(output.includes('Amnesia Risk Index:'), 'Must include Amnesia Risk row');
      assert.ok(output.includes('Second Brain Coverage:'), 'Must include Second Brain Coverage row');
      assert.ok(output.includes('Active Decisions Injected:'), 'Must include Active Decisions row');

      // Verify Quality section appears before Efficiency section
      const qualityIdx = output.indexOf('Second Brain & Context Quality');
      const efficiencyIdx = output.indexOf('Efficiency & Token Economics');
      assert.ok(qualityIdx < efficiencyIdx, 'Quality section must precede Efficiency section');
    });

    await t.test('5. gsd-tools CLI commands support graph --vault and telemetry dashboard', () => {
      // CLI graph --vault --raw
      const graphRes = spawnSync(process.execPath, [GSD_TOOLS_CLI, 'graph', '--vault', '--raw'], {
        cwd: tmpRoot,
        encoding: 'utf8',
        timeout: 15000,
      });
      assert.strictEqual(graphRes.status, 0, `CLI graph --vault failed: ${graphRes.stderr}`);
      const graphJson = JSON.parse(graphRes.stdout);
      assert.ok(graphJson.vaultPath, 'Must output vaultPath in JSON');
      assert.strictEqual(graphJson.totalDecisions, 3, 'Must report 3 decisions');

      // CLI tokens
      const tokensRes = spawnSync(process.execPath, [GSD_TOOLS_CLI, 'tokens'], {
        cwd: tmpRoot,
        encoding: 'utf8',
        timeout: 15000,
      });
      assert.strictEqual(tokensRes.status, 0, `CLI tokens failed: ${tokensRes.stderr}`);
      assert.ok(tokensRes.stdout.includes('Zero Amnesia'), 'CLI tokens output must include Zero Amnesia quality header');
    });
  } finally {
    helpers.cleanup(tmpRoot);
  }
});
