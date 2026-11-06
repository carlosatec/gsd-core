#!/usr/bin/env node
'use strict';

/**
 * Unified Drift Linter Suite CLI Runner (Phase 34)
 *
 * Runs all registered drift and schema checkers in-memory in a single Node process,
 * reducing CI execution time by >70% while reporting consolidated diagnostics.
 */

const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const suite = require(path.join(ROOT, 'gsd-core', 'bin', 'lib', 'drift-linter-suite.cjs'));

function parseArgs() {
  const args = process.argv.slice(2);
  let rule = null;
  for (const arg of args) {
    if (arg.startsWith('--rule=')) {
      rule = arg.slice(7).trim();
    }
  }
  return { rule };
}

function main() {
  const { rule } = parseArgs();

  if (rule) {
    const res = suite.runSingleRule(rule, ROOT);
    if (res.passed) {
      process.stdout.write(`ok ${res.rule} (${res.durationMs}ms)\n`);
      return;
    }
    process.stderr.write(`FAIL ${res.rule} (${res.durationMs}ms)\n`);
    for (const v of res.violations) {
      const loc = v.file ? ` (${v.file})` : '';
      process.stderr.write(`  - ${v.message}${loc}\n`);
    }
    process.exitCode = 1;
    return;
  }

  process.stdout.write('Running GSD Unified Drift Linter Suite in-memory...\n');
  const suiteResult = suite.runUnifiedDriftSuite(ROOT);

  for (const r of suiteResult.results) {
    if (r.passed) {
      process.stdout.write(`  ✓ ${r.rule.padEnd(35)} ok (${r.durationMs}ms)\n`);
    } else {
      process.stderr.write(`  ✗ ${r.rule.padEnd(35)} FAILED (${r.durationMs}ms)\n`);
      for (const v of r.violations) {
        const loc = v.file ? ` (${v.file})` : '';
        process.stderr.write(`      - ${v.message}${loc}\n`);
      }
    }
  }

  if (suiteResult.passed) {
    process.stdout.write(
      `\nok unified-drift-suite: all ${suiteResult.totalRules} rules passed in ${suiteResult.durationMs}ms\n`,
    );
  } else {
    process.stderr.write(
      `\nFAIL unified-drift-suite: ${suiteResult.failedRules} of ${suiteResult.totalRules} rules failed in ${suiteResult.durationMs}ms\n`,
    );
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };

