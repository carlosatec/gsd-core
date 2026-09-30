/**
 * Comprehensive Test Suite for Phase 27:
 * AST Semantic Engine & Resilience (Security Guards, Zombie Imports, Blast Radius, God Objects, Causal Cycles)
 */

'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const codebaseAst = require('../gsd-core/bin/lib/codebase-ast-analyzer.cjs');
const {
  analyzeSourceFile,
  buildCodebaseGraph,
  inspectRouteSecurityGuards,
  inspectRouteDataAccess,
  compareDuplicateSymbols,
  findCircularDependencyPath,
  calculateBlastRadius,
} = codebaseAst;

const guardrails = require('../gsd-core/bin/lib/preflight-guardrails.cjs');
const { runPreFlightChecks } = guardrails;

const workflowHub = require('../gsd-core/bin/lib/unified-workflow-hub.cjs');
const { executeReview } = workflowHub;

const visualGraph = require('../gsd-core/bin/lib/visual-graph-exporter.cjs');
const { buildVisualGraphPayload, generateVisualGraphHtml } = visualGraph;

const { cleanup } = require('./helpers.cjs');

describe('Phase 27 — Route Security Guards & Data Access Heuristics', () => {
  test('detects security guards in route handler snippet', () => {
    const secureSnippet = `
      export async function POST(req: Request) {
        const auth = req.headers.get('authorization');
        if (!auth) return new Response('Unauthorized', { status: 401 });
        await checkRateLimit(req);
        if (!verifySignature(req, process.env.WEBHOOK_SECRET)) {
          return new Response('Invalid signature', { status: 403 });
        }
        return new Response(JSON.stringify({ ok: true }));
      }
    `;

    const guards = inspectRouteSecurityGuards(secureSnippet);
    assert.strictEqual(guards.hasGuards, true);
    assert.strictEqual(guards.hasRateLimit, true);
    assert.strictEqual(guards.hasAuthCheck, true);
    assert.strictEqual(guards.hasSignatureValidation, true);
    assert.strictEqual(guards.isPublic, false);
  });

  test('detects public / unauthenticated route with no guards', () => {
    const publicSnippet = `
      export async function GET(req: Request) {
        return new Response('hello world');
      }
    `;

    const guards = inspectRouteSecurityGuards(publicSnippet);
    assert.strictEqual(guards.hasGuards, false);
    assert.strictEqual(guards.isPublic, true);
  });

  test('detects data access patterns (Prisma queries vs mutations)', () => {
    const mutationSnippet = `
      export async function POST(req: Request) {
        const body = await req.json();
        const existing = await prisma.user.findUnique({ where: { id: body.id } });
        const updated = await prisma.user.update({
          where: { id: body.id },
          data: { name: body.name }
        });
        const webhookRes = await fetch('https://api.external.com/notify', { method: 'POST' });
        return new Response(JSON.stringify(updated));
      }
    `;

    const access = inspectRouteDataAccess(mutationSnippet);
    assert.strictEqual(access.readsDb, true);
    assert.strictEqual(access.writesDb, true);
    assert.strictEqual(access.mutatesDb, true);
    assert.strictEqual(access.hasExternalFetch, true);
  });
});

describe('Phase 27 — App Router & Server Actions Route Extraction', () => {
  test('extracts App Router HTTP routes and inspects guards in route.ts', () => {
    const routeCode = `
      import { NextResponse } from 'next/server';

      export async function GET(request: Request) {
        const authHeader = request.headers.get('authorization');
        const user = await prisma.user.findMany();
        return NextResponse.json(user);
      }

      export async function DELETE(request: Request) {
        await checkRateLimit(request);
        await prisma.user.deleteMany();
        return NextResponse.json({ ok: true });
      }
    `;

    const result = analyzeSourceFile('app/api/users/route.ts', routeCode);
    assert.ok(result.routes, 'should have routes array');
    assert.strictEqual(result.routes.length, 2);

    const getRoute = result.routes.find(r => r.method === 'GET');
    assert.ok(getRoute);
    assert.strictEqual(getRoute.path, '/api/users');
    assert.strictEqual(getRoute.security?.hasAuthCheck, true);
    assert.strictEqual(getRoute.dataAccess?.readsDb, true);

    const delRoute = result.routes.find(r => r.method === 'DELETE');
    assert.ok(delRoute);
    assert.strictEqual(delRoute.security?.hasRateLimit, true);
    assert.strictEqual(delRoute.dataAccess?.writesDb, true);
  });

  test('extracts Server Actions marked with "use server"', () => {
    const actionCode = `
      "use server";

      export async function updateProfile(formData: FormData) {
        const session = await getSession();
        return prisma.profile.update({ where: { id: session.id }, data: {} });
      }
    `;

    const result = analyzeSourceFile('actions/profile.ts', actionCode);
    assert.ok(result.routes, 'should have routes');
    const actionRoute = result.routes.find(r => r.method === 'ACTION');
    assert.ok(actionRoute, 'should find Server Action');
    assert.ok(actionRoute.path.includes('updateProfile'));
    assert.strictEqual(actionRoute.dataAccess?.writesDb, true);
  });
});

