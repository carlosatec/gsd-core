// allow-test-rule: source-text-is-the-product (see #2641)
// The mempalace-capture skill gates on config.mempalace.capture_artifacts.
// The capability registry declares this key with default: true, so an absent
// key must be treated as enabled. The skill previously used `!== true` which
// treated absent (undefined) as disabled — inverted from the schema default.
// The fix changes it to `=== false` (disabled only on explicit false).

'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CAPTURE_FRAGMENT = path.join(__dirname, '..', 'capabilities', 'mempalace', 'fragments', 'capture-problems.md');
const RECALL_FRAGMENT = path.join(__dirname, '..', 'capabilities', 'mempalace', 'fragments', 'recall-discuss.md');
const CURATOR = path.join(__dirname, '..', 'agents', 'gsd-mempalace-curator.md');

describe('#2641 — mempalace fragments treat absent default-true toggles as enabled', () => {
  test('capture-problems.md checks mempalace.capture_artifacts is false (disabled only on explicit false)', () => {
    const text = fs.readFileSync(CAPTURE_FRAGMENT, 'utf8');
    assert.ok(
      text.includes('`mempalace.capture_artifacts` is `false`'),
      'capture-problems.md must gate only on explicit false (`mempalace.capture_artifacts` is `false`), not !== true (#2641)',
    );
    assert.ok(
      !text.includes('capture_artifacts !== true') && !text.includes('`mempalace.capture_artifacts` is not `true`'),
      'capture-problems.md must NOT use an inverted !== true check for default-true capture_artifacts (#2641)',
    );
  });

  test('recall-discuss.md checks mempalace.recall_on_discuss is false (disabled only on explicit false)', () => {
    const text = fs.readFileSync(RECALL_FRAGMENT, 'utf8');
    assert.ok(
      text.includes('`mempalace.recall_on_discuss` is `false`'),
      'recall-discuss.md must gate only on explicit false (`mempalace.recall_on_discuss` is `false`), not !== true (#2641)',
    );
    assert.ok(
      !text.includes('recall_on_discuss !== true') && !text.includes('`mempalace.recall_on_discuss` is not `true`'),
      'recall-discuss.md must NOT use an inverted !== true check for default-true recall_on_discuss (#2641)',
    );
  });
});

// #3479 — gates on default-true mempalace sub-toggles treat an absent key as
// enabled (disabled only on explicit false); default-false keys keep requiring
// positive presence.

const REGISTRY_PATH = path.join(__dirname, '..', 'gsd-core', 'bin', 'lib', 'capability-registry.cjs');

/** Deep-search the mempalace capability for the flat settings schema keyed `mempalace.<key>`. */
function mempalaceSettings() {
  const { capabilities } = require(REGISTRY_PATH);
  const stack = [capabilities.mempalace];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    if (Object.prototype.hasOwnProperty.call(node, 'mempalace.mirror_kg')) return node;
    for (const value of Object.values(node)) {
      if (value && typeof value === 'object') stack.push(value);
    }
  }
  return null;
}

/** Boolean mempalace.<key> settings partitioned by their registry-declared default. */
function mempalaceBooleansByDefault() {
  const settings = mempalaceSettings();
  assert.ok(settings, 'capability registry must expose a mempalace settings schema');
  const defaultTrue = [];
  const defaultFalse = [];
  for (const [key, spec] of Object.entries(settings)) {
    if (!key.startsWith('mempalace.') || spec.type !== 'boolean') continue;
    (spec.default === true ? defaultTrue : defaultFalse).push(key);
  }
  return { defaultTrue, defaultFalse };
}

