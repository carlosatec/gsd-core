/**
 * Tests for skill-manifest command
 */

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runGsdTools, createTempProject, cleanup } = require('./helpers.cjs');

function writeSkill(rootDir, name, description, body = '') {
  const skillDir = path.join(rootDir, name);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), [
    '---',
    `name: ${name}`,
    `description: ${description}`,
    '---',
    '',
    body || `# ${name}`,
  ].join('\n'));
}

describe('skill-manifest', () => {
  let tmpDir;
  let homeDir;

  beforeEach(() => {
    tmpDir = createTempProject();
    homeDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'gsd-skill-manifest-home-'));

    writeSkill(path.join(tmpDir, '.claude', 'skills'), 'project-claude', 'Project Claude skill');
    writeSkill(path.join(tmpDir, '.claude', 'skills'), 'gsd-help', 'Installed GSD skill');
    writeSkill(path.join(tmpDir, '.agents', 'skills'), 'project-agents', 'Project agent skill');
    writeSkill(path.join(tmpDir, '.codex', 'skills'), 'project-codex', 'Project Codex skill');

    writeSkill(path.join(homeDir, '.claude', 'skills'), 'global-claude', 'Global Claude skill');
    writeSkill(path.join(homeDir, '.codex', 'skills'), 'global-codex', 'Global Codex skill');
    writeSkill(
      path.join(homeDir, '.claude', 'gsd-core', 'skills'),
      'legacy-import',
      'Deprecated import-only skill'
    );

    fs.mkdirSync(path.join(homeDir, '.claude', 'commands', 'gsd'), { recursive: true });
    fs.writeFileSync(path.join(homeDir, '.claude', 'commands', 'gsd', 'help.md'), '# legacy');
  });

  afterEach(() => {
    cleanup(tmpDir);
    cleanup(homeDir);
  });

  test('returns normalized inventory across canonical roots', () => {
    // On Windows, os.homedir() reads USERPROFILE (not HOME). The SUT scans
    // global skill roots via os.homedir(), so the test must also override
    // USERPROFILE to keep the fixture's homeDir visible.
    const result = runGsdTools(['skill-manifest'], tmpDir, { HOME: homeDir, USERPROFILE: homeDir });
    assert.ok(result.success, `Command should succeed: ${result.error || result.output}`);

    const manifest = JSON.parse(result.output);
    assert.ok(Array.isArray(manifest.skills), 'skills should be an array');
    assert.ok(Array.isArray(manifest.roots), 'roots should be an array');
    assert.ok(manifest.installation && typeof manifest.installation === 'object', 'installation summary present');
    assert.ok(manifest.counts && typeof manifest.counts === 'object', 'counts summary present');

    const skillNames = manifest.skills.map((skill) => skill.name).sort();
    assert.deepStrictEqual(skillNames, [
      'global-claude',
      'global-codex',
      'gsd-help',
      'legacy-import',
      'project-agents',
      'project-claude',
      'project-codex',
    ]);

    const codexSkill = manifest.skills.find((skill) => skill.name === 'project-codex');
    assert.deepStrictEqual(
      {
        root: codexSkill.root,
        scope: codexSkill.scope,
        installed: codexSkill.installed,
        deprecated: codexSkill.deprecated,
      },
      {
        root: '.codex/skills',
        scope: 'project',
        installed: true,
        deprecated: false,
      }
    );

    const importedSkill = manifest.skills.find((skill) => skill.name === 'legacy-import');
    assert.deepStrictEqual(
      {
        root: importedSkill.root,
        scope: importedSkill.scope,
        installed: importedSkill.installed,
        deprecated: importedSkill.deprecated,
      },
      {
        root: '.claude/gsd-core/skills',
        scope: 'import-only',
        installed: false,
        deprecated: true,
      }
    );

    const gsdSkill = manifest.skills.find((skill) => skill.name === 'gsd-help');
    assert.strictEqual(gsdSkill.installed, true);

    const legacyRoot = manifest.roots.find((root) => root.scope === 'legacy-commands');
    assert.ok(legacyRoot, 'legacy commands root should be reported');
    assert.strictEqual(legacyRoot.present, true);

    assert.strictEqual(manifest.installation.gsd_skills_installed, true);
    assert.strictEqual(manifest.installation.legacy_claude_commands_installed, true);
    assert.strictEqual(manifest.counts.skills, 7);
  });

  test('writes manifest to .planning/skill-manifest.json when --write flag is used', () => {
    const result = runGsdTools(['skill-manifest', '--write'], tmpDir, { HOME: homeDir, USERPROFILE: homeDir });
    assert.ok(result.success, `Command should succeed: ${result.error || result.output}`);

    const manifestPath = path.join(tmpDir, '.planning', 'skill-manifest.json');
    assert.ok(fs.existsSync(manifestPath), 'skill-manifest.json should be written to .planning/');

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    assert.ok(Array.isArray(manifest.skills));
    assert.ok(manifest.installation);
  });

  test('global roots honor runtime-home env overrides instead of hardcoded home paths', () => {
    const result = runGsdTools(['skill-manifest'], tmpDir, {
      HOME: homeDir,
      USERPROFILE: homeDir,
      CLAUDE_CONFIG_DIR: path.join(homeDir, 'claude-custom'),
      CODEX_HOME: path.join(homeDir, 'codex-custom'),
    });
    assert.ok(result.success, `Command should succeed: ${result.error || result.output}`);

    const manifest = JSON.parse(result.output);
    const claudeRoot = manifest.roots.find((root) => root.root === '~/.claude/skills');
    const codexRoot = manifest.roots.find((root) => root.root === '~/.codex/skills');
    assert.ok(claudeRoot, 'Expected ~/.claude/skills root to be present');
    assert.ok(codexRoot, 'Expected ~/.codex/skills root to be present');
    assert.strictEqual(claudeRoot.path, path.join(homeDir, 'claude-custom', 'skills'));
    assert.strictEqual(codexRoot.path, path.join(homeDir, 'codex-custom', 'skills'));
  });

  // bug-929: nested layout discovery
  test('bug-929: discovers concrete skills nested under gsd-ns-* routers', () => {
    // Mirrors the on-disk shape that stageSkillsForRuntimeAsSkills emits for
    // cline/qwen/hermes/augment/trae/antigravity when nested=true:
    //   <root>/gsd-ns-workflow/SKILL.md             — router (top-level)
    //   <root>/gsd-ns-workflow/skills/plan/SKILL.md — concrete
    //   <root>/gsd-ns-workflow/skills/execute/SKILL.md — concrete
    //   <root>/gsd-ns-workflow/skills/spec-phase/SKILL.md — dual-routed concrete
    //   <root>/gsd-ns-manage/SKILL.md               — router (top-level)
    //   <root>/gsd-ns-manage/skills/progress/SKILL.md — concrete
    //   <root>/gsd-ns-manage/skills/spec-phase/SKILL.md — same dual-routed concrete (dedupe by name)
    //   <root>/gsd-standalone/SKILL.md              — flat top-level skill (no skills/ subdir)
    const skillsDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'gsd-nested-skills-'));

    function writeNestedSkill(dir, name, description) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'SKILL.md'), [
        '---',
        `name: ${name}`,
        `description: ${description}`,
        '---',
        '',
        `# ${name}`,
      ].join('\n'));
    }

    // Router 1: gsd-ns-workflow
    writeNestedSkill(path.join(skillsDir, 'gsd-ns-workflow'), 'gsd-ns-workflow', 'Workflow router');
    writeNestedSkill(path.join(skillsDir, 'gsd-ns-workflow', 'skills', 'plan'), 'gsd-plan', 'Plan skill');
    writeNestedSkill(path.join(skillsDir, 'gsd-ns-workflow', 'skills', 'execute'), 'gsd-execute', 'Execute skill');
    writeNestedSkill(path.join(skillsDir, 'gsd-ns-workflow', 'skills', 'spec-phase'), 'gsd-spec-phase', 'Spec phase skill');

    // Router 2: gsd-ns-manage
    writeNestedSkill(path.join(skillsDir, 'gsd-ns-manage'), 'gsd-ns-manage', 'Manage router');
    writeNestedSkill(path.join(skillsDir, 'gsd-ns-manage', 'skills', 'progress'), 'gsd-progress', 'Progress skill');
    // Same spec-phase under a second router (dual-routed); must appear exactly once in manifest
    writeNestedSkill(path.join(skillsDir, 'gsd-ns-manage', 'skills', 'spec-phase'), 'gsd-spec-phase', 'Spec phase skill');

    // Flat top-level skill (not a router, no skills/ subdir)
    writeNestedSkill(path.join(skillsDir, 'gsd-standalone'), 'gsd-standalone', 'Standalone flat skill');

    const result = runGsdTools(['skill-manifest', '--skills-dir', skillsDir], tmpDir);
    assert.ok(result.success, `Command should succeed: ${result.error || result.output}`);

    const manifest = JSON.parse(result.output);
    const skillNames = manifest.skills.map((s) => s.name).sort();

    // 2 routers + 4 unique concretes (gsd-spec-phase deduped) + 1 flat = 7 total
    assert.deepStrictEqual(skillNames, [
      'gsd-execute',
      'gsd-ns-manage',
      'gsd-ns-workflow',
      'gsd-plan',
      'gsd-progress',
      'gsd-spec-phase',
      'gsd-standalone',
    ]);
    assert.strictEqual(manifest.counts.skills, 7, 'dual-routed concrete must be deduped to one entry');

    // Concrete skills should have a forward-slash nested file_path (posix-stable on all platforms)
    const planSkill = manifest.skills.find((s) => s.name === 'gsd-plan');
    assert.ok(planSkill, 'gsd-plan should be discovered');
    assert.ok(
      planSkill.file_path.includes('skills/plan'),
      `gsd-plan file_path should reflect nested location with forward slashes, got: ${planSkill.file_path}`
    );

    // Router should also appear as a skill entry
    const routerSkill = manifest.skills.find((s) => s.name === 'gsd-ns-workflow');
    assert.ok(routerSkill, 'gsd-ns-workflow router should be discovered as a top-level skill');

    cleanup(skillsDir);
  });

  test('bug-929: discovers nested concretes even when router has no top-level SKILL.md', () => {
    // Edge case: a router dir has a skills/ subdir with concretes but no top-level SKILL.md.
    // The concrete skills should still be discovered.
    const skillsDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'gsd-router-only-skills-'));

    // Router dir with skills/ but no SKILL.md of its own
    const concreteDir = path.join(skillsDir, 'gsd-ns-noroot', 'skills', 'orphan-skill');
    fs.mkdirSync(concreteDir, { recursive: true });
    fs.writeFileSync(path.join(concreteDir, 'SKILL.md'), [
      '---',
      'name: gsd-orphan',
      'description: Orphan skill under router without top-level SKILL.md',
      '---',
      '',
      '# gsd-orphan',
    ].join('\n'));

    const result = runGsdTools(['skill-manifest', '--skills-dir', skillsDir], tmpDir);
    assert.ok(result.success, `Command should succeed: ${result.error || result.output}`);

    const manifest = JSON.parse(result.output);
    assert.deepStrictEqual(
      manifest.skills.map((s) => s.name).sort(),
      ['gsd-orphan'],
    );
    assert.strictEqual(manifest.counts.skills, 1);

    cleanup(skillsDir);
  });

  test('bug-929: flat layout (no nested skills/ subdirs) still works correctly', () => {
    const skillsDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'gsd-flat-skills-'));

    function writeFlat(name, description) {
      const dir = path.join(skillsDir, name);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'SKILL.md'), [
        '---',
        `name: ${name}`,
        `description: ${description}`,
        '---',
        '',
        `# ${name}`,
      ].join('\n'));
    }

    writeFlat('gsd-alpha', 'Alpha skill');
    writeFlat('gsd-beta', 'Beta skill');
    writeFlat('gsd-gamma', 'Gamma skill');

    const result = runGsdTools(['skill-manifest', '--skills-dir', skillsDir], tmpDir);
    assert.ok(result.success, `Command should succeed: ${result.error || result.output}`);

    const manifest = JSON.parse(result.output);
    assert.deepStrictEqual(
      manifest.skills.map((s) => s.name).sort(),
      ['gsd-alpha', 'gsd-beta', 'gsd-gamma']
    );
    assert.strictEqual(manifest.counts.skills, 3, 'flat layout count should be exact, no phantom nesting');

    cleanup(skillsDir);
  });

  test('bug-929: non-gsd-ns-* dirs with a skills/ subdir are NOT scanned (guard)', () => {
    // Regression guard for the `if (!entry.name.startsWith('gsd-ns-')) continue;` guard
    // in buildSkillManifest. A user tool dir like `my-tool/` that happens to have its
    // own `skills/` subdirectory must NOT have those skills vacuumed up.
    // Only `gsd-ns-<router>/skills/<stem>/SKILL.md` paths are in scope.
    const skillsDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'gsd-guard-test-'));

    // Non-router dir with a flat SKILL.md at its own root — SHOULD be found (flat scan).
    const topLevelDir = path.join(skillsDir, 'my-tool');
    fs.mkdirSync(topLevelDir, { recursive: true });
    fs.writeFileSync(path.join(topLevelDir, 'SKILL.md'), [
      '---',
      'name: my-tool',
      'description: A user-defined top-level skill',
      '---',
      '',
      '# my-tool',
    ].join('\n'));

    // Non-router dir with a nested skills/ subdir — nested skills must NOT be discovered.
    const nestedDir = path.join(skillsDir, 'my-tool', 'skills', 'helper');
    fs.mkdirSync(nestedDir, { recursive: true });
    fs.writeFileSync(path.join(nestedDir, 'SKILL.md'), [
      '---',
      'name: my-tool-helper',
      'description: A nested skill that must not be vacuumed up',
      '---',
      '',
      '# my-tool-helper',
    ].join('\n'));

    // Another non-router dir (prefixed differently, could look router-like but isn't)
    const otherDir = path.join(skillsDir, 'gsd-settings');
    fs.mkdirSync(otherDir, { recursive: true });
    fs.writeFileSync(path.join(otherDir, 'SKILL.md'), [
      '---',
      'name: gsd-settings',
      'description: A flat gsd-* skill that is not a router',
      '---',
      '',
      '# gsd-settings',
    ].join('\n'));
    // Give gsd-settings its own skills/ subdir — must not be traversed since it's not gsd-ns-*
    const otherNestedDir = path.join(skillsDir, 'gsd-settings', 'skills', 'subsetting');
    fs.mkdirSync(otherNestedDir, { recursive: true });
    fs.writeFileSync(path.join(otherNestedDir, 'SKILL.md'), [
      '---',
      'name: gsd-subsetting',
      'description: A nested skill that must not be vacuumed up',
      '---',
      '',
      '# gsd-subsetting',
    ].join('\n'));

    const result = runGsdTools(['skill-manifest', '--skills-dir', skillsDir], tmpDir);
    assert.ok(result.success, `Command should succeed: ${result.error || result.output}`);

    const manifest = JSON.parse(result.output);
    const skillNames = manifest.skills.map((s) => s.name).sort();

    // Only the flat top-level SKILL.md entries should be found; nested non-router skills are ignored
    assert.deepStrictEqual(
      skillNames,
      ['gsd-settings', 'my-tool'],
      'nested skills under non-gsd-ns-* dirs must not be discovered',
    );
    assert.strictEqual(
      manifest.counts.skills,
      2,
      'only 2 top-level skills; nested non-router helpers must not inflate the count',
    );

    // Confirm the forbidden names are absent
    assert.ok(
      !skillNames.includes('my-tool-helper'),
      'my-tool/skills/helper/SKILL.md must not appear (guard: my-tool is not gsd-ns-*)',
    );
    assert.ok(
      !skillNames.includes('gsd-subsetting'),
      'gsd-settings/skills/subsetting/SKILL.md must not appear (guard: gsd-settings is not gsd-ns-*)',
    );

    cleanup(skillsDir);
  });
});


