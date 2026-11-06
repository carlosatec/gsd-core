'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { cleanup } = require('./helpers.cjs');
const { splitLines } = require('../gsd-core/bin/lib/text-lines.cjs');

const {
  recordMemoryEntry,
  queryMemory,
  sanitizePii,
} = require('../gsd-core/bin/lib/continuous-memory.cjs');

const { assembleJitContext } = require('../gsd-core/bin/lib/jit-context-injector.cjs');

test('Continuous Memory: PII path sanitization', () => {
  const root = 'C:\\Projects\\my-secret-app';
  const textWithRoot = 'Error in C:\\Projects\\my-secret-app\\src\\index.ts: syntax error';
  const sanitized1 = sanitizePii(textWithRoot, root);
  assert.ok(!sanitized1.includes('C:/Projects/my-secret-app'));
  assert.ok(sanitized1.includes('./src/index.ts'));

  const textWithHome = 'Found credential in /Users/carlos/config.json or C:/Users/Carlos/id_rsa';
  const sanitized2 = sanitizePii(textWithHome, root);
  assert.ok(!sanitized2.includes('carlos'));
  assert.ok(!sanitized2.includes('Carlos'));
  assert.ok(sanitized2.includes('~'));
});

test('Continuous Memory: Record and Query with BM25 & Proximity Bonus', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-mem-test-'));
  try {
    const mem1 = recordMemoryEntry(tmpDir, {
      phase: '34',
      command: 'exec',
      category: 'architecture_decision',
      summary: 'Use native TypeScript AST analyzer without Python dependencies',
      details: 'Decision D-01 strictly enforces zero python runtimes.',
      relevantFiles: ['src/codebase-ast-analyzer.cts'],
      keywords: ['ast', 'native', 'no-python'],
    });

    assert.ok(mem1.id.startsWith('mem-'));
    assert.equal(mem1.category, 'architecture_decision');

    const mem2 = recordMemoryEntry(tmpDir, {
      phase: '34',
      command: 'review',
      category: 'self_healing_fix',
      summary: 'Fixed unhandled exception in database connection pooling',
      details: 'Wrapped pool acquisition in retry loop.',
      relevantFiles: ['src/db.ts'],
      keywords: ['database', 'retry', 'pool'],
    });

    // Query 1: BM25 matching "python ast"
    const results1 = queryMemory(tmpDir, 'python ast');
    assert.ok(results1.length > 0);
    assert.equal(results1[0].id, mem1.id);

    // Query 2: File proximity bonus for src/db.ts
    const results2 = queryMemory(tmpDir, '', { files: ['src/db.ts'] });
    assert.ok(results2.length > 0);
    assert.equal(results2[0].id, mem2.id);

    // Query 3: Category filter
    const results3 = queryMemory(tmpDir, '', { category: 'architecture_decision' });
    assert.equal(results3.length, 1);
    assert.equal(results3[0].id, mem1.id);
  } finally {
    cleanup(tmpDir);
  }
});

test('Continuous Memory: Fail-Open Resilience', () => {
  // Querying on a non-existent directory must return [] without throwing
  const emptyRes = queryMemory('/non-existent-dir-path-xyz-123', 'search term');
  assert.deepEqual(emptyRes, []);
});

test('Continuous Memory: JIT Context Injection includes Memories', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-jit-mem-'));
  try {
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '# State\n- **D-01 [Architecture]**: Native TS\n', 'utf8');

    // Create target file
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'engine.ts'), 'export function runEngine() {}', 'utf8');

    // Record relevant memory for engine.ts
    recordMemoryEntry(tmpDir, {
      command: 'exec',
      category: 'self_healing_fix',
      summary: 'Engine requires maxWorkers limit on Windows',
      details: 'Avoid CPU starvation on multicore hosts.',
      relevantFiles: ['src/engine.ts'],
    });

    const jitPackage = assembleJitContext({
      targetFiles: ['src/engine.ts'],
      planningDir,
      rootDir: tmpDir,
      query: 'maxWorkers limit',
    });

    assert.ok(jitPackage.applicableMemories);
    assert.ok(jitPackage.applicableMemories.length > 0);
    assert.ok(jitPackage.markdownBlock.includes('Continuous Memory (Historical Decisions & Fixes)'));
    assert.ok(jitPackage.markdownBlock.includes('maxWorkers limit'));
  } finally {
    cleanup(tmpDir);
  }
});

test('Continuous Memory: Compaction archives older entries and keeps architecture_decision', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-mem-compact-'));
  try {
    const memoryDir = path.join(tmpDir, '.planning', 'memory');
    fs.mkdirSync(memoryDir, { recursive: true });
    const decisionsPath = path.join(memoryDir, 'decisions.jsonl');

    // Populate 1505 entries directly, with entry 0 as architecture_decision
    const lines = [];
    lines.push(JSON.stringify({
      id: 'arch-perm',
      timestamp: Date.now() - 100000,
      category: 'architecture_decision',
      summary: 'Permanent Architecture Decision',
    }));

    for (let i = 1; i <= 1505; i++) {
      lines.push(JSON.stringify({
        id: `ephemeral-${i}`,
        timestamp: Date.now() - 50000 + i,
        category: 'tool_quirk',
        summary: `Ephemeral quirk ${i}`,
      }));
    }
    fs.writeFileSync(decisionsPath, lines.join('\n') + '\n', 'utf8');

    // Trigger one more recordMemoryEntry to invoke tryCompaction
    recordMemoryEntry(tmpDir, {
      category: 'tool_quirk',
      summary: 'Triggering entry',
    });

    // Poll for async compaction completion
    const archiveDir = path.join(memoryDir, 'archive');
    let compacted = false;
    for (let wait = 0; wait < 40; wait++) {
      if (fs.existsSync(archiveDir) && fs.readdirSync(archiveDir).length > 0) {
        compacted = true;
        break;
      }
      await new Promise(r => setImmediate(r));
    }
    assert.ok(compacted, 'Archive directory should have been created');

    const remaining = splitLines(fs.readFileSync(decisionsPath, 'utf8').trim());
    assert.ok(remaining.length <= 1100, `Remaining lines should be compacted (got ${remaining.length})`);

    // Verify architecture_decision was retained
    const hasArch = remaining.some(l => l.includes('arch-perm'));
    assert.ok(hasArch, 'architecture_decision entry must be preserved permanently');
  } finally {
    cleanup(tmpDir);
  }
});
