/**
 * Companion MCP server (ADR-1239 Phase C-2, #1681 slice 3a).
 *
 * A minimal stdio JSON-RPC 2.0 server exposing two of the six interface points
 * so any MCP-consuming host (Claude/Codex/OpenCode/VS Code/Gemini/Cursor/Cline/
 * Hermes) can drive GSD with NO bespoke plugin:
 *
 *   - point 1 (command): tool `gsd_invoke_command` → `dispatchGsdCommand`
 *     (src/shell-command-projection.cts), a bounded subprocess-shim to
 *     gsd-tools.cjs. #2102 Stage 2: `commandRoutingHub.createHub()` called
 *     with no args here always hit `if(!_cjsRegistry) return
 *     makeUnknownCommand()` — every dispatch was UnknownCommand. No
 *     fully-populated hub factory exists anywhere in gsd-core (every
 *     createHub() caller builds a single-family hub for its own narrow
 *     purpose), so the fix routes through the SAME shared dispatch helper
 *     the pi extension uses (pi/gsd.cjs), mirroring the SUBPROCESS-REUSE
 *     precedent already established for the OpenCode/Kilo hook bridge.
 *   - point 5 (state IO): tools `gsd_read_state` / `gsd_write_state` → the
 *     Phase 3 `stateIO` seam (src/state-io.cts, filesystem default).
 *
 * No new runtime dependency — the JSON-RPC stdio loop is hand-rolled (the repo
 * ships only claude-agent-sdk + ws; adding an MCP SDK is a separate packaging
 * decision). The protocol logic (`handleMessage`) is PURE and fully testable;
 * `runServer` is a thin line-delimited-JSON loop over injectable streams.
 *
 * Bin entry / packaging / manifest-version-sync is slice 3b — this module is
 * the additive, importable server surface a host (or the bin shim) drives.
 */
'use strict';

// eslint-disable-next-line @typescript-eslint/no-require-imports
import stateIo = require('./state-io.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import shellCommandProjection = require('./shell-command-projection.cjs');
const { dispatchGsdCommand } = shellCommandProjection;
// eslint-disable-next-line @typescript-eslint/no-require-imports
import verificationMod = require('./verification.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import continuousMemoryMod = require('./continuous-memory.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import jitInjector = require('./jit-context-injector.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import guardrails = require('./preflight-guardrails.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import blastRadius = require('./shell-blast-radius.cjs');
import { validatePath } from './security.cjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildCatalog,
  readResource,
  listResources,
  getPrompt,
  REASON,
  type Catalog,
} from './mcp-catalog.cjs';

export const PROTOCOL_VERSION = '2024-11-05';
export const SERVER_NAME = 'gsd-core';

// #3072: resolve SERVER_VERSION from package.json (source tree) or the
// installed gsd-core/VERSION marker, WITHOUT a top-level `require(...)` —
// mirrors the established, already-precedented resolver in
// `runtime-artifact-conversion.cts`'s `gsdVersion()` (#1383): a top-level
// require would throw on any runtime whose root has no package.json/VERSION,
// and `scripts/sync-manifest-versions.cjs` is not a fit here — its
// `VERSIONED_MANIFESTS` list stamps a `version` FIELD into hand-authored JSON
// manifests (plugin.json, marketplace.json, vscode/package.json); a `.cts`
// source constant is not a JSON document that script can round-trip through
// `readJson`/`setByPath`, and teaching it to text-edit TypeScript source
// would be a much larger footprint than this lazy, cached, defensive read.
// Resolved once per process (never per-request) and cached; a failed lookup
// degrades to '0.0.0' (never `undefined`, never a crash) rather than making
// `initialize`'s `serverInfo.version` field absent or malformed.
const SEMVER_PREFIX = /^\d+\.\d+\.\d+/;
let cachedServerVersion: string | undefined;

/**
 * Reset internal version cache for deterministic test environments.
 */
export function _resetServerVersionCache(): void {
  cachedServerVersion = undefined;
}

function resolveServerVersion(): string {
  if (cachedServerVersion !== undefined) return cachedServerVersion;
  let version = '0.0.0';
  try {
    const v = fs.readFileSync(path.join(__dirname, '..', '..', 'VERSION'), 'utf8').trim();
    if (SEMVER_PREFIX.test(v)) version = v;
  } catch {
    /* not an installed tree (no gsd-core/VERSION) */
  }
  if (version === '0.0.0') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy, defensive: a top-level require would throw on a runtime root with no package.json.
      const pkg = require(path.join(__dirname, '..', '..', '..', 'package.json')) as { name?: string; version?: string };
      if (pkg && typeof pkg.version === 'string' && SEMVER_PREFIX.test(pkg.version)) version = pkg.version;
    } catch {
      /* runtime root has no package.json */
    }
  }
  if (version === '0.0.0') {
    // Ascending directory search for non-canonical layouts (npx, monorepos, worktrees)
    try {
      let cur = __dirname;
      while (cur && cur !== path.dirname(cur)) {
        const candidate = path.join(cur, 'package.json');
        if (fs.existsSync(candidate)) {
          try {
            const raw = fs.readFileSync(candidate, 'utf8');
            const parsed = JSON.parse(raw) as { name?: string; version?: string };
            if (parsed && typeof parsed.version === 'string' && SEMVER_PREFIX.test(parsed.version)) {
              if (!parsed.name || parsed.name === 'gsd-core' || parsed.name.includes('gsd')) {
                version = parsed.version;
                break;
              }
            }
          } catch {
            /* ignore unparseable json */
          }
        }
        cur = path.dirname(cur);
      }
    } catch {
      /* ignore traversal errors */
    }
  }
  cachedServerVersion = version;
  return version;
}

