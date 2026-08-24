const { spawnSync } = require('child_process');

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
  'tests/gsd-statusline.test.cjs'
];

console.log(`\n🚀 Running GSD Core Nexus test suite (${testFiles.length} suites)...\n`);

const args = ['--test', ...testFiles];
const result = spawnSync(process.execPath, args, { stdio: 'inherit' });

if (result.status !== 0) {
  console.error(`\n❌ Tests failed with status ${result.status}`);
  process.exitCode = result.status || 1;
} else {
  console.log(`\n✅ All GSD Core Nexus tests passed successfully!\n`);
}
