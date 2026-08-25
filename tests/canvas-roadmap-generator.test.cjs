const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const helpers = require('./helpers.cjs');

const canvasGen = require('../gsd-core/bin/lib/canvas-roadmap-generator.cjs');

test('Canvas Roadmap Generator — builds compliant .canvas JSON', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-test-'));
  const planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });

  const mockRoadmap = `# Roadmap\n\n### Phase 1: Core Setup\nInitial setup of project.\nStatus: complete\n\n### Phase 2: Feature Implementation\nBuilding core features.\nStatus: in progress\n`;
  fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), mockRoadmap, 'utf8');

  try {
    await t.test('parseRoadmapPhases extracts phases from planning dir', () => {
      const phases = canvasGen.parseRoadmapPhases(planningDir);
      assert.ok(phases.length > 0, 'Must parse at least 1 phase');

      const sample = phases[0];
      assert.ok(sample.id.startsWith('phase-'), 'Phase ID must match phase-XX format');
      assert.ok(typeof sample.number === 'number', 'Phase number must be a number');
      assert.ok(['complete', 'in_progress', 'planned'].includes(sample.status), 'Status must be valid');
    });

    await t.test('buildRoadmapCanvas generates valid nodes and sequential edges', () => {
      const mockPhases = [
        { id: 'phase-01', number: 1, title: 'Init', status: 'complete', description: 'First step' },
        { id: 'phase-02', number: 2, title: 'Build', status: 'in_progress', description: 'Second step' },
        { id: 'phase-03', number: 3, title: 'Ship', status: 'planned', description: 'Third step' },
      ];

      const canvas = canvasGen.buildRoadmapCanvas(mockPhases);
      assert.strictEqual(canvas.nodes.length, 3, 'Must create 3 nodes');
      assert.strictEqual(canvas.edges.length, 2, 'Must create 2 sequential edges');

      assert.strictEqual(canvas.nodes[0].color, '4', 'Complete status must be color 4 (green)');
      assert.strictEqual(canvas.nodes[1].color, '3', 'In Progress status must be color 3 (yellow)');
      assert.strictEqual(canvas.nodes[2].color, '5', 'Planned status must be color 5 (cyan)');
    });

    await t.test('exportRoadmapCanvas writes ROADMAP.canvas to disk', () => {
      const { canvasPath, payload } = canvasGen.exportRoadmapCanvas(planningDir);

      assert.ok(fs.existsSync(canvasPath), 'ROADMAP.canvas must exist');
      assert.ok(canvasPath.endsWith('ROADMAP.canvas'), 'Path must end with ROADMAP.canvas');
      assert.ok(payload.nodes.length > 0, 'Canvas payload must contain nodes');
    });
  } finally {
    helpers.cleanup(tmpDir);
  }
});