// Catalog is built once per process, lazily, and cached (design "Shape" /
// Gall's Law — no watching, no invalidation; Known limits: the package is
// immutable in every install mode we ship).
let cachedCatalog: Catalog | undefined;
function getCatalog(): Catalog {
  if (cachedCatalog === undefined) cachedCatalog = buildCatalog();
  return cachedCatalog;
}

// JSON-RPC 2.0 error codes.
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

export interface McpContext {
  cwd?: string;
}

export interface JsonRpcRequest {
  jsonrpc?: string;
  id?: unknown;
  method?: string;
  params?: unknown;
}

const TOOLS = [
  {
    name: 'gsd_invoke_command',
    description: 'Invoke a GSD command via the command-routing hub (interface point 1).',
    inputSchema: {
      type: 'object',
      properties: {
        family: { type: 'string', description: 'Command family (e.g. "query", "state", "phase").' },
        subcommand: { type: 'string', description: 'Subcommand name.' },
        args: { type: 'array', items: {}, description: 'Positional args.' },
      },
      required: ['family', 'subcommand'],
    },
  },
  {
    name: 'gsd_read_state',
    description: 'Read a .planning state file (interface point 5).',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Absolute path under .planning/.' } },
      required: ['path'],
    },
  },
  {
    name: 'gsd_write_state',
    description: 'Write a .planning state file (interface point 5).',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path under .planning/.' },
        content: { type: 'string', description: 'File content.' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'gsd_jit_context',
    description: 'Assemble surgical JIT context payload based on AST graph and active decisions (interface point 3).',
    inputSchema: {
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string' }, description: 'Target file paths to assemble context for.' },
        maxTokens: { type: 'number', description: 'Optional token budget cap.' },
        dryRun: { type: 'boolean', description: 'If true, returns metadata without full markdown block.' },
      },
      required: ['files'],
    },
  },
  {
    name: 'gsd_preflight_check',
    description: 'Run static pre-flight guardrail checks and optional command blast-radius analysis before mutations.',
    inputSchema: {
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string' }, description: 'Files proposed for modification.' },
        command: { type: 'string', description: 'Shell command proposed for execution.' },
      },
    },
  },
  {
    name: 'gsd_feasibility_check',
    description: 'Validate whether referenced classes, methods, and symbols exist in codebase graph before execution (NVIDIA Auto-Ontology pattern).',
    inputSchema: {
      type: 'object',
      properties: {
        taskText: { type: 'string', description: 'Task description or plan step text to check.' },
        referencedFiles: { type: 'array', items: { type: 'string' }, description: 'Optional list of files touched by task.' },
      },
      required: ['taskText'],
    },
  },
  {
    name: 'gsd_verify_step',
    description: 'Read verification status and execute automated verification step for the current phase.',
    inputSchema: {
      type: 'object',
      properties: {
        phase: { type: 'string', description: 'Optional phase identifier.' },
      },
    },
  },
  {
    name: 'gsd_memory_recall',
    description: 'Retrieve relevant technical decisions and self-healing precedents from continuous memory (Claude-Mem pattern).',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keywords or topic.' },
        files: { type: 'array', items: { type: 'string' }, description: 'Optional target files to boost relevance.' },
        limit: { type: 'number', description: 'Maximum entries to return (default: 5).' },
      },
      required: ['query'],
    },
  },
  {
    name: 'gsd_memory_record',
    description: 'Record an architectural decision, tool quirk, or self-healing fix to persistent cross-session memory.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Category (architecture_decision, tool_quirk, self_healing_fix, rule_override).' },
        summary: { type: 'string', description: 'Concise summary of the decision or fix.' },
        details: { type: 'string', description: 'Detailed context, root cause, or rationale.' },
        relevantFiles: { type: 'array', items: { type: 'string' }, description: 'Files associated with this decision.' },
        keywords: { type: 'array', items: { type: 'string' }, description: 'Keywords for retrieval.' },
      },
      required: ['category', 'summary'],
    },
  },
];

