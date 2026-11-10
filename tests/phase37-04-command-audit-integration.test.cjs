/**
 * Phase 37 — Plan 04: Command Ecosystem Harmonization, Real-Time Decision Sync,
 * Cognitive Sentinels & Workflow Saneamiento Regression Suite
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const repoRoot = path.resolve(__dirname, '..');
const secondBrainMod = require('../gsd-core/bin/lib/obsidian-second-brain.cjs');
const unifiedHub = require('../gsd-core/bin/lib/unified-workflow-hub.cjs');
const stateMod = require('../gsd-core/bin/lib/state.cjs');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-p37-04-'));
}

describe('Phase 37 — Plan 04: Command Ecosystem Harmonization & Cognitive Sentinels', () => {

  it('1. querySecondBrain searches across decisions, phases, modules, and lessons', () => {
    const tmp = makeTempDir();
    const planningDir = path.join(tmp, '.planning');
    const vaultDir = path.join(planningDir, 'vault');
    fs.mkdirSync(path.join(vaultDir, 'Decisions'), { recursive: true });
    fs.mkdirSync(path.join(vaultDir, 'Lessons'), { recursive: true });
    fs.mkdirSync(path.join(vaultDir, 'Phases'), { recursive: true });
    fs.mkdirSync(path.join(vaultDir, 'Modules'), { recursive: true });

    // Seed notes
    fs.writeFileSync(path.join(vaultDir, 'Decisions', 'D-153.md'), '# D-153: Memoria Continua Claude-Mem\n\nMemoria permanente sem perda de contexto.');
    fs.writeFileSync(path.join(vaultDir, 'Lessons', 'L-01.md'), '# L-01: Auto-Cura de AST\n\nResolucao de quebra de contrato de export.');
    fs.writeFileSync(path.join(vaultDir, 'Phases', '37-second-brain.md'), '# Fase 37: Segundo Cerebro\n\nConstrucao do Obsidian Vault e telemetria.');
    fs.writeFileSync(path.join(vaultDir, 'Modules', 'src--state.cts.md'), '# src/state.cts\n\nMotor de gestao de estado e progresso.');

    // Query for "Claude-Mem"
    const res1 = secondBrainMod.querySecondBrain(planningDir, 'Claude-Mem', tmp);
    assert.ok(res1.totalMatches >= 1, 'Should find Claude-Mem decision');
    assert.equal(res1.results[0].id, 'D-153');
    assert.equal(res1.results[0].category, 'decision');

    // Query for "Auto-Cura"
    const res2 = secondBrainMod.querySecondBrain(planningDir, 'Auto-Cura', tmp);
    assert.ok(res2.totalMatches >= 1, 'Should find auto-cura lesson');
    assert.equal(res2.results[0].id, 'L-01');
    assert.equal(res2.results[0].category, 'lesson');

    // Query with no matches
    const res3 = secondBrainMod.querySecondBrain(planningDir, 'NonExistentTermXYZ', tmp);
    assert.equal(res3.totalMatches, 0);
  });

  it('2. unified-workflow-hub /gsd:graph --query returns formatted search results', () => {
    const tmp = makeTempDir();
    const planningDir = path.join(tmp, '.planning');
    const vaultDir = path.join(planningDir, 'vault', 'Decisions');
    fs.mkdirSync(vaultDir, { recursive: true });
    fs.writeFileSync(path.join(vaultDir, 'D-01.md'), '# D-01: Analisador AST Nativo\n\nAnalisador AST nativo em TypeScript.');

    const res = unifiedHub.dispatchUnifiedCommand('graph', {
      args: ['--query=Nativo'],
      cwd: tmp,
    });

    assert.equal(res.command, 'graph');
    assert.equal(res.action, 'QUERY_SECOND_BRAIN');
    assert.ok(res.message.includes('Analisador AST Nativo'));
    assert.ok(res.data.totalMatches >= 1);
  });

  it('3. unified-workflow-hub /gsd:status provides dynamic nextStep based on active phase files', () => {
    const tmp = makeTempDir();
    const planningDir = path.join(tmp, '.planning');
    const phasesDir = path.join(planningDir, 'phases', '37-test-phase');
    fs.mkdirSync(phasesDir, { recursive: true });

    // Seed STATE.md
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '# Project State\n\n- **Current Phase:** Phase 37 (Test Phase)\n- **Status:** In Progress\n');

    // Case A: Plan exists, no summary -> suggest exec
    fs.writeFileSync(path.join(phasesDir, '37-01-PLAN.md'), '# Plan 01');
    const resPlan = unifiedHub.dispatchUnifiedCommand('status', { args: [], cwd: tmp });
    assert.ok(resPlan.nextStep.includes('/gsd:exec 37'), `Expected /gsd:exec in nextStep, got: ${resPlan.nextStep}`);

    // Case B: Summary exists -> suggest verify or ship
    fs.writeFileSync(path.join(phasesDir, '37-SUMMARY.md'), '# Summary 37');
    const resSummary = unifiedHub.dispatchUnifiedCommand('status', { args: [], cwd: tmp });
    assert.ok(resSummary.nextStep.includes('/gsd:verify 37') || resSummary.nextStep.includes('/gsd:ship'), `Expected /gsd:verify or /gsd:ship in nextStep, got: ${resSummary.nextStep}`);
  });

  it('4. unified-workflow-hub /gsd:ship auto-synchronizes Second Brain vault', () => {
    const tmp = makeTempDir();
    const planningDir = path.join(tmp, '.planning');
    fs.mkdirSync(path.join(planningDir, 'phases'), { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '# State\n- **Current Phase:** Phase 37\n');
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), '# Roadmap\n');

    const res = unifiedHub.dispatchUnifiedCommand('ship', { args: [], cwd: tmp });
    assert.equal(res.command, 'ship');
    assert.equal(res.action, 'SHIP_RELEASE');
    assert.ok(res.data && res.data.vaultSynced === true, 'Expected vaultSynced to be true');
    assert.ok(fs.existsSync(path.join(planningDir, 'vault', '00-Home.md')), '00-Home.md should exist in vault');
  });

  it('5. gsd-core/workflows/autonomous.md contains zero legacy skill invocations', () => {
    const autoWfPath = path.join(repoRoot, 'gsd-core', 'workflows', 'autonomous.md');
    const content = fs.readFileSync(autoWfPath, 'utf8');

    const forbiddenLegacySkills = [
      'gsd-discuss-phase',
      'gsd-plan-phase',
      'gsd-execute-phase',
      'gsd-code-review',
      'gsd-complete-milestone',
      'gsd-audit-milestone',
    ];

    for (const legacy of forbiddenLegacySkills) {
      const match = content.match(new RegExp(`Skill\\(skill=["']${legacy}["']`, 'g'));
      assert.equal(match, null, `Found legacy skill invocation for "${legacy}" in autonomous.md`);
    }
  });

  it('6. ROADMAP.md formalizes Phase 26 as Complete/absorbed in Phase 36', () => {
    const roadmapPath = path.join(repoRoot, '.planning', 'ROADMAP.md');
    const content = fs.readFileSync(roadmapPath, 'utf8');

    assert.ok(content.includes('Phase 26: Modularização do Core (State-Lock Facade)'), 'ROADMAP should reflect Phase 26 modularization');
    assert.ok(content.includes('| 26. Modularização do Core (State-Lock Facade) | 1/1 | Complete |'), 'Table should reflect Phase 26 complete');
  });

  it('7. cmdStateAddDecision triggers real-time sync into continuous memory', () => {
    const tmp = makeTempDir();
    const planningDir = path.join(tmp, '.planning');
    const memoryDir = path.join(planningDir, 'memory');
    fs.mkdirSync(memoryDir, { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '# Project State\n\n## Decisions\n- **D-01 [Architecture]:** Initial decision\n');

    stateMod.cmdStateAddDecision(tmp, {
      summary: 'D-999 [Test Real-Time Sync]: Sync directly into memory',
      rationale: 'Verified in integration test',
    }, true);

    const memoryFile = path.join(memoryDir, 'decisions.jsonl');
    assert.ok(fs.existsSync(memoryFile), 'decisions.jsonl should be created or updated');
    const memContent = fs.readFileSync(memoryFile, 'utf8');
    assert.ok(memContent.includes('D-999'), 'Memory file should contain real-time synced decision D-999');
  });

});
