'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { cleanup } = require('./helpers.cjs');
const htmlDashboard = require('../gsd-core/bin/lib/observability-html-dashboard.cjs');
const aggregator = require('../gsd-core/bin/lib/observability-aggregator.cjs');
const telemetryMod = require('../gsd-core/bin/lib/jit-telemetry.cjs');

describe('Wave 3: Standalone Offline HTML Dashboard', () => {
  test('escapeHtml sanitizes special characters against XSS', () => {
    assert.strictEqual(htmlDashboard.escapeHtml('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    assert.strictEqual(htmlDashboard.escapeHtml("foo'bar&baz>"), 'foo&#039;bar&amp;baz&gt;');
    assert.strictEqual(htmlDashboard.escapeHtml(null), '');
    assert.strictEqual(htmlDashboard.escapeHtml(undefined), '');
  });

  test('generateDashboardHtml produces 100% offline-compliant HTML5 with SVG charts', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-html-test-'));
    try {
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });

      telemetryMod.recordJitInvocation(planningDir, ['src/main.ts'], 100000, 500000, 'plan', '25');

      const snapshot = aggregator.getObservabilitySnapshot(planningDir);
      const html = htmlDashboard.generateDashboardHtml(snapshot);

      // Valid HTML5
      assert.ok(html.includes('<!DOCTYPE html>'));
      assert.ok(html.includes('<html lang="en">'));
      assert.ok(html.includes('GSD Observability 360°'));

      // Strict Offline Compliance (Zero CDN / remote tags)
      assert.ok(!html.includes('https://cdn.'));
      assert.ok(!html.includes('http://cdn.'));
      assert.ok(!html.includes('unpkg.com'));
      assert.ok(!html.includes('jsdelivr.net'));
      assert.ok(!html.includes('<link rel="stylesheet" href="http'));
      assert.ok(!html.includes('<script src="http'));

      // SVG Charts
      assert.ok(html.includes('donut-svg'));
      assert.ok(html.includes('timeline-container'));

      // Client-side simulator script
      assert.ok(html.includes('modelSelector'));
      assert.ok(html.includes('PRICING_TABLE'));
    } finally {
      cleanup(tmpDir);
    }
  });

  test('exportObservabilityDashboard exports to .planning/intel/dashboard.html', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-html-test-'));
    try {
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });

      const { htmlPath, snapshot } = htmlDashboard.exportObservabilityDashboard(planningDir);

      assert.ok(fs.existsSync(htmlPath));
      assert.ok(htmlPath.endsWith('dashboard.html'));
      assert.ok(snapshot.financial);

      const content = fs.readFileSync(htmlPath, 'utf8');
      assert.ok(content.includes('GSD Observability 360°'));
      assert.ok(content.includes('100% Offline Standalone Architecture'));
    } finally {
      cleanup(tmpDir);
    }
  });
});