function errorResponse(id: unknown, code: number, message: string, data?: unknown) {
  const err: { code: number; message: string; data?: unknown } = { code, message };
  if (data !== undefined) err.data = data;
  return { jsonrpc: '2.0', id, error: err };
}

function okResponse(id: unknown, result: unknown) {
  return { jsonrpc: '2.0', id, result };
}

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

/** Extract the {@link REASON} carried by a `CatalogError`, if any (see `mcp-catalog.cts`). */
function catalogErrorReason(err: unknown): string | undefined {
  const reason = err && typeof err === 'object' ? (err as { reason?: unknown }).reason : undefined;
  return typeof reason === 'string' ? reason : undefined;
}

function catalogErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Map a `mcp-catalog.cts` `CatalogError.reason` to a JSON-RPC error code.
 * `READ_FAILED` is a server-side IO/compose failure (`INTERNAL_ERROR`);
 * every other reason (unknown uri/prompt/cursor/root, malformed/traversal
 * uri, wrong-typed param) is a client-supplied-value problem (`INVALID_PARAMS`)
 * — deliberately never `METHOD_NOT_FOUND`, so a refusal is never
 * indistinguishable from the method simply not existing (test-matrix rows
 * 33/35).
 */
function catalogErrorCode(err: unknown): number {
  return catalogErrorReason(err) === REASON.READ_FAILED ? INTERNAL_ERROR : INVALID_PARAMS;
}

function wireResource(entry: { uri: string; name: string; title: string; description: string; mimeType: string }) {
  return { uri: entry.uri, name: entry.name, title: entry.title, description: entry.description, mimeType: entry.mimeType };
}

function wirePrompt(entry: { name: string; title: string; description: string }) {
  return { name: entry.name, title: entry.title, description: entry.description };
}

const ALLOWED_ROOT_STATE_FILES = new Set([
  'state.md',
  'roadmap.md',
  'requirements.md',
  'config.md',
  'config.json',
]);

