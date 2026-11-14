'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const { createTempDir, cleanup } = require('./helpers.cjs');

const GSD_TOOLS = path.join(__dirname, '..', 'gsd-core', 'bin', 'gsd-tools.cjs');

const agentRouter = require('../gsd-core/bin/lib/agent-command-router.cjs');
const embeddingAdapter = require('../gsd-core/bin/lib/embedding-adapter.cjs');
const evalRouter = require('../gsd-core/bin/lib/eval-command-router.cjs');
const verificationRouter = require('../gsd-core/bin/lib/verification-command-router.cjs');
const taskRouter = require('../gsd-core/bin/lib/task-command-router.cjs');
const uiEvidence = require('../gsd-core/bin/lib/ui-frontend-evidence.cjs');
const onboardProjection = require('../gsd-core/bin/lib/onboard-projection.cjs');

describe('agent-command-router', () => {
  test('classifyAgentFailure classifies quota exceeded with Retry-After header', () => {
    const res = agentRouter.classifyAgentFailure('HTTP 429 Too Many Requests\nRetry-After: 45');
    assert.strictEqual(res.class, agentRouter.AGENT_FAILURE_CLASSES.QUOTA_EXCEEDED);
    assert.strictEqual(res.sentinel, '429');
    assert.strictEqual(res.retryAfterSeconds, 45);
  });

  test('classifyAgentFailure classifies classifyHandoffIfNeeded regression sentinel', () => {
    const res = agentRouter.classifyAgentFailure('ReferenceError: classifyHandoffIfNeeded is not defined');
    assert.strictEqual(res.class, agentRouter.AGENT_FAILURE_CLASSES.CLASSIFY_HANDOFF_BUG);
    assert.strictEqual(res.sentinel, 'classifyhandoffifneeded is not defined');
  });

  test('classifyAgentFailure returns unknown-failure for empty and unrelated bodies', () => {
    assert.deepStrictEqual(agentRouter.classifyAgentFailure('   '), {
      class: agentRouter.AGENT_FAILURE_CLASSES.UNKNOWN_FAILURE,
    });
    assert.deepStrictEqual(agentRouter.classifyAgentFailure('ENOENT: missing file'), {
      class: agentRouter.AGENT_FAILURE_CLASSES.UNKNOWN_FAILURE,
    });
  });

  test('routeAgentCommand emits raw JSON for classify-failure', () => {
    const res = spawnSync(
      process.execPath,
      [GSD_TOOLS, 'agent', 'classify-failure', '--', 'usage_limit_reached', '--raw'],
      { encoding: 'utf8', timeout: 15_000 },
    );
    assert.strictEqual(res.status, 0, res.stderr);
    const parsed = JSON.parse(res.stdout);
    assert.strictEqual(parsed.class, 'quota-exceeded');
    assert.strictEqual(parsed.sentinel, 'usage_limit_reached');
  });
});

describe('embedding-adapter', () => {
  test('exposes frozen ADAPTER_KINDS containing declarative and imperative', () => {
    assert.ok(Object.isFrozen(embeddingAdapter.ADAPTER_KINDS));
    assert.deepStrictEqual(embeddingAdapter.ADAPTER_KINDS, ['declarative', 'imperative']);
  });
});

describe('eval-command-router', () => {
  test('dispatches eval score to evalMod.cmdEvalScore', () => {
    const calls = [];
    evalRouter.routeEvalCommand({
      evalMod: { cmdEvalScore: (cwd, args, raw) => calls.push({ cwd, args, raw }) },
      args: ['eval', 'score', 'fixture'],
      cwd: '/tmp/proj',
      raw: true,
      error: (msg) => {
        throw new Error(`unexpected error: ${msg}`);
      },
    });
    assert.deepStrictEqual(calls, [{ cwd: '/tmp/proj', args: ['eval', 'score', 'fixture'], raw: true }]);
  });

  test('reports unknown eval subcommands through error callback', () => {
    const errors = [];
    evalRouter.routeEvalCommand({
      evalMod: { cmdEvalScore: () => {} },
      args: ['eval', 'unknown-op'],
      cwd: '/tmp/proj',
      raw: false,
      error: (msg) => errors.push(msg),
    });
    assert.strictEqual(errors.length, 1);
    assert.match(errors[0], /Unknown eval subcommand/);
  });
});

