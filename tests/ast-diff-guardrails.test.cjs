'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { cleanup } = require('./helpers.cjs');
const guardrails = require('../gsd-core/bin/lib/preflight-guardrails.cjs');
const codebaseAst = require('../gsd-core/bin/lib/codebase-ast-analyzer.cjs');

describe('Wave 4: Memory Contract Pre-Flight Validation', () => {
  test('flags CONTRACT_BREAK when an exported symbol is deleted without migrating existing callers', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-diff-guard-'));
    try {
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });

      fs.writeFileSync(path.join(tmpDir, 'tax.ts'), 'export function calculateTax(amount: number) { return amount * 0.2; }\n');
      fs.writeFileSync(path.join(tmpDir, 'invoice.ts'), 'import { calculateTax } from "./tax";\nexport function createInvoice() { return calculateTax(100); }\n');

      const graph = codebaseAst.buildCodebaseGraph(tmpDir);
      codebaseAst.saveCodebaseGraph(planningDir, graph);

      const brokenTaxContent = 'export function newTax(amount: number) { return amount * 0.15; }\n';

      const report = guardrails.runPreFlightChecks({
        taskId: 'test-break',
        filesToModify: ['tax.ts'],
        proposedCodeMap: { 'tax.ts': brokenTaxContent },
        planningDir,
        rootDir: tmpDir,
      });

      assert.strictEqual(report.valid, false);
      const contractBreaks = report.violations.filter(v => v.rule === 'CONTRACT_BREAK');
      assert.strictEqual(contractBreaks.length, 1);
      assert.ok(contractBreaks[0].message.includes('calculateTax'));
    } finally {
      cleanup(tmpDir);
    }
  });

  test('allows co-evolution when both provider and caller are updated in proposedCodeMap', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-coevo-guard-'));
    try {
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });

      fs.writeFileSync(path.join(tmpDir, 'tax.ts'), 'export function calculateTax(amount: number) { return amount * 0.2; }\n');
      fs.writeFileSync(path.join(tmpDir, 'invoice.ts'), 'import { calculateTax } from "./tax";\nexport function createInvoice() { return calculateTax(100); }\n');

      const graph = codebaseAst.buildCodebaseGraph(tmpDir);
      codebaseAst.saveCodebaseGraph(planningDir, graph);

      const newTaxContent = 'export function computeTaxRate(amount: number) { return amount * 0.15; }\n';
      const newInvoiceContent = 'import { computeTaxRate } from "./tax";\nexport function createInvoice() { return computeTaxRate(100); }\n';

      const report = guardrails.runPreFlightChecks({
        taskId: 'test-coevo',
        filesToModify: ['tax.ts', 'invoice.ts'],
        proposedCodeMap: {
          'tax.ts': newTaxContent,
          'invoice.ts': newInvoiceContent,
        },
        planningDir,
        rootDir: tmpDir,
      });

      const contractBreaks = report.violations.filter(v => v.rule === 'CONTRACT_BREAK');
      assert.strictEqual(contractBreaks.length, 0, 'Co-evolving changes in proposedCodeMap should resolve CONTRACT_BREAK');
    } finally {
      cleanup(tmpDir);
    }
  });
});
