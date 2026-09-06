'use strict';
/**
 * scripts/ensure-build-lib.cjs
 *
 * Safe compilation bootstrap seam for npm lifecycle hooks (prepare, postinstall).
 * Checks if the TypeScript compiler is physically present in node_modules before
 * executing the build. If TypeScript is not installed (e.g. clean git clone during
 * dependency resolution, or package consumed as a production dependency), exits
 * gracefully with code 0 instead of aborting the installation.
 */

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

function run() {
  const rootDir = path.resolve(__dirname, '..');
  const tscPath = path.join(rootDir, 'node_modules', 'typescript', 'bin', 'tsc');
  const tsconfigPath = path.join(rootDir, 'tsconfig.build.json');

  if (!fs.existsSync(tscPath)) {
    // TypeScript is not yet installed in node_modules (transient install phase)
    return;
  }

  if (!fs.existsSync(tsconfigPath)) {
    return;
  }

  const result = childProcess.spawnSync(process.execPath, [tscPath, '-p', 'tsconfig.build.json'], {
    cwd: rootDir,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

try {
  run();
} catch (err) {
  console.error('[gsd-core] ensure-build-lib failed:', err);
  process.exit(1);
}
