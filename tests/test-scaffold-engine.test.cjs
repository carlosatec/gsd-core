'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { cleanup } = require('./helpers.cjs');
const scaffolder = require('../gsd-core/bin/lib/test-scaffold-engine.cjs');
const canonicalFinder = require('../gsd-core/bin/lib/canonical-examples-finder.cjs');
const hub = require('../gsd-core/bin/lib/unified-workflow-hub.cjs');

describe('Wave 5: Scaffolding with Language Topology & Canonical Examples', () => {
  describe('Test Scaffold Engine', () => {
    test('generates inline _test.go scaffold for Go source files', () => {
      const goCode = 'package main\n\nfunc CalculateTax(amt float64) float64 { return amt * 0.2 }\nfunc ProcessOrder() {}\n';
      const scaffold = scaffolder.generateTestScaffold('pkg/billing/calculator.go', goCode);

      assert.strictEqual(scaffold.language, 'go');
      assert.strictEqual(scaffold.isInline, true);
      assert.strictEqual(scaffold.testFilePath, 'pkg/billing/calculator_test.go');
      assert.ok(scaffold.testCode.includes('func TestCalculateTax(t *testing.T)'));
      assert.ok(scaffold.testCode.includes('func TestProcessOrder(t *testing.T)'));
    });

    test('generates inline #[cfg(test)] scaffold for Rust source files', () => {
      const rustCode = 'pub fn parse_input(s: &str) -> bool { true }\npub fn transform() {}\n';
      const scaffold = scaffolder.generateTestScaffold('src/parser.rs', rustCode);

      assert.strictEqual(scaffold.language, 'rust');
      assert.strictEqual(scaffold.isInline, true);
      assert.ok(scaffold.testCode.includes('#[cfg(test)]'));
      assert.ok(scaffold.testCode.includes('fn test_parse_input()'));
    });

    test('generates isolated tests/test_foo.py scaffold for Python source files', () => {
      const pyCode = 'def authenticate_user(): pass\ndef get_permissions(): pass\n';
      const scaffold = scaffolder.generateTestScaffold('auth/service.py', pyCode);

      assert.strictEqual(scaffold.language, 'python');
      assert.strictEqual(scaffold.isInline, false);
      assert.strictEqual(scaffold.testFilePath, 'tests/test_service.py');
      assert.ok(scaffold.testCode.includes('def test_authenticate_user():'));
    });

    test('generates isolated tests/*.test.cjs scaffold for Node.js source files', () => {
      const tsCode = 'export function runTask() {}\nexport function stopTask() {}\n';
      const scaffold = scaffolder.generateTestScaffold('src/runner.ts', tsCode);

      assert.strictEqual(scaffold.language, 'typescript');
      assert.strictEqual(scaffold.isInline, false);
      assert.strictEqual(scaffold.testFilePath, 'tests/runner.test.cjs');
      assert.ok(scaffold.testCode.includes("describe('runner unit tests'"));
      assert.ok(scaffold.testCode.includes("test('should correctly execute runTask'"));
    });
  });

  describe('Canonical Examples Finder', () => {
    test('finds the top architectural reference module in the codebase', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-canonical-'));
      try {
        const planningDir = path.join(tmpDir, '.planning');
        fs.mkdirSync(planningDir, { recursive: true });

        fs.writeFileSync(
          path.join(tmpDir, 'service.ts'),
          'export function doServiceA() {}\nexport function doServiceB() {}\nexport function doServiceC() {}\n'
        );

        fs.writeFileSync(
          path.join(tmpDir, 'app.ts'),
          'import { doServiceA } from "./service";\nexport function run() { doServiceA(); }\n'
        );

        const example = canonicalFinder.findCanonicalExample(tmpDir, planningDir);
        assert.ok(example, 'Should discover canonical example');
        assert.strictEqual(example.file, 'service.ts');
        assert.ok(example.content.includes('doServiceA'));
      } finally {
        cleanup(tmpDir);
      }
    });
  });

  describe('Unified Workflow Hub Integration', () => {
    test('re-exports generateTestScaffold and findCanonicalExample', () => {
      assert.strictEqual(typeof hub.generateTestScaffold, 'function');
      assert.strictEqual(typeof hub.findCanonicalExample, 'function');
    });
  });
});
