/**
 * Pre-Flight Guardrails & Self-Healing Engine.
 *
 * Validates task context before execution (catching contract breaks and missing imports)
 * and orchestrates autonomous self-healing when tests or linter checks fail.
 */

import fs from 'node:fs';
import path from 'node:path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import codebaseAst = require('./codebase-ast-analyzer.cjs');
const { analyzeSourceFile, buildCodebaseGraph, loadCodebaseGraph } = codebaseAst;

// ─── Types ────────────────────────────────────────────────────────────────────

type CodebaseGraph = ReturnType<typeof buildCodebaseGraph>;

interface PreFlightViolation {
  rule: 'CONTRACT_BREAK' | 'PHANTOM_IMPORT' | 'CIRCULAR_DEPENDENCY' | 'SCOPE_VIOLATION';
  severity: 'error' | 'warning';
  file: string;
  message: string;
}

interface PreFlightReport {
  valid: boolean;
  violations: PreFlightViolation[];
  targetFiles: string[];
}

interface TaskExecutionContext {
  taskId: string;
  filesToModify: string[];
  proposedCodeMap?: Record<string, string>;
  planningDir: string;
  rootDir?: string;
}

interface SelfHealingResult {
  success: boolean;
  attempts: number;
  repaired: boolean;
  history: Array<{ attempt: number; error: string; action: string; passed: boolean }>;
}

// ─── Pre-Flight Guardrails ────────────────────────────────────────────────────

/**
 * Runs pre-execution checks on proposed task file modifications against the AST graph.
 */
function runPreFlightChecks(ctx: TaskExecutionContext): PreFlightReport {
  const root = ctx.rootDir ?? path.dirname(ctx.planningDir);
  let graph = loadCodebaseGraph(ctx.planningDir);
  if (!graph) {
    graph = buildCodebaseGraph(root);
  }
  const activeGraph = graph;

  const violations: PreFlightViolation[] = [];
  const pathExistsCache = new Map<string, boolean>();

  function checkPathExists(p: string): boolean {
    if (pathExistsCache.has(p)) return pathExistsCache.get(p)!;
    const exists =
      fs.existsSync(p) ||
      fs.existsSync(p + '.ts') ||
      fs.existsSync(p + '.tsx') ||
      fs.existsSync(p + '.cts') ||
      fs.existsSync(p + '.js') ||
      fs.existsSync(p + '.cjs') ||
      fs.existsSync(path.join(p, 'index.ts')) ||
      fs.existsSync(path.join(p, 'index.js'));
    pathExistsCache.set(p, exists);
    return exists;
  }

  const normalizedModifying = new Set(
    ctx.filesToModify.map(f => path.normalize(f).replace(/\\/g, '/').replace(/\.[^/.]+$/, ''))
  );

  for (const relFile of ctx.filesToModify) {
    const normalized = relFile.replace(/\\/g, '/');
    const existingFile = activeGraph.files[normalized];
    const proposedContent = ctx.proposedCodeMap ? ctx.proposedCodeMap[relFile] || ctx.proposedCodeMap[normalized] : undefined;

    // Check proposed edits if content was provided
    if (proposedContent !== undefined) {
      const newAnalysis = analyzeSourceFile(path.join(root, relFile), proposedContent);

      // Check 1: Contract Break (removing an exported symbol that other files depend on)
      if (existingFile && existingFile.exports) {
        const currentDeps = activeGraph.reverseDependencies[normalized] || [];
        if (currentDeps.length > 0) {
          const newExportNames = new Set(newAnalysis.exports.map((e: { name: string }) => e.name));
          for (const oldExp of existingFile.exports) {
            if (!newExportNames.has(oldExp.name)) {
              violations.push({
                rule: 'CONTRACT_BREAK',
                severity: 'error',
                file: normalized,
                message: `Export '${oldExp.name}' is imported by ${currentDeps.join(', ')} and cannot be removed without updating callers.`,
              });
            }
          }
        }
      }

      // Check 2: Phantom Local Imports (importing local files that don't exist)
      for (const localDep of newAnalysis.localDeps) {
        const fileDir = path.dirname(path.join(root, relFile));
        const resolvedPath = path.resolve(fileDir, localDep);
        const resolvedRelNoExt = path.relative(root, resolvedPath).replace(/\\/g, '/').replace(/\.[^/.]+$/, '');

        const exists = checkPathExists(resolvedPath);
        if (!exists && !normalizedModifying.has(resolvedRelNoExt)) {
          violations.push({
            rule: 'PHANTOM_IMPORT',
            severity: 'error',
            file: normalized,
            message: `Import '${localDep}' resolves to nonexistent path and is not planned for creation in this task.`,
          });
        }
      }

      // Check 3: Circular Dependency Detection
      const visited = new Set<string>();
      function detectCycle(current: string, stack: Set<string>): boolean {
        visited.add(current);
        stack.add(current);
        const callers = activeGraph.reverseDependencies[current] || [];
        for (const caller of callers) {
          if (stack.has(caller)) return true;
          if (!visited.has(caller)) {
            if (detectCycle(caller, stack)) return true;
          }
        }
        stack.delete(current);
        return false;
      }
      if (detectCycle(normalized, new Set<string>())) {
        violations.push({
          rule: 'CIRCULAR_DEPENDENCY',
          severity: 'warning',
          file: normalized,
          message: `Circular dependency detected involving ${normalized}.`,
        });
      }
    }
  }

  const hasErrors = violations.some(v => v.severity === 'error');

  return {
    valid: !hasErrors,
    violations,
    targetFiles: ctx.filesToModify,
  };
}

// ─── Self-Healing Loop ────────────────────────────────────────────────────────

/**
 * Executes an operation with self-healing retries upon test/execution failure.
 */
async function executeWithSelfHealing(
  runFn: () => Promise<{ success: boolean; error?: string }>,
  repairFn?: (error: string, attempt: number) => Promise<boolean>,
  maxRetries: number = 3
): Promise<SelfHealingResult> {
  const history: Array<{ attempt: number; error: string; action: string; passed: boolean }> = [];
  let attempts = 0;

  while (attempts < maxRetries) {
    attempts++;
    const outcome = await runFn();

    if (outcome.success) {
      return {
        success: true,
        attempts,
        repaired: attempts > 1,
        history,
      };
    }

    const err = outcome.error || 'Unknown test failure';
    history.push({
      attempt: attempts,
      error: err,
      action: `Triggered repair routine (attempt ${attempts}/${maxRetries})`,
      passed: false,
    });

    if (attempts >= maxRetries || typeof repairFn !== 'function') {
      break;
    }

    const repaired = await repairFn(err, attempts);
    if (!repaired) {
      break;
    }
  }

  return {
    success: false,
    attempts,
    repaired: false,
    history,
  };
}

export = {
  runPreFlightChecks,
  executeWithSelfHealing,
};