describe('verification-command-router', () => {
  test('dispatches status and resolve-file subcommands with args[2]', () => {
    const seen = [];
    const verification = {
      cmdVerificationStatus: (cwd, arg, raw) => seen.push(['status', cwd, arg, raw]),
      cmdVerificationResolveFile: (cwd, arg, raw) => seen.push(['resolve-file', cwd, arg, raw]),
    };
    verificationRouter.routeVerificationCommand({
      verification,
      args: ['verification', 'status', '01-init'],
      cwd: '/tmp/proj',
      raw: true,
      error: (msg) => {
        throw new Error(`unexpected error: ${msg}`);
      },
    });
    verificationRouter.routeVerificationCommand({
      verification,
      args: ['verification', 'resolve-file', '01-init'],
      cwd: '/tmp/proj',
      raw: false,
      error: (msg) => {
        throw new Error(`unexpected error: ${msg}`);
      },
    });
    assert.deepStrictEqual(seen, [
      ['status', '/tmp/proj', '01-init', true],
      ['resolve-file', '/tmp/proj', '01-init', false],
    ]);
  });

  test('reports unknown verification subcommand via error callback', () => {
    const errors = [];
    verificationRouter.routeVerificationCommand({
      verification: {
        cmdVerificationStatus: () => {},
        cmdVerificationResolveFile: () => {},
      },
      args: ['verification', 'nope'],
      cwd: '/tmp/proj',
      raw: false,
      error: (msg) => errors.push(msg),
    });
    assert.strictEqual(errors.length, 1);
    assert.match(errors[0], /Unknown verification subcommand/);
  });
});

describe('task-command-router', () => {
  test('isBehaviorAddingTaskContent detects complete TDD task block', () => {
    const xml = '<task type="auto" tdd="true"><behavior>Returns normalized value</behavior><files>src/core.ts, tests/core.test.ts</files></task>';
    const res = taskRouter.isBehaviorAddingTaskContent(xml);
    assert.strictEqual(res.is_behavior_adding, true);
    assert.deepStrictEqual(res.checks, {
      tdd_true: true,
      has_behavior_block: true,
      has_source_files: true,
    });
    assert.strictEqual(res.reason, null);
  });

  test('isBehaviorAddingTaskContent rejects docs-only, test-only, or non-TDD tasks', () => {
    const docsOnly = '<task tdd="true"><behavior>Doc update</behavior><files>README.md, package.json, .env.example</files></task>';
    const resDocs = taskRouter.isBehaviorAddingTaskContent(docsOnly);
    assert.strictEqual(resDocs.is_behavior_adding, false);
    assert.strictEqual(resDocs.checks.has_source_files, false);
    assert.match(resDocs.reason, /no non-test source file/);

    const noTdd = '<task><behavior></behavior><files>src/app.ts</files></task>';
    const resNoTdd = taskRouter.isBehaviorAddingTaskContent(noTdd);
    assert.strictEqual(resNoTdd.is_behavior_adding, false);
    assert.strictEqual(resNoTdd.checks.tdd_true, false);
    assert.strictEqual(resNoTdd.checks.has_behavior_block, false);
  });

  test('routeTaskCommand evaluates inline --task-content and writes raw JSON', () => {
    const res = spawnSync(
      process.execPath,
      [
        GSD_TOOLS,
        'task',
        'is-behavior-adding',
        '--task-content',
        '<task tdd="true"><behavior>x</behavior><files>src/a.ts</files></task>',
        '--raw',
      ],
      { encoding: 'utf8', timeout: 15_000 },
    );
    assert.strictEqual(res.status, 0, res.stderr);
    const parsed = JSON.parse(res.stdout);
    assert.strictEqual(parsed.is_behavior_adding, true);
  });
});

