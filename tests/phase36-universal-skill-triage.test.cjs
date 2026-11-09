'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const textLines = require('../gsd-core/bin/lib/text-lines.cjs');
const { splitLines } = textLines;

const COMMANDS_DIR = path.resolve('commands', 'gsd');
const SKILLS_DIR = path.resolve('skills');

function extractExecutionContext(content) {
  const startTag = '<execution_context>';
  const endTag = '</execution_context>';
  const startIdx = content.indexOf(startTag);
  if (startIdx === -1) return null;
  const endIdx = content.indexOf(endTag, startIdx + startTag.length);
  if (endIdx === -1) return null;
  return content.slice(startIdx + startTag.length, endIdx);
}

test('Wave 3: all canonical commands have <= 2 eager execution_context refs and utilize load_on_demand', () => {
  const commandFiles = fs.readdirSync(COMMANDS_DIR).filter(f => f.endsWith('.md'));
  assert.strictEqual(commandFiles.length, 11, 'Should have exactly 11 canonical commands');

  for (const file of commandFiles) {
    const content = fs.readFileSync(path.join(COMMANDS_DIR, file), 'utf8');
    const execContextBlock = extractExecutionContext(content);
    assert.ok(execContextBlock !== null, `${file} must contain <execution_context>`);

    const eagerRefs = splitLines(execContextBlock)
      .map(line => line.trim())
      .filter(line => line.startsWith('@'));

    assert.ok(
      eagerRefs.length <= 2,
      `${file} should have at most 2 eager @-refs in <execution_context>, found ${eagerRefs.length}: ${JSON.stringify(eagerRefs)}`
    );

    // Multi-workflow commands must declare load_on_demand
    if (['status.md', 'exec.md', 'review.md', 'verify.md', 'ship.md', 'migrate.md', 'help.md', 'plan.md', 'auto.md'].includes(file)) {
      assert.ok(content.includes('<load_on_demand>'), `${file} must declare a <load_on_demand> block`);
    }
  }
});

test('Wave 3: generated skills/ match the lean context structure in lockstep', () => {
  const skillDirs = fs.readdirSync(SKILLS_DIR).filter(f => f.startsWith('gsd-'));
  assert.strictEqual(skillDirs.length, 11, 'Should have exactly 11 generated skill directories');

  for (const dir of skillDirs) {
    const skillPath = path.join(SKILLS_DIR, dir, 'SKILL.md');
    assert.ok(fs.existsSync(skillPath), `Missing ${skillPath}`);
    const content = fs.readFileSync(skillPath, 'utf8');

    const execContextBlock = extractExecutionContext(content);
    assert.ok(execContextBlock !== null, `${dir}/SKILL.md must contain <execution_context>`);

    const eagerRefs = splitLines(execContextBlock)
      .map(line => line.trim())
      .filter(line => line.startsWith('@'));

    assert.ok(
      eagerRefs.length <= 2,
      `${dir}/SKILL.md should have at most 2 eager refs in <execution_context>, found ${eagerRefs.length}`
    );
  }
});


