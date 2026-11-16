'use strict';

// Tests for graphify.cjs — staleness, mvp-viz, and regressions describe blocks.
// Split from the consolidated 2336-LOC file. Refs #3761.

const { describe, test, beforeEach, afterEach, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('node:os');
const { runNode } = require('./helpers/process-seam.cjs');
const { throwIfFailed } = require('./helpers/git-fixture.cjs');
const { BUILD_TIMEOUT_MS, INSTALL_TIMEOUT_MS } = require('./helpers/timeouts.cjs');
const { createTempProject, createTempGitProject, cleanup } = require('./helpers.cjs');

const {
  graphifyStatus,
} = require('../gsd-core/bin/lib/graphify.cjs');

const {
  enableGraphify,
  writeGraphJson,
  gitHead,
  commitEmpty,
  SAMPLE_NODES_MINIMAL,
} = require('./helpers/graphify.cjs');

// ─── staleness describe ──────────────────────────────────────────────────────

describe('staleness', () => {
  // Regression for #3170: graphifyStatus surfaces built_at_commit staleness.
  // graphify v0.7+ embeds `built_at_commit` into graph.json at write time.
  // Tri-state on commit_stale: null means "we don't know" (pre-v0.7 graph or
  // no git), which is semantically distinct from false ("known fresh").

  describe('git-aware', () => {
    let tmpDir;
    let planningDir;

    beforeEach(() => {
      tmpDir = createTempGitProject();
      planningDir = path.join(tmpDir, '.planning');
      enableGraphify(planningDir);
    });

    afterEach(() => cleanup(tmpDir));

    test('graph rebuilt at HEAD: commits_behind=0, commit_stale=false', () => {
      const head = gitHead(tmpDir);
      writeGraphJson(planningDir, { nodes: SAMPLE_NODES_MINIMAL, edges: [], built_at_commit: head });

      const result = graphifyStatus(tmpDir);

      assert.equal(result.built_at_commit, head.slice(0, 7),
        'short hash from graph.built_at_commit');
      assert.equal(result.current_commit, head.slice(0, 7),
        'short hash of git HEAD');
      assert.equal(result.commits_behind, 0,
        'zero commits between HEAD and itself');
      assert.equal(result.commit_stale, false,
        'commit_stale is explicitly false when commits_behind === 0');
    });

    test('graph 5 commits behind HEAD: commits_behind=5, commit_stale=true', () => {
      const built = gitHead(tmpDir);
      for (let i = 0; i < 5; i += 1) commitEmpty(tmpDir, `c${i}`);
      writeGraphJson(planningDir, { nodes: SAMPLE_NODES_MINIMAL, edges: [], built_at_commit: built });

      const result = graphifyStatus(tmpDir);

      assert.equal(result.commits_behind, 5);
      assert.equal(result.commit_stale, true);
      assert.equal(result.built_at_commit, built.slice(0, 7));
      assert.notEqual(result.current_commit, built.slice(0, 7),
        'current_commit reflects HEAD, not graph build commit');
    });

    test('built_at_commit absent (pre-v0.7 graph): all four new fields null', () => {
      // No built_at_commit on the graph -- GSD must not fabricate one.
      writeGraphJson(planningDir, { nodes: SAMPLE_NODES_MINIMAL, edges: [] });

      const result = graphifyStatus(tmpDir);

      assert.equal(result.built_at_commit, null);
      assert.equal(result.commits_behind, null);
      assert.equal(result.commit_stale, null,
        'tri-state: null means "we do not know", not "fresh"');
      // current_commit may still be non-null since we are in a git repo,
      // but without a baseline it cannot drive staleness.
      assert.notEqual(result.current_commit, undefined,
        'current_commit field is always present even when null');
    });

    test('rebased-away built_at_commit: commits_behind=null, commit_stale=null', () => {
      // built_at_commit references a commit that never existed in this repo.
      const ghostHash = '0000000000000000000000000000000000000001';
      writeGraphJson(planningDir, { nodes: SAMPLE_NODES_MINIMAL, edges: [], built_at_commit: ghostHash });

      const result = graphifyStatus(tmpDir);

      assert.equal(result.built_at_commit, ghostHash.slice(0, 7),
        'echoes the field even if unreachable -- caller can decide what to do');
      assert.equal(result.commits_behind, null,
        'cannot count commits to an unreachable commit');
      assert.equal(result.commit_stale, null,
        'unknown distance means unknown staleness');
    });

    test('malformed built_at_commit (dashed argv): rejected before git invocation', () => {
      // Argument-injection fence: a graph.json with a hostile built_at_commit
      // must never reach `git` as an argv element. The implementation should
      // validate /^[0-9a-f]{4,40}$/i and treat anything else as absent.
      const malicious = '--upload-pack=evil';
      writeGraphJson(planningDir, { nodes: SAMPLE_NODES_MINIMAL, edges: [], built_at_commit: malicious });

      const result = graphifyStatus(tmpDir);

      assert.equal(result.built_at_commit, null,
        'malformed value is rejected, not echoed');
      assert.equal(result.commits_behind, null);
      assert.equal(result.commit_stale, null);
    });
  });

  describe('non-git cwd', () => {
    let tmpDir;
    let planningDir;

    beforeEach(() => {
      tmpDir = createTempProject();
      planningDir = path.join(tmpDir, '.planning');
      enableGraphify(planningDir);
    });

    afterEach(() => cleanup(tmpDir));

    test('cwd has no .git: current_commit=null, derived fields=null', () => {
      const built = 'abcdef1234567890abcdef1234567890abcdef12';
      writeGraphJson(planningDir, { nodes: SAMPLE_NODES_MINIMAL, edges: [], built_at_commit: built });

      const result = graphifyStatus(tmpDir);

      assert.equal(result.built_at_commit, built.slice(0, 7),
        'graph field is echoed even without a local repo');
      assert.equal(result.current_commit, null,
        'no HEAD without git');
      assert.equal(result.commits_behind, null);
      assert.equal(result.commit_stale, null);
    });
  });

  describe('back-compat', () => {
    let tmpDir;
    let planningDir;

    beforeEach(() => {
      tmpDir = createTempGitProject();
      planningDir = path.join(tmpDir, '.planning');
      enableGraphify(planningDir);
      writeGraphJson(planningDir, {
        nodes: SAMPLE_NODES_MINIMAL,
        edges: [{ source: 'n1', target: 'n2', label: 'x', confidence: 'EXTRACTED' }],
        hyperedges: [],
        built_at_commit: gitHead(tmpDir),
      });
    });

    afterEach(() => cleanup(tmpDir));

    test('existing fields are unchanged when commit-staleness fields are added', () => {
      const result = graphifyStatus(tmpDir);

      // Existing contract — must not regress.
      assert.equal(result.exists, true);
      assert.equal(result.node_count, 2);
      assert.equal(result.edge_count, 1);
      assert.equal(result.hyperedge_count, 0);
      assert.equal(typeof result.last_build, 'string');
      assert.equal(typeof result.stale, 'boolean',
        'mtime-based stale flag stays as-is for back-compat');
      assert.equal(typeof result.age_hours, 'number');
    });

    test('disabled response is unchanged (commit-staleness fields not added)', () => {
      const tmp2 = createTempProject();
      try {
        const result = graphifyStatus(tmp2);
        assert.equal(result.disabled, true,
          'disabled path returns the existing shape, no commit fields');
        assert.equal(result.built_at_commit, undefined,
          'commit-staleness fields are only added on the success path');
      } finally {
        cleanup(tmp2);
      }
    });
  });
});

// ─── mvp-viz describe ─────────────────────────────────────────────────────────

function loadGraphCommandContract() {
  const cmdPath = path.join(__dirname, '..', 'commands', 'gsd', 'graph.md');
  const markdown = fs.readFileSync(cmdPath, 'utf8');
  const lines = markdown.split(/\r?\n/);
  const delims = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim() === '---') delims.push(i);
    if (delims.length === 2) break;
  }
  assert.equal(delims.length, 2, 'graph.md must have a closed frontmatter block');
  const fmLines = lines.slice(delims[0] + 1, delims[1]);
  const frontmatter = {};
  let activeList = null;
  for (const raw of fmLines) {
    const listItem = raw.match(/^\s+-\s+(.+?)\s*$/);
    if (listItem && activeList) {
      activeList.push(listItem[1]);
      continue;
    }
    const kv = raw.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!kv) continue;
    const [, key, rawValue] = kv;
    const value = rawValue.trim();
    if (value === '') {
      activeList = [];
      frontmatter[key] = activeList;
    } else {
      activeList = null;
      frontmatter[key] = value;
    }
  }
  const body = lines.slice(delims[1] + 1).join('\n');
  const bodyLines = body.split(/\r?\n/);
  const fencedBlocks = [];
  let active = null;
  for (const line of bodyLines) {
    const open = line.match(/^```(\S*)\s*$/);
    if (active === null) {
      if (open) active = { lang: open[1] || '', lines: [] };
      continue;
    }
    if (line.trim() === '```') {
      fencedBlocks.push({ lang: active.lang, content: active.lines.join('\n') });
      active = null;
      continue;
    }
    active.lines.push(line);
  }
  return { frontmatter, body, fencedBlocks };
}