describe('Phase 27 — Intra-file Call Graph & Zombie Imports', () => {
  test('detects unused imports while preserving externalDeps backwards-compatibility', () => {
    const code = `
      import { usedHelper, unusedHelper } from './helpers.js';
      import express from 'express';
      import lodash from 'lodash';

      export function run() {
        return usedHelper() + lodash.identity('ok');
      }
    `;

    const result = analyzeSourceFile('service.ts', code);
    // Backwards compatibility: declared external deps are preserved
    assert.ok(result.externalDeps.includes('express'));
    assert.ok(result.externalDeps.includes('lodash'));

    // New capability: unusedImports accurately identifies unused packages & local specifiers
    assert.ok(result.unusedImports, 'unusedImports should be defined');
    assert.ok(result.unusedImports.includes('express'), 'express should be marked as unused');
    assert.strictEqual(result.unusedImports.includes('lodash'), false, 'lodash is used');
  });
});

describe('Phase 27 — Toolchain Entrypoint Allowlist & God Objects', () => {
  test('exempts infrastructure toolchain files from orphan status', () => {
    const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-infra-test-'));
    try {
      fs.writeFileSync(path.join(tmpProject, 'next.config.js'), 'module.exports = {};\n');
      fs.writeFileSync(path.join(tmpProject, 'tailwind.config.js'), 'module.exports = {};\n');
      fs.writeFileSync(path.join(tmpProject, 'orphan-helper.ts'), 'export function deadCode() {}\n');

      const graph = buildCodebaseGraph(tmpProject);
      const nextNode = graph.files['next.config.js'];
      const tailwindNode = graph.files['tailwind.config.js'];
      const orphanNode = graph.files['orphan-helper.ts'];

      assert.ok(nextNode, 'next.config.js should be indexed');
      assert.strictEqual(nextNode.role, 'infrastructure-root');
      assert.strictEqual(nextNode.isOrphan, false);

      assert.ok(tailwindNode, 'tailwind.config.js should be indexed');
      assert.strictEqual(tailwindNode.role, 'infrastructure-root');
      assert.strictEqual(tailwindNode.isOrphan, false);

      assert.ok(orphanNode, 'orphan-helper.ts should be indexed');
      assert.strictEqual(orphanNode.isOrphan, true);
    } finally {
      cleanup(tmpProject);
    }
  });

  test('computes coupling ratio and flags God Objects (>800 lines with <=2 exports)', () => {
    const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-god-test-'));
    try {
      // Create a 850-line file with only 1 export
      const lines = ['export function massiveHandler() {'];
      for (let i = 0; i < 850; i++) {
        lines.push(`  const x_${i} = ${i};`);
      }
      lines.push('}');
      fs.writeFileSync(path.join(tmpProject, 'giant.ts'), lines.join('\n'));

      const graph = buildCodebaseGraph(tmpProject);
      const giantNode = graph.files['giant.ts'];

      assert.ok(giantNode);
      assert.strictEqual(giantNode.isGodObject, true);
      assert.ok(giantNode.couplingRatio > 800);
    } finally {
      cleanup(tmpProject);
    }
  });
});

describe('Phase 27 — Duplicate Symbol Divergence & Causal Cycle Tracing', () => {
  test('compares duplicate symbols across files and identifies signature divergence', () => {
    const symA = { name: 'fetchUser', kind: 'function', line: 10, exported: true, meta: { signature: '(id: string) => Promise<User>' } };
    const symB = { name: 'fetchUser', kind: 'function', line: 42, exported: false, meta: { signature: '(id: number) => User' } };

    const div = compareDuplicateSymbols(symA, symB);
    assert.strictEqual(div.symbolName, 'fetchUser');
    assert.strictEqual(div.kindMatch, true);
    assert.strictEqual(div.signatureMatch, false);
    assert.strictEqual(div.exportMatch, false);
    assert.ok(div.divergenceTypes.includes('signature_divergence'));
    assert.ok(div.divergenceTypes.includes('export_visibility_mismatch'));
  });

  test('traces exact causal cycle path in circular dependencies', () => {
    const mockGraph = {
      files: {},
      dependencies: {
        'a.ts': ['b.ts'],
        'b.ts': ['c.ts'],
        'c.ts': ['a.ts'],
        'd.ts': ['a.ts'],
      },
      reverseDependencies: {
        'b.ts': ['a.ts'],
        'c.ts': ['b.ts'],
        'a.ts': ['c.ts', 'd.ts'],
      },
      stats: { totalFiles: 4, totalDependencies: 4, orphanFiles: 0, internalEdges: 4, externalPackages: 0 },
    };

    const cycle = findCircularDependencyPath(mockGraph, 'a.ts');
    assert.ok(cycle, 'should find circular cycle');
    assert.strictEqual(cycle[0], 'a.ts');
    assert.strictEqual(cycle[cycle.length - 1], 'a.ts');
    assert.deepStrictEqual(cycle, ['a.ts', 'b.ts', 'c.ts', 'a.ts']);

    const noCycle = findCircularDependencyPath(mockGraph, 'd.ts');
    // d.ts points to a.ts which loops back to a.ts, but does not loop back to d.ts
    assert.strictEqual(noCycle, null);
  });
});

