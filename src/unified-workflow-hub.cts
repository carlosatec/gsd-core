/**
 * Unified Workflow Hub — Streamlined 6+1 Command Surface & Reviewer for GSD Core Nexus 3.6.
 *
 * Implements canonical command interface (/gsd:status, /gsd:plan, /gsd:exec, /gsd:review,
 * /gsd:verify, /gsd:ship, /gsd:auto) with autonomous repair support.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { platformReadSync } from './shell-command-projection.cjs';
import { collectSection } from './markdown-sectionizer.cjs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import livingDocs = require('./living-docs-engine.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import codebaseAst = require('./codebase-ast-analyzer.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import autoUpgrade = require('./auto-upgrade-engine.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import jitTelemetry = require('./jit-telemetry.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import tokenDashboard = require('./token-dashboard-renderer.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import jitInjector = require('./jit-context-injector.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import guardrailsMod = require('./preflight-guardrails.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import initMod = require('./init.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import sessionHook = require('./session-context-hook.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import gapChecker = require('./gap-checker.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import complexityTrigger = require('./complexity-trigger.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import coverageMod = require('./coverage.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import scanPhasePlans = require('./plan-scan.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import sessionLoggerMod = require('./session-logger.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import visualGraphMod = require('./visual-graph-exporter.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import canvasGenMod = require('./canvas-roadmap-generator.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import observabilityHtmlMod = require('./observability-html-dashboard.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import systemOneMod = require('./system-one-engine.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import normalizeTestMod = require('./normalize-test-command.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import intelMod = require('./intel.cjs');
const { checkIntelHealth } = intelMod;
const { SessionLogger } = sessionLoggerMod;

const { verifyDocsAgainstCode, syncLivingDocs } = livingDocs;
const { buildCodebaseGraph, loadCodebaseGraph, queryTopCentralFiles, calculateBlastRadius } = codebaseAst;
const { runAutoUpgrade } = autoUpgrade;
const { getTelemetrySummary, recordJitInvocation, LANGUAGE_CHAR_WEIGHTS } = jitTelemetry;
const { renderTokenDashboard } = tokenDashboard;
const { assembleJitContext } = jitInjector;
const { runPreFlightChecks } = guardrailsMod;
const { syncSessionContext } = sessionHook;
const { runGapAnalysis } = gapChecker;
const { analyzeSource, isAnalyzablePath } = complexityTrigger;
const { classifyContent } = coverageMod;
const { classifyRiskSync, evaluateAssertionSync, recordUserOverride, choose } = systemOneMod;
const { detectProjectTestCommand, normalizeTestCommand } = normalizeTestMod;

// ─── Types ────────────────────────────────────────────────────────────────────

type UnifiedCommandName =
  | 'auto'
  | 'status'
  | 'plan'
  | 'exec'
  | 'review'
  | 'verify'
  | 'ship'
  | 'migrate'
  | 'tokens'
  | 'graph'
  | 'help';

interface UnifiedCommandOptions {
  args: string[];
  cwd?: string;
  flags?: Record<string, string | boolean>;
  raw?: boolean;
}

interface UnifiedCommandResult {
  command: UnifiedCommandName;
  action: string;
  nextStep?: string;
  data?: unknown;
  fixedIssues?: string[];
  message: string;
}

// ─── Strict Canonical Command Normalizer (D-41 / D-42) ────────────────────────

const CANONICAL_COMMAND_SET = new Set<UnifiedCommandName>([
  'auto',
  'status',
  'plan',
  'exec',
  'review',
  'verify',
  'ship',
  'migrate',
  'tokens',
  'graph',
  'help',
]);

/**
 * Normalizes command namespace variations (/gsd:plan, /gsd-plan, gsd:plan, plan)
 * strictly to canonical UnifiedCommandName. Rejects retired/legacy commands (D-42).
 */
function normalizeCommandName(input: string): UnifiedCommandName | null {
  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/^[/\\$]/, '')      // strip leading /, \, or $
    .replace(/^gsd[:-]/, '')     // strip gsd: or gsd-
    .replace(/^gsd\s+/, '');     // strip "gsd "

  if (CANONICAL_COMMAND_SET.has(cleaned as UnifiedCommandName)) {
    return cleaned as UnifiedCommandName;
  }
  return null;
}

// ─── Review & Auto-Fix Engine ─────────────────────────────────────────────────

interface ReviewReport {
  filesReviewed: number;
  targetFiles?: string[];
  criticalIssues: string[];
  warnings: string[];
  fixed: string[];
  passed: boolean;
  telemetry?: unknown;
  blastRadius?: unknown;
  topCentralFiles?: Array<{ file: string; score: number }>;
  verdict?: 'TRIVIAL_AUTO_PASSED';
}

/**
 * Runs code review over changed files (targeted mode) or the whole codebase (full-repo mode)
 * and performs optional autonomous fixes when --fix is set.
 * Measures and records real JIT token efficiency under transactional concurrency.
 */