describe('graph-command-contract', () => {
  test('graph.md declares gsd:graph name and visualization/export flags', () => {
    const { frontmatter, body } = loadGraphCommandContract();
    assert.equal(frontmatter.name, 'gsd:graph');
    for (const flag of ['--vault', '--canvas', '--open', '--no-open']) {
      assert.ok(
        String(frontmatter['argument-hint'] || '').includes(flag),
        `argument-hint must advertise ${flag}`,
      );
    }
    assert.ok(
      body.includes('@~/.claude/gsd-core/workflows/analyze-dependencies.md'),
      'execution_context must point to workflows/analyze-dependencies.md',
    );
  });

  test('graph.md documents graph-view HTML, Obsidian canvas, and Second Brain vault outputs', () => {
    const { body } = loadGraphCommandContract();
    assert.ok(body.includes('.planning/intel/graph-view.html'), 'must document interactive HTML output');
    assert.ok(body.includes('.planning/ROADMAP.canvas'), 'must document Obsidian canvas output');
    assert.ok(body.includes('.planning/vault/'), 'must document Second Brain vault output directory');
  });
});

// ─── regressions describe ─────────────────────────────────────────────────────

describe('regressions', () => {
  // Regression for #3166 (aligned to canonical commands/gsd/graph.md):
  // graph generation runs inline via gsd-tools without spawning Task subagents.
  test('graph.md allowed-tools does not include Task (inline build fence)', () => {
    const { frontmatter } = loadGraphCommandContract();
    assert.ok(Array.isArray(frontmatter['allowed-tools']), 'allowed-tools must be a YAML block list');
    assert.ok(frontmatter['allowed-tools'].length > 0, 'allowed-tools must declare at least one tool');
    assert.ok(
      !frontmatter['allowed-tools'].includes('Task'),
      'Task must NOT be in allowed-tools (#3166 inline build invariant)',
    );
  });

  test('graph.md frontmatter retains Read, Write, and Bash (inline export prerequisites)', () => {
    const { frontmatter } = loadGraphCommandContract();
    const tools = frontmatter['allowed-tools'];
    assert.ok(tools.includes('Read'), 'Read required for state inspection');
    assert.ok(tools.includes('Write'), 'Write required for graph/vault exports');
    assert.ok(tools.includes('Bash'), 'Bash required for inline gsd-tools graph command');
  });

  test('no fenced code block in graph.md invokes Task() agent spawn syntax', () => {
    const { fencedBlocks } = loadGraphCommandContract();
    const offending = fencedBlocks.filter(b => b.content.includes('Task('));
    assert.deepEqual(offending, [], 'no fenced code block in graph.md may contain Task(');
  });

  test('graph.md dispatches to gsd-tools graph in its process steps', () => {
    const { body } = loadGraphCommandContract();
    assert.ok(body.includes('gsd-tools graph'), 'process must dispatch to gsd-tools graph');
  });

  // ── Regression for #3579 ────────────────────────────────────────────────────
  // graphify auto-update hook was dead-on-arrival in 1.50.0-canary.x because:
  //   Gap 1: scripts/build-hooks.js HOOKS_TO_COPY did not include
  //           gsd-graphify-update.sh
  //   Gap 2: hooks/lib/gsd-graphify-rebuild.sh not copied by installer
  // Test strategy: run the actual build and assert filesystem outcomes.

  const REPO_ROOT_3579 = path.resolve(__dirname, '..');
  const HOOKS_DIR_3579 = path.join(REPO_ROOT_3579, 'hooks');
  const DIST_DIR_3579 = path.join(HOOKS_DIR_3579, 'dist');
  const BUILD_SCRIPT_3579 = path.join(REPO_ROOT_3579, 'scripts', 'build-hooks.js');
  const INSTALL_SCRIPT_3579 = path.join(REPO_ROOT_3579, 'bin', 'install.js');

  // Regression for #3579: Gap 1 — build-hooks.js packages every top-level hooks/*.sh
  describe('#3579 Gap 1: build-hooks.js packages every top-level hooks/*.sh into dist', () => {
    before(() => {
      const r = runNode([BUILD_SCRIPT_3579], { timeoutMs: BUILD_TIMEOUT_MS });
      throwIfFailed(r, `node ${BUILD_SCRIPT_3579}`);
    });

    test('every top-level hooks/*.sh is emitted to hooks/dist/ by the build', () => {
      const topLevelSh = fs
        .readdirSync(HOOKS_DIR_3579, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.endsWith('.sh'))
        .map((e) => e.name);

      assert.ok(topLevelSh.length > 0, 'expected at least one top-level hooks/*.sh in source');

      const missing = topLevelSh.filter(
        (sh) => !fs.existsSync(path.join(DIST_DIR_3579, sh))
      );
      assert.deepStrictEqual(
        missing,
        [],
        `every top-level hooks/*.sh must be emitted to hooks/dist/ by scripts/build-hooks.js; missing from dist: ${JSON.stringify(missing)}`
      );
    });

    test('hooks/dist/gsd-graphify-update.sh exists after build', () => {
      assert.ok(
        fs.existsSync(path.join(DIST_DIR_3579, 'gsd-graphify-update.sh')),
        'expected hooks/dist/gsd-graphify-update.sh to exist after build (Gap 1)'
      );
    });

    test('hooks/dist/lib/gsd-graphify-rebuild.sh exists after build', () => {
      assert.ok(
        fs.existsSync(path.join(DIST_DIR_3579, 'lib', 'gsd-graphify-rebuild.sh')),
        'expected hooks/dist/lib/gsd-graphify-rebuild.sh to exist after build (Gap 2)'
      );
    });
  });

  // Regression for #3579: installer deploys graphify hook + lib helper to target
  describe('#3579: installer deploys graphify hook + lib helper to target', () => {
    let tmpDir;
    let installStdout;

    before(() => {
      const r1 = runNode([BUILD_SCRIPT_3579], { timeoutMs: BUILD_TIMEOUT_MS });
      throwIfFailed(r1, `node ${BUILD_SCRIPT_3579}`);
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-3579-install-'));
      const r2 = runNode(
        [INSTALL_SCRIPT_3579, '--claude', '--global', '--yes', '--no-sdk'],
        {
          env: { ...process.env, CLAUDE_CONFIG_DIR: tmpDir },
          timeoutMs: INSTALL_TIMEOUT_MS,
        }
      );
      throwIfFailed(r2, `node ${INSTALL_SCRIPT_3579}`);
      installStdout = r2.stdout;
    });

    after(() => {
      cleanup(tmpDir);
    });

    test('hooks/gsd-graphify-update.sh present at install target', () => {
      const dest = path.join(tmpDir, 'hooks', 'gsd-graphify-update.sh');
      assert.ok(fs.existsSync(dest), `expected ${dest} to exist after install`);
    });

    test('hooks/lib/gsd-graphify-rebuild.sh present at install target', () => {
      const dest = path.join(tmpDir, 'hooks', 'lib', 'gsd-graphify-rebuild.sh');
      assert.ok(fs.existsSync(dest), `expected ${dest} to exist after install`);
    });

    test('installer does not warn about missing gsd-graphify-update.sh', () => {
      assert.ok(
        !installStdout.includes('Missing expected hook: gsd-graphify-update.sh'),
        `installer output must not warn about missing graphify hook; got:\n${installStdout}`
      );
      assert.ok(
        !installStdout.includes(
          'Skipped graphify auto-update hook — gsd-graphify-update.sh not found'
        ),
        `installer must not skip graphify hook configuration; got:\n${installStdout}`
      );
    });
  });
});


