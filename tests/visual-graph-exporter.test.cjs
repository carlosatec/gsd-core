const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const helpers = require('./helpers.cjs');

const visualGraph = require('../gsd-core/bin/lib/visual-graph-exporter.cjs');

test('Visual Graph Exporter — builds payload and generates offline HTML', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-graph-test-'));
  const planningDir = path.join(tmpDir, '.planning');
  const srcDir = path.join(tmpDir, 'src');
  fs.mkdirSync(planningDir, { recursive: true });
  fs.mkdirSync(srcDir, { recursive: true });

  fs.writeFileSync(
    path.join(planningDir, 'STATE.md'),
    '# State\nCurrent Phase: Phase 1\nDecisions: D-01 [Core Engine]\n',
    'utf8'
  );
  fs.writeFileSync(
    path.join(srcDir, 'index.ts'),
    'export const version = "2.8.0";\n',
    'utf8'
  );

  try {
    await t.test('buildVisualGraphPayload extracts nodes and links', () => {
      const payload = visualGraph.buildVisualGraphPayload(planningDir, tmpDir);

      assert.ok(payload.nodes.length > 0, 'Must extract at least 1 node');
      assert.ok(payload.stats.totalNodes > 0, 'Stats totalNodes must be > 0');

      // Verify node structure
      const sampleNode = payload.nodes[0];
      assert.ok(sampleNode.id, 'Node must have an id');
      assert.ok(sampleNode.label, 'Node must have a label');
      assert.ok(sampleNode.color, 'Node must have a color');
      assert.ok(typeof sampleNode.pageRank === 'number', 'Node pageRank must be a number');
      assert.ok(sampleNode.radius >= 5, 'Node radius must be at least 5');
    });

    await t.test('generateVisualGraphHtml produces self-contained offline HTML', () => {
      const payload = visualGraph.buildVisualGraphPayload(planningDir, tmpDir);
      const html = visualGraph.generateVisualGraphHtml(payload);

      assert.ok(html.includes('<!DOCTYPE html>'), 'Must be valid HTML5 document');
      assert.ok(html.includes('canvas id="graphCanvas"'), 'Must contain HTML5 canvas');
      assert.ok(html.includes('exportSnapshot()'), 'Must contain image export function');
      assert.ok(html.includes('togglePhysics()'), 'Must contain physics toggle');
      assert.ok(html.includes('search-box'), 'Must contain search box');
      assert.ok(!html.includes('cdn.jsdelivr.net'), 'Must NOT depend on external CDN');
      assert.ok(!html.includes('d3js.org'), 'Must NOT depend on external CDN');
    });

    await t.test('exportVisualGraph writes to .planning/intel/graph-view.html', () => {
      const { htmlPath, payload } = visualGraph.exportVisualGraph(planningDir, tmpDir);

      assert.ok(fs.existsSync(htmlPath), 'Exported HTML file must exist on disk');
      assert.ok(htmlPath.endsWith('graph-view.html'), 'Path must end with graph-view.html');
      assert.ok(payload.nodes.length > 0, 'Payload must contain nodes');
    });
  } finally {
    helpers.cleanup(tmpDir);
  }
});