function isAllowedStatePath(targetPath: string, cwd: string): { safe: boolean; resolved: string; error?: string } {
  if (!targetPath || typeof targetPath !== 'string') {
    return { safe: false, resolved: '', error: 'Empty or invalid file path' };
  }
  if (targetPath.includes('\0')) {
    return { safe: false, resolved: '', error: 'Path contains null bytes' };
  }

  const planningDir = path.resolve(cwd, '.planning');
  let resolved: string;
  if (path.isAbsolute(targetPath)) {
    resolved = path.resolve(targetPath);
  } else {
    resolved = path.resolve(cwd, targetPath);
  }

  // 1. Direct confinement inside .planning/
  const planningCheck = validatePath(resolved, planningDir, { allowAbsolute: true });
  if (planningCheck.safe) {
    return planningCheck;
  }

  // Also check if relative path was meant relative to .planning
  if (!path.isAbsolute(targetPath) && !targetPath.startsWith('.planning')) {
    const candidateInPlanning = path.resolve(planningDir, targetPath);
    const candidateCheck = validatePath(candidateInPlanning, planningDir, { allowAbsolute: true });
    if (candidateCheck.safe) {
      const baseLower = path.basename(candidateInPlanning).toLowerCase();
      if (fs.existsSync(candidateInPlanning) || ALLOWED_ROOT_STATE_FILES.has(baseLower)) {
        return candidateCheck;
      }
    }
  }

  // 2. Authorized state document in project root or temporary test directory
  const baseName = path.basename(resolved).toLowerCase();
  if (ALLOWED_ROOT_STATE_FILES.has(baseName)) {
    const parentDir = path.dirname(resolved);
    const resolvedCwd = path.resolve(cwd);
    const isExactRoot = process.platform === 'win32' || process.platform === 'darwin'
      ? parentDir.toLowerCase() === resolvedCwd.toLowerCase()
      : parentDir === resolvedCwd;
    const isTmpDir = parentDir.toLowerCase().startsWith(path.resolve(os.tmpdir()).toLowerCase());

    if (isExactRoot || isTmpDir) {
      const rootCheck = validatePath(resolved, parentDir, { allowAbsolute: true });
      if (rootCheck.safe) {
        return { safe: true, resolved };
      }
    }
  }

  return {
    safe: false,
    resolved: '',
    error: `Path '${targetPath}' is outside the .planning directory and is not an authorized planning state document.`,
  };
}