// ────────────────────────────────────────────────────────────────────────
// Folded from tests/bug-622-graphify-optional-graph-html.test.cjs — consolidation epic #1969 (B6 #1975)
// ────────────────────────────────────────────────────────────────────────
{
  const { describe: __foldDescribe } = require('node:test');
  __foldDescribe("folded:bug-622-graphify-optional-graph-html (consolidation epic #1969 B6 #1975)", () => {
// allow-test-rule: source-text-is-the-product (see #622)
// Behavioral regression test for #622 aligned to the shipped rebuild script
// (`hooks/lib/gsd-graphify-rebuild.sh`), which replaced the retired inline Step 3
// shell block in removed `commands/gsd/graphify.md`. Executes the real rebuild script
// against stubbed binaries to prove missing `graph.html` never aborts copy of
// `graph.json` and `GRAPH_REPORT.md`.

'use strict';

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runHook } = require('./helpers/process-seam.cjs');
const { toLegacyResult } = require('./helpers/git-fixture.cjs');
const { PROBE_TIMEOUT_MS } = require('./helpers/timeouts.cjs');

const { createTempDir, cleanup } = require('./helpers.cjs');

const REBUILD_SCRIPT = path.join(__dirname, '..', 'hooks', 'lib', 'gsd-graphify-rebuild.sh');

let sandbox;
let fakeBin;

before(() => {
  sandbox = createTempDir('gsd-622-sandbox-');
  fakeBin = createTempDir('gsd-622-fakebin-');
});

after(() => {
  cleanup(sandbox);
  cleanup(fakeBin);
});

function writeFakeGraphify() {
  const exe = path.join(fakeBin, 'graphify');
  fs.writeFileSync(exe, ['#!/bin/sh', 'exit 0'].join('\n'), { mode: 0o755 });
  return exe;
}

function populateSandbox(includeHtml) {
  const outDir = path.join(sandbox, 'graphify-out');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'graph.json'), '{}');
  fs.writeFileSync(path.join(outDir, 'GRAPH_REPORT.md'), '# report');
  if (includeHtml) {
    fs.writeFileSync(path.join(outDir, 'graph.html'), '<html/>');
  }
  fs.mkdirSync(path.join(sandbox, '.planning', 'graphs'), { recursive: true });
}

