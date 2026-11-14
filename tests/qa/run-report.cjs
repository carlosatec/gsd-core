#!/usr/bin/env node
'use strict';

/**
 * run-report.cjs — developer/CI entry point that discovers every QA-walk
 * scenario, runs it for real against `gsd-tools`, and writes a single
 * `qa-report.json` document (see `report.cjs`).
 *
 * This is a TOOL, not a test file — it is invoked directly with `node`,
 * never through `gsd-test` / `node --test`, and is deliberately NOT named
 * `*.test.cjs` so it is never picked up by the test runner's glob.
 *
 * Usage:
 *   node tests/qa/run-report.cjs [--out <path>] [--keep]
 *
 * `--out <path>` defaults to `qa-report.json` at the repo root.
 * `--keep` (or `GSD_QA_KEEP=1`) preserves every scenario's temp project
 * directory instead of deleting it, and threads real repro commands for it
 * into the report — see `report.cjs`'s `buildRepro`.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const { loadScenario, runScenario } = require('./scenario.cjs');
const { buildReport, writeReport } = require('./report.cjs');
const { LoopWalk } = require('./loop-walk.cjs');
const { runOracles } = require('./oracles.cjs');
const { getLiveCommandTokens } = require('../helpers/live-command-registry.cjs');

/** Absolute path to the repo root (`tests/qa/` -> `tests/` -> repo root). */
const REPO_ROOT = path.join(__dirname, '..', '..');

/** Absolute path to the scenarios directory. */
const SCENARIOS_DIR = path.join(__dirname, 'scenarios');

/**
 * Parse `argv` (excluding `node`/script name) into `{ out, keep }`.
 *
 * @param {string[]} argv
 * @returns {{out: string, keep: boolean}}
 */
function parseArgs(argv) {
  let out = path.join(REPO_ROOT, 'qa-report.json');
  let keep = false;
  let workerScenario = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') {
      const value = argv[i + 1];
      if (typeof value !== 'string' || value === '') {
        throw new Error('run-report: --out requires a path argument');
      }
      out = path.resolve(value);
      i += 1;
    } else if (arg === '--keep') {
      keep = true;
    } else if (arg === '--worker-scenario') {
      const value = argv[i + 1];
      if (typeof value !== 'string' || value === '') {
        throw new Error('run-report: --worker-scenario requires a path argument');
      }
      workerScenario = path.resolve(value);
      i += 1;
    } else {
      throw new Error(`run-report: unrecognized argument "${arg}" (expected --out <path>, --keep, or --worker-scenario <path>)`);
    }
  }
  return { out, keep, workerScenario };
}

/**
 * Every `.json` scenario file under `tests/qa/scenarios/`, EXCLUDING
 * underscore-prefixed self-test scenarios (e.g. `_selftest-must-fail.json`),
 * which are deliberately broken and must never run as a normal walk — see
 * `scenario.cjs`'s `assertWiringIsLive`.
 *
 * @returns {string[]} absolute file paths, sorted for a deterministic run order.
 */
function discoverScenarioFiles() {
  return fs
    .readdirSync(SCENARIOS_DIR)
    .filter((name) => name.endsWith('.json') && !name.startsWith('_'))
    .sort()
    .map((name) => path.join(SCENARIOS_DIR, name));
}

/**
 * Run every discovered scenario for real and return the raw array of
 * per-scenario reports (each carrying its own `fixture` field — see
 * `runScenario`'s header). This is the shared "drive every scenario" seam:
 * `main()` below feeds this straight into `buildReport`, and
 * `scripts/qa-smell-ratchet.cjs` reuses this EXACT function rather than
 * re-implementing scenario discovery + walking, so the two tools can never
 * silently diverge on which scenarios ran or how.
 *
 * @param {{keep?: boolean, liveCommands?: string[]}} [opts] `keep` (default
 *   `false`) is forwarded to `runScenario` — see its own header for the
 *   `GSD_QA_KEEP=1` interaction. `liveCommands` defaults to a fresh call to
 *   `getLiveCommandTokens()` when omitted.
 * @returns {Array<ReturnType<typeof runScenario> & {fixture: string}>}
 * @throws {Error} when no scenario files are discovered.
 */
function runAllScenarios(opts) {
  const { keep = false, liveCommands = [...getLiveCommandTokens()] } = opts || {};

  const scenarioFiles = discoverScenarioFiles();
  if (scenarioFiles.length === 0) {
    throw new Error(`run-report: no scenario files discovered under "${SCENARIOS_DIR}"`);
  }

  return scenarioFiles.map((file) => {
    const scenario = loadScenario(file);
    const report = runScenario(scenario, { LoopWalk, runOracles, liveCommands, keep });
    // `runScenario`'s own return value carries no `fixture` field — attach it
    // here from the (already-validated) scenario so the report document can
    // show which starting world each scenario walked.
    return { ...report, fixture: scenario.fixture };
  });
}

