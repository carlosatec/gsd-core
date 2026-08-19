"use strict";
/**
 * Pre-Flight Guardrails & Self-Healing Engine.
 *
 * Validates task context before execution (catching contract breaks and missing imports)
 * and orchestrates autonomous self-healing when tests or linter checks fail.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const codebaseAst = require("./codebase-ast-analyzer.cjs");
const { analyzeSourceFile, buildCodebaseGraph, loadCodebaseGraph } = codebaseAst;
// ─── Pre-Flight Guardrails ────────────────────────────────────────────────────
/**
 * Runs pre-execution checks on proposed task file modifications against the AST graph.
 */
function runPreFlightChecks(ctx) {
    const root = ctx.rootDir ?? node_path_1.default.dirname(ctx.planningDir);
    let graph = loadCodebaseGraph(ctx.planningDir);
    if (!graph) {
        graph = buildCodebaseGraph(root);
    }
    const activeGraph = graph;
    const violations = [];
    const pathExistsCache = new Map();
    function checkPathExists(p) {
        if (pathExistsCache.has(p))
            return pathExistsCache.get(p);
        const exists = node_fs_1.default.existsSync(p) ||
            node_fs_1.default.existsSync(p + '.ts') ||
            node_fs_1.default.existsSync(p + '.tsx') ||
            node_fs_1.default.existsSync(p + '.cts') ||
            node_fs_1.default.existsSync(p + '.js') ||
            node_fs_1.default.existsSync(p + '.cjs') ||
            node_fs_1.default.existsSync(node_path_1.default.join(p, 'index.ts')) ||
            node_fs_1.default.existsSync(node_path_1.default.join(p, 'index.js'));
        pathExistsCache.set(p, exists);
        return exists;
    }
    const normalizedModifying = new Set(ctx.filesToModify.map(f => node_path_1.default.normalize(f).replace(/\\/g, '/').replace(/\.[^/.]+$/, '')));
    for (const relFile of ctx.filesToModify) {
        const normalized = relFile.replace(/\\/g, '/');
        const existingFile = activeGraph.files[normalized];
        const proposedContent = ctx.proposedCodeMap ? ctx.proposedCodeMap[relFile] || ctx.proposedCodeMap[normalized] : undefined;
        // Check proposed edits if content was provided
        if (proposedContent !== undefined) {
            const newAnalysis = analyzeSourceFile(node_path_1.default.join(root, relFile), proposedContent);
            // Check 1: Contract Break (removing an exported symbol that other files depend on)
            if (existingFile && existingFile.exports) {
                const currentDeps = activeGraph.reverseDependencies[normalized] || [];
                if (currentDeps.length > 0) {
                    const newExportNames = new Set(newAnalysis.exports.map((e) => e.name));
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
                const fileDir = node_path_1.default.dirname(node_path_1.default.join(root, relFile));
                const resolvedPath = node_path_1.default.resolve(fileDir, localDep);
                const resolvedRelNoExt = node_path_1.default.relative(root, resolvedPath).replace(/\\/g, '/').replace(/\.[^/.]+$/, '');
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
            const visited = new Set();
            function detectCycle(current, stack) {
                visited.add(current);
                stack.add(current);
                const callers = activeGraph.reverseDependencies[current] || [];
                for (const caller of callers) {
                    if (stack.has(caller))
                        return true;
                    if (!visited.has(caller)) {
                        if (detectCycle(caller, stack))
                            return true;
                    }
                }
                stack.delete(current);
                return false;
            }
            if (detectCycle(normalized, new Set())) {
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
async function executeWithSelfHealing(runFn, repairFn, maxRetries = 3) {
    const history = [];
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
module.exports = {
    runPreFlightChecks,
    executeWithSelfHealing,
};
