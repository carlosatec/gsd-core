/**
 * Phase 37 — Plan 05: Visual 360° Knowledge Layer, Dead Code Detection,
 * Exec Auto-Heal & Status Auto-Sync Regression Test Suite
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const visualGraphMod = require('../gsd-core/bin/lib/visual-graph-exporter.cjs');
const unifiedHub = require('../gsd-core/bin/lib/unified-workflow-hub.cjs');
const guardrailsMod = require('../gsd-core/bin/lib/preflight-guardrails.cjs');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-p37-05-'));
}

describe('Phase 37 — Plan 05: Visual 360° Knowledge Layer & Command Synergy', () => {

  it('1. buildVisualGraphPayload captures AST v2.1 KnowledgeNodes and governance links', () => {
    const tmp = makeTempDir();
    const planningDir = path.join(tmp, '.planning');
    const intelDir = path.join(planningDir, 'intel');
    fs.mkdirSync(intelDir, { recursive: true });

    // Seed a mock codebase-graph.json with files and knowledgeNodes
    const mockGraph = {
      version: '2.1.0',
      root: tmp,
      stats: { totalFiles: 2, totalKnowledgeNodes: 2 },
      files: {
        'src/index.ts': {
          path: 'src/index.ts',
          language: 'TypeScript',
          exportsCount: 1,
          isOrphan: false,
          imports: ['./helper'],
        },
        'src/helper.ts': {
          path: 'src/helper.ts',
          language: 'TypeScript',
          exportsCount: 1,
          isOrphan: false,
          imports: [],
        },
      },
      knowledgeNodes: {
        decisions: {
          'D-99': {
            id: 'D-99',
            title: 'Decisao de Arquitetura de Teste',
            category: 'Architecture',
            governedFiles: ['src/helper.ts'],
          },
        },
        phases: {
          '37-knowledge': {
            id: '37-knowledge',
            name: '37-knowledge',
            specPath: 'src/index.ts',
            planPaths: ['src/helper.ts'],
          },
        },
      },
    };
    fs.writeFileSync(path.join(intelDir, 'codebase-graph.json'), JSON.stringify(mockGraph, null, 2));

    const payload = visualGraphMod.buildVisualGraphPayload(planningDir, tmp);

    assert.ok(payload.stats.totalKnowledgeNodes >= 2, 'Should count knowledge nodes');
    assert.ok(payload.stats.totalDecisions >= 1, 'Should count decisions');
    assert.ok(payload.stats.totalPhases >= 1, 'Should count phases');

    const decisionNode = payload.nodes.find(n => n.id === 'decision:D-99');
    assert.ok(decisionNode, 'Decision node should exist');
    assert.equal(decisionNode.type, 'decision');

    const phaseNode = payload.nodes.find(n => n.id === 'phase:37-knowledge');
    assert.ok(phaseNode, 'Phase node should exist');
    assert.equal(phaseNode.type, 'phase');

    const governsLink = payload.links.find(l => l.type === 'governs' && l.source === 'decision:D-99' && l.target === 'src/helper.ts');
    assert.ok(governsLink, 'Governs link from decision to governed file should exist');

    const specifiesLink = payload.links.find(l => l.type === 'specifies' && l.source === 'phase:37-knowledge' && l.target === 'src/index.ts');
    assert.ok(specifiesLink, 'Specifies link from phase to file should exist');
  });

  it('2. executeReview flags orphan modules in src/ with [Dead-Code/Orphan]', () => {
    const tmp = makeTempDir();
    const planningDir = path.join(tmp, '.planning');
    const intelDir = path.join(planningDir, 'intel');
    fs.mkdirSync(intelDir, { recursive: true });
    const srcDir = path.join(tmp, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'orphan-module.ts'), 'export const orphanValue = 42;\n');

    // Seed mock graph with an orphan file in src/
    const mockGraph = {
      version: '2.1.0',
      root: tmp,
      files: {
        'src/orphan-module.ts': {
          path: 'src/orphan-module.ts',
          language: 'TypeScript',
          exportsCount: 1,
          exports: ['orphanValue'],
          isOrphan: true,
          isGodObject: false,
          unusedImports: [],
        },
      },
    };
    fs.writeFileSync(path.join(intelDir, 'codebase-graph.json'), JSON.stringify(mockGraph, null, 2));

    const reviewRes = unifiedHub.executeReview(planningDir, tmp, false, ['src/orphan-module.ts']);

    const orphanWarning = reviewRes.warnings.find(w => w.includes('[Dead-Code/Orphan]'));
    assert.ok(orphanWarning, 'Should include [Dead-Code/Orphan] warning');
    assert.ok(orphanWarning.includes('src/orphan-module.ts has no incoming imports'));
  });

  it('3. unified-workflow-hub /gsd:status --sync performs AST refresh and memory indexing', () => {
    const tmp = makeTempDir();
    const planningDir = path.join(tmp, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '# State\n- **Current Phase:** Phase 37\n- **D-01 [Arch]:** Native AST\n');

    const res = unifiedHub.dispatchUnifiedCommand('status', {
      args: ['--sync'],
      cwd: tmp,
    });

    assert.equal(res.command, 'status');
    assert.equal(res.action, 'DISPLAY_STATUS');
    assert.equal(res.data.synced, true);
    assert.ok(res.message.includes('Synced: AST Intel refreshed & Memory indexed'));
  });

  it('4. unified-workflow-hub /gsd:exec accepts --auto-heal flag and reflects active status', () => {
    const tmp = makeTempDir();
    const planningDir = path.join(tmp, '.planning');
    fs.mkdirSync(path.join(planningDir, 'phases', '37-heal'), { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '# State\n- **Current Phase:** Phase 37\n');
    fs.writeFileSync(path.join(planningDir, 'phases', '37-heal', '37-01-PLAN.md'), '# Plan\n- Files: src/main.ts\n');

    const res = unifiedHub.dispatchUnifiedCommand('exec', {
      args: ['37', '--auto-heal'],
      cwd: tmp,
    });

    assert.equal(res.command, 'exec');
    assert.equal(res.data.autoHeal, true);
    assert.ok(res.message.includes('[Auto-Healing Guard active]'));
  });

  it('5. unified-workflow-hub /gsd:exec engages auto-healing when guardrail violations occur', () => {
    const tmp = makeTempDir();
    const planningDir = path.join(tmp, '.planning');
    fs.mkdirSync(path.join(planningDir, 'phases', '37-heal'), { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '# State\n- **Current Phase:** Phase 37\n');

    // Create a mock CONSTITUTION.md with strict invariants
    fs.writeFileSync(
      path.join(tmp, 'CONSTITUTION.md'),
      '# Constitution\nInvariants:\n- No modifications without verification\n'
    );

    // Mock runPreFlightChecks to return an error violation
    const originalPreflight = guardrailsMod.runPreFlightChecks;
    try {
      guardrailsMod.runPreFlightChecks = () => ({
        valid: false,
        score: 0,
        violations: [
          { rule: 'branch-isolation', severity: 'error', message: 'Uncommitted changes on protected branch' },
        ],
        timestamp: new Date().toISOString(),
      });

      // Without --auto-heal, should be BLOCKED_BY_GUARDRAIL
      const blockedRes = unifiedHub.dispatchUnifiedCommand('exec', {
        args: ['37'],
        cwd: tmp,
      });
      assert.equal(blockedRes.action, 'BLOCKED_BY_GUARDRAIL');

      // With --auto-heal, should engage AUTO_HEAL_ENGAGED
      const healedRes = unifiedHub.dispatchUnifiedCommand('exec', {
        args: ['37', '--auto-heal'],
        cwd: tmp,
      });
      assert.equal(healedRes.action, 'AUTO_HEAL_ENGAGED');
      assert.equal(healedRes.data.autoHealed, true);
      assert.ok(healedRes.message.includes('[Self-Healing]'));
      assert.ok(healedRes.message.includes('Auto-heal routine engaged'));
    } finally {
      guardrailsMod.runPreFlightChecks = originalPreflight;
    }
  });

});
