import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const mod = require('./worktree-isolation.cjs');
export default mod;
export const {
  isWorktreeSupported,
  linkSharedDependencies,
  unlinkSharedDependencies,
  createIsolatedWorktree,
  mergeAndCleanupWorktree,
  cleanupWaveWorktrees,
} = mod;