describe('ui-frontend-evidence', () => {
  test('returns false for empty/invalid paths and backend-only packages', (t) => {
    assert.strictEqual(uiEvidence.hasStaticFrontendEvidence(''), false);
    assert.strictEqual(uiEvidence.hasStaticFrontendEvidence(null), false);

    const dir = createTempDir('gsd-ui-ev-none-');
    t.after(() => cleanup(dir));
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { express: '^5.0.0' } }));
    fs.writeFileSync(path.join(dir, 'index.html'), '<html></html>');
    assert.strictEqual(uiEvidence.hasStaticFrontendEvidence(dir), false);
  });

  test('detects UI framework dependencies and component files while skipping node_modules', (t) => {
    const dirDeps = createTempDir('gsd-ui-ev-deps-');
    t.after(() => cleanup(dirDeps));
    fs.writeFileSync(path.join(dirDeps, 'package.json'), JSON.stringify({ devDependencies: { react: '^19.0.0' } }));
    assert.strictEqual(uiEvidence.hasStaticFrontendEvidence(dirDeps), true);

    const dirTree = createTempDir('gsd-ui-ev-tree-');
    t.after(() => cleanup(dirTree));
    fs.mkdirSync(path.join(dirTree, 'node_modules', 'pkg'), { recursive: true });
    fs.writeFileSync(path.join(dirTree, 'node_modules', 'pkg', 'Ignored.tsx'), 'export const X = 1;');
    assert.strictEqual(uiEvidence.hasStaticFrontendEvidence(dirTree), false);

    fs.mkdirSync(path.join(dirTree, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dirTree, 'src', 'App.tsx'), 'export function App() { return null; }');
    assert.strictEqual(uiEvidence.hasStaticFrontendEvidence(dirTree), true);
  });
});

describe('onboard-projection', () => {
  test('greenfield directory recommends new-project (or ingest-docs when PRD candidates exist)', (t) => {
    const dir = createTempDir('gsd-onboard-green-');
    t.after(() => cleanup(dir));

    const green = onboardProjection.buildOnboardProjection(dir, { commitDocs: true, fast: false, textMode: false });
    assert.strictEqual(green.is_brownfield, false);
    assert.strictEqual(green.map_readiness, 'none');
    assert.strictEqual(green.next_action.kind, 'new-project');

    fs.mkdirSync(path.join(dir, 'docs', 'prd'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'docs', 'prd', 'spec.md'), '# Spec');
    const withDocs = onboardProjection.buildOnboardProjection(dir, { commitDocs: true, fast: false, textMode: false });
    assert.strictEqual(withDocs.has_docs_candidates, true);
    assert.strictEqual(withDocs.next_action.kind, 'ingest-docs');
  });

  test('brownfield directory recommends map-codebase and honors fast map readiness', (t) => {
    const dir = createTempDir('gsd-onboard-brown-');
    t.after(() => cleanup(dir));
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'demo' }));
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'main.ts'), 'export const x = 1;');

    const beforeMap = onboardProjection.buildOnboardProjection(dir, { commitDocs: false, fast: true, textMode: true });
    assert.strictEqual(beforeMap.has_existing_code, true);
    assert.strictEqual(beforeMap.has_package_file, true);
    assert.strictEqual(beforeMap.is_brownfield, true);
    assert.strictEqual(beforeMap.needs_fast_codebase_map, true);
    assert.strictEqual(beforeMap.next_action.kind, 'map-codebase');

    const codebaseDir = path.join(dir, '.planning', 'codebase');
    fs.mkdirSync(codebaseDir, { recursive: true });
    for (const file of onboardProjection.FAST_CODEBASE_MAP_FILES) {
      fs.writeFileSync(path.join(codebaseDir, file), `# ${file}\n`);
    }

    const afterFastMap = onboardProjection.buildOnboardProjection(dir, { commitDocs: false, fast: true, textMode: false });
    assert.strictEqual(afterFastMap.map_readiness, 'fast');
    assert.strictEqual(afterFastMap.has_fast_codebase_map, true);
    assert.strictEqual(afterFastMap.needs_fast_codebase_map, false);
    assert.strictEqual(afterFastMap.next_action.kind, 'complete-map-before-new-project');

    for (const file of onboardProjection.REQUIRED_CODEBASE_MAP_FILES) {
      fs.writeFileSync(path.join(codebaseDir, file), `# ${file}\n`);
    }
    const afterFullMap = onboardProjection.buildOnboardProjection(dir, { commitDocs: false, fast: false, textMode: false });
    assert.strictEqual(afterFullMap.map_readiness, 'complete');
    assert.strictEqual(afterFullMap.next_action.kind, 'new-project');
  });
});