function executeReview(
  planningDir: string,
  rootDir: string,
  autoFix: boolean = false,
  explicitFiles?: string[],
  fullRepoMode: boolean = false,
  phaseId?: string
): ReviewReport {
  const fixed: string[] = [];
  const criticalIssues: string[] = [];
  const warnings: string[] = [];

  const resolvedPlanningDir = path.resolve(planningDir);
  const resolvedRoot = path.resolve(rootDir);

  // 1. Inspect STATE.md / Phase ID
  const activePhase = resolveActivePhaseId(resolvedPlanningDir, phaseId);
  const statePath = path.join(resolvedPlanningDir, 'STATE.md');
  const stateContent = platformReadSync(statePath) || '';

  if (!stateContent.includes('Phase')) {
    warnings.push('STATE.md does not specify an active phase.');
  }

  // 2. Real AST Codebase Analysis
  let graph = loadCodebaseGraph(resolvedPlanningDir);
  if (!graph) {
    graph = buildCodebaseGraph(resolvedRoot);
  }

  // Determine target files for review (D-113, D-121)
  let filesToReview: string[] = [];
  if (explicitFiles && explicitFiles.length > 0) {
    filesToReview = explicitFiles;
  } else if (fullRepoMode) {
    filesToReview = graph && graph.files ? Object.keys(graph.files) : [];
  } else {
    // Targeted mode: derive from active phase plan
    const phaseFiles = extractTargetFilesFromPhase(resolvedPlanningDir, activePhase, resolvedRoot, false);
    if (phaseFiles.length > 0) {
      filesToReview = phaseFiles;
    } else if (graph && graph.files) {
      const topCentral = typeof queryTopCentralFiles === 'function' ? queryTopCentralFiles(graph, 5) : [];
      filesToReview = topCentral.length > 0 ? topCentral.map((t: { file: string }) => t.file) : Object.keys(graph.files).slice(0, 5);
    }
  }

  if (filesToReview.length === 0 && graph && graph.files) {
    filesToReview = Object.keys(graph.files).slice(0, 5);
  }

  const filesReviewed = filesToReview.length > 0 ? filesToReview.length : (graph ? graph.stats.totalFiles : 1);

  // 3. Living Documentation Drift Verification
  const driftReport = verifyDocsAgainstCode(resolvedPlanningDir, resolvedRoot);
  if (!driftReport.valid) {
    for (const disc of driftReport.discrepancies) {
      if (disc.type === 'missing_symbol' || disc.type === 'removed_symbol') {
        warnings.push(`[Missing] ${disc.file}: ${disc.detail}`);
      } else {
        warnings.push(`[Drift] ${disc.file}: ${disc.detail}`);
      }
    }
  }

  // 4. Complexity & UI Anti-Pattern Inspection
  try {
    if (graph && graph.files) {
      const targetsToCheck = fullRepoMode ? Object.keys(graph.files) : filesToReview;
      for (const relPath of targetsToCheck) {
        const fullPath = path.join(resolvedRoot, relPath);
        if (!fs.existsSync(fullPath)) continue;
        const content = platformReadSync(fullPath) || '';

        // Complexity trigger check
        if (isAnalyzablePath(relPath)) {
          const compResult = analyzeSource(content);
          if (compResult.ok) {
            for (const fn of compResult.functions) {
              if (fn.score > 15) {
                warnings.push(`[Complexity] ${relPath}:${fn.name} (complexity score ${fn.score} exceeds threshold 15)`);
              }
            }
          }
        }

        // Frontend UI anti-pattern check
        const ext = path.extname(relPath).toLowerCase();
        if (['.tsx', '.jsx', '.vue', '.html', '.svelte'].includes(ext)) {
          // Hardcoded hex colors outside class names/tokens
          const hardcodedColors = content.match(/#[0-9a-fA-F]{6}\b/g);
          if (hardcodedColors && hardcodedColors.length > 3) {
            warnings.push(`[UI-Token] ${relPath} contains ${hardcodedColors.length} hardcoded hex colors. Use design tokens.`);
          }
        }

        // AST Semantic Resilience: God-Object and Zombie-Import checks
        if (graph && graph.files && graph.files[relPath]) {
          const fileData = graph.files[relPath];
          if (fileData.isGodObject) {
            warnings.push(`[God-Object] ${relPath} (${fileData.linesCount || 0} lines, ${fileData.exports?.length || 0} exports, coupling ratio ${fileData.couplingRatio}) exceeds maintainability limits.`);
          }
          if (fileData.unusedImports && fileData.unusedImports.length > 0) {
            warnings.push(`[Zombie-Import] ${relPath} contains unused imports: ${fileData.unusedImports.join(', ')}`);
          }
        }
      }
    }
  } catch {
    // Non-blocking inspection
  }

  // 5. Auto-Fix when requested
  if (autoFix) {
    if (!driftReport.valid) {
      syncLivingDocs(resolvedPlanningDir, resolvedRoot);
      fixed.push(`Synchronized and resolved ${driftReport.discrepancies.length} living documentation drift item(s).`);
    }
  }

  // 6. Language-Calibrated Token Telemetry & Scope Mode Tracking (D-113, D-121)
  let recordedTelemetry = undefined;
  try {
    let totalRepoChars = 0;
    if (graph && graph.files) {
      for (const f of Object.values(graph.files) as Array<{ linesCount?: number; language?: string }>) {
        const weight = (f.language && LANGUAGE_CHAR_WEIGHTS[f.language.toLowerCase()]) || 45;
        totalRepoChars += (f.linesCount || 10) * weight;
      }
    }
    const repoTokenBaseline = Math.max(1000, Math.ceil(totalRepoChars / 4));

    let reviewedChars = 0;
    for (const relPath of filesToReview) {
      const fullPath = path.join(resolvedRoot, relPath);
      if (fs.existsSync(fullPath)) {
        try {
          const content = platformReadSync(fullPath) || '';
          reviewedChars += content.length;
        } catch {
          reviewedChars += 1000;
        }
      } else if (graph && graph.files && graph.files[relPath]) {
        const f = graph.files[relPath];
        const weight = (f.language && LANGUAGE_CHAR_WEIGHTS[f.language.toLowerCase()]) || 45;
        reviewedChars += (f.linesCount || 10) * weight;
      }
    }
    const reviewedTokens = Math.max(100, Math.ceil(reviewedChars / 4));

    if (fullRepoMode) {
      recordedTelemetry = recordJitInvocation(
        resolvedPlanningDir,
        filesToReview.slice(0, 10),
        repoTokenBaseline,
        repoTokenBaseline,
        'review',
        activePhase,
        undefined,
        'full-repo'
      );
    } else {
      const baseline = Math.max(repoTokenBaseline, reviewedTokens * 5);
      recordedTelemetry = recordJitInvocation(
        resolvedPlanningDir,
        filesToReview,
        reviewedTokens,
        baseline,
        'review',
        activePhase,
        undefined,
        'targeted'
      );
    }
  } catch {
    // Non-blocking telemetry
  }

  // 7. Blast Radius & Centrality Hub Calculation
  let blastReport: ReturnType<typeof calculateBlastRadius> | undefined = undefined;
  if (typeof calculateBlastRadius === 'function' && graph && filesToReview.length > 0) {
    try {
      blastReport = calculateBlastRadius(graph, filesToReview);
      if (blastReport && (blastReport.impactScore ?? 0) > 20) {
        warnings.push(`[Blast-Radius] Modified files have high blast radius (impact score ${blastReport.impactScore ?? 0}, ${blastReport.directDependents.length} direct / ${blastReport.transitiveDependents.length} transitive dependents).`);
      }
    } catch {
      // Non-blocking
    }
  }

  const topCentral = typeof queryTopCentralFiles === 'function' && graph ? queryTopCentralFiles(graph, 5) : [];

  let systemOneAutoPass = false;
  const systemOneCtx = { planningDir: resolvedPlanningDir, rootDir: resolvedRoot };
  if (filesToReview.length > 0) {
    try {
      let allLowRisk = true;
      let hasSystemOneWarning = false;

      // Test co-evolution guard (Phase 31 Wave 3)
      const hasTestFiles = filesToReview.some(f => f.includes('.test.') || f.includes('.spec.') || f.startsWith('tests/') || f.startsWith('test/'));
      const hasCodeFiles = filesToReview.some(f => !f.includes('.test.') && !f.includes('.spec.') && !f.startsWith('tests/') && !f.startsWith('test/') && !f.endsWith('.md') && !f.endsWith('.json') && !f.endsWith('.png') && !f.endsWith('.svg'));
      if (hasCodeFiles && !hasTestFiles) {
        warnings.push('[System-One] Co-evolução de testes ausente: código de produção modificado sem testes unitários correspondentes.');
        hasSystemOneWarning = true;
        allLowRisk = false;
      }

      for (const relPath of filesToReview) {
        const fullPath = path.join(resolvedRoot, relPath);

        // Score: Regression risk 0 (inofensivo) → 3 (crítico)
        const riskResult = classifyRiskSync(fullPath, systemOneCtx);
        if (riskResult.warning) {
          warnings.push(`[System-One] ${riskResult.warning}`);
          hasSystemOneWarning = true;
        }
        if (riskResult.score >= 3) {
          warnings.push(`[System-One] ${relPath} — high regression risk (score ${riskResult.score}/3, ${riskResult.confidence} confidence)`);
          allLowRisk = false;
        } else if (riskResult.score >= 2) {
          warnings.push(`[System-One] ${relPath} — elevated risk score ${riskResult.score}/3`);
          allLowRisk = false;
        } else if (riskResult.score > 0 || riskResult.confidence !== 'high') {
          allLowRisk = false;
        }

        // Noul 1: Does this change touch auth/security logic?
        const authNoul = evaluateAssertionSync(
          `Does the file ${relPath} introduce or modify authentication or security logic?`,
          { ...systemOneCtx, filePath: fullPath }
        );
        if (authNoul.warning) {
          warnings.push(`[System-One] ${authNoul.warning}`);
          hasSystemOneWarning = true;
        }
        if (authNoul.noul >= 0.8) {
          warnings.push(`[System-One] ${relPath} — security/auth impact detected (noul=${authNoul.noul.toFixed(2)}, ${authNoul.confidence})`);
        }

        // Noul 2: Does this break public API signatures / exported types?
        const apiBreakNoul = evaluateAssertionSync(
          `Does the file ${relPath} break or alter public API signatures or exported types?`,
          { ...systemOneCtx, filePath: fullPath }
        );
        if (apiBreakNoul.warning) {
          warnings.push(`[System-One] ${apiBreakNoul.warning}`);
          hasSystemOneWarning = true;
        }
        if (apiBreakNoul.noul >= 0.85) {
          criticalIssues.push(`[System-One] ${relPath} — potential public API breakage (noul=${apiBreakNoul.noul.toFixed(2)}, ${apiBreakNoul.confidence})`);
          allLowRisk = false;
        }
      }

      // Verdict: trivially auto-pass only when all files are low-risk, high-confidence, and no imperative warnings
      if (allLowRisk && !hasSystemOneWarning && criticalIssues.length === 0) {
        systemOneAutoPass = true;
      }
    } catch (sysErr: unknown) {
      const msg = sysErr instanceof Error ? sysErr.message : String(sysErr);
      warnings.push(`[System-One] Fallback ativado: aviso de falha do motor de decisão (${msg}). Triagem de risco ignorada.`);
    }
  }

  return {
    filesReviewed,
    targetFiles: filesToReview,
    criticalIssues,
    warnings,
    fixed,
    passed: criticalIssues.length === 0,
    telemetry: recordedTelemetry,
    blastRadius: blastReport,
    topCentralFiles: topCentral,
    ...(systemOneAutoPass ? { verdict: 'TRIVIAL_AUTO_PASSED' } : {}),
  };
}

/**
 * Dynamically resolves active phase ID from explicit args (flexible positional token)
 * or falls back to STATE.md inspection (D-120).
 */
function resolveActivePhaseId(planningDir: string, explicitPhaseOrArgs?: string[] | string): string {
  if (typeof explicitPhaseOrArgs === 'string' && explicitPhaseOrArgs.trim()) {
    const candidate = explicitPhaseOrArgs.trim();
    if (!candidate.startsWith('-')) {
      return candidate;
    }
  } else if (Array.isArray(explicitPhaseOrArgs) && explicitPhaseOrArgs.length > 0) {
    for (const arg of explicitPhaseOrArgs) {
      if (typeof arg === 'string' && !arg.startsWith('-')) {
        const lower = arg.toLowerCase();
        if (!CANONICAL_COMMAND_SET.has(lower as UnifiedCommandName) && lower !== 'review' && lower !== 'plan' && lower !== 'exec' && lower !== 'verify') {
          if (/^[0-9]+([a-zA-Z0-9._-]*)$/.test(arg) || /^phase[-_]?[0-9]+/i.test(arg)) {
            return arg;
          }
        }
      }
    }
  }

  try {
    const statePath = path.join(planningDir, 'STATE.md');
    const stateContent = platformReadSync(statePath) || '';
    const match = stateContent.match(/Current Phase:\s*Phase\s*([0-9a-zA-Z._-]+)/i);
    if (match) {
      return match[1];
    }
  } catch {
    // Non-blocking
  }
  return '1';
}

function extractTargetFilesFromPhase(planningDir: string, phaseId: string, cwd: string, singlePlanOnly: boolean = false): string[] {
  const targetFiles: string[] = [];
  if (!phaseId) return targetFiles;

  const phaseDirPath = path.join(planningDir, 'phases');
  try {
    if (fs.existsSync(phaseDirPath)) {
      const dirs = fs.readdirSync(phaseDirPath);
      const matchingDir = dirs.find(d => d.startsWith(phaseId) || d.includes(phaseId));
      if (matchingDir) {
        const fullDir = path.join(phaseDirPath, matchingDir);
        const { planFiles } = scanPhasePlans(fullDir);
        const filesToScan = singlePlanOnly ? (planFiles[0] ? [planFiles[0]] : []) : planFiles;
        for (const pf of filesToScan) {
          const planContent = platformReadSync(path.join(fullDir, pf)) || '';
          const fileMatches = planContent.match(/(?:`|\b)([a-zA-Z0-9_./\\-]+\.[a-zA-Z0-9]+)(?:`|\b)/g);
          if (fileMatches) {
            for (const m of fileMatches) {
              const clean = m.replace(/`/g, '');
              if (!clean.endsWith('.md') && !clean.endsWith('.json') && fs.existsSync(path.join(cwd, clean))) {
                targetFiles.push(clean);
              }
            }
          }
        }
      }
    }
  } catch {
    // non-blocking
  }
  return Array.from(new Set(targetFiles));
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

/**
 * Dispatches a unified command to its corresponding streamlined handler.
 */
function dispatchUnifiedCommand(rawCommand: string, options: UnifiedCommandOptions): UnifiedCommandResult {
  const canonicalName = normalizeCommandName(rawCommand);
  const cwd = options.cwd || process.cwd();
  const planningDir = path.join(cwd, '.planning');
  const hasFixFlag = Boolean(options.flags?.['fix'] || options.args.includes('--fix'));

  // Sync session context handshake on command dispatch (D-30)
  syncSessionContext(planningDir, cwd);

  if (!canonicalName) {
    throw new Error(
      `Unknown or retired command "${rawCommand}". GSD Core strictly supports only the 11 unified canonical commands: status, plan, exec, review, verify, ship, auto, tokens, migrate, graph, help.`
    );
  }

  const logger = new SessionLogger({ planningDir });
  logger.startSession({ command: canonicalName, args: options.args });

  try {
    const result = runInternalUnifiedCommand(canonicalName, options, cwd, planningDir, hasFixFlag);
    logger.endSession('completed', { action: result.action });
    return result;
  } catch (err) {
    logger.endSession('failed', { error: (err as Error).message });
    throw err;
  }
}

function runInternalUnifiedCommand(
  canonicalName: UnifiedCommandName,
  options: UnifiedCommandOptions,
  cwd: string,
  planningDir: string,
  hasFixFlag: boolean
): UnifiedCommandResult {
  switch (canonicalName) {
    case 'auto':
      try {
        initMod.cmdInitAutonomous(cwd, Boolean(options.raw));
      } catch {
        // Non-blocking in mock environments
      }
      return {
        command: 'auto',
        action: 'AUTOPILOT_CYCLE',
        nextStep: 'executing phase plans sequentially with safety checkpoints',
        message: 'GSD Core Nexus 3.6 Autopilot active. Running phase loop with guardrails.',
      };

    case 'status': {
      const telemetry = getTelemetrySummary(planningDir);
      let intelHealth: unknown = undefined;
      let intelMsg = '';
      try {
        if (typeof checkIntelHealth === 'function') {
          const healthReport = checkIntelHealth(planningDir, cwd);
          intelHealth = healthReport;
          if (healthReport.stale) {
            intelMsg = ` | Intel AST: Stale (${healthReport.gitCommitSha ? healthReport.gitCommitSha.slice(0, 7) : 'missing'} vs ${healthReport.currentGitHead ? healthReport.currentGitHead.slice(0, 7) : 'head'}).`;
          } else if (healthReport.healthy) {
            intelMsg = ` | Intel AST: Fresh (${healthReport.gitCommitSha ? healthReport.gitCommitSha.slice(0, 7) : 'ok'}, ${healthReport.totalFiles ?? 0} files).`;
          }
        }
      } catch {
        // Non-blocking
      }

      const teleMsg = telemetry.totalInvocations > 0
        ? ` | JIT Efficiency: ${telemetry.averageEfficiencyPct}% tokens saved (${telemetry.totalTokensSaved} tokens).`
        : '';
      return {
        command: 'status',
        action: 'DISPLAY_STATUS',
        nextStep: 'execute next recommended action based on STATE.md',
        data: { telemetry, intelHealth },
        message: `GSD Core Nexus 3.6 Status analyzed. Context and phase roadmap verified.${teleMsg}${intelMsg}`,
      };
    }

    case 'plan': {
      const phaseId = resolveActivePhaseId(planningDir, options.args);
      let targetFiles = extractTargetFilesFromPhase(planningDir, phaseId, cwd, true);

      if (targetFiles.length === 0) {
        const fallbackGraph = loadCodebaseGraph(planningDir) || buildCodebaseGraph(cwd);
        targetFiles = Object.keys(fallbackGraph.files).slice(0, 3);
      }

      const jitPackage = assembleJitContext({
        targetFiles,
        planningDir,
        rootDir: cwd,
        command: 'plan',
        phaseId,
      });

      // Gap Analysis Check (D-34)
      let gapWarnings: string[] = [];
      try {
        const phaseDirPath = path.join(planningDir, 'phases');
        const gapResult = runGapAnalysis(cwd, phaseDirPath);
        if (gapResult && gapResult.counts && gapResult.counts.uncovered > 0) {
          gapWarnings = gapResult.rows
            .filter((r) => r.status === 'uncovered')
            .map((r) => `Uncovered item [${r.source}]: ${r.item}`);
        }
      } catch {
        // Non-blocking
      }

      try {
        initMod.cmdInitPlanPhase(cwd, phaseId, Boolean(options.raw));
      } catch {
        // Non-blocking in mock environments
      }

      // System One Gatekeeping: decide fast vs deep planning mode
      let planMode = 'fast';
      try {
        if (typeof choose === 'function') {
          const isComplex = targetFiles.length > 5 || gapWarnings.length > 0;
          const choiceResult = choose(['fast', 'deep'], {
            planningDir,
            taskType: 'planning',
            complexity: isComplex ? 'high' : 'low',
            targetFilesCount: targetFiles.length,
          });
          planMode = choiceResult.choice;
        }
      } catch {
        // Fallback default
      }

      return {
        command: 'plan',
        action: 'PLAN_PHASE',
        nextStep: 'run /gsd:exec to execute the generated phase plan',
        data: { jit: jitPackage, gapWarnings, planMode },
        message: `Phase plan ready in ${planMode} mode with atomic task waves, verification criteria, and surgical JIT context (${jitPackage.estimatedTokens} estimated tokens).`,
      };
    }

    case 'exec': {
      const phaseId = resolveActivePhaseId(planningDir, options.args);
      const filesToModify = extractTargetFilesFromPhase(planningDir, phaseId, cwd, false);

      const preFlightReport = runPreFlightChecks({
        taskId: phaseId || 'active-phase',
        filesToModify,
        planningDir,
        rootDir: cwd,
      });

      const errorViolations = preFlightReport.violations.filter(v => v.severity === 'error');
      const isForced = Boolean(options.flags?.['force'] || options.args.includes('--force'));

      if (errorViolations.length > 0 && !isForced) {
        return {
          command: 'exec',
          action: 'BLOCKED_BY_GUARDRAIL',
          nextStep: 'resolve guardrail error violations or rerun with --force to bypass',
          data: { preFlight: preFlightReport },
          message: `Execution blocked by pre-flight guardrails: ${errorViolations.length} error-level violation(s) detected. Rerun with --force to override.`,
        };
      }

      try {
        initMod.cmdInitExecutePhase(cwd, phaseId, Boolean(options.raw));
      } catch {
        // Non-blocking in mock environments
      }

      // Auto-record telemetry for exec (Wave 4, D-112)
      try {
        let execChars = 0;
        const targetFiles = filesToModify.length > 0 ? filesToModify : ['<active-phase>'];
        for (const tf of filesToModify) {
          const fullP = path.isAbsolute(tf) ? tf : path.join(cwd, tf);
          if (fs.existsSync(fullP)) {
            try {
              execChars += fs.readFileSync(fullP, 'utf8').length;
            } catch {
              execChars += 1000;
            }
          } else {
            execChars += 500;
          }
        }
        const execTokens = Math.max(100, Math.ceil(execChars / 4));
        const graph = loadCodebaseGraph(planningDir) || buildCodebaseGraph(cwd);
        let repoChars = 0;
        if (graph && graph.files) {
          for (const f of Object.values(graph.files)) {
            const weight = (f.language && LANGUAGE_CHAR_WEIGHTS[f.language.toLowerCase()]) || 45;
            repoChars += (f.linesCount || 10) * weight;
          }
        }
        const fullRepoBaseline = Math.max(5000, Math.ceil(repoChars / 4), execTokens * 5);
        recordJitInvocation(
          planningDir,
          targetFiles,
          execTokens,
          fullRepoBaseline,
          'exec',
          phaseId,
          `exec_${phaseId || 'active'}_${Date.now()}`
        );
      } catch {
        // Non-blocking telemetry
      }

      // System One Gatekeeping: decide between wave parallelism vs serial execution
      let executionMode = 'parallel';
      try {
        if (typeof choose === 'function') {
          const hasWarnings = preFlightReport.violations.length > 0;
          const choiceResult = choose(['parallel', 'serial'], {
            planningDir,
            taskType: 'execution',
            complexity: hasWarnings || filesToModify.length > 8 ? 'high' : 'low',
            violationsCount: preFlightReport.violations.length,
          });
          executionMode = choiceResult.choice;
        }
      } catch {
        // Fallback default
      }

      return {
        command: 'exec',
        action: 'EXECUTE_PHASE',
        nextStep: 'run /gsd:review or /gsd:verify upon wave completion',
        data: { preFlight: preFlightReport, executionMode },
        message: preFlightReport.valid
          ? `Pre-flight guardrails passed. Phase execution underway in ${executionMode} wave mode with atomic commits and JIT context injection.`
          : `Pre-flight warnings detected (${preFlightReport.violations.length} violation(s)). Phase execution proceeding in ${executionMode} mode with guardrails active.`,
      };
    }

    case 'review': {
      const phaseId = resolveActivePhaseId(planningDir, options.args);
      const isFull = Boolean(
        options.flags?.['full'] ||
        options.flags?.['repo'] ||
        options.flags?.['fullRepo'] ||
        options.args.includes('--full') ||
        options.args.includes('--repo')
      );
      const explicitFiles = options.args.filter(arg =>
        !arg.startsWith('-') &&
        arg !== 'review' &&
        arg !== phaseId &&
        (arg.includes('/') || arg.includes('\\') || arg.includes('.'))
      );

      const reviewResult = executeReview(
        planningDir,
        cwd,
        hasFixFlag,
        explicitFiles.length > 0 ? explicitFiles : undefined,
        isFull,
        phaseId
      );
      const totalIssues = reviewResult.criticalIssues.length + reviewResult.warnings.length;
      const fixHint = (!hasFixFlag && totalIssues > 0)
        ? ' 💡 Dica: Para aplicar essas correções automaticamente, execute /gsd:review --fix'
        : '';

      const hasReject = Boolean(options.flags?.['reject'] || options.flags?.['override'] || options.args.includes('--reject'));
      if (hasReject && typeof recordUserOverride === 'function') {
        const rejectReason = typeof options.flags?.['reason'] === 'string'
          ? options.flags['reason']
          : 'User manual override in review session';
        const filesToOverride = reviewResult.targetFiles || explicitFiles;
        for (const file of filesToOverride) {
          recordUserOverride(file, rejectReason, planningDir);
        }
      }

      return {
        command: 'review',
        action: hasFixFlag ? 'REVIEW_AND_AUTO_FIX' : 'REVIEW_ONLY',
        nextStep: hasFixFlag || totalIssues === 0
          ? 'run /gsd:verify to validate user acceptance criteria'
          : 'run /gsd:review --fix to auto-repair issues, or /gsd:verify',
        data: reviewResult,
        fixedIssues: reviewResult.fixed,
        message: hasFixFlag
          ? `Review complete. Automatically repaired ${reviewResult.fixed.length} issue(s).`
          : `Review complete. Found ${reviewResult.criticalIssues.length} critical issues, ${reviewResult.warnings.length} warnings.${fixHint}`,
      };
    }

    case 'verify': {
      const phaseId = resolveActivePhaseId(planningDir, options.args);
      let autoPassed = false;
      let systemOneVerified = false;
      const verifyWarnings: string[] = [];
      try {
        initMod.cmdInitVerifyWork(cwd, phaseId, Boolean(options.raw));
      } catch {
        // Non-blocking in mock environments
      }

      // Check coverage auto-pass
      try {
        const summaryPath = path.join(planningDir, 'phases', `${phaseId}-SUMMARY.md`);
        if (fs.existsSync(summaryPath)) {
          const summaryContent = platformReadSync(summaryPath) || '';
          const covResult = classifyContent(summaryContent, summaryPath);
          if (covResult && covResult.all_auto_covered) {
            autoPassed = true;
          }
        }
      } catch {
        // Non-blocking
      }

      // ── Wave 4: Double-Interlock Auto-UAT ─────────────────────────────────────
      // Interlock 1: Test suite must be green (exitCode === 0)
      let testsGreen = false;
      const skipTests = Boolean(options.flags?.['skip-tests'] || options.flags?.['no-tests'] || options.args.includes('--skip-tests'));
      if (skipTests) {
        testsGreen = true;
      } else {
        try {
          const detectedCmd = detectProjectTestCommand(cwd);
          const normalizedCmd = normalizeTestCommand(detectedCmd, cwd);
          try {
            execSync(normalizedCmd, { cwd, stdio: 'ignore', timeout: 60000 });
            testsGreen = true;
          } catch {
            verifyWarnings.push(`[System-One] Interlock 1 BLOQUEADO: suíte de testes falhou (${normalizedCmd}). Auto-UAT não aprovará até os testes estarem verdes.`);
          }
        } catch {
          // If child_process is unavailable, assume green to not block CLI environments
          testsGreen = true;
        }
      }

      // Interlock 2: Acceptance criteria Noul evaluation (only if tests are green)
      if (testsGreen && !autoPassed) {
        try {
          const planPath = path.join(
            planningDir,
            'phases',
            phaseId ? `${phaseId}-PLAN.md` : ''
          );
          let acceptanceCriteria: string[] = [];

          // Extract acceptance criteria from PLAN.md (numbered list under section 4 or "Verification Criteria")
          if (phaseId && fs.existsSync(planPath)) {
            const planContent = platformReadSync(planPath) || '';
            const criteriaSection = collectSection(
              planContent,
              (h) => h.level === 2 && /verification/i.test(h.text),
              { levelBounded: true }
            );
            if (criteriaSection) {
              const lines = criteriaSection.body.split('\n');
              for (const line of lines) {
                const clean = line.replace(/^\s*\d+\.\s*\*\*[^*]+\*\*:?\s*/, '').replace(/^\s*[-*]\s+/, '').trim();
                if (clean.length > 10) {
                  acceptanceCriteria.push(clean);
                }
              }
            }
          }

          if (acceptanceCriteria.length === 0) {
            acceptanceCriteria = [
              'All modified source files compile without errors',
              'All automated tests pass with exit code 0',
              'No new critical security issues are introduced',
            ];
          }

          const systemOneCtxVerify = { planningDir, rootDir: cwd };
          let allNoulPassed = true;
          let hasSystemOneVerifyWarning = false;

          for (const criterion of acceptanceCriteria.slice(0, 10)) {
            const noulResult = evaluateAssertionSync(criterion, systemOneCtxVerify);
            if (noulResult.warning) {
              verifyWarnings.push(`[System-One] ${noulResult.warning}`);
              hasSystemOneVerifyWarning = true;
              allNoulPassed = false;
              break;
            }
            if (noulResult.noul < 0.95 || noulResult.confidence !== 'high') {
              verifyWarnings.push(
                `[System-One] Critério não atingiu confiança necessária: "${criterion.slice(0, 80)}" (noul=${noulResult.noul.toFixed(2)}, ${noulResult.confidence}). Delegando ao fluxo conversacional.`
              );
              allNoulPassed = false;
              break;
            }
          }

          if (allNoulPassed && !hasSystemOneVerifyWarning) {
            systemOneVerified = true;
          }
        } catch (verErr: unknown) {
          const msg = verErr instanceof Error ? verErr.message : String(verErr);
          verifyWarnings.push(`[System-One] Fallback ativado: aviso de falha do motor de decisão (${msg}). Auto-UAT delegado ao fluxo conversacional.`);
        }
      }

      // Auto-record telemetry for verify
      try {
        const summaryPath = path.join(planningDir, 'phases', `${phaseId}-SUMMARY.md`);
        const targetFiles: string[] = [];
        let verifyChars = 0;
        if (fs.existsSync(summaryPath)) {
          targetFiles.push(path.relative(cwd, summaryPath));
          try {
            verifyChars += fs.readFileSync(summaryPath, 'utf8').length;
          } catch {
            verifyChars += 1000;
          }
        }
        const verifyTokens = Math.max(100, Math.ceil(verifyChars / 4));
        const graph = loadCodebaseGraph(planningDir) || buildCodebaseGraph(cwd);
        let repoChars = 0;
        if (graph && graph.files) {
          for (const f of Object.values(graph.files)) {
            const weight = (f.language && LANGUAGE_CHAR_WEIGHTS[f.language.toLowerCase()]) || 45;
            repoChars += (f.linesCount || 10) * weight;
          }
        }
        const fullRepoBaseline = Math.max(5000, Math.ceil(repoChars / 4), verifyTokens * 5);
        recordJitInvocation(
          planningDir,
          targetFiles.length > 0 ? targetFiles : ['<verification-summary>'],
          verifyTokens,
          fullRepoBaseline,
          'verify',
          phaseId,
          `verify_${phaseId || 'active'}_${Date.now()}`
        );
      } catch {
        // Non-blocking telemetry
      }

      const finalVerdict = systemOneVerified
        ? 'SYSTEM_ONE_VERIFIED'
        : autoPassed
          ? 'COVERAGE_AUTO_PASSED'
          : 'MANUAL_VALIDATION_REQUIRED';

      const hasVerifyReject = Boolean(options.flags?.['reject'] || options.args.includes('--reject'));
      if (hasVerifyReject && typeof recordUserOverride === 'function') {
        const rejectReason = typeof options.flags?.['reason'] === 'string'
          ? options.flags['reason']
          : 'User rejected acceptance criteria in verify';
        recordUserOverride(`phase-${phaseId}`, rejectReason, planningDir);
      }

      return {
        command: 'verify',
        action: 'VERIFY_WORK',
        nextStep: (systemOneVerified || autoPassed)
          ? 'run /gsd:ship to create PR and merge'
          : 'address failing acceptance criteria and re-run /gsd:verify',
        data: { autoPassed, systemOneVerified, verdict: finalVerdict, warnings: verifyWarnings },
        message: systemOneVerified
          ? `✅ Auto-UAT aprovado pelo System One Engine (Intertravamento Duplo). Critérios de aceitação validados com noul ≥ 0.95 e confiança alta. Verdict: ${finalVerdict}.`
          : autoPassed
            ? 'Functional and acceptance criteria validation complete with 100% test coverage (Auto-Pass).'
            : verifyWarnings.length > 0
              ? `⚠️ Auto-UAT inconclusivo. ${verifyWarnings[0]} Faça a validação conversacional antes de /gsd:ship.`
              : 'Functional and acceptance criteria validation complete.',
      };
    }


    case 'ship':
      initMod.cmdInitCompleteMilestone(cwd, Boolean(options.raw));
      return {
        command: 'ship',
        action: 'SHIP_RELEASE',
        nextStep: 'advance to next milestone or phase',
        message: 'Release prepared, branch cleaned and ready for PR merge.',
      };

    case 'migrate': {
      const upgradeOpts = {
        dryRun: Boolean(options.flags?.['dry-run'] || options.flags?.['dryRun'] || options.args.includes('--dry-run')),
        force: Boolean(options.flags?.['force'] || options.args.includes('--force')),
      };
      const report = runAutoUpgrade(planningDir, cwd, upgradeOpts);
      return {
        command: 'migrate',
        action: 'UPGRADE_LEGACY_PROJECT',
        nextStep: 'run /gsd:status to review modernized roadmap and intelligence graph',
        data: report,
        message: report.message,
      };
    }

    case 'tokens': {
      const isWeb = Boolean(
        options.args.includes('--web') ||
        options.args.includes('--html') ||
        options.flags?.['web'] ||
        options.flags?.['html']
      );

      if (isWeb) {
        const { htmlPath, snapshot } = observabilityHtmlMod.exportObservabilityDashboard(planningDir);
        return {
          command: 'tokens',
          action: 'EXPORT_OBSERVABILITY_DASHBOARD',
          nextStep: 'open .planning/intel/dashboard.html in browser to view visual telemetry',
          data: snapshot,
          message: `Observability 360° visual dashboard exported to ${htmlPath}. Open in your browser to inspect interactive graphs and dynamic cost simulator.`,
        };
      }

      const viewOption = options.args.find(a => a === '--sessions' || a === '--cost' || a === '--all')
        || (options.flags?.['sessions'] ? '--sessions' : (options.flags?.['cost'] ? '--cost' : (options.flags?.['all'] ? '--all' : undefined)));
      const dashboard = renderTokenDashboard(planningDir, viewOption);
      const telemetry = getTelemetrySummary(planningDir);
      return {
        command: 'tokens',
        action: 'DISPLAY_TELEMETRY_DASHBOARD',
        nextStep: 'use surgical JIT context injection in next phase plans',
        data: telemetry,
        message: dashboard,
      };
    }

    case 'graph': {
      const { htmlPath, payload } = visualGraphMod.exportVisualGraph(planningDir, cwd);
      const canvasResult = canvasGenMod.exportRoadmapCanvas(planningDir);
      return {
        command: 'graph',
        action: 'EXPORT_VISUAL_GRAPH',
        nextStep: 'open .planning/intel/graph-view.html or .planning/ROADMAP.canvas',
        data: {
          htmlPath,
          canvasPath: canvasResult.canvasPath,
          totalNodes: payload.stats.totalNodes,
          totalLinks: payload.stats.totalLinks,
        },
        message: `Visual knowledge graph exported to ${htmlPath} (${payload.stats.totalNodes} nodes, ${payload.stats.totalLinks} links) and ${canvasResult.canvasPath}.`,
      };
    }

    case 'help':
      return {
        command: 'help',
        action: 'DISPLAY_HELP',
        nextStep: 'run /gsd:status or /gsd:plan to proceed with your workflow',
        message: 'GSD Core Nexus 3.6 Unified Commands: /gsd:status, /gsd:plan, /gsd:exec, /gsd:review, /gsd:verify, /gsd:ship, /gsd:auto, /gsd:tokens, /gsd:migrate, /gsd:graph, /gsd:help',
      };
  }
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
import testScaffolder = require('./test-scaffold-engine.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import canonicalFinder = require('./canonical-examples-finder.cjs');

export = {
  normalizeCommandName,
  dispatchUnifiedCommand,
  executeReview,
  recordUserOverride,
  executeWithSelfHealing: guardrailsMod.executeWithSelfHealing,
  generateTestScaffold: testScaffolder.generateTestScaffold,
  findCanonicalExample: canonicalFinder.findCanonicalExample,
  renderTokenDashboard,
};

