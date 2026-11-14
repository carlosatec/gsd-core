#!/usr/bin/env node
'use strict';

/**
 * Cross-platform CLI entrypoint for `gsd_run` exposed via package.json `bin`.
 * Delegates all arguments and exit status to `gsd-core/bin/gsd-tools.cjs` so
 * npm generates working `.cmd`/`.ps1` shims on Windows and POSIX wrappers on Unix.
 */

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const toolsPath = path.resolve(__dirname, '..', 'gsd-core', 'bin', 'gsd-tools.cjs');
const result = spawnSync(process.execPath, [toolsPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
});

if (result.error) {
  process.stderr.write(`${result.error.message}\n`);
  process.exitCode = 1;
} else if (result.signal) {
  process.kill(process.pid, result.signal);
} else {
  process.exitCode = typeof result.status === 'number' ? result.status : 1;
}

