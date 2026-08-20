'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const sessionHook = require('../gsd-core/bin/lib/session-context-hook.cjs');
const { syncSessionContext, extractSessionBrief, START_MARKER, END_MARKER } = sessionHook;

describe('Session Context Hook (D-30)', () => {
  let tmpDir;
  let planningDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-session-test-'));
    planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });

    // Create a mock STATE.md
    const stateContent = `# Project State
- **Current Phase:** Phase 10: Ultra-Convergence
- **Status:** In Progress
- **D-29**: Mobile 360° support
- **D-30**: Session context hook
- **D-31**: Graphify native facade
`;
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), stateContent);
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // non-blocking cleanup
    }
  });

  it('should extract a concise session brief <= 15 lines', () => {
    const brief = extractSessionBrief(planningDir);
    const lines = brief.split('\n');

    assert.equal(lines.length <= 15, true);
    assert.match(brief, /Phase 10: Ultra-Convergence/);
    assert.match(brief, /In Progress/);
    assert.match(brief, /D-29/);
  });

  it('should synchronize session context into existing GEMINI.md idempotently', () => {
    const geminiMdPath = path.join(tmpDir, 'GEMINI.md');
    fs.writeFileSync(geminiMdPath, '# My Project Instructions\n\nSome guidelines here.');

    // First sync
    const res1 = syncSessionContext(planningDir, tmpDir);
    assert.equal(res1, true);

    const content1 = fs.readFileSync(geminiMdPath, 'utf8');
    assert.equal(content1.includes(START_MARKER), true);
    assert.equal(content1.includes(END_MARKER), true);
    assert.equal(content1.includes('# My Project Instructions'), true);

    // Second sync (idempotency check)
    const res2 = syncSessionContext(planningDir, tmpDir);
    assert.equal(res2, true);

    const content2 = fs.readFileSync(geminiMdPath, 'utf8');
    const startCount = (content2.match(new RegExp(START_MARKER, 'g')) || []).length;
    const endCount = (content2.match(new RegExp(END_MARKER, 'g')) || []).length;

    assert.equal(startCount, 1);
    assert.equal(endCount, 1);
  });

  it('should create fallback rule file when no host context file exists', () => {
    const res = syncSessionContext(planningDir, tmpDir);
    assert.equal(res, true);

    const fallbackPath = path.join(tmpDir, '.agents', 'rules', 'gsd-session.md');
    assert.equal(fs.existsSync(fallbackPath), true);

    const content = fs.readFileSync(fallbackPath, 'utf8');
    assert.equal(content.includes(START_MARKER), true);
  });
});