describe('Phase 27 — Transitive Blast Radius Calculation', () => {
  test('calculates direct, transitive dependents and risk rating', () => {
    const mockGraph = {
      files: {
        'core.ts': { filePath: 'core.ts', imports: [], exports: [], symbols: [], routes: [], externalDeps: [], localDeps: [], linesCount: 100 },
        'auth.ts': { filePath: 'auth.ts', imports: [], exports: [], symbols: [], routes: [], externalDeps: [], localDeps: ['core.ts'], linesCount: 150 },
        'api.ts': { filePath: 'api.ts', imports: [], exports: [], symbols: [], routes: [], externalDeps: [], localDeps: ['auth.ts'], linesCount: 200 },
        'server.ts': { filePath: 'server.ts', imports: [], exports: [], symbols: [], routes: [], externalDeps: [], localDeps: ['api.ts'], linesCount: 300 },
      },
      dependencies: {
        'auth.ts': ['core.ts'],
        'api.ts': ['auth.ts'],
        'server.ts': ['api.ts'],
      },
      reverseDependencies: {
        'core.ts': ['auth.ts'],
        'auth.ts': ['api.ts'],
        'api.ts': ['server.ts'],
      },
      stats: { totalFiles: 4, totalDependencies: 3, orphanFiles: 0, internalEdges: 3, externalPackages: 0 },
    };

    const blast = calculateBlastRadius(mockGraph, ['core.ts']);
    assert.strictEqual(blast.targetFiles[0], 'core.ts');
    assert.deepStrictEqual(blast.directDependents, ['auth.ts']);
    assert.ok(blast.transitiveDependents.includes('api.ts'));
    assert.ok(blast.transitiveDependents.includes('server.ts'));
    assert.strictEqual(blast.totalAffectedFiles, 3);
    assert.ok(blast.impactScore > 0);
  });
});

describe('Phase 27 — Preflight Guardrails Cycle Trace Integration', () => {
  test('reports exact circular path in preflight guardrails violation message', () => {
    const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-preflight-cycle-'));
    try {
      const srcDir = path.join(tmpProject, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      fs.writeFileSync(path.join(srcDir, 'a.ts'), "import './b.js'; export const A = 1;\n");
      fs.writeFileSync(path.join(srcDir, 'b.ts'), "import './c.js'; export const B = 2;\n");
      fs.writeFileSync(path.join(srcDir, 'c.ts'), "import './a.js'; export const C = 3;\n");

      const planningDir = path.join(tmpProject, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });

      const report = runPreFlightChecks({
        taskId: 'cycle-task',
        filesToModify: ['src/a.ts'],
        planningDir,
        rootDir: tmpProject,
      });

      const cycleViolation = report.violations.find(v => v.rule === 'CIRCULAR_DEPENDENCY');
      assert.ok(cycleViolation, 'must detect circular dependency');
      assert.ok(cycleViolation.message.includes(' -> '), `Message should contain causal trace: ${cycleViolation.message}`);
    } finally {
      cleanup(tmpProject);
    }
  });
});

describe('Phase 27 — Visual Knowledge Graph Exporter & Review Lane', () => {
  test('exports infrastructure nodes with distinct type and palette in visual graph', () => {
    const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-vis-test-'));
    try {
      fs.writeFileSync(path.join(tmpProject, 'next.config.js'), 'module.exports = {};\n');
      fs.writeFileSync(path.join(tmpProject, 'index.ts'), "import './next.config.js';\n");

      const planningDir = path.join(tmpProject, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });

      const payload = buildVisualGraphPayload(planningDir, tmpProject);
      const infraNode = payload.nodes.find(n => n.id.includes('next.config.js'));

      assert.ok(infraNode, 'should include next.config.js');
      assert.strictEqual(infraNode.type, 'infrastructure');
      assert.strictEqual(infraNode.color, '#64748b');
      assert.ok(infraNode.label.startsWith('[INFRA]'));

      const html = generateVisualGraphHtml(payload);
      assert.ok(html.includes('Infra'), 'HTML should contain Infra filter pill and legend');
      assert.ok(html.includes('#64748b'), 'HTML should include slate grey color');
    } finally {
      cleanup(tmpProject);
    }
  });

  test('executeReview includes blastRadius and topCentralFiles in report', () => {
    const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-review-test-'));
    try {
      const planningDir = path.join(tmpProject, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });
      fs.writeFileSync(path.join(planningDir, 'STATE.md'), '# State\nPhase: Phase 27\n');

      fs.writeFileSync(path.join(tmpProject, 'a.ts'), "import './b.js'; export const a = 1;\n");
      fs.writeFileSync(path.join(tmpProject, 'b.ts'), "export const b = 2;\n");

      const report = executeReview(planningDir, tmpProject, false, ['a.ts']);
      assert.ok(report);
      assert.ok(Array.isArray(report.topCentralFiles));
      assert.ok(report.blastRadius !== undefined);
    } finally {
      cleanup(tmpProject);
    }
  });
});