const WORKER_RESULT_PREFIX = 'GSD_QA_SCENARIO_RESULT:';
const WORKER_SCENARIO_TIMEOUT_MS = 120_000;

/**
 * Parallel bounded worker execution for QA scenarios (dramatically speeds up
 * Windows runs where spawning sequential CLIs takes ~95s+). Preserves the
 * exact deterministic order of `discoverScenarioFiles()`.
 *
 * @param {{keep?: boolean, liveCommands?: string[], concurrency?: number, onProgress?: (info: {done: number, total: number, file: string, elapsedMs: number}) => void}} [opts]
 * @returns {Promise<Array<ReturnType<typeof runScenario> & {fixture: string}>>}
 */
async function runAllScenariosParallel(opts) {
  const {
    keep = false,
    liveCommands = [...getLiveCommandTokens()],
    concurrency,
    onProgress,
  } = opts || {};

  const scenarioFiles = discoverScenarioFiles();
  if (scenarioFiles.length === 0) {
    throw new Error(`run-report: no scenario files discovered under "${SCENARIOS_DIR}"`);
  }

  const cpuCount = typeof os.availableParallelism === 'function'
    ? os.availableParallelism()
    : (os.cpus() || []).length || 2;
  const maxWorkers = Math.max(
    1,
    Math.min(
      scenarioFiles.length,
      Number.isInteger(concurrency) && concurrency > 0 ? concurrency : Math.min(4, cpuCount),
    ),
  );

  const results = new Array(scenarioFiles.length);
  let nextIndex = 0;
  let completed = 0;
  const workerEnv = {
    ...process.env,
    GSD_QA_LIVE_COMMANDS: JSON.stringify(liveCommands),
  };

  async function workerLoop() {
    while (nextIndex < scenarioFiles.length) {
      const idx = nextIndex;
      nextIndex += 1;
      const file = scenarioFiles[idx];
      const t0 = Date.now();
      const args = [__filename, '--worker-scenario', file];
      if (keep) args.push('--keep');
      const { stdout } = await execFileAsync(process.execPath, args, {
        cwd: REPO_ROOT,
        env: workerEnv,
        timeout: WORKER_SCENARIO_TIMEOUT_MS,
        maxBuffer: 16 * 1024 * 1024,
      });
      const markerLine = stdout
        .split(/\r?\n/)
        .find((line) => line.startsWith(WORKER_RESULT_PREFIX));
      if (!markerLine) {
        throw new Error(`run-report worker did not emit ${WORKER_RESULT_PREFIX} for ${file}`);
      }
      results[idx] = JSON.parse(markerLine.slice(WORKER_RESULT_PREFIX.length));
      completed += 1;
      if (typeof onProgress === 'function') {
        onProgress({
          done: completed,
          total: scenarioFiles.length,
          file: path.basename(file),
          elapsedMs: Date.now() - t0,
        });
      }
    }
  }

  await Promise.all(Array.from({ length: maxWorkers }, () => workerLoop()));
  return results;
}

async function main() {
  const { out, keep, workerScenario } = parseArgs(process.argv.slice(2));

  if (workerScenario) {
    const scenario = loadScenario(workerScenario);
    const liveCommands = process.env.GSD_QA_LIVE_COMMANDS
      ? JSON.parse(process.env.GSD_QA_LIVE_COMMANDS)
      : [...getLiveCommandTokens()];
    const report = runScenario(scenario, { LoopWalk, runOracles, liveCommands, keep });
    process.stdout.write(`${WORKER_RESULT_PREFIX}${JSON.stringify({ ...report, fixture: scenario.fixture })}\n`);
    return;
  }

  const scenarioReports = await runAllScenariosParallel({
    keep,
    onProgress: ({ done, total, file, elapsedMs }) => {
      process.stderr.write(`[qa] ${done}/${total} ${file} (${elapsedMs}ms)\n`);
    },
  });

  const meta = {
    nodeVersion: process.version,
    platform: process.platform,
    generatedAt: new Date().toISOString(),
  };

  const reportObject = buildReport(scenarioReports, meta);
  const absOut = writeReport(reportObject, out);

  console.log(`qa-report written to ${absOut}`);
  console.log(
    `scenarios=${reportObject.totals.scenarios} steps=${reportObject.totals.steps} `
      + `violations=${reportObject.totals.violations} smells=${reportObject.totals.smells} `
      + `mutationsApplied=${reportObject.totals.mutationsApplied} mutationsObserved=${reportObject.totals.mutationsObserved}`,
  );
}

// Guarded so `scripts/qa-smell-ratchet.cjs` (and anything else) can
// `require('./run-report.cjs')` for its exports — `discoverScenarioFiles`,
// `runAllScenarios` — without triggering a second full scenario run and a
// stray `qa-report.json` write as a side effect of loading the module.
if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`${err && err.stack ? err.stack : String(err)}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  discoverScenarioFiles,
  runAllScenarios,
  runAllScenariosParallel,
  parseArgs,
  REPO_ROOT,
  SCENARIOS_DIR,
};