function callTool(name: string, args: unknown, ctx: McpContext): { content: Array<{ type: string; text: string }>; isError?: boolean } {
  const a = (args && typeof args === 'object' ? args : {}) as Record<string, unknown>;
  const cwd = asString(ctx.cwd) || process.cwd();
  try {
    if (name === 'gsd_invoke_command') {
      const family = asString(a.family);
      const subcommand = asString(a.subcommand);
      if (!family || !subcommand) {
        return { isError: true, content: [{ type: 'text', text: 'gsd_invoke_command requires string "family" and "subcommand".' }] };
      }
      const res = dispatchGsdCommand({ family, subcommand, args: Array.isArray(a.args) ? (a.args as string[]) : [], cwd });
      if (!res.ok) {
        return { isError: true, content: [{ type: 'text', text: res.stderr || res.stdout || `dispatch failed (exit ${res.code})` }] };
      }
      return { content: [{ type: 'text', text: res.stdout }] };
    }
    if (name === 'gsd_read_state') {
      const p = asString(a.path);
      if (!p) return { isError: true, content: [{ type: 'text', text: 'gsd_read_state requires string "path".' }] };
      const pathCheck = isAllowedStatePath(p, cwd);
      if (!pathCheck.safe) {
        return { isError: true, content: [{ type: 'text', text: `Access denied: ${pathCheck.error}` }] };
      }
      const io = stateIo.createStateIO({ io: 'filesystem' });
      return { content: [{ type: 'text', text: io.read(pathCheck.resolved) }] };
    }
    if (name === 'gsd_write_state') {
      const p = asString(a.path);
      const content = asString(a.content);
      if (!p || content === null) return { isError: true, content: [{ type: 'text', text: 'gsd_write_state requires string "path" and "content".' }] };
      const pathCheck = isAllowedStatePath(p, cwd);
      if (!pathCheck.safe) {
        return { isError: true, content: [{ type: 'text', text: `Access denied: ${pathCheck.error}` }] };
      }
      if (typeof guardrails.inspectWriteSafety === 'function') {
        const safety = guardrails.inspectWriteSafety(pathCheck.resolved, content, cwd);
        if (!safety.safe) {
          return { isError: true, content: [{ type: 'text', text: `Write safety violation: ${safety.reason}` }] };
        }
      }
      const io = stateIo.createStateIO({ io: 'filesystem' });
      io.write(pathCheck.resolved, content);
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, path: pathCheck.resolved }) }] };
    }
    if (name === 'gsd_jit_context') {
      const files = Array.isArray(a.files) ? (a.files as string[]) : [];
      if (files.length === 0) return { isError: true, content: [{ type: 'text', text: 'gsd_jit_context requires non-empty array "files".' }] };
      const maxTokens = typeof a.maxTokens === 'number' ? a.maxTokens : undefined;
      const dryRun = Boolean(a.dryRun);
      const pkg = jitInjector.assembleJitContext({
        planningDir: path.join(cwd, '.planning'),
        rootDir: cwd,
        targetFiles: files,
        maxTokens,
        dryRun,
      });
      return { content: [{ type: 'text', text: JSON.stringify(pkg, null, 2) }] };
    }
    if (name === 'gsd_preflight_check') {
      const files = Array.isArray(a.files) ? (a.files as string[]) : [];
      const command = asString(a.command);
      const checks = files.length > 0
        ? guardrails.runPreFlightChecks({
            taskId: 'mcp-check',
            planningDir: path.join(cwd, '.planning'),
            rootDir: cwd,
            filesToModify: files,
          })
        : { valid: true, violations: [], targetFiles: [] };
      let blastReport: unknown = null;
      if (command) {
        blastReport = blastRadius.inspectCommandRisk(command, { cwd });
      }
      return { content: [{ type: 'text', text: JSON.stringify({ checks, blastReport }, null, 2) }] };
    }
    if (name === 'gsd_feasibility_check') {
      const taskText = asString(a.taskText);
      if (!taskText) return { isError: true, content: [{ type: 'text', text: 'gsd_feasibility_check requires string "taskText".' }] };
      const referencedFiles = Array.isArray(a.referencedFiles) ? (a.referencedFiles as string[]) : [];
      const graphPath = path.join(cwd, '.planning', 'intel', 'codebase-graph.json');
      let knownFiles: string[] = [];
      const knownExports = new Set<string>();
      const knownSymbols = new Set<string>();
      let graphLoaded = false;
      let graphFreshness: { updatedAt?: string; stale: boolean } = { stale: false };

      if (fs.existsSync(graphPath)) {
        try {
          const raw = fs.readFileSync(graphPath, 'utf8');
          const graph = JSON.parse(raw) as {
            updatedAt?: string;
            files?: Record<string, { exports?: Array<{ name?: string }>; symbols?: Array<{ name?: string }> }>;
            nodes?: Record<string, { exports?: Array<{ name?: string }>; symbols?: Array<{ name?: string }> }>;
            symbolIndex?: Record<string, string[]>;
          };
          const fileMap = graph.files || graph.nodes;
          if (fileMap) {
            knownFiles = Object.keys(fileMap);
            graphLoaded = knownFiles.length > 0;
            for (const n of Object.values(fileMap)) {
              for (const exp of n.exports || []) {
                if (exp && exp.name) knownExports.add(exp.name);
              }
              for (const sym of n.symbols || []) {
                if (sym && sym.name) knownSymbols.add(sym.name);
              }
            }
          }
          if (graph.symbolIndex) {
            for (const symName of Object.keys(graph.symbolIndex)) {
              knownSymbols.add(symName);
            }
          }
          if (graph.updatedAt) {
            const stat = fs.statSync(graphPath);
            const ageMs = Date.now() - stat.mtimeMs;
            graphFreshness = {
              updatedAt: graph.updatedAt,
              stale: ageMs > 24 * 60 * 60 * 1000,
            };
          }
        } catch {
          // ignore
        }
      }

      // Candidate classification (ADR Phase 35)
      const BUILTIN_OR_PROSE = new Set([
        'object', 'array', 'string', 'number', 'boolean', 'promise', 'map', 'set', 'json', 'math',
        'date', 'regexp', 'error', 'buffer', 'process', 'console', 'fs', 'path', 'os', 'crypto',
        'execsync', 'describe', 'it', 'assert', 'true', 'false', 'null', 'undefined', 'void',
        'record', 'type', 'interface', 'class', 'function', 'const', 'let', 'var', 'import',
        'export', 'return', 'async', 'await', 'try', 'catch', 'finally', 'throw', 'new', 'if',
        'else', 'for', 'while', 'switch', 'case', 'default', 'break', 'continue', 'this', 'super',
        'the', 'and', 'to', 'in', 'for', 'with', 'check', 'add', 'update', 'fix', 'test', 'tests',
        'file', 'files', 'code', 'task', 'phase', 'plan', 'step', 'create', 'implement', 'run',
        'node', 'npm', 'git', 'src', 'bin', 'lib', 'docs', 'use', 'using', 'from', 'as', 'any'
      ]);

      const candidateRegex = /\b[a-zA-Z_$][a-zA-Z0-9_$]*\b/g;
      const allTokens = taskText.match(candidateRegex) || [];

      const candidateClassification = {
        known: [] as string[],
        intentionallyNew: [] as string[],
        ignored: [] as string[],
        missing: [] as string[],
      };

      const seen = new Set<string>();
      for (const token of allTokens) {
        if (seen.has(token)) continue;
        seen.add(token);
        const tokenLower = token.toLowerCase();

        if (BUILTIN_OR_PROSE.has(tokenLower) || token.length <= 2) {
          candidateClassification.ignored.push(token);
          continue;
        }

        const isDeclaredNew =
          new RegExp(`\\b(?:create|implement|add|introduce|new|define|declare)\\s+(?:class\\s+|interface\\s+|type\\s+|function\\s+)?${token}\\b`, 'i').test(taskText) ||
          new RegExp(`\\b(?:class|interface|type|function)\\s+${token}\\b`, 'i').test(taskText);

        if (isDeclaredNew) {
          candidateClassification.intentionallyNew.push(token);
          continue;
        }

        if (knownExports.has(token) || knownSymbols.has(token)) {
          candidateClassification.known.push(token);
          continue;
        }

        if (graphLoaded && /^[A-Z][a-zA-Z0-9]+$|^[a-z]+[A-Z][a-zA-Z0-9]*$/.test(token)) {
          candidateClassification.missing.push(token);
        } else {
          candidateClassification.ignored.push(token);
        }
      }

      const missingFiles = referencedFiles.filter(f => !fs.existsSync(path.resolve(cwd, f)));
      const feasible = missingFiles.length === 0 && candidateClassification.missing.length === 0;

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            feasible,
            missingFiles,
            knownSymbolsCount: knownExports.size + knownSymbols.size,
            graphLoaded,
            graphFreshness,
            candidates: candidateClassification,
          }, null, 2),
        }],
      };
    }
    if (name === 'gsd_verify_step') {
      const status = typeof verificationMod.readVerificationStatus === 'function' ? verificationMod.readVerificationStatus(cwd) : { status: 'unknown' };
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, status }, null, 2) }] };
    }
    if (name === 'gsd_memory_recall') {
      const query = asString(a.query);
      if (!query) return { isError: true, content: [{ type: 'text', text: 'gsd_memory_recall requires string "query".' }] };
      const files = Array.isArray(a.files) ? (a.files as string[]) : [];
      const limit = typeof a.limit === 'number' ? a.limit : 5;
      const results = continuousMemoryMod.queryMemory(cwd, query, { files, limit });
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    }
    if (name === 'gsd_memory_record') {
      const category = asString(a.category);
      const summary = asString(a.summary);
      if (!category || !summary) {
        return { isError: true, content: [{ type: 'text', text: 'gsd_memory_record requires string "category" and "summary".' }] };
      }
      const details = asString(a.details) || undefined;
      const relevantFiles = Array.isArray(a.relevantFiles) ? (a.relevantFiles as string[]) : undefined;
      const keywords = Array.isArray(a.keywords) ? (a.keywords as string[]) : undefined;
      const entry = continuousMemoryMod.recordMemoryEntry(cwd, { category, summary, details, relevantFiles, keywords });
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, entry }, null, 2) }] };
    }
    return { isError: true, content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
  } catch (e) {
    return { isError: true, content: [{ type: 'text', text: `Tool error: ${e instanceof Error ? e.message : String(e)}` }] };
  }
}

