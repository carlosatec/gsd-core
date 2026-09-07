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

interface CoEvolutionWarning {
  targetFile: string;
  symbolName: string;
  callers: string[];
  action: 'CO_EVOLVE_CALLERS';
  previousSignature?: string;
  proposedSignature?: string;
  message: string;
}

interface PreFlightViolation {
  rule: 'CONTRACT_BREAK' | 'PHANTOM_IMPORT' | 'CIRCULAR_DEPENDENCY' | 'SCOPE_VIOLATION' | 'UNINTENDED_TRUNCATION' | 'SIGNATURE_DRIFT';
  severity: 'error' | 'warning';
  file: string;
  message: string;
}

interface PreFlightReport {
  valid: boolean;
  violations: PreFlightViolation[];
  targetFiles: string[];
  coEvolutionWarnings?: CoEvolutionWarning[];
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

// ─── Cycle Detection Helper ──────────────────────────────────────────────────

function detectCycleInGraph(
  graph: CodebaseGraph,
  startNode: string,
  onDeepRecursion?: (node: string) => void
): boolean {
  const visited = new Set<string>();
  function dfs(current: string, stack: Set<string>, depth: number = 0): boolean {
    if (depth > 1000) {
      if (onDeepRecursion) onDeepRecursion(current);
      return false;
    }
    visited.add(current);
    stack.add(current);
    const callers = graph.reverseDependencies[current] || [];
    for (const caller of callers) {
      if (stack.has(caller)) return true;
      if (!visited.has(caller)) {
        if (dfs(caller, stack, depth + 1)) return true;
      }
    }
    stack.delete(current);
    return false;
  }
  return dfs(startNode, new Set<string>());
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
  const coEvolutionWarnings: CoEvolutionWarning[] = [];
  const pathExistsCache = new Map<string, boolean>();

  // Build in-memory path set from activeGraph for O(1) existence checks (sub-15ms)
  const inMemoryPathSet = new Set<string>();
  if (activeGraph && activeGraph.files) {
    for (const f of Object.keys(activeGraph.files)) {
      const norm = f.replace(/\\/g, '/');
      inMemoryPathSet.add(norm);
      inMemoryPathSet.add(path.resolve(root, norm).replace(/\\/g, '/'));
    }
  }

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
      const crateMatch = cargoContent.match(/name\s*=\s*["']([^"']{1,200})["']/);
      if (crateMatch) rustRootCrate = crateMatch[1].trim();
    }
  } catch {
    // Non-blocking
  }

  function checkPathExists(p: string): boolean {
    if (pathExistsCache.has(p)) return pathExistsCache.get(p)!;

    // Fast O(1) in-memory check
    const relPosix = (path.isAbsolute(p) ? path.relative(root, p) : p).replace(/\\/g, '/').replace(/^\.\//, '');
    const absPosix = path.isAbsolute(p) ? p.replace(/\\/g, '/') : path.resolve(root, p).replace(/\\/g, '/');

    const inMemCandidates = [
      relPosix,
      relPosix + '.ts',
      relPosix + '.tsx',
      relPosix + '.cts',
      relPosix + '.mts',
      relPosix + '.js',
      relPosix + '.jsx',
      relPosix + '.cjs',
      relPosix + '.mjs',
      relPosix + '.py',
      relPosix + '.go',
      relPosix + '.rs',
      relPosix + '.dart',
      relPosix + '.css',
      relPosix + '/index.ts',
      relPosix + '/index.tsx',
      relPosix + '/index.cts',
      relPosix + '/index.js',
      relPosix + '/index.cjs',
      relPosix + '/__init__.py',
      relPosix + '/mod.rs',
      relPosix + '/lib.rs',
      absPosix,
    ];

    for (const cand of inMemCandidates) {
      if (inMemoryPathSet.has(cand)) {
        pathExistsCache.set(p, true);
        return true;
      }
    }

    // Fallback to filesystem for external / un-indexed paths (anchored to root to prevent cwd drift)
    const absPath = path.isAbsolute(p) ? p : path.resolve(root, p);
    const exists =
      fs.existsSync(absPath) ||
      fs.existsSync(absPath + '.ts') ||
      fs.existsSync(absPath + '.tsx') ||
      fs.existsSync(absPath + '.cts') ||
      fs.existsSync(absPath + '.mts') ||
      fs.existsSync(absPath + '.js') ||
      fs.existsSync(absPath + '.jsx') ||
      fs.existsSync(absPath + '.cjs') ||
      fs.existsSync(absPath + '.mjs') ||
      fs.existsSync(absPath + '.py') ||
      fs.existsSync(absPath + '.go') ||
      fs.existsSync(absPath + '.rs') ||
      fs.existsSync(absPath + '.dart') ||
      fs.existsSync(absPath + '.css') ||
      fs.existsSync(path.join(absPath, 'index.ts')) ||
      fs.existsSync(path.join(absPath, 'index.tsx')) ||
      fs.existsSync(path.join(absPath, 'index.cts')) ||
      fs.existsSync(path.join(absPath, 'index.js')) ||
      fs.existsSync(path.join(absPath, 'index.cjs')) ||
      fs.existsSync(path.join(absPath, '__init__.py')) ||
      fs.existsSync(path.join(absPath, 'mod.rs')) ||
      fs.existsSync(path.join(absPath, 'lib.rs'));
    pathExistsCache.set(p, exists);
    return exists;
  }

  const proposedKeys = ctx.proposedCodeMap ? Object.keys(ctx.proposedCodeMap) : [];
  const allTargetFiles = Array.from(new Set([...ctx.filesToModify, ...proposedKeys]));

  const normalizedModifying = new Set(
    allTargetFiles.map(f => path.normalize(f).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\.[^/.]+$/, ''))
  );

  // Pre-analyze all proposed files in memory to support mutual contract validation
  const proposedAnalyses = new Map<string, ReturnType<typeof analyzeSourceFile>>();
  if (ctx.proposedCodeMap) {
    for (const [fName, content] of Object.entries(ctx.proposedCodeMap)) {
      const norm = fName.replace(/\\/g, '/').replace(/^\.\//, '');
      proposedAnalyses.set(norm, analyzeSourceFile(path.join(root, fName), content));
    }
  }

  for (const relFile of allTargetFiles) {
    const normalized = relFile.replace(/\\/g, '/').replace(/^\.\//, '');
    const existingFile = activeGraph.files[normalized];
    const proposedContent = ctx.proposedCodeMap
      ? ctx.proposedCodeMap[relFile] ?? ctx.proposedCodeMap[normalized] ?? ctx.proposedCodeMap[`./${normalized}`]
      : undefined;

    // Check proposed edits if content was provided
    if (proposedContent !== undefined) {
      // Guard against unintended file truncation (0 bytes)
      if (existingFile && proposedContent.trim().length === 0) {
        try {
          const currentDiskContent = fs.readFileSync(path.join(root, relFile), 'utf8');
          if (currentDiskContent.trim().length > 0) {
            violations.push({
              rule: 'UNINTENDED_TRUNCATION',
              severity: 'error',
              file: relFile,
              message: `Empty file guard triggered: proposed modification truncates an existing file of ${currentDiskContent.length} bytes to 0 bytes.`
            });
            continue; // Skip further checks for this file since it's empty
          }
        } catch {
          // Ignore read errors
        }
      }
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

      // Check 1b: Signature Drift & Co-Evolution Warnings
      if (existingFile && existingFile.symbols) {
        const currentDeps = activeGraph.reverseDependencies[normalized] || [];
        if (currentDeps.length > 0) {
          const oldSymbolMap = new Map(existingFile.symbols.map(s => [s.name, s]));
          for (const newSym of newAnalysis.symbols) {
            const oldSym = oldSymbolMap.get(newSym.name);
            if (oldSym && oldSym.exported && newSym.exported) {
              const oldSig = typeof oldSym.meta?.signature === 'string' ? oldSym.meta.signature : '';
              const newSig = typeof newSym.meta?.signature === 'string' ? newSym.meta.signature : '';
              if (oldSig && newSig && oldSig !== newSig) {
                const warningMsg = `Signature drift detected for '${newSym.name}': '${oldSig}' -> '${newSig}'. Callers (${currentDeps.join(', ')}) should be co-evolved.`;
                violations.push({
                  rule: 'SIGNATURE_DRIFT',
                  severity: 'warning',
                  file: normalized,
                  message: warningMsg,
                });
                coEvolutionWarnings.push({
                  targetFile: normalized,
                  symbolName: newSym.name,
                  callers: currentDeps,
                  action: 'CO_EVOLVE_CALLERS',
                  previousSignature: oldSig,
                  proposedSignature: newSig,
                  message: warningMsg,
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
        } else if (rustRootCrate && localDep.startsWith(rustRootCrate)) {
          const relCratePath = localDep.slice(rustRootCrate.length).replace(/^::/, '').replace(/::/g, '/');
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
      const hasCycle = detectCycleInGraph(activeGraph, normalized, (deepNode) => {
        violations.push({
          rule: 'CIRCULAR_DEPENDENCY',
          severity: 'warning',
          file: normalized,
          message: `Graph recursion depth exceeded 1000 nodes around ${deepNode}. Cycle check inconclusive.`,
        });
      });
      if (hasCycle) {
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
    coEvolutionWarnings,
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
