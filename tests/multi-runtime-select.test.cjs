/**
 * Tests for multi-runtime selection in the interactive installer prompt.
 * Verifies that promptRuntime accepts comma-separated, space-separated,
 * and single-choice inputs, deduplicates, and falls back to claude.
 * See issue #1281.
 *
 * Per CONTRIBUTING.md "no-source-grep" testing standard, prompt + parser
 * behavior is asserted via the install module's exported pure functions
 * (`runtimeMap`, `allRuntimes`, `parseRuntimeInput`, `buildRuntimePromptText`)
 * instead of regexing bin/install.js source text.
 */

process.env.GSD_TEST_MODE = '1';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  runtimeMap,
  allRuntimes,
  selectRuntimesFromArgs,
  parseRuntimeInput,
  buildRuntimePromptText,
} = require('../bin/install.js');

// Strip ANSI color codes for human-readable assertions on prompt text.
function stripAnsi(s) {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('multi-runtime selection parsing', () => {
  test('single choice returns single runtime', () => {
    assert.deepStrictEqual(parseRuntimeInput('1'), ['claude']);
    assert.deepStrictEqual(parseRuntimeInput('2'), ['antigravity']);
    assert.deepStrictEqual(parseRuntimeInput('3'), ['cline']);
    assert.deepStrictEqual(parseRuntimeInput('4'), ['codex']);
    assert.deepStrictEqual(parseRuntimeInput('5'), ['copilot']);
    assert.deepStrictEqual(parseRuntimeInput('6'), ['cursor']);
    assert.deepStrictEqual(parseRuntimeInput('7'), ['deepseek-harness']);
    assert.deepStrictEqual(parseRuntimeInput('8'), ['kimi-code']);
    assert.deepStrictEqual(parseRuntimeInput('9'), ['opencode']);
    assert.deepStrictEqual(parseRuntimeInput('10'), ['qwen']);
    assert.deepStrictEqual(parseRuntimeInput('11'), ['windsurf']);
  });

  test('comma-separated choices return multiple runtimes', () => {
    assert.deepStrictEqual(parseRuntimeInput('1,5,9'), ['claude', 'copilot', 'opencode']);
    assert.deepStrictEqual(parseRuntimeInput('2,3'), ['antigravity', 'cline']);
    assert.deepStrictEqual(parseRuntimeInput('3,4'), ['cline', 'codex']);
  });

  test('space-separated choices return multiple runtimes', () => {
    assert.deepStrictEqual(parseRuntimeInput('1 5 9'), ['claude', 'copilot', 'opencode']);
    assert.deepStrictEqual(parseRuntimeInput('6 8'), ['cursor', 'kimi-code']);
  });

  test('mixed comma and space separators work', () => {
    assert.deepStrictEqual(parseRuntimeInput('1, 5, 9'), ['claude', 'copilot', 'opencode']);
    assert.deepStrictEqual(parseRuntimeInput('2 , 6'), ['antigravity', 'cursor']);
  });

  test('single choice for deepseek-harness', () => {
    assert.deepStrictEqual(parseRuntimeInput('7'), ['deepseek-harness']);
  });

  test('single choice for kimi-code', () => {
    assert.deepStrictEqual(parseRuntimeInput('8'), ['kimi-code']);
  });

  test('single choice for opencode', () => {
    assert.deepStrictEqual(parseRuntimeInput('9'), ['opencode']);
  });

  test('single choice for qwen', () => {
    assert.deepStrictEqual(parseRuntimeInput('10'), ['qwen']);
  });

  test('single choice for windsurf', () => {
    assert.deepStrictEqual(parseRuntimeInput('11'), ['windsurf']);
  });

  test('choice 12 returns all runtimes', () => {
    assert.deepStrictEqual(parseRuntimeInput('12'), allRuntimes);
  });

  test('choice 12 returns all runtimes when mixed with separators or other tokens', () => {
    assert.deepStrictEqual(parseRuntimeInput('12,'), allRuntimes);
    assert.deepStrictEqual(parseRuntimeInput('12 1'), allRuntimes);
    assert.deepStrictEqual(parseRuntimeInput('1,12'), allRuntimes);
    assert.deepStrictEqual(parseRuntimeInput('  12  '), allRuntimes);
  });

  test('empty input defaults to claude', () => {
    assert.deepStrictEqual(parseRuntimeInput(''), ['claude']);
    assert.deepStrictEqual(parseRuntimeInput('   '), ['claude']);
  });

  test('invalid choices are ignored, falls back to claude if all invalid', () => {
    assert.deepStrictEqual(parseRuntimeInput('99'), ['claude']);
    assert.deepStrictEqual(parseRuntimeInput('0'), ['claude']);
    assert.deepStrictEqual(parseRuntimeInput('abc'), ['claude']);
  });

  test('invalid choices mixed with valid are filtered out', () => {
    assert.deepStrictEqual(parseRuntimeInput('1,99,5'), ['claude', 'copilot']);
    assert.deepStrictEqual(parseRuntimeInput('abc 3 xyz'), ['cline']);
  });

  test('duplicate choices are deduplicated', () => {
    assert.deepStrictEqual(parseRuntimeInput('1,1,1'), ['claude']);
    assert.deepStrictEqual(parseRuntimeInput('5,5,9,9'), ['copilot', 'opencode']);
  });

  test('preserves selection order', () => {
    assert.deepStrictEqual(parseRuntimeInput('9,1,5'), ['opencode', 'claude', 'copilot']);
    assert.deepStrictEqual(parseRuntimeInput('8,2,6'), ['kimi-code', 'antigravity', 'cursor']);
  });
});

describe('install.js exports multi-select runtime metadata', () => {
  const expectedRuntimeMap = {
    '1': 'claude',
    '2': 'antigravity',
    '3': 'cline',
    '4': 'codex',
    '5': 'copilot',
    '6': 'cursor',
    '7': 'deepseek-harness',
    '8': 'kimi-code',
    '9': 'opencode',
    '10': 'qwen',
    '11': 'windsurf',
  };
  const expectedRuntimes = [
    'claude', 'antigravity', 'cline', 'codex',
    'copilot', 'cursor', 'deepseek-harness',
    'kimi-code', 'opencode', 'qwen', 'windsurf',
  ];

  test('runtimeMap exports every option key bound to the right runtime', () => {
    assert.deepStrictEqual(runtimeMap, expectedRuntimeMap,
      'exported runtimeMap matches the canonical option list');
  });

  test('allRuntimes contains every runtime exactly once', () => {
    assert.strictEqual(allRuntimes.length, expectedRuntimes.length);
    for (const rt of expectedRuntimes) {
      assert.ok(allRuntimes.includes(rt), `allRuntimes contains ${rt}`);
    }
    assert.strictEqual(new Set(allRuntimes).size, allRuntimes.length,
      'allRuntimes has no duplicates');
  });

  test('"All" shortcut (option 12) selects every runtime', () => {
    assert.deepStrictEqual(parseRuntimeInput('12'), allRuntimes);
  });

  test('--kimi-code flag selects Kimi Code (Node CLI) without interactive prompt (#2454)', () => {
    assert.deepStrictEqual(selectRuntimesFromArgs(['--kimi-code']), ['kimi-code']);
  });

  test('prompt lists Antigravity (2), DeepSeek (7), Kimi Code (8), Qwen (10), Windsurf (11), and All (12)', () => {
    const prompt = stripAnsi(buildRuntimePromptText());
    assert.ok(/\b2\)\s*Antigravity\b/.test(prompt),
      'prompt lists Antigravity as option 2');
    assert.ok(/Antigravity\s+\(~\/\.gemini\/config\)/.test(prompt),
      'prompt shows the Antigravity ~/.gemini/config root');
    assert.ok(/\b7\)\s*DeepSeek Harness\b/.test(prompt),
      'prompt lists DeepSeek Harness as option 7');
    assert.ok(/\b8\)\s*Kimi Code\b/.test(prompt),
      'prompt lists Kimi Code as option 8');
    assert.ok(/\b10\)\s*Qwen Code\b/.test(prompt),
      'prompt lists Qwen Code as option 10');
    assert.ok(/\b11\)\s*Windsurf\b/.test(prompt),
      'prompt lists Windsurf as option 11');
    assert.ok(/\b12\)\s*(All|Todos)\b/.test(prompt),
      'prompt lists All/Todos as option 12');
  });

  test('prompt does not list Gemini (removed #1928)', () => {
    const prompt = stripAnsi(buildRuntimePromptText());
    assert.ok(!/Gemini/.test(prompt), 'prompt must not mention Gemini');
  });

  test('prompt text shows multi-select hint', () => {
    const prompt = stripAnsi(buildRuntimePromptText());
    assert.ok(/Select multiple/i.test(prompt),
      'prompt includes multi-select instructions');
  });

  test('parser splits on commas and whitespace and deduplicates', () => {
    assert.deepStrictEqual(
      parseRuntimeInput('1,5,9'),
      parseRuntimeInput('1 5 9'),
      'comma- and space-separated input yield identical selections'
    );
    assert.deepStrictEqual(parseRuntimeInput('1,1,5,5'), ['claude', 'copilot'],
      'duplicates collapsed in order');
  });
});