function runRebuild(fakeGraphifyExe) {
  const statusFile = path.join(sandbox, '.planning', 'graphs', 'rebuild-status.json').replace(/\\/g, '/');
  const lockFile = path.join(sandbox, '.planning', 'graphs', 'rebuild.lock').replace(/\\/g, '/');
  const scriptPosix = REBUILD_SCRIPT.replace(/\\/g, '/');
  const binPosix = fakeGraphifyExe.replace(/\\/g, '/');
  const r = runHook(scriptPosix, [statusFile, lockFile, 'deadbeef', '1000', binPosix], {
    interpreter: 'bash',
    cwd: sandbox,
    timeoutMs: PROBE_TIMEOUT_MS,
  });
  return toLegacyResult(r);
}

describe('bug #622: graph.html absence must not abort rebuild artifact copy', () => {
  test('gsd-graphify-rebuild.sh exists and is executable-structured (sanity gate)', () => {
    const src = fs.readFileSync(REBUILD_SCRIPT, 'utf8');
    assert.ok(src.includes('cp graphify-out/graph.html .planning/graphs/graph.html'), 'must copy optional graph.html');
    assert.ok(src.includes('cp graphify-out/GRAPH_REPORT.md .planning/graphs/GRAPH_REPORT.md'), 'must copy GRAPH_REPORT.md');
  });

  test('graph.html absent: rebuild exits 0 and copies remaining artifacts (#622 regression)', (t) => {
    if (process.platform === 'win32') { t.skip('POSIX sh script execution tested on POSIX CI runners'); return; }
    t.after(() => {
      cleanup(sandbox);
      fs.mkdirSync(sandbox, { recursive: true });
    });

    const exe = writeFakeGraphify();
    populateSandbox(false);

    const result = runRebuild(exe);
    assert.equal(result.status, 0, `Expected exit 0: stderr=${result.stderr}`);
    assert.ok(fs.existsSync(path.join(sandbox, '.planning', 'graphs', 'graph.json')), 'graph.json copied');
    assert.ok(fs.existsSync(path.join(sandbox, '.planning', 'graphs', 'GRAPH_REPORT.md')), 'GRAPH_REPORT.md copied');
    assert.ok(!fs.existsSync(path.join(sandbox, '.planning', 'graphs', 'graph.html')), 'graph.html absent');
  });

  test('graph.html present: rebuild exits 0 and copies graph.html (happy path)', (t) => {
    if (process.platform === 'win32') { t.skip('POSIX sh script execution tested on POSIX CI runners'); return; }
    t.after(() => {
      cleanup(sandbox);
      fs.mkdirSync(sandbox, { recursive: true });
    });

    const exe = writeFakeGraphify();
    populateSandbox(true);

    const result = runRebuild(exe);
    assert.equal(result.status, 0, `Expected exit 0: stderr=${result.stderr}`);
    assert.ok(fs.existsSync(path.join(sandbox, '.planning', 'graphs', 'graph.html')), 'graph.html copied');
    assert.ok(fs.existsSync(path.join(sandbox, '.planning', 'graphs', 'graph.json')), 'graph.json copied');
    assert.ok(fs.existsSync(path.join(sandbox, '.planning', 'graphs', 'GRAPH_REPORT.md')), 'GRAPH_REPORT.md copied');
  });
});
  });
}