// ────────────────────────────────────────────────────────────────────────
// Folded from tests/enh-2792-namespace-skills.test.cjs — consolidation epic #1969 (B3 #1972)
// ────────────────────────────────────────────────────────────────────────
{
  const { describe: __foldDescribe } = require('node:test');
  __foldDescribe("folded:enh-2792-canonical-commands-and-health (consolidation epic #1969 B3 #1972)", () => {
'use strict';

// allow-test-rule: source-text-is-the-product (see #2792)
// commands/gsd/*.md and gsd-core/workflows/*.md ARE what the runtime loads —
// testing their routing frontmatter and workflow links verifies the deployed surface.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const COMMANDS_DIR = path.join(__dirname, '..', 'commands', 'gsd');
const WORKFLOWS_ROOT = path.join(__dirname, '..', 'gsd-core');

const CANONICAL_COMMANDS = [
  'auto', 'exec', 'graph', 'help', 'migrate', 'plan',
  'review', 'ship', 'status', 'tokens', 'verify',
];

function parseFrontmatter(content) {
  const lines = content.split(/\r?\n/);
  let openIdx = -1;
  let closeIdx = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim() === '---') {
      if (openIdx === -1) openIdx = i;
      else { closeIdx = i; break; }
    }
  }
  assert.ok(openIdx !== -1 && closeIdx !== -1, 'frontmatter block must be delimited by --- on its own lines');
  const fm = {};
  for (const line of lines.slice(openIdx + 1, closeIdx)) {
    const m = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!m) continue;
    const [, key, raw] = m;
    fm[key] = raw.trim().replace(/^["']|["']$/g, '');
  }
  fm._body = lines.slice(closeIdx + 1).join('\n');
  return fm;
}

describe('Canonical 11 commands replace legacy ns-* routers', () => {
  test('all 11 canonical command files exist with gsd:<cmd> frontmatter', () => {
    for (const cmd of CANONICAL_COMMANDS) {
      const filePath = path.join(COMMANDS_DIR, `${cmd}.md`);
      assert.ok(fs.existsSync(filePath), `${cmd}.md must exist`);
      const fm = parseFrontmatter(fs.readFileSync(filePath, 'utf8'));
      assert.strictEqual(fm.name, `gsd:${cmd}`, `name in ${cmd}.md must be gsd:${cmd}`);
      assert.ok(fm.description && fm.description.length > 0, `${cmd}.md must have a non-empty description`);
    }
  });

  test('no legacy ns-*.md namespace router files remain in commands/gsd/', () => {
    const nsFiles = fs.readdirSync(COMMANDS_DIR).filter((f) => f.startsWith('ns-'));
    assert.deepStrictEqual(nsFiles, [], `Unexpected legacy ns-*.md routers: ${nsFiles.join(', ')}`);
  });
});

// ── Context guard contract on gsd-core/workflows/health.md ───────────

describe('gsd-health --context flag is wired into status command + health workflow', () => {
  const STATUS_CMD = path.join(COMMANDS_DIR, 'status.md');
  const HEALTH_WORKFLOW = path.join(WORKFLOWS_ROOT, 'workflows', 'health.md');

  test('commands/gsd/status.md routes workflows/health.md in load_on_demand', () => {
    const raw = fs.readFileSync(STATUS_CMD, 'utf8');
    assert.ok(raw.includes('workflows/health.md'), 'status.md must route workflows/health.md');
  });

  test('gsd-core/workflows/health.md parses --context flag and documents context_check step', () => {
    const raw = fs.readFileSync(HEALTH_WORKFLOW, 'utf8');
    assert.ok(raw.includes('--context'), 'health.md workflow must parse --context');
    assert.match(raw, /<step name="context_check">/, 'workflow must define a <step name="context_check"> branch');
  });

  test('workflow context_check invokes gsd-sdk query validate.context', () => {
    const raw = fs.readFileSync(HEALTH_WORKFLOW, 'utf8');
    // eslint-disable-next-line local/no-unbounded-quantifier -- parses this repo's own workflow .md content, fixed-size author-controlled content
    const stepMatch = raw.match(/<step name="context_check">([\s\S]*?)<\/step>/);
    assert.ok(stepMatch, 'context_check step must be a closed <step>...</step> block');
    const stepBody = stepMatch[1];
    assert.match(stepBody, /gsd_run\s+query\s+validate\.context/, 'context_check must call gsd_run query validate.context');
    assert.match(stepBody, /--tokens-used/, 'context_check must pass --tokens-used');
    assert.match(stepBody, /--context-window/, 'context_check must pass --context-window');
  });
});

// ── Cross-reference: every workflow referenced by canonical commands resolves ──

describe('Canonical commands workflow references resolve to existing files', () => {
  for (const cmd of CANONICAL_COMMANDS) {
    test(`${cmd}.md — every referenced workflows/*.md exists in gsd-core/`, () => {
      const content = fs.readFileSync(path.join(COMMANDS_DIR, `${cmd}.md`), 'utf8');
      const matches = [...content.matchAll(/\bworkflows\/([a-z0-9_-]+\.md)\b/g)];
      const missing = [];
      for (const m of matches) {
        const rel = path.join('workflows', m[1]);
        if (!fs.existsSync(path.join(WORKFLOWS_ROOT, rel))) {
          missing.push(rel);
        }
      }
      assert.deepStrictEqual(missing, [], `${cmd}.md references missing workflows: ${missing.join(', ')}`);
    });
  }
});
  });
}