describe('#3479 — gates on default-true mempalace keys treat an absent key as enabled', () => {
  test('capture-problems.md uses negative-presence check for capture_artifacts (not positive-presence)', () => {
    const text = fs.readFileSync(CAPTURE_FRAGMENT, 'utf8');
    assert.ok(
      text.includes('`mempalace.capture_artifacts` is `false`'),
      'capture-problems.md must treat absent capture_artifacts as enabled (#3479)',
    );
    assert.ok(
      !text.includes('`mempalace.capture_artifacts` is true'),
      'capture-problems.md must NOT gate capture_artifacts on positive presence (#3479)',
    );
  });

  test('recall-discuss.md uses negative-presence check for recall_on_discuss (not positive-presence)', () => {
    const text = fs.readFileSync(RECALL_FRAGMENT, 'utf8');
    assert.ok(
      text.includes('`mempalace.recall_on_discuss` is `false`'),
      'recall-discuss.md must treat absent recall_on_discuss as enabled (#3479)',
    );
    assert.ok(
      !text.includes('`mempalace.recall_on_discuss` is true'),
      'recall-discuss.md must NOT gate recall_on_discuss on positive presence (#3479)',
    );
  });

  test('curator agent diary_journal and mirror_kg gates are disabled-only-on-explicit-false', () => {
    const text = fs.readFileSync(CURATOR, 'utf8');
    assert.ok(
      text.includes('mempalace.diary_journal !== false'),
      'agents/gsd-mempalace-curator.md diary gate must run unless mempalace.diary_journal !== false (#3479)',
    );
    assert.ok(
      text.includes('mempalace.mirror_kg !== false'),
      'agents/gsd-mempalace-curator.md KG-mirror gate must run unless mempalace.mirror_kg !== false (#3479)',
    );
    assert.ok(
      !text.includes('mempalace.diary_journal` is true'),
      'agents/gsd-mempalace-curator.md must NOT gate diary_journal on positive presence (#3479)',
    );
    assert.ok(
      !text.includes('mempalace.mirror_kg` is true'),
      'agents/gsd-mempalace-curator.md must NOT gate mirror_kg on positive presence (#3479)',
    );
  });
});

describe('#3479 — registry parity guard: no default-true mempalace key is positively gated', () => {
  test('every default-true mempalace boolean defaults to enabled in the registry', () => {
    const { defaultTrue } = mempalaceBooleansByDefault();
    for (const key of ['mempalace.capture_artifacts', 'mempalace.mirror_kg', 'mempalace.diary_journal']) {
      assert.ok(defaultTrue.includes(key), `${key} must declare default: true in the capability registry`);
    }
  });

  test('no gate file uses positive presence for a default-true key', () => {
    const { defaultTrue } = mempalaceBooleansByDefault();
    const files = [CAPTURE_FRAGMENT, RECALL_FRAGMENT, CURATOR];
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      for (const key of defaultTrue) {
        for (const refix of ['config.' + key, key]) {
          assert.ok(
            !text.includes('`' + refix + '` is true'),
            `${path.relative(process.cwd(), file)} gates \`${key}\` on positive presence, but the registry declares default: true — absent must mean enabled (#3479)`,
          );
        }
      }
    }
  });

  test('default-false keys keep requiring positive presence (no over-correction)', () => {
    const { defaultFalse } = mempalaceBooleansByDefault();
    assert.ok(
      defaultFalse.includes('mempalace.enabled'),
      'mempalace.enabled must stay default: false — the master switch is opt-in',
    );
    const capture = fs.readFileSync(CAPTURE_FRAGMENT, 'utf8');
    const recall = fs.readFileSync(RECALL_FRAGMENT, 'utf8');
    const curator = fs.readFileSync(CURATOR, 'utf8');
    assert.ok(
      capture.includes('`mempalace.enabled` is not `true`'),
      'capture fragment master gate must keep treating an absent mempalace.enabled as disabled (#3479)',
    );
    assert.ok(
      recall.includes('`mempalace.enabled` is not `true`'),
      'recall fragment master gate must keep treating an absent mempalace.enabled as disabled (#3479)',
    );
    assert.ok(
      curator.includes('mempalace.enabled !== true'),
      'curator master gate must keep treating an absent mempalace.enabled as disabled (#3479)',
    );
    assert.ok(
      curator.includes('mempalace.cross_project_tunnels` is true'),
      'cross_project_tunnels (default: false) must keep its positive-presence gate — do not over-correct (#3479)',
    );
  });
});