/**
 * Pure JSON-RPC handler. Takes a parsed request object + context, returns a
 * JSON-RPC response object (or null for JSON-RPC notifications — no id).
 */
export function handleMessage(request: JsonRpcRequest, ctx: McpContext = {}): Record<string, unknown> | null {
  if (!request || typeof request !== 'object') {
    return errorResponse(null, INVALID_REQUEST, 'Invalid Request: not an object.');
  }
  const id = request.id;
  // Notification (no id) → no response per JSON-RPC.
  const isNotification = id === undefined || id === null;
  const method = typeof request.method === 'string' ? request.method : '';

  let result: unknown;
  switch (method) {
    case 'initialize':
      result = {
        protocolVersion: PROTOCOL_VERSION,
        // #3072: resources/prompts declared alongside tools. Deliberately NO
        // subscribe/listChanged — nothing ever sends those notifications
        // (design row 2 / Hyrum's Law: advertising an unimplemented
        // notification is a lie a host would act on).
        capabilities: { tools: {}, resources: {}, prompts: {} },
        serverInfo: { name: SERVER_NAME, version: resolveServerVersion() },
      };
      break;
    case 'tools/list':
      result = { tools: TOOLS };
      break;
    case 'tools/call': {
      const params = (request.params && typeof request.params === 'object' ? request.params : {}) as Record<string, unknown>;
      const toolName = asString(params.name);
      if (!toolName) return errorResponse(id, INVALID_PARAMS, 'tools/call requires string "name".');
      result = callTool(toolName, params.arguments, ctx);
      break;
    }
    case 'resources/list': {
      const params = (request.params && typeof request.params === 'object' ? request.params : {}) as Record<string, unknown>;
      try {
        const cursor = typeof params.cursor === 'string' ? params.cursor : undefined;
        const pageSize = typeof params.pageSize === 'number' ? params.pageSize : undefined;
        const page = listResources(getCatalog(), { cursor, pageSize });
        result = page.nextCursor === undefined
          ? { resources: page.resources.map(wireResource) }
          : { resources: page.resources.map(wireResource), nextCursor: page.nextCursor };
      } catch (e) {
        return errorResponse(id, catalogErrorCode(e), catalogErrorMessage(e));
      }
      break;
    }
    case 'resources/read': {
      const params = (request.params && typeof request.params === 'object' ? request.params : {}) as Record<string, unknown>;
      try {
        const read = readResource(getCatalog(), params.uri);
        result = { contents: [{ uri: read.uri, mimeType: read.mimeType, text: read.text }] };
      } catch (e) {
        return errorResponse(id, catalogErrorCode(e), catalogErrorMessage(e));
      }
      break;
    }
    case 'prompts/list':
      result = {
        prompts: [...getCatalog().prompts.values()]
          .map(wirePrompt)
          .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
      };
      break;
    case 'prompts/get': {
      const params = (request.params && typeof request.params === 'object' ? request.params : {}) as Record<string, unknown>;
      const name = asString(params.name);
      if (!name) return errorResponse(id, INVALID_PARAMS, 'prompts/get requires string "name".');
      try {
        result = getPrompt(getCatalog(), name, params.arguments);
      } catch (e) {
        return errorResponse(id, catalogErrorCode(e), catalogErrorMessage(e));
      }
      break;
    }
    default:
      if (isNotification) return null;
      return errorResponse(id, METHOD_NOT_FOUND, `Method not found: ${method || '(empty)'}.`);
  }
  if (isNotification) return null;
  return okResponse(id, result);
}

/**
 * Thin stdio loop over injectable streams. Reads line-delimited JSON-RPC from
 * `input`, writes responses (one JSON object + newline) to `output`. Stops when
 * input ends. Errors in handleMessage are caught and emitted as JSON-RPC error
 * responses (the loop never crashes).
 */
export async function runServer({
  input,
  output,
  ctx = {},
}: {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
  ctx?: McpContext;
}): Promise<void> {
  let buffer = '';
  for await (const chunk of input as AsyncIterable<Buffer>) {
    buffer += chunk.toString('utf-8');
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        output.write(JSON.stringify(errorResponse(null, PARSE_ERROR, 'Parse error.')) + '\n');
        continue;
      }
      try {
        const response = handleMessage(parsed as JsonRpcRequest, ctx);
        if (response) output.write(JSON.stringify(response) + '\n');
      } catch (e) {
        output.write(JSON.stringify(errorResponse(null, INTERNAL_ERROR, e instanceof Error ? e.message : 'Internal error.')) + '\n');
      }
    }
  }
}

// handleMessage + runServer are exported above (export function); PROTOCOL_VERSION
// + SERVER_NAME are exported above (export const).
