'use strict';
process.env.GSD_TEST_MODE = '1';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { cleanup } = require('./helpers.cjs');

const ROOT = path.join(__dirname, '..');
const {
  runUnifiedDriftSuite,
  runSingleRule,
  lintAnthropicSkillsSpec,
} = require(path.join(ROOT, 'gsd-core', 'bin', 'lib', 'drift-linter-suite.cjs'));

describe('Phase 34 Wave 1: Unified Drift Linter Suite', () => {
  test('live repository passes unified drift suite for baseline rules', () => {
    const res = runUnifiedDriftSuite(ROOT, ['anthropic-skills-spec', 'table-schema-drift', 'plan-count-drift']);
    assert.equal(res.passed, true, 'unified suite should pass for valid baseline rules');
    assert.equal(res.failedRules, 0);
    assert.ok(res.durationMs >= 0);
  });

  test('runSingleRule returns clean result for table-schema-drift', () => {
    const res = runSingleRule('table-schema-drift', ROOT);
    assert.equal(res.passed, true);
    assert.equal(res.violations.length, 0);
  });

  test('lintAnthropicSkillsSpec flags skill directories missing SKILL.md or frontmatter', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-skills-test-'));
    try {
      const skillsDir = path.join(tmpDir, '.github', 'skills');
      fs.mkdirSync(skillsDir, { recursive: true });

      // 1. Valid skill
      const validDir = path.join(skillsDir, 'valid-skill');
      fs.mkdirSync(validDir, { recursive: true });
      fs.writeFileSync(path.join(validDir, 'SKILL.md'), '---\nname: valid-skill\ndescription: "A valid test skill"\n---\n# Content\n');

      // 2. Skill missing SKILL.md
      const missingMdDir = path.join(skillsDir, 'missing-md');
      fs.mkdirSync(missingMdDir, { recursive: true });

      // 3. Skill missing frontmatter
      const noFrontmatterDir = path.join(skillsDir, 'no-frontmatter');
      fs.mkdirSync(noFrontmatterDir, { recursive: true });
      fs.writeFileSync(path.join(noFrontmatterDir, 'SKILL.md'), '# Just markdown without frontmatter\n');

      // 4. Skill missing description in frontmatter
      const noDescDir = path.join(skillsDir, 'no-desc');
      fs.mkdirSync(noDescDir, { recursive: true });
      fs.writeFileSync(path.join(noDescDir, 'SKILL.md'), '---\nname: no-desc\n---\n# Content\n');

      const violations = lintAnthropicSkillsSpec(tmpDir);
      assert.ok(violations.length >= 3, `Expected at least 3 violations, got ${violations.length}`);

      const missingMd = violations.find(v => v.id === 'missing-md');
      assert.ok(missingMd, 'should flag missing SKILL.md');

      const noFront = violations.find(v => v.id === 'no-frontmatter');
      assert.ok(noFront, 'should flag missing YAML frontmatter');

      const noDesc = violations.find(v => v.id === 'no-desc');
      assert.ok(noDesc, 'should flag missing description field');
    } finally {
      cleanup(tmpDir);
    }
  });

  test('handles unknown rule gracefully without throwing', () => {
    const res = runSingleRule('non-existent-rule-xyz', ROOT);
    assert.equal(res.passed, false);
    assert.equal(res.violations.length, 1);
    assert.ok(res.violations[0].message.includes('Unknown drift rule'));
  });
});
