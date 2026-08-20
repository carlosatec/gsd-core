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

  // Detect project root modules for Go and Rust
  let goRootModule: string | undefined;
  let rustRootCrate: string | undefined;

  try {
    const goModPath = path.join(root, 'go.mod');
    if (fs.existsSync(goModPath)) {
      const goModContent = fs.readFileSync(goModPath, 'utf8');
      const modMatch = goModContent.match(/^module\s+(\S+)/m);
      if (modMatch) goRootModule = modMatch[1].trim();
    }
  } catch {
    // Non-blocking
  }

  try {
    const cargoPath = path.join(root, 'Cargo.toml');
    if (fs.existsSync(cargoPath)) {
      const cargoContent = fs.readFileSync(cargoPath, 'utf8');
      const crateMatch = cargoContent.match(/name\s*=\s*["']([^"']+)["']/);
      if (crateMatch) rustRootCrate = crateMatch[1].trim();
    }
  } catch {
    // Non-blocking
  }

  function checkPathExists(p: string): boolean {
    if (pathExistsCache.has(p)) return pathExistsCache.get(p)!;
    const exists =
      fs.existsSync(p) ||
      fs.existsSync(p + '.ts') ||
      fs.existsSync(p + '.tsx') ||
      fs.existsSync(p + '.cts') ||
      fs.existsSync(p + '.mts') ||
      fs.existsSync(p + '.js') ||
      fs.existsSync(p + '.jsx') ||
      fs.existsSync(p + '.cjs') ||
      fs.existsSync(p + '.mjs') ||
      fs.existsSync(p + '.py') ||
      fs.existsSync(p + '.go') ||
      fs.existsSync(p + '.rs') ||
      fs.existsSync(p + '.dart') ||
      fs.existsSync(p + '.css') ||
      fs.existsSync(path.join(p, 'index.ts')) ||
      fs.existsSync(path.join(p, 'index.js')) ||
      fs.existsSync(path.join(p, '__init__.py')) ||
      fs.existsSync(path.join(p, 'mod.rs')) ||
      fs.existsSync(path.join(p, 'lib.rs'));
    pathExistsCache.set(p, exists);
    return exists;
  }

  const proposedKeys = ctx.proposedCodeMap ? Object.keys(ctx.proposedCodeMap) : [];
  const allTargetFiles = Array.from(new Set([...ctx.filesToModify, ...proposedKeys]));

  const normalizedModifying = new Set(
    allTargetFiles.map(f => path.normalize(f).replace(/\\/g, '/').replace(/\.[^/.]+$/, ''))
  );

  // Pre-analyze all proposed files in memory to support mutual contract validation
  const proposedAnalyses = new Map<string, ReturnType<typeof analyzeSourceFile>>();
  if (ctx.proposedCodeMap) {
    for (const [fName, content] of Object.entries(ctx.proposedCodeMap)) {
      const norm = fName.replace(/\\/g, '/');
      proposedAnalyses.set(norm, analyzeSourceFile(path.join(root, fName), content));
    }
  }

  for (const relFile of allTargetFiles) {
    const normalized = relFile.replace(/\\/g, '/');
    const existingFile = activeGraph.files[normalized];
    const proposedContent = ctx.proposedCodeMap ? ctx.proposedCodeMap[relFile] || ctx.proposedCodeMap[normalized] : undefined;

    // Check proposed edits if content was provided
    if (proposedContent !== undefined) {
      const newAnalysis = proposedAnalyses.get(normalized) || analyzeSourceFile(path.join(root, relFile), proposedContent);

      // Check 1: Contract Break (removing an exported symbol that other files depend on)
      if (existingFile && existingFile.exports) {
        const currentDeps = activeGraph.reverseDependencies[normalized] || [];
        if (currentDeps.length > 0) {
          const newExportNames = new Set(newAnalysis.exports.map((e: { name: string }) => e.name));
          for (const oldExp of existingFile.exports) {
            if (!newExportNames.has(oldExp.name)) {
              // Check if all callers in proposedCodeMap have also updated their imports (co-evolution)
              const unmigratedCallers: string[] = [];
              for (const caller of currentDeps) {
                const callerAnalysis = proposedAnalyses.get(caller);
                if (callerAnalysis) {
                  // Check if caller still imports this removed symbol
                  const stillImports = callerAnalysis.imports.some(
                    imp => imp.specifiers.includes(oldExp.name)
                  );
                  if (stillImports) {
                    unmigratedCallers.push(caller);
                  }
                } else {
                  unmigratedCallers.push(caller);
                }
              }

              if (unmigratedCallers.length > 0) {
                violations.push({
                  rule: 'CONTRACT_BREAK',
                  severity: 'error',
                  file: normalized,
                  message: `Export '${oldExp.name}' is imported by ${unmigratedCallers.join(', ')} and cannot be removed without updating callers.`,
                });
              }
            }
          }
        }
      }

      // Check 2: Phantom Local Imports (importing local files that don't exist)
      for (const localDep of newAnalysis.localDeps) {
        const fileDir = path.dirname(path.join(root, relFile));
        let resolvedPath: string;

        if (goRootModule && localDep.startsWith(goRootModule)) {
          const relModPath = localDep.slice(goRootModule.length).replace(/^[/\\]+/, '');
          resolvedPath = path.resolve(root, relModPath);
        } else if (localDep.startsWith('crate::')) {
          const relCratePath = localDep.slice(7).replace(/::/g, '/');
          resolvedPath = path.resolve(root, 'src', relCratePath);
        } else {
          resolvedPath = path.resolve(fileDir, localDep);
        }

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

// eslint-disable-next-line @typescript-eslint/no-require-imports
import antiPatternStore = require('./anti-pattern-store.cjs');
const { recordAntiPattern } = antiPatternStore;

/**
 * Executes an operation with self-healing retries upon test/execution failure.
 */
async function executeWithSelfHealing(
  runFn: () => Promise<{ success: boolean; error?: string }>,
  repairFn?: (error: string, attempt: number) => Promise<boolean>,
  maxRetries: number = 3,
  planningDir?: string
): Promise<SelfHealingResult> {
  const history: Array<{ attempt: number; error: string; action: string; passed: boolean }> = [];
  let attempts = 0;

  while (attempts < maxRetries) {
    attempts++;
    const outcome = await runFn();

    if (outcome.success) {
      // If we repaired an earlier failure, record lessons to anti-pattern store
      if (attempts > 1 && planningDir) {
        for (const item of history) {
          try {
            recordAntiPattern(planningDir, {
              error: item.error,
              repairedAction: item.action,
              lesson: `Self-healing repaired error on attempt ${attempts}: "${item.error}"`,
            });
          } catch {
            // Non-blocking
          }
        }
      }

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


