const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const helpers = require('./helpers.cjs');

const secondBrainMod = require('../gsd-core/bin/lib/obsidian-second-brain.cjs');
const obsidianInterop = require('../gsd-core/bin/lib/obsidian-interop.cjs');
const continuousMemory = require('../gsd-core/bin/lib/continuous-memory.cjs');
const unifiedHub = require('../gsd-core/bin/lib/unified-workflow-hub.cjs');

const GSD_TOOLS_CLI = path.resolve(__dirname, '../gsd-core/bin/gsd-tools.cjs');

test('Phase 37 — Plan 03: Second Brain Refinements, Continuous Memory Lessons, Production-First Topology & Dual Canvas', async (t) => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-phase37-p03-'));
  const planningDir = path.join(tmpRoot, '.planning');
  const memoryDir = path.join(planningDir, 'memory');
  const phasesDir = path.join(planningDir, 'phases', '37-second-brain');
  const srcDir = path.join(tmpRoot, 'src');
  const testsDir = path.join(tmpRoot, 'tests');

  fs.mkdirSync(memoryDir, { recursive: true });
  fs.mkdirSync(phasesDir, { recursive: true });
  fs.mkdirSync(srcDir, { recursive: true });
  fs.mkdirSync(testsDir, { recursive: true });

  // 1. Create mock STATE.md
  const mockState = [
    '# Active State',
    '- **D-01 [Architecture]:** Analisador AST nativo em TypeScript.',
    '- **D-02 [Docs]:** Documentacao viva incremental sincronizada.',
    '- **D-174 [Universal Second Brain Obsidian Vault Engine]:** Compilacao isolada sob .planning/vault/.',
  ].join('\n');
  fs.writeFileSync(path.join(planningDir, 'STATE.md'), mockState, 'utf8');

  // 2. Create mock ROADMAP.md
  const mockRoadmap = [
    '# Roadmap',
    '## Milestones',
    '- [x] **Phase 1: Living Docs**',
    '- [x] **Phase 37: Second Brain Knowledge Graph**',
  ].join('\n');
  fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), mockRoadmap, 'utf8');

  // 3. Create mock production & test source files
  fs.writeFileSync(path.join(srcDir, 'engine.ts'), 'export class CoreEngine { run() { return true; } }', 'utf8');
  fs.writeFileSync(path.join(srcDir, 'router.ts'), 'import { CoreEngine } from "./engine"; export class AppRouter {}', 'utf8');
  fs.writeFileSync(path.join(testsDir, 'engine.test.ts'), 'import { CoreEngine } from "../src/engine";', 'utf8');

  // 4. Create mock continuous memory self-healing entries
  continuousMemory.recordMemoryEntry(tmpRoot, {
    category: 'self_healing_fix',
    phase: '36',
    summary: 'Resolved CPU spin-lock in memory compaction loop',
    details: 'Replaced busy wait polling with reactive wakeups and timeout bound',
    relevantFiles: ['src/engine.ts'],
    keywords: ['spin-lock', 'concurrency'],
  });
  continuousMemory.recordMemoryEntry(tmpRoot, {
    category: 'self_healing_fix',
    phase: '35',
    summary: 'Repaired duplicate AST contract extraction bug',
    details: 'Normalized interface keys before deduping',
    relevantFiles: ['src/router.ts'],
    keywords: ['ast', 'contracts'],
  });

  // 5. Create mock phase spec
  fs.writeFileSync(path.join(phasesDir, '37-SPEC.md'), '# Spec 37', 'utf8');

  try {
    await t.test('1. generates rich Lessons from continuous memory self_healing_fix entries', () => {
      const report = secondBrainMod.generateSecondBrainVault(planningDir, tmpRoot);

      assert.ok(report.totalLessons >= 2, `Expected at least 2 lessons, got ${report.totalLessons}`);

      const lessonFile = path.join(planningDir, 'vault', 'Lessons', 'L-01.md');
      assert.ok(fs.existsSync(lessonFile), 'L-01.md must exist in Lessons directory');

      const content = fs.readFileSync(lessonFile, 'utf8');
      assert.ok(content.includes('tags: [gsd, lesson, self-healing]'), 'Must contain self-healing tag');
      assert.ok(content.includes('## Causa Raiz e Detalhes'), 'Must contain Details section');
      assert.ok(content.includes('[[00-Home|Voltar ao Home'), 'Must contain navigation link to 00-Home');
    });

    await t.test('2. separates Production modules (src/) from Tooling in 00-Home.md and 00-Vault.canvas', () => {
      const report = secondBrainMod.generateSecondBrainVault(planningDir, tmpRoot);

      // Verify 00-Home.md
      const homeContent = fs.readFileSync(report.homePath, 'utf8');
      assert.ok(homeContent.includes('Módulos Centrais de Produção (src/)'), 'Home MOC must have Production Modules section');
      assert.ok(homeContent.includes('Lições de Auto-Cura & Anti-Patterns Recentes'), 'Home MOC must have Lessons section');

      // Verify 00-Vault.canvas
      const canvasRaw = fs.readFileSync(report.canvasPath, 'utf8');
      const canvasJson = JSON.parse(canvasRaw);

      // Verify bottom lesson nodes exist
      const lessonNodes = canvasJson.nodes.filter(n => n.color === '2');
      assert.ok(lessonNodes.length > 0, 'Canvas must have bottom lesson nodes with color: 2 (Orange)');

      // Verify lesson edges point towards active phase
      const lessonEdges = canvasJson.edges.filter(e => e.color === '2');
      assert.ok(lessonEdges.length > 0, 'Canvas must connect lesson nodes to active phase');
    });

    await t.test('3. generates 01-Roadmap.canvas and links both canvases and HTML visualizers in 00-Home.md', () => {
      const report = secondBrainMod.generateSecondBrainVault(planningDir, tmpRoot);

      assert.ok(report.roadmapCanvasPath, 'Report must contain roadmapCanvasPath');
      assert.ok(fs.existsSync(report.roadmapCanvasPath), '01-Roadmap.canvas must exist inside .planning/vault/');

      const roadmapCanvasRaw = fs.readFileSync(report.roadmapCanvasPath, 'utf8');
      const roadmapJson = JSON.parse(roadmapCanvasRaw);
      assert.ok(Array.isArray(roadmapJson.nodes), '01-Roadmap.canvas must be valid canvas JSON');

      const homeContent = fs.readFileSync(report.homePath, 'utf8');
      assert.ok(homeContent.includes('00-Vault.canvas'), '00-Home.md must link to 00-Vault.canvas');
      assert.ok(homeContent.includes('01-Roadmap.canvas'), '00-Home.md must link to 01-Roadmap.canvas');
      assert.ok(homeContent.includes('graph-view.html'), '00-Home.md must reference graph-view.html');
      assert.ok(homeContent.includes('dashboard.html'), '00-Home.md must reference dashboard.html');
    });

    await t.test('4. unified-workflow-hub /gsd:status reflects Second Brain telemetry when vault is active', () => {
      const res = unifiedHub.dispatchUnifiedCommand('status', {
        args: [],
        cwd: tmpRoot,
        raw: true,
      });

      assert.strictEqual(res.command, 'status');
      assert.ok(res.message.includes('Segundo Cérebro: Ativo'), 'Status message must indicate active Second Brain');
      assert.ok(res.data.secondBrain && res.data.secondBrain.active === true, 'Data must include secondBrain object');
      assert.ok(['LOW', 'MED'].includes(res.data.secondBrain.amnesiaRisk), 'Amnesia risk should be LOW or MED');
    });

    await t.test('5. backlinks index reports zero unresolved targets with new lessons and canvas notes', () => {
      const backlinkReport = obsidianInterop.buildBacklinkIndex(planningDir, tmpRoot);

      assert.strictEqual(backlinkReport.unresolvedTargets.length, 0, `Unresolved targets should be 0, got: ${JSON.stringify(backlinkReport.unresolvedTargets)}`);
    });

    await t.test('6. gsd-tools CLI graph --vault displays Roadmap Canvas path in output', () => {
      const graphRes = spawnSync(process.execPath, [GSD_TOOLS_CLI, 'graph', '--vault'], {
        cwd: tmpRoot,
        encoding: 'utf8',
        timeout: 15000,
      });

      assert.strictEqual(graphRes.status, 0, `CLI failed: ${graphRes.stderr}`);
      assert.ok(graphRes.stdout.includes('Roadmap Canvas:'), 'Output must display Roadmap Canvas path');
      assert.ok(graphRes.stdout.includes('Visual Mindmap:'), 'Output must display Visual Mindmap path');
    });
  } finally {
    helpers.cleanup(tmpRoot);
  }
});
