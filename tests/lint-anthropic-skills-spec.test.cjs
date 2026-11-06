'use strict';
process.env.GSD_TEST_MODE = '1';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const { lintAnthropicSkillsSpec } = require(path.join(ROOT, 'gsd-core', 'bin', 'lib', 'drift-linter-suite.cjs'));

describe('Anthropic Agent Skills Specification Compliance', () => {
  test('all skills in repository satisfy Anthropic SKILL.md and YAML frontmatter specification', () => {
    const violations = lintAnthropicSkillsSpec(ROOT);
    if (violations.length > 0) {
      const messages = violations.map(v => `${v.file || v.id}: ${v.message}`).join('\n');
      assert.fail(`Skills specification violations detected:\n${messages}`);
    }
    assert.equal(violations.length, 0, 'zero violations expected in canonical skills');
  });
});

