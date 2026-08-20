'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { cleanup } = require('./helpers.cjs');
const jitInjector = require('../gsd-core/bin/lib/jit-context-injector.cjs');
const guardrails = require('../gsd-core/bin/lib/preflight-guardrails.cjs');
const normalizer = require('../gsd-core/bin/lib/normalize-test-command.cjs');

describe('Wave 0: Polyglot Integration Polish', () => {
  describe('JIT Context Injector: Polyglot Type Extraction', () => {
    test('extracts structs, traits, classes and models into applicableTypes', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-jit-poly-'));
      try {
        const planningDir = path.join(tmpDir, '.planning');
        fs.mkdirSync(planningDir, { recursive: true });

        fs.writeFileSync(
          path.join(tmpDir, 'service.go'),
          'package main\n\ntype UserService struct {\n  ID int\n}\n\ntype AuthHandler interface {\n  Auth()\n}\n'
        );

        const pkg = jitInjector.assembleJitContext({
          targetFiles: ['service.go'],
          planningDir,
          rootDir: tmpDir,
        });

        assert.ok(pkg.applicableTypes.some(t => t.includes('UserService (struct')), 'Should extract UserService struct');
        assert.ok(pkg.applicableTypes.some(t => t.includes('AuthHandler (interface')), 'Should extract AuthHandler interface');
        assert.ok(pkg.markdownBlock.includes('UserService (struct'), 'Markdown block should contain struct');
      } finally {
        cleanup(tmpDir);
      }
    });
  });

  describe('Preflight Guardrails: Polyglot Path Resolution & Root Modules', () => {
    test('resolves Go root module imports without phantom import errors', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-guard-go-'));
      try {
        const planningDir = path.join(tmpDir, '.planning');
        fs.mkdirSync(planningDir, { recursive: true });

        fs.writeFileSync(path.join(tmpDir, 'go.mod'), 'module github.com/example/myproject\n\ngo 1.22\n');

        fs.mkdirSync(path.join(tmpDir, 'pkg', 'utils'), { recursive: true });
        fs.writeFileSync(path.join(tmpDir, 'pkg', 'utils', 'helper.go'), 'package utils\n\nfunc Help() {}\n');

        const mainGoContent = 'package main\n\nimport (\n  "github.com/example/myproject/pkg/utils"\n)\n\nfunc main() {}\n';

        const report = guardrails.runPreFlightChecks({
          taskId: 'task-test-go',
          filesToModify: ['main.go'],
          proposedCodeMap: { 'main.go': mainGoContent },
          planningDir,
          rootDir: tmpDir,
        });

        const phantomViolations = report.violations.filter(v => v.rule === 'PHANTOM_IMPORT');
        assert.strictEqual(phantomViolations.length, 0, 'Should not flag Go project module imports as PHANTOM_IMPORT');
      } finally {
        cleanup(tmpDir);
      }
    });
  });

  describe('Normalize Test Command: Polyglot Runner Support', () => {
    test('normalizes watch-mode pytest commands', () => {
      assert.strictEqual(normalizer.normalizeTestCommand('ptw -- -v', '/tmp'), 'pytest -- -v');
      assert.strictEqual(normalizer.normalizeTestCommand('pytest -f tests/', '/tmp'), 'pytest tests/');
    });

    test('normalizes cargo watch to cargo test', () => {
      assert.strictEqual(normalizer.normalizeTestCommand('cargo watch -x test', '/tmp'), 'cargo test');
      assert.strictEqual(normalizer.normalizeTestCommand('cargo test', '/tmp'), 'cargo test');
    });

    test('detects test runner based on manifests', () => {
      const tmpGo = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-det-go-'));
      try {
        fs.writeFileSync(path.join(tmpGo, 'go.mod'), 'module foo\n');
        assert.strictEqual(normalizer.detectProjectTestCommand(tmpGo), 'go test ./...');
      } finally {
        cleanup(tmpGo);
      }

      const tmpPy = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-det-py-'));
      try {
        fs.writeFileSync(path.join(tmpPy, 'pytest.ini'), '[pytest]\n');
        assert.strictEqual(normalizer.detectProjectTestCommand(tmpPy), 'pytest');
      } finally {
        cleanup(tmpPy);
      }
    });
  });
});
