const { spawnSync } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

// Ensure hooks are pre-built so concurrent tests don't race on build-hooks
const hooksDist = path.join(__dirname, '..', 'hooks', 'dist');
if (!fs.existsSync(hooksDist)) {
  console.log('\n📦 Pre-building hooks for test suite execution...');
  spawnSync(process.execPath, [path.join(__dirname, 'build-hooks.js')], { stdio: 'inherit' });
}

const testFiles = [
  'tests/installer-language-prompt.test.cjs',
  'tests/codebase-ast-analyzer-mobile.test.cjs',
  'tests/session-context-hook.test.cjs',
  'tests/graphify-facade.test.cjs',
  'tests/hybrid-rag-bm25.test.cjs',
  'tests/unified-workflow-hub.test.cjs',
  'tests/jit-context-injector.test.cjs',
  'tests/hybrid-semantic-rag.test.cjs',
  'tests/preflight-guardrails.test.cjs',
  'tests/anti-pattern-store.test.cjs',
  'tests/auto-upgrade-engine.test.cjs',
  'tests/living-docs-engine.test.cjs',
  'tests/i18n-descriptions.test.cjs',
  'tests/token-telemetry.test.cjs',
  'tests/test-scaffold-engine.test.cjs',
  'tests/deep-ast-graph.test.cjs',
  'tests/multi-language-ast.test.cjs',
  'tests/polyglot-integration-polish.test.cjs',
  'tests/ios-scaffold-safety.test.cjs',
  'tests/ast-diff-guardrails.test.cjs',
  'tests/installed-surface-resolver.test.cjs',
  'tests/gsd-statusline.test.cjs',
  'tests/deepseek-harness-adapter.test.cjs',
  'tests/session-logger-replay.test.cjs',
  'tests/visual-graph-exporter.test.cjs',
  'tests/obsidian-interop.test.cjs',
  'tests/canvas-roadmap-generator.test.cjs',
  'tests/bump-version.test.cjs',
  'tests/uninstall-self-repo-guard.test.cjs',
  'tests/telemetry-multi-command.test.cjs',
  'tests/mcp-server-security.test.cjs'
];

const concurrency = Math.max(1, Math.min(os.cpus()?.length || 2, 4));
console.log(`\n🚀 Running GSD Core Nexus test suite (${testFiles.length} suites, concurrency: ${concurrency})...\n`);

const args = ['--test', `--test-concurrency=${concurrency}`, ...testFiles];
const result = spawnSync(process.execPath, args, { stdio: 'inherit' });

if (result.status !== 0) {
  console.error(`\n❌ Tests failed with status ${result.status}`);
  process.exitCode = result.status || 1;
} else {
  console.log(`\n✅ All GSD Core Nexus tests passed successfully!\n`);
}

