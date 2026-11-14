'use strict';
/**
 * Shell-free Windows-safe npm and .cmd shim spawn helpers.
 * Eliminates Node 24 [DEP0190] warnings when passing arguments to npm or .cmd wrappers.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function quoteCmdToken(token) {
  const s = String(token);
  return /[\s&|<>^"()]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s;
}

function resolveNpmCliPath() {
  const envExec = process.env.npm_execpath;
  if (envExec && envExec.endsWith('npm-cli.js') && fs.existsSync(envExec)) {
    return envExec;
  }
  const nodeDir = path.dirname(process.execPath);
  for (const candidate of [
    path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function spawnNpm(args, options = {}) {
  const npmCli = resolveNpmCliPath();
  if (npmCli) {
    return spawnSync(process.execPath, [npmCli, ...args], options);
  }
  if (process.platform === 'win32') {
    const cmdLine = `"${['npm.cmd', ...args].map(quoteCmdToken).join(' ')}"`;
    return spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', cmdLine], {
      ...options,
      windowsVerbatimArguments: true,
    });
  }
  return spawnSync('npm', args, options);
}

function execBinInvocation(invocation, options = {}) {
  if (!invocation.shell) {
    return spawnSync(invocation.command, invocation.args, options);
  }
  const rawCommand =
    invocation.command.startsWith('"') && invocation.command.endsWith('"')
      ? invocation.command.slice(1, -1)
      : invocation.command;
  const cmdLine = `"${[rawCommand, ...invocation.args].map(quoteCmdToken).join(' ')}"`;
  return spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', cmdLine], {
    ...options,
    windowsVerbatimArguments: true,
  });
}

module.exports = {
  execBinInvocation,
  quoteCmdToken,
  resolveNpmCliPath,
  spawnNpm,
};

