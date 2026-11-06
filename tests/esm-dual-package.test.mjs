import test from 'node:test';
import assert from 'node:assert/strict';

import defaultGsd from '../index.mjs';
import * as speckit from '../gsd-core/bin/lib/speckit-interop.mjs';
import * as memory from '../gsd-core/bin/lib/continuous-memory.mjs';
import * as worktree from '../gsd-core/bin/lib/worktree-isolation.mjs';
import * as hub from '../gsd-core/bin/lib/unified-workflow-hub.mjs';

test('ESM Dual-Package: root default export', () => {
  assert.ok(defaultGsd, 'Root default export must exist');
});

test('ESM Dual-Package: speckit interop named exports', () => {
  assert.equal(typeof speckit.parseRfc2119Requirement, 'function');
  assert.equal(typeof speckit.sanitizeExternalSpecContent, 'function');
  assert.equal(typeof speckit.parseConstitution, 'function');
  assert.equal(typeof speckit.validateAgainstConstitution, 'function');
});

test('ESM Dual-Package: continuous memory named exports', () => {
  assert.equal(typeof memory.recordMemoryEntry, 'function');
  assert.equal(typeof memory.queryMemory, 'function');
  assert.equal(typeof memory.sanitizePii, 'function');
});

test('ESM Dual-Package: worktree isolation named exports', () => {
  assert.equal(typeof worktree.isWorktreeSupported, 'function');
  assert.equal(typeof worktree.linkSharedDependencies, 'function');
  assert.equal(typeof worktree.unlinkSharedDependencies, 'function');
  assert.equal(typeof worktree.createIsolatedWorktree, 'function');
});

test('ESM Dual-Package: hub named exports', () => {
  assert.equal(typeof hub.dispatchUnifiedCommand, 'function');
  assert.equal(typeof hub.normalizeCommandName, 'function');
});

