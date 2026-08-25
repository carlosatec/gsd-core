const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const obsidianInterop = require('../gsd-core/bin/lib/obsidian-interop.cjs');

test('Obsidian Interop — Wikilinks and Backlinks Index', async (t) => {
  const rootDir = path.resolve(__dirname, '..');
  const planningDir = path.join(rootDir, '.planning');

  await t.test('extractWikilinks extracts simple and aliased links', () => {
    const sampleMd = `
# Sample Document
Referencing [[D-59]] and [[15-01-PLAN|Phase 15 Plan]].
Also see [[src/runtime-homes.cts]] for config roots.
\`\`\`ts
// [[ignored in code block]]
\`\`\`
`;
    const links = obsidianInterop.extractWikilinks(sampleMd, 'test.md');
    assert.strictEqual(links.length, 3, 'Must find exactly 3 wikilinks');
    assert.strictEqual(links[0].target, 'D-59');
    assert.strictEqual(links[1].target, '15-01-PLAN');
    assert.strictEqual(links[1].alias, 'Phase 15 Plan');
    assert.strictEqual(links[2].target, 'src/runtime-homes.cts');
  });

  await t.test('resolveTargetType accurately categorizes targets', () => {
    assert.strictEqual(obsidianInterop.resolveTargetType('D-59'), 'decision');
    assert.strictEqual(obsidianInterop.resolveTargetType('16-01-PLAN'), 'phase');
    assert.strictEqual(obsidianInterop.resolveTargetType('SPEC.md'), 'spec');
    assert.strictEqual(obsidianInterop.resolveTargetType('src/index.ts'), 'code');
  });

  await t.test('buildBacklinkIndex and saveBacklinkIndex persist backlinks.json', () => {
    const { report, filePath } = obsidianInterop.saveBacklinkIndex(planningDir, rootDir);

    assert.ok(fs.existsSync(filePath), 'backlinks.json must exist');
    assert.ok(report.totalNodes > 0, 'Total nodes must be > 0');
    assert.ok(report.nodes['STATE'] !== undefined || Object.keys(report.nodes).length > 0, 'Must have indexed nodes');
  });
});
