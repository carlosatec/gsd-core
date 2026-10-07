'use strict';

/**
 * Phase 31 Integration Suite: Unified Graph SSOT, Semantic Edge Typing & Closed-Loop Intelligence.
 *
 * Validates:
 * 1. Single Source of Truth (SSOT) graph location resolution and deduplication.
 * 2. Git commit SHA pinning in AST graph stats.
 * 3. Semantic edge typing (type_only vs runtime) across TypeScript/JavaScript and Astro.
 * 4. Damped Blast Radius impact scoring for type-only consumers.
 * 5. Polyglot AST analysis: Zig (.zig), Astro (.astro), Protobuf (.proto), and Rust `mod` resolution.
 * 6. Closed-loop System One auto-ingestion of anti-patterns from anti-patterns.json.
 * 7. Test topology co-evolution guard and auto-pass inhibition.
 * 8. O(1) Intel ecosystem freshness validation (checkIntelHealth).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// Core modules under test
const codebaseAst = require('../gsd-core/bin/lib/codebase-ast-analyzer.cjs');
const graphify = require('../gsd-core/bin/lib/graphify.cjs');
const intel = require('../gsd-core/bin/lib/intel.cjs');
const systemOne = require('../gsd-core/bin/lib/system-one-engine.cjs');
const antiPatternStore = require('../gsd-core/bin/lib/anti-pattern-store.cjs');

const {
  analyzeSourceFile,
  analyzeZigFile,
  analyzeAstroFile,
  analyzeProtoFile,
  buildCodebaseGraph,
  calculateBlastRadius,
} = codebaseAst;

const {
  resolveGraphLocation,
} = graphify;

const { checkIntelHealth } = intel;
const { AstAnalyticalProvider, QualityHead } = systemOne;
const { recordAntiPattern } = antiPatternStore;

describe('Phase 31 — Unified Graph SSOT & Git Commit Pinning', () => {
  it('prioritizes .planning/intel/codebase-graph.json as canonical SSOT', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-p31-ssot-'));
    const planningDir = path.join(tmpDir, '.planning');
    const intelDir = path.join(planningDir, 'intel');
    const graphsDir = path.join(planningDir, 'graphs');

    fs.mkdirSync(intelDir, { recursive: true });
    fs.mkdirSync(graphsDir, { recursive: true });

    const canonicalPath = path.join(intelDir, 'codebase-graph.json');
    const legacyPath = path.join(graphsDir, 'graph.json');

    fs.writeFileSync(canonicalPath, JSON.stringify({ nodes: [], files: {} }));
    fs.writeFileSync(legacyPath, JSON.stringify({ nodes: [], files: {} }));

    const loc = resolveGraphLocation(tmpDir, planningDir);
    assert.equal(loc.graphPath, canonicalPath);
    assert.equal(loc.configured, false);
  });

  it('falls back to legacy .planning/graphs/graph.json when canonical file is absent', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-p31-fallback-'));
    const planningDir = path.join(tmpDir, '.planning');
    const graphsDir = path.join(planningDir, 'graphs');

    fs.mkdirSync(graphsDir, { recursive: true });
    const legacyPath = path.join(graphsDir, 'graph.json');
    fs.writeFileSync(legacyPath, JSON.stringify({ nodes: [], files: {} }));

    const loc = resolveGraphLocation(tmpDir, planningDir);
    assert.equal(loc.graphPath, legacyPath);
    assert.equal(loc.configured, false);
  });

  it('records gitCommitSha in graph.stats when analyzing a git repository', () => {
    const graph = buildCodebaseGraph(process.cwd(), { liteMode: true, maxFiles: 5 });
    assert.ok(graph.stats);
    assert.equal(typeof graph.stats.gitCommitSha, 'string');
    assert.ok(graph.stats.gitCommitSha.length >= 7);
  });
});

describe('Phase 31 — Semantic Edge Typing & Blast Radius Damping', () => {
  it('differentiates type_only from runtime imports in TypeScript', () => {
    const tsCode = `
import type { UserProfile } from './types.js';
import { calculateDiscount } from './pricing.js';
export function render(profile: UserProfile): number {
  return calculateDiscount(100);
}
`;
    const res = analyzeSourceFile('src/checkout.ts', tsCode);
    assert.ok(res.dependencyKinds);
    assert.equal(res.dependencyKinds['./types.js'], 'type_only');
    assert.equal(res.dependencyKinds['./pricing.js'], 'runtime');
  });

  it('damps blast radius impact score when dependents are purely type-only consumers', () => {
    const mockGraph = {
      version: '2.2.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      root: '/mock',
      stats: { totalFiles: 3, totalSymbols: 10, totalExports: 3, totalRoutes: 0, scanDurationMs: 1 },
      files: {
        'types.ts': {
          filePath: 'types.ts',
          imports: [],
          exports: [{ name: 'UserDto', kind: 'interface', isTypeOnly: true }],
          symbols: [{ name: 'UserDto', kind: 'interface', line: 1, exported: true, isTypeOnly: true }],
          routes: [],
          externalDeps: [],
          localDeps: [],
          linesCount: 10,
        },
        'consumer-type.ts': {
          filePath: 'consumer-type.ts',
          imports: [{ source: './types.js', specifiers: ['UserDto'], isTypeOnly: true, isRelative: true }],
          exports: [],
          symbols: [],
          routes: [],
          externalDeps: [],
          localDeps: ['types.ts'],
          linesCount: 20,
          dependencyKinds: {
            'types.ts': 'type_only',
          },
        },
        'consumer-runtime.ts': {
          filePath: 'consumer-runtime.ts',
          imports: [{ source: './types.js', specifiers: ['UserDto'], isTypeOnly: false, isRelative: true }],
          exports: [],
          symbols: [],
          routes: [],
          externalDeps: [],
          localDeps: ['types.ts'],
          linesCount: 20,
          dependencyKinds: {
            'types.ts': 'runtime',
          },
        },
      },
      symbolIndex: {},
      reverseDependencies: {
        'types.ts': ['consumer-type.ts'],
      },
      pageRankScores: {
        'types.ts': 0.05,
        'consumer-type.ts': 0.05,
        'consumer-runtime.ts': 0.05,
      },
      routes: [],
    };

    // Calculate blast radius for type-only consumer
    const typeBlast = calculateBlastRadius(mockGraph, ['types.ts']);

    // Now switch reverse dependency to runtime consumer
    mockGraph.reverseDependencies['types.ts'] = ['consumer-runtime.ts'];
    const runtimeBlast = calculateBlastRadius(mockGraph, ['types.ts']);

    // Type-only consumer must have lower impactScore than runtime consumer
    assert.ok(typeBlast.impactScore < runtimeBlast.impactScore);
    assert.equal(typeBlast.directDependents.length, 1);
    assert.equal(runtimeBlast.directDependents.length, 1);
  });
});

describe('Phase 31 — Polyglot AST Engine Expansions', () => {
  it('analyzes Zig files (.zig) with struct, pub fn, and @import', () => {
    const zigCode = `
const std = @import("std");
const math = @import("./math.zig");

pub const Config = struct {
    port: u16,
};

pub fn init() Config {
    return Config{ .port = 8080 };
}

fn privateHelper() void {}
`;
    const res = analyzeZigFile('src/server.zig', zigCode);
    assert.equal(res.language, 'zig');
    assert.ok(res.localDeps.includes('./math.zig'));
    assert.ok(res.externalDeps.includes('std'));
    assert.ok(res.symbols.some(s => s.name === 'Config' && s.kind === 'struct' && s.exported));
    assert.ok(res.symbols.some(s => s.name === 'init' && s.kind === 'function' && s.exported));
    assert.ok(res.symbols.some(s => s.name === 'privateHelper' && !s.exported));
  });

  it('analyzes Astro files (.astro) with frontmatter and components', () => {
    const astroCode = `---
import Header from '../components/Header.astro';
import type { PageProps } from '../types';

export interface Props {
  title: string;
}
---
<main>
  <Header />
</main>
`;
    const res = analyzeAstroFile('src/pages/index.astro', astroCode);
    assert.equal(res.language, 'astro');
    assert.ok(res.symbols.some(s => s.name === 'index' && s.kind === 'component'));
    assert.ok(res.symbols.some(s => s.name === 'Props' && s.kind === 'interface'));
    assert.ok(res.localDeps.includes('../components/Header.astro'));
    assert.equal(res.dependencyKinds['../types'], 'type_only');
    assert.equal(res.dependencyKinds['../components/Header.astro'], 'runtime');
  });

  it('analyzes Protobuf files (.proto) with messages, services, and rpc', () => {
    const protoCode = `
syntax = "proto3";
package users.v1;

import "common.proto";

message UserRequest {
  string id = 1;
}

service UserService {
  rpc GetUser (UserRequest) returns (UserResponse);
}

enum Status {
  ACTIVE = 0;
  INACTIVE = 1;
}
`;
    const res = analyzeProtoFile('proto/user.proto', protoCode);
    assert.equal(res.language, 'protobuf');
    assert.ok(res.symbols.some(s => s.name === 'UserRequest' && s.kind === 'model'));
    assert.ok(res.symbols.some(s => s.name === 'UserService' && s.kind === 'service'));
    assert.ok(res.symbols.some(s => s.name === 'Status' && s.kind === 'enum'));
    assert.ok(res.routes.some(r => r.path === '/rpc/GetUser' && r.method === 'POST'));
    assert.ok(res.localDeps.includes('common.proto'));
  });

  it('resolves Rust module declarations (mod <name>;)', () => {
    const rustCode = `
pub mod handlers;
mod internal_state;
use std::collections::HashMap;

pub fn start() {}
`;
    const res = analyzeSourceFile('src/main.rs', rustCode);
    assert.ok(res.localDeps.includes('./handlers'));
    assert.ok(res.localDeps.includes('./internal_state'));
    assert.ok(res.symbols.some(s => s.name === 'handlers' && s.exported));
  });
});

describe('Phase 31 — Closed-Loop Intelligence & Test Co-Evolution', () => {
  it('elevates risk score in System One when anti-patterns are recorded for the file', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-p31-anti-'));
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });

    // Record an anti-pattern for critical-auth.ts
    recordAntiPattern(planningDir, {
      file: 'src/critical-auth.ts',
      error: 'JWT expiration race condition in verifyToken',
      lesson: 'Always validate clock tolerance before rejecting bearer token',
    });

    const provider = new AstAnalyticalProvider();
    const result = provider.evaluateRiskScore('src/critical-auth.ts', null, {
      planningDir,
      diff: 'const x = 1;',
      diffLines: 1,
    });

    assert.ok(result.score >= 2, 'Score must be elevated to at least 2 for repeat offender file');
    assert.ok(result.warning && result.warning.includes('anti-patterns.json'));
    assert.ok(result.warning.includes('clock tolerance'));
  });

  it('detects missing test co-evolution when executable code changes without tests', () => {
    const qHead = new QualityHead();

    // Modifying production code without modifying tests
    const reportWithoutTests = qHead.evaluate('src/payment.ts', {
      diff: 'export function charge() { return true; }',
      diffLines: 20,
      testModified: false,
    });

    assert.equal(reportWithoutTests.score, 2);
    assert.ok(reportWithoutTests.reason.includes('co-evolução de testes ausente'));

    // Modifying production code WITH test modifications
    const reportWithTests = qHead.evaluate('src/payment.ts', {
      diff: 'export function charge() { return true; }',
      diffLines: 20,
      testModified: true,
    });

    assert.equal(reportWithTests.score, 1);
  });
});

describe('Phase 31 — checkIntelHealth Ecosystem Diagnostic', () => {
  it('reports healthy when graph exists and commit is fresh', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-p31-health-'));
    const planningDir = path.join(tmpDir, '.planning');
    const intelDir = path.join(planningDir, 'intel');
    fs.mkdirSync(intelDir, { recursive: true });

    // Build real graph in current repo to capture HEAD commit
    const realGraph = buildCodebaseGraph(process.cwd(), { liteMode: true, maxFiles: 3 });
    fs.writeFileSync(path.join(intelDir, 'codebase-graph.json'), JSON.stringify(realGraph, null, 2));

    const health = checkIntelHealth(planningDir, process.cwd());
    assert.equal(health.graphExists, true);
    assert.equal(health.healthy, true);
    assert.equal(health.stale, false);
    assert.ok(health.gitCommitSha);
    assert.ok(health.message.includes('saudável'));
  });

  it('reports stale when graph commit diverges from current git HEAD', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-p31-stale-'));
    const planningDir = path.join(tmpDir, '.planning');
    const intelDir = path.join(planningDir, 'intel');
    fs.mkdirSync(intelDir, { recursive: true });

    const staleGraph = {
      version: '2.2.0',
      stats: {
        totalFiles: 10,
        totalSymbols: 50,
        gitCommitSha: '0000000000000000000000000000000000000000',
      },
      files: {},
      symbolIndex: {},
      reverseDependencies: {},
      routes: [],
    };
    fs.writeFileSync(path.join(intelDir, 'codebase-graph.json'), JSON.stringify(staleGraph, null, 2));

    const health = checkIntelHealth(planningDir, process.cwd());
    assert.equal(health.graphExists, true);
    assert.equal(health.stale, true);
    assert.equal(health.healthy, false);
    assert.ok(health.message.includes('defasado'));
  });
});
