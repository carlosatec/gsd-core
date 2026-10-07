/**
 * GSD System One Engine — Sovereign Decision Intelligence & Confidence-Gated Routing.
 *
 * Implements sovereign, non-autoregressive decision heads inspired by Jev (TypeSafe AI)
 * and Laya (Apache 2.0), operating 100% locally with the user's installed runtime/LLM and
 * native AST static intelligence. Eliminates external proprietary APIs and guarantees
 * non-blocking warning fallbacks upon decision motor disruptions.
 */

import fs from 'node:fs';
import path from 'node:path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import codebaseAst = require('./codebase-ast-analyzer.cjs');
const {
  loadCodebaseGraph,
  buildCodebaseGraph,
  calculateBlastRadius,
  toPosixPath,
} = codebaseAst;

// eslint-disable-next-line @typescript-eslint/no-require-imports
import antiPatternMod = require('./anti-pattern-store.cjs');
const { queryAntiPatterns } = antiPatternMod;

// eslint-disable-next-line @typescript-eslint/no-require-imports
import hybridRag = require('./hybrid-semantic-rag.cjs');
const { tokenize } = hybridRag;

// eslint-disable-next-line @typescript-eslint/no-require-imports
import patternMod = require('./pattern.cjs');
const { escapeRegex } = patternMod;

// eslint-disable-next-line @typescript-eslint/no-require-imports
import sessionLoggerMod = require('./session-logger.cjs');
const { SessionLogger } = sessionLoggerMod;

type CodebaseGraph = ReturnType<typeof buildCodebaseGraph>;

// ─── Interfaces & Primitives ──────────────────────────────────────────────────

type SystemOneConfidence = 'low' | 'med' | 'high';

interface SystemOneHeadReport {
  score: number; // 0 to 3
  reason: string;
  weight: number;
}

interface SystemOneLearningRule {
  pattern: string;
  forcedMinScore?: number;
  disallowAutoApprove?: boolean;
  reason: string;
  updatedAt: string;
}

interface SystemOneLearningPayload {
  version: string;
  rules: SystemOneLearningRule[];
}

interface SystemOneScoreResult {
  score: number; // Graduated score (e.g. 0 to 3 for risk)
  probabilities: Record<number, number>;
  confidence: SystemOneConfidence;
  warning?: string;
  source: 'ast_analytical' | 'user_runtime_semantic' | 'fallback';
  heads?: {
    security: SystemOneHeadReport;
    architecture: SystemOneHeadReport;
    quality: SystemOneHeadReport;
  };
  entropy?: number; // Normalized Shannon uncertainty: 0.0 to 1.0
  learningRule?: {
    pattern: string;
    reason: string;
    disallowAutoApprove?: boolean;
  };
}

interface SystemOneChoiceResult<T extends string = string> {
  choice: T;
  probabilities: Record<T, number>;
  confidence: SystemOneConfidence;
  warning?: string;
  source: 'ast_analytical' | 'user_runtime_semantic' | 'fallback';
  entropy?: number; // Normalized Shannon uncertainty: 0.0 to 1.0
}

interface SystemOneNoulResult {
  noul: number; // Continuous truth probability: 0.0 to 1.0
  confidence: SystemOneConfidence;
  warning?: string;
  source: 'ast_analytical' | 'user_runtime_semantic' | 'fallback';
}

interface SystemOneReRankItem {
  file?: string;
  name?: string;
  id?: string;
  [key: string]: unknown;
}

interface SystemOneReRankResult<T extends SystemOneReRankItem = SystemOneReRankItem> {
  items: T[];
  relevanceScores: Record<string, number>; // Item key -> percentage 0.0 to 100.0%
  averageRelevance: number; // 0.0 to 100.0%
  confidence: SystemOneConfidence;
  warning?: string;
  source: 'ast_analytical' | 'user_runtime_semantic' | 'fallback';
}

interface EvaluationOptions {
  planningDir?: string;
  rootDir?: string;
  diff?: string;
  diffLines?: number;
  testsPassed?: boolean;
  testModified?: boolean;
  changedFiles?: string[];
  useSemantic?: boolean;
  semanticTimeoutMs?: number;
  semanticDispatcher?: (prompt: string) => Promise<string>;
}

// ─── Mathematics & Information Theory (Shannon Entropy) ───────────────────────

/**
 * Calculates normalized Shannon entropy H(P) over a probability distribution.
 * Normalized to 0.0 (certainty) ... 1.0 (maximum uncertainty / uniform distribution).
 */
function computeShannonEntropy(probabilities: Record<string | number, number>): number {
  const values = Object.values(probabilities).filter(p => typeof p === 'number' && p > 0);
  if (values.length <= 1) {
    return 0.0;
  }
  let h = 0.0;
  for (const p of values) {
    h -= p * Math.log2(p);
  }
  const maxH = Math.log2(values.length);
  return maxH > 0 ? Number((h / maxH).toFixed(4)) : 0.0;
}

/**
 * Computes Reciprocal Rank Fusion (RRF) score for a document present in multiple rankings.
 * Formula: RRF(d) = sum( w_i / (k + rank_i(d)) )
 * Default: k = 60 (standard Cormack & Clarke constant), weights = [0.5, 0.5]
 */
function computeRrfScore(rankTopo: number, rankLexical: number, k = 60, wTopo = 0.5, wLexical = 0.5): number {
  const safeRankTopo = Math.max(1, rankTopo);
  const safeRankLexical = Math.max(1, rankLexical);
  const score = (wTopo / (k + safeRankTopo)) + (wLexical / (k + safeRankLexical));
  return Number(score.toFixed(6));
}

// ─── Windows Atomic File Persistence (DEFECT.WINDOWS-FS-OPS Parity) ──────────

const RENAME_RETRY_ERRNOS = new Set(['EPERM', 'EBUSY', 'EACCES']);
const RENAME_MAX_ATTEMPTS = 3;
const RENAME_RETRY_BACKOFF_MS = 50;
let _renameSleepBuf: Int32Array | null = null;
function renameBackoff(): void {
  if (_renameSleepBuf === null) _renameSleepBuf = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(_renameSleepBuf, 0, 0, RENAME_RETRY_BACKOFF_MS);
}

function renameWithRetry(from: string, to: string): void {
  for (let attempt = 1; ; attempt += 1) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? '';
      if (attempt < RENAME_MAX_ATTEMPTS && RENAME_RETRY_ERRNOS.has(code)) {
        renameBackoff();
        continue;
      }
      throw err;
    }
  }
}

// ─── Context Learning Store (Durabilidade & Retroalimentação Local) ───────────

const LEARNING_STORE_MAX_RULES = 100;
const LEARNING_STORE_VERSION = '1.0.0';

class SystemOneLearningStore {
  readonly planningDir: string;
  readonly filePath: string;
  readonly maxRules: number;

  constructor(planningDir?: string, maxRules = LEARNING_STORE_MAX_RULES) {
    this.planningDir = planningDir || path.resolve('.planning');
    this.filePath = path.join(this.planningDir, 'intel', 'system-one-learning.json');
    this.maxRules = maxRules;
  }

  loadRules(): SystemOneLearningRule[] {
    try {
      if (!fs.existsSync(this.filePath)) {
        return [];
      }
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as SystemOneLearningPayload;
      if (Array.isArray(parsed?.rules)) {
        return parsed.rules;
      }
      return [];
    } catch {
      return [];
    }
  }

  saveRules(rules: SystemOneLearningRule[]): void {
    try {
      const intelDir = path.dirname(this.filePath);
      if (!fs.existsSync(intelDir)) {
        fs.mkdirSync(intelDir, { recursive: true });
      }

      const cappedRules = rules.length > this.maxRules
        ? rules.slice(rules.length - this.maxRules)
        : rules;

      const payload: SystemOneLearningPayload = {
        version: LEARNING_STORE_VERSION,
        rules: cappedRules,
      };

      const tmpPath = `${this.filePath}.tmp.${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
      renameWithRetry(tmpPath, this.filePath);
    } catch {
      // Non-blocking fail-safe
    }
  }

  recordOverride(
    pattern: string,
    reason = 'User manual override',
    forcedMinScore = 3,
    disallowAutoApprove = true
  ): void {
    const rules = this.loadRules();
    const normalizedPattern = pattern.replace(/\\/g, '/');
    const existingIndex = rules.findIndex((r) => r.pattern.replace(/\\/g, '/') === normalizedPattern);

    const updatedRule: SystemOneLearningRule = {
      pattern: normalizedPattern,
      forcedMinScore,
      disallowAutoApprove,
      reason,
      updatedAt: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      rules[existingIndex] = updatedRule;
    } else {
      rules.push(updatedRule);
    }

    this.saveRules(rules);
  }

  getMatchingRule(filePath: string): SystemOneLearningRule | undefined {
    const rules = this.loadRules();
    if (rules.length === 0) return undefined;

    const normalizedPath = filePath.replace(/\\/g, '/');
    for (let i = rules.length - 1; i >= 0; i--) {
      const rule = rules[i];
      const pattern = rule.pattern.replace(/\\/g, '/');
      if (
        normalizedPath === pattern ||
        normalizedPath.endsWith(`/${pattern}`) ||
        normalizedPath.includes(pattern) ||
        (pattern.includes('*') && this.globMatch(normalizedPath, pattern))
      ) {
        return rule;
      }
    }
    return undefined;
  }

  private globMatch(str: string, pattern: string): boolean {
    const parts = pattern.split('*').map(p => escapeRegex(p));
    const regex = new RegExp(`^${parts.join('.*')}$`);
    return regex.test(str);
  }

  clearRules(): void {
    this.saveRules([]);
  }
}

// ─── Specialized Multi-Head Evaluators (Inspired by Laya Multi-Persona) ──────

class SecurityHead {
  readonly weight = 0.4;

  evaluate(filePath: string, options?: EvaluationOptions): SystemOneHeadReport {
    const norm = toPosixPath(filePath).toLowerCase();
    const diff = (options?.diff || '').toLowerCase();

    // High critical security signals
    const secKeywords = ['password', 'secret', 'token', 'jwt', 'credential', 'private_key', 'crypto', 'bearer'];
    const hasCriticalDiff = secKeywords.some(kw => diff.includes(kw));
    const isAuthFile = norm.includes('auth') || norm.includes('security') || norm.includes('secret') || norm.includes('token') || norm.includes('crypto');

    if (hasCriticalDiff || (isAuthFile && diff.length > 0)) {
      return {
        score: 3,
        reason: 'Alterações sensíveis detectadas em credenciais, criptografia ou lógica de autenticação.',
        weight: this.weight,
      };
    }

    if (isAuthFile || norm.includes('guard') || norm.includes('session') || norm.includes('permission')) {
      return {
        score: 2,
        reason: 'Módulo de controle de acesso ou permissões modificado.',
        weight: this.weight,
      };
    }

    if (diff.includes('env') || diff.includes('config') || diff.includes('api_key')) {
      return {
        score: 1,
        reason: 'Referências a configurações de ambiente ou chaves secundárias.',
        weight: this.weight,
      };
    }

    return {
      score: 0,
      reason: 'Nenhum sinal ou vetor de vulnerabilidade de segurança identificado.',
      weight: this.weight,
    };
  }
}

class ArchitectureHead {
  readonly weight = 0.4;

  evaluate(filePath: string, graph?: CodebaseGraph | null, options?: EvaluationOptions): SystemOneHeadReport {
    const norm = toPosixPath(filePath);
    if (!graph || !graph.files) {
      return {
        score: 1,
        reason: 'Grafo arquitetural indisponível; avaliação topológica em modo padrão.',
        weight: this.weight,
      };
    }

    const relNorm = options?.rootDir ? toPosixPath(path.relative(options.rootDir, filePath)) : norm;
    const lookupKey = graph.files[norm] ? norm : (graph.files[relNorm] ? relNorm : norm);
    const fileNode = graph.files[lookupKey];
    const pageRank = graph.pageRankScores?.[lookupKey] || graph.pageRankScores?.[norm] || 0;
    const isGodObject = Boolean(fileNode?.isGodObject);

    let totalBlast = 0;
    try {
      const blast = calculateBlastRadius(graph, [lookupKey]);
      totalBlast = blast.totalAffectedFiles || 0;
    } catch {
      // Non-blocking
    }

    const diff = options?.diff || '';
    const hasExportBreaking = /-\s*export\s+(function|class|interface|type|const)/.test(diff);

    if (hasExportBreaking || isGodObject || totalBlast > 10 || pageRank > 0.05) {
      return {
        score: 3,
        reason: `Módulo central de alto acoplamento (PageRank: ${pageRank.toFixed(3)}, Blast Radius: ${totalBlast}, GodObject: ${isGodObject}, Quebra de Export: ${hasExportBreaking}).`,
        weight: this.weight,
      };
    }

    if (totalBlast > 2 || pageRank > 0.015) {
      return {
        score: 2,
        reason: `Módulo com dependentes moderados (Blast Radius: ${totalBlast}, PageRank: ${pageRank.toFixed(3)}).`,
        weight: this.weight,
      };
    }

    return {
      score: 1,
      reason: 'Módulo folha ou de baixo impacto arquitetural no grafo.',
      weight: this.weight,
    };
  }
}

class QualityHead {
  readonly weight = 0.2;

  evaluate(filePath: string, options?: EvaluationOptions): SystemOneHeadReport {
    const diff = options?.diff || '';
    const lines = diff ? diff.split('\n').length : (options?.diffLines || 0);

    const isTestFile = filePath.includes('.test.') || filePath.includes('.spec.') || filePath.startsWith('tests/') || filePath.startsWith('test/');
    const isDoc = isBenignDocAsset(filePath);

    // Test co-evolution evaluation (Phase 31 Wave 3)
    let coEvolutionWarning = '';
    if (!isTestFile && !isDoc && lines > 0) {
      if (options?.testModified === false) {
        coEvolutionWarning = ' (co-evolução de testes ausente: código alterado sem modificação de testes correspondentes)';
      } else if (Array.isArray(options?.changedFiles) && options.changedFiles.length > 0) {
        const hasTests = options.changedFiles.some(f => f.includes('.test.') || f.includes('.spec.') || f.startsWith('tests/') || f.startsWith('test/'));
        if (!hasTests) {
          coEvolutionWarning = ' (co-evolução de testes ausente: código alterado sem modificação de testes correspondentes)';
        }
      }
    }

    if (lines > 300) {
      return {
        score: 3,
        reason: `Volume massivo de alterações (${lines} linhas modificadas no diff), risco elevado de regressão.${coEvolutionWarning}`,
        weight: this.weight,
      };
    }

    if (lines > 80 || (lines > 0 && coEvolutionWarning)) {
      return {
        score: 2,
        reason: coEvolutionWarning
          ? `Alteração em código de produção sem testes associados.${coEvolutionWarning}`
          : `Volume moderado de alterações (${lines} linhas modificadas).`,
        weight: this.weight,
      };
    }

    if (lines > 0) {
      return {
        score: 1,
        reason: `Diff compacto e atômico (${lines} linhas modificadas).`,
        weight: this.weight,
      };
    }

    return {
      score: 0,
      reason: 'Sem alterações em código executável ou diff vazio.',
      weight: this.weight,
    };
  }
}

function isBenignDocAsset(norm: string): boolean {
  const ext = path.extname(norm).toLowerCase();
  return ext === '.md' || ext === '.txt' || ext === '.json' || ext === '.png' || ext === '.svg' || ext === '.css';
}

function calibrateRiskProbabilities(finalScore: number): Record<number, number> {
  if (finalScore === 3) {
    return { 0: 0.02, 1: 0.08, 2: 0.25, 3: 0.65 };
  }
  if (finalScore === 2) {
    return { 0: 0.05, 1: 0.25, 2: 0.55, 3: 0.15 };
  }
  if (finalScore === 1) {
    return { 0: 0.20, 1: 0.65, 2: 0.12, 3: 0.03 };
  }
  return { 0: 0.95, 1: 0.05, 2: 0.0, 3: 0.0 };
}

function computeChoiceWeights<T extends string>(choices: T[], context?: Record<string, unknown>): Record<string, number> {
  const rawWeights: Record<string, number> = {};
  for (const c of choices) {
    rawWeights[c] = 1.0;
  }
  if (!context) {
    return rawWeights;
  }

  const ctxStr = JSON.stringify(context).toLowerCase();
  const blastRadius = typeof context.blastRadius === 'number' ? context.blastRadius : 0;
  const complexity = typeof context.complexity === 'string' ? context.complexity.toLowerCase() : '';
  const isCritical = blastRadius > 10 || complexity === 'high' || ctxStr.includes('critical') || ctxStr.includes('breaking');

  for (const c of choices) {
    const lower = c.toLowerCase();
    if (isCritical) {
      if (lower.includes('deep') || lower.includes('serial') || lower.includes('strict') || lower.includes('reject') || lower.includes('human')) {
        rawWeights[c] += 3.0;
      }
    } else {
      if (lower.includes('quick') || lower.includes('fast') || lower.includes('parallel') || lower.includes('auto') || lower.includes('approve')) {
        rawWeights[c] += 2.5;
      }
    }
    if (ctxStr.includes(lower)) {
      rawWeights[c] += 1.5;
    }
  }

  return rawWeights;
}

function isSecurityAssertion(lower: string): boolean {
  return lower.includes('autentica') || lower.includes('seguran') || lower.includes('auth') || lower.includes('security');
}

function isExportBreakageAssertion(lower: string): boolean {
  return lower.includes('quebra') || lower.includes('assinatura') || lower.includes('breaking') || lower.includes('export');
}

// ─── AstAnalyticalProvider (Local / Zero-Token / <5ms) ────────────────────────

class AstAnalyticalProvider {
  readonly securityHead: SecurityHead;
  readonly architectureHead: ArchitectureHead;
  readonly qualityHead: QualityHead;

  constructor() {
    this.securityHead = new SecurityHead();
    this.architectureHead = new ArchitectureHead();
    this.qualityHead = new QualityHead();
  }

  /**
   * Evaluates graduated risk score (0: Inocuous, 1: Low, 2: Medium, 3: Critical) via Multi-Head analysis.
   */
  evaluateRiskScore(filePath: string, graph?: CodebaseGraph | null, options?: EvaluationOptions): SystemOneScoreResult {
    const norm = toPosixPath(filePath);

    // Check durable learning store if planningDir is provided
    let appliedRule: SystemOneLearningRule | undefined;
    if (options?.planningDir) {
      const store = new SystemOneLearningStore(options.planningDir);
      appliedRule = store.getMatchingRule(norm);
    }

    // 0: Documentation, Markdown, assets or trivial configurations (if not overridden)
    if (!appliedRule && isBenignDocAsset(norm)) {
      const benignHeads = {
        security: { score: 0, reason: 'Arquivo estático/documentação', weight: 0.4 },
        architecture: { score: 0, reason: 'Sem acoplamento executável no grafo', weight: 0.4 },
        quality: { score: 0, reason: 'Sem lógica procedural ou de negócio', weight: 0.2 },
      };
      const probabilities = calibrateRiskProbabilities(0);
      return {
        score: 0,
        probabilities,
        confidence: 'high',
        source: 'ast_analytical',
        heads: benignHeads,
        entropy: computeShannonEntropy(probabilities),
      };
    }

    // Run specialized multi-head evaluations
    const sec = this.securityHead.evaluate(filePath, options);
    const arch = this.architectureHead.evaluate(filePath, graph, options);
    const qual = this.qualityHead.evaluate(filePath, options);

    // Auto-ingest closed-loop anti-patterns from .planning/intel/anti-patterns.json (Phase 31 Wave 3)
    let antiPatternWarning = '';
    if (options?.planningDir) {
      try {
        const patterns = queryAntiPatterns(options.planningDir, { file: norm });
        if (patterns.length > 0) {
          qual.score = Math.max(qual.score, 2);
          antiPatternWarning = `Histórico de ${patterns.length} falha(s)/anti-padrão(ões) reincidente(s) em anti-patterns.json (ex: ${patterns[0].lesson})`;
        }
      } catch {
        // Non-blocking
      }
    }

    // Weighted composite score with critical override
    const rawWeighted = sec.score * sec.weight + arch.score * arch.weight + qual.score * qual.weight;
    let finalScore = Math.round(rawWeighted);

    if (sec.score === 3 || arch.score === 3) {
      finalScore = Math.max(finalScore, 3);
    } else if (sec.score === 2 && arch.score === 2) {
      finalScore = Math.max(finalScore, 2);
    }

    let warning: string | undefined;
    if (antiPatternWarning) {
      warning = antiPatternWarning;
    }
    if (appliedRule) {
      if (appliedRule.forcedMinScore !== undefined && appliedRule.forcedMinScore > finalScore) {
        finalScore = Math.min(3, Math.max(0, appliedRule.forcedMinScore));
      }
      if (appliedRule.disallowAutoApprove) {
        const ruleMsg = `Regra de aprendizado ativa: auto-aprovação desabilitada para ${norm} (${appliedRule.reason})`;
        warning = warning ? `${warning}; ${ruleMsg}` : ruleMsg;
      }
    }

    const probabilities = calibrateRiskProbabilities(finalScore);
    const entropy = computeShannonEntropy(probabilities);
    let confidence: SystemOneConfidence = 'high';
    if (finalScore === 2 || entropy > 0.85) {
      confidence = 'med';
    }
    if (entropy > 0.95) {
      confidence = 'low';
    }

    return {
      score: finalScore,
      probabilities,
      confidence,
      warning,
      source: 'ast_analytical',
      heads: {
        security: sec,
        architecture: arch,
        quality: qual,
      },
      entropy,
      learningRule: appliedRule
        ? {
            pattern: appliedRule.pattern,
            reason: appliedRule.reason,
            disallowAutoApprove: appliedRule.disallowAutoApprove,
          }
        : undefined,
    };
  }

  /**
   * Evaluates continuous truth probability (Noul: 0.0 to 1.0) for a given assertion.
   */
  evaluateNoul(assertion: string, context?: EvaluationOptions & { filePath?: string; graph?: CodebaseGraph | null }): SystemOneNoulResult {
    const lower = assertion.toLowerCase();

    // Critical Interlock: If tests failed, acceptance/verification assertion is strictly 0.0
    if (context?.testsPassed === false && (lower.includes('accept') || lower.includes('pass') || lower.includes('verif') || lower.includes('critéri'))) {
      return {
        noul: 0.0,
        confidence: 'high',
        source: 'ast_analytical',
      };
    }

    // Security check assertions: "Esta alteração introduz ou altera lógica de autenticação/segurança?"
    if (isSecurityAssertion(lower)) {
      const diff = context?.diff || '';
      const hasSecuritySignals = /(password|secret|auth|token|jwt|crypto|permission|session|guard|credential)/i.test(diff);
      return {
        noul: hasSecuritySignals ? 0.92 : 0.05,
        confidence: 'high',
        source: 'ast_analytical',
      };
    }

    // Public contract breakage: "Esta alteração quebra a assinatura pública ou tipos exportados de APIs?"
    if (isExportBreakageAssertion(lower)) {
      const diff = context?.diff || '';
      const hasExportMutation = /-\s*export\s+(function|class|interface|type|const)/.test(diff);
      return {
        noul: hasExportMutation ? 0.88 : 0.08,
        confidence: 'high',
        source: 'ast_analytical',
      };
    }

    // Standard acceptance assertion (when tests are green or not failing)
    const baseTruth = context?.testsPassed ? 0.98 : 0.85;
    return {
      noul: baseTruth,
      confidence: context?.testsPassed ? 'high' : 'med',
      source: 'ast_analytical',
    };
  }

  /**
   * Contextual and calibrated categorical selection over a set of options with Shannon entropy.
   */
  evaluateChoice<T extends string>(choices: T[], context?: Record<string, unknown>): SystemOneChoiceResult<T> {
    if (choices.length === 0) {
      throw new Error('SystemOneEngine: choices array cannot be empty');
    }
    if (choices.length === 1) {
      const singleProb = { [choices[0]]: 1.0 } as Record<T, number>;
      return {
        choice: choices[0],
        probabilities: singleProb,
        confidence: 'high',
        source: 'ast_analytical',
        entropy: 0.0,
      };
    }

    const rawWeights = computeChoiceWeights(choices, context);
    const totalWeight = Object.values(rawWeights).reduce((a, b) => a + b, 0);
    const probabilities = {} as Record<T, number>;
    let bestChoice = choices[0];
    let maxProb = -1;

    for (const c of choices) {
      const prob = Number((rawWeights[c] / totalWeight).toFixed(4));
      probabilities[c] = prob;
      if (prob > maxProb) {
        maxProb = prob;
        bestChoice = c;
      }
    }

    const entropy = computeShannonEntropy(probabilities);
    let confidence: SystemOneConfidence = 'med';
    if (context) {
      if (maxProb >= 0.5 || entropy < 0.65) {
        confidence = 'high';
      } else if (entropy > 0.85) {
        confidence = 'low';
      }
    }

    return {
      choice: bestChoice,
      probabilities,
      confidence,
      source: 'ast_analytical',
      entropy,
    };
  }

  /**
   * Re-ranks items using Hybrid Reciprocal Rank Fusion (RRF) combining
   * AST dependency PageRank centrality and Okapi BM25 lexical code similarity (Laya parity).
   */
  reRankItems<T extends SystemOneReRankItem>(items: T[], targetFiles: string[], graph?: CodebaseGraph | null): SystemOneReRankResult<T> {
    if (items.length === 0) {
      return {
        items: [],
        relevanceScores: {},
        averageRelevance: 100.0,
        confidence: 'high',
        source: 'ast_analytical',
      };
    }

    const targetSet = new Set(targetFiles.map(f => toPosixPath(f)));
    const targetTokens = new Set<string>();
    for (const tf of targetFiles) {
      for (const tok of tokenize(tf)) {
        targetTokens.add(tok.toLowerCase());
      }
    }

    interface CandidateMetric {
      item: T;
      key: string;
      isTarget: boolean;
      prScore: number;
      lexicalScore: number;
    }

    const candidates: CandidateMetric[] = items.map((item) => {
      const key = item.file || item.name || item.id || JSON.stringify(item);
      let pr = 0;
      let isTarget = false;

      if (item.file) {
        const norm = toPosixPath(item.file);
        const relNorm = path.isAbsolute(item.file) ? toPosixPath(path.relative(process.cwd(), item.file)) : norm;
        pr = (graph?.pageRankScores?.[norm] || graph?.pageRankScores?.[relNorm]) ?? 0;
        isTarget = targetSet.has(norm) || targetSet.has(relNorm);
      }

      const itemTokens = tokenize(key);
      let matchingCount = 0;
      for (const t of itemTokens) {
        if (targetTokens.has(t.toLowerCase())) {
          matchingCount++;
        }
      }
      const lexicalScore = itemTokens.length > 0 ? (matchingCount / itemTokens.length) : 0;

      return {
        item,
        key,
        isTarget,
        prScore: isTarget ? 1.0 : pr,
        lexicalScore: isTarget ? 1.0 : lexicalScore,
      };
    });

    const topoRanks = new Map<string, number>();
    const byTopo = [...candidates].sort((a, b) => b.prScore - a.prScore);
    byTopo.forEach((c, idx) => topoRanks.set(c.key, idx + 1));

    const lexRanks = new Map<string, number>();
    const byLex = [...candidates].sort((a, b) => b.lexicalScore - a.lexicalScore);
    byLex.forEach((c, idx) => lexRanks.set(c.key, idx + 1));

    const scores: Record<string, number> = {};
    let totalScore = 0;
    const maxRrf = computeRrfScore(1, 1);

    for (const c of candidates) {
      if (c.isTarget) {
        scores[c.key] = 99.0;
        totalScore += 99.0;
        continue;
      }

      const rTopo = topoRanks.get(c.key) || candidates.length;
      const rLex = lexRanks.get(c.key) || candidates.length;
      const rrf = computeRrfScore(rTopo, rLex);

      const rrfRatio = Math.min(1.0, rrf / maxRrf);
      const prBonus = c.prScore > 0 ? Math.min(15.0, c.prScore * 100.0) : 0;
      const calculatedScore = Math.min(95.0, 70.0 + rrfRatio * 20.0 + prBonus);

      const finalItemScore = Number(calculatedScore.toFixed(1));
      scores[c.key] = finalItemScore;
      totalScore += finalItemScore;
    }

    const sorted = [...items].sort((a, b) => {
      const keyA = a.file || a.name || a.id || JSON.stringify(a);
      const keyB = b.file || b.name || b.id || JSON.stringify(b);
      return (scores[keyB] || 0) - (scores[keyA] || 0);
    });

    const avg = Number((totalScore / items.length).toFixed(1));

    return {
      items: sorted,
      relevanceScores: scores,
      averageRelevance: avg,
      confidence: 'high',
      source: 'ast_analytical',
    };
  }
}

// ─── Native Agent CLI Runtime Detection & Rate Guard ─────────────────────────

function detectActiveRuntime(): 'antigravity' | 'gemini' | 'claude' | 'generic' {
  if (process.env['ANTIGRAVITY_SESSION_ID'] || process.env['ANTIGRAVITY_API_KEY']) {
    return 'antigravity';
  }
  if (process.env['GEMINI_SESSION_ID'] || process.env['GEMINI_API_KEY']) {
    return 'gemini';
  }
  if (process.env['CLAUDE_SESSION_ID'] || process.env['CLAUDE_CODE_SESSION_ID']) {
    return 'claude';
  }
  const gsdRuntime = process.env['GSD_RUNTIME'];
  if (gsdRuntime === 'antigravity' || gsdRuntime === 'gemini' || gsdRuntime === 'claude') {
    return gsdRuntime;
  }
  return 'generic';
}

class SlidingWindowRateGuard {
  readonly windowMs: number;
  readonly maxRequests: number;
  private timestamps: number[] = [];

  constructor(windowMs = 60000, maxRequests = 10) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  checkAndRecord(): boolean {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    this.timestamps = this.timestamps.filter((t) => t > cutoff);

    if (this.timestamps.length >= this.maxRequests) {
      return false;
    }

    this.timestamps.push(now);
    return true;
  }

  getCurrentUsage(): { count: number; max: number; resetMs: number } {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    this.timestamps = this.timestamps.filter((t) => t > cutoff);
    const oldest = this.timestamps[0] || now;
    const resetMs = Math.max(0, this.windowMs - (now - oldest));
    return { count: this.timestamps.length, max: this.maxRequests, resetMs };
  }

  reset(): void {
    this.timestamps = [];
  }
}

// ─── UserRuntimeSemanticProvider (Defensive / Sovereign User Runtime) ─────────

class UserRuntimeSemanticProvider {
  private astProvider: AstAnalyticalProvider;
  readonly rateGuard: SlidingWindowRateGuard;

  constructor(astProvider: AstAnalyticalProvider, rateGuard?: SlidingWindowRateGuard) {
    this.astProvider = astProvider;
    this.rateGuard = rateGuard || new SlidingWindowRateGuard(60000, 10);
  }

  private getDefaultDispatcher(): ((prompt: string) => Promise<string>) {
    const runtime = detectActiveRuntime();
    return () => Promise.reject(new Error(`Nenhum dispatcher de LLM injetado para o runtime '${runtime}'.`));
  }

  /**
   * Executes a semantic decision with an active, non-blocking warning fallback.
   */
  async evaluateSemanticScore(
    filePath: string,
    graph?: CodebaseGraph | null,
    options?: EvaluationOptions
  ): Promise<SystemOneScoreResult> {
    try {
      if (!options?.useSemantic) {
        return this.astProvider.evaluateRiskScore(filePath, graph, options);
      }

      if (!this.rateGuard.checkAndRecord()) {
        const usage = this.rateGuard.getCurrentUsage();
        const warning = `[System-One] Rate Guard ativado: limite de taxa excedido (${usage.count}/${usage.max} req/min). Recorrendo ao provedor analítico AST determinístico.`;
        const fallbackResult = this.astProvider.evaluateRiskScore(filePath, graph, options);
        return {
          ...fallbackResult,
          warning,
          source: 'fallback',
        };
      }

      const dispatcher = options.semanticDispatcher || this.getDefaultDispatcher();

      const prompt = `SystemOne Score Task:\nFile: ${filePath}\nDiff: ${options.diff?.slice(0, 1000) || 'none'}\nReturn single digit score 0..3:`;
      const timeoutPromise = new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('Semantic provider timeout')), options.semanticTimeoutMs || 3000)
      );

      const raw = await Promise.race([dispatcher(prompt), timeoutPromise]);
      const match = raw.match(/[0-3]/);
      if (!match) {
        throw new Error(`Invalid semantic response: ${raw}`);
      }

      const score = parseInt(match[0], 10);
      const probabilities: Record<number, number> = { 0: 0.05, 1: 0.1, 2: 0.15, 3: 0.1 };
      probabilities[score] = 0.7;

      return {
        score,
        probabilities,
        confidence: 'high',
        source: 'user_runtime_semantic',
        entropy: computeShannonEntropy(probabilities),
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const fallbackResult = this.astProvider.evaluateRiskScore(filePath, graph, options);
      const warning = `[System-One] Fallback ativado: aviso de falha do motor de decisão (${msg}). Recorrendo ao provedor analítico AST determinístico.`;
      return {
        ...fallbackResult,
        warning,
        source: 'fallback',
      };
    }
  }

  /**
   * Executes a semantic Noul truth assessment with fail-safe fallback and warning.
   */
  async evaluateSemanticNoul(
    assertion: string,
    context?: EvaluationOptions & { filePath?: string; graph?: CodebaseGraph | null }
  ): Promise<SystemOneNoulResult> {
    try {
      if (!context?.useSemantic) {
        return this.astProvider.evaluateNoul(assertion, context);
      }

      // Hard gate: If tests failed, acceptance cannot pass even semantically
      if (context.testsPassed === false) {
        return {
          noul: 0.0,
          confidence: 'high',
          source: 'user_runtime_semantic',
        };
      }

      if (!this.rateGuard.checkAndRecord()) {
        const usage = this.rateGuard.getCurrentUsage();
        const warning = `[System-One] Rate Guard ativado: limite de taxa excedido (${usage.count}/${usage.max} req/min). Recorrendo ao provedor analítico AST determinístico.`;
        const fallbackResult = this.astProvider.evaluateNoul(assertion, context);
        return {
          ...fallbackResult,
          warning,
          source: 'fallback',
        };
      }

      const dispatcher = context.semanticDispatcher || this.getDefaultDispatcher();

      const prompt = `SystemOne Noul Task:\nAssertion: ${assertion}\nContext: ${context.diff?.slice(0, 1000) || 'none'}\nReturn probability 0.0 to 1.0:`;
      const timeoutPromise = new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('Semantic provider timeout')), context.semanticTimeoutMs || 3000)
      );

      const raw = await Promise.race([dispatcher(prompt), timeoutPromise]);
      const match = raw.match(/([01](?:\.\d+)?)/);
      if (!match) {
        throw new Error(`Invalid semantic response: ${raw}`);
      }

      const noul = Math.min(1.0, Math.max(0.0, parseFloat(match[1])));
      return {
        noul,
        confidence: noul >= 0.9 || noul <= 0.1 ? 'high' : 'med',
        source: 'user_runtime_semantic',
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const fallbackResult = this.astProvider.evaluateNoul(assertion, context);
      const warning = `[System-One] Fallback ativado: aviso de falha do motor de decisão (${msg}). Recorrendo ao provedor analítico AST determinístico.`;
      return {
        ...fallbackResult,
        warning,
        source: 'fallback',
      };
    }
  }

  /**
   * Executes a semantic categorical choice with fail-safe fallback and warning.
   */
  async evaluateSemanticChoice<T extends string>(
    choices: T[],
    context?: Record<string, unknown> & EvaluationOptions
  ): Promise<SystemOneChoiceResult<T>> {
    try {
      if (!context?.useSemantic) {
        return this.astProvider.evaluateChoice(choices, context);
      }

      if (choices.length <= 1) {
        return this.astProvider.evaluateChoice(choices, context);
      }

      if (!this.rateGuard.checkAndRecord()) {
        const usage = this.rateGuard.getCurrentUsage();
        const warning = `[System-One] Rate Guard ativado: limite de taxa excedido (${usage.count}/${usage.max} req/min). Recorrendo ao provedor analítico AST determinístico.`;
        const fallbackResult = this.astProvider.evaluateChoice(choices, context);
        return {
          ...fallbackResult,
          warning,
          source: 'fallback',
        };
      }

      const dispatcher = context.semanticDispatcher || this.getDefaultDispatcher();

      const prompt = `SystemOne Choice Task:\nChoices: [${choices.join(', ')}]\nContext: ${JSON.stringify(context || {}).slice(0, 1000)}\nSelect exactly one choice:`;
      const timeoutPromise = new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('Semantic provider timeout')), context.semanticTimeoutMs || 3000)
      );

      const raw = await Promise.race([dispatcher(prompt), timeoutPromise]);
      const trimmed = raw.trim();

      const matchedChoice = choices.find((c) => new RegExp(`\\b${escapeRegex(c)}\\b`, 'i').test(trimmed));
      if (!matchedChoice) {
        throw new Error(`Semantic response "${trimmed}" did not match any allowed choice [${choices.join(', ')}]`);
      }

      const probabilities = {} as Record<T, number>;
      const remainder = Number((0.2 / Math.max(1, choices.length - 1)).toFixed(4));
      for (const c of choices) {
        probabilities[c] = c === matchedChoice ? 0.8 : remainder;
      }

      const entropy = computeShannonEntropy(probabilities);

      return {
        choice: matchedChoice,
        probabilities,
        confidence: 'high',
        source: 'user_runtime_semantic',
        entropy,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const fallbackResult = this.astProvider.evaluateChoice(choices, context);
      const warning = `[System-One] Fallback ativado: aviso de falha do motor de decisão (${msg}). Recorrendo ao provedor analítico AST determinístico.`;
      return {
        ...fallbackResult,
        warning,
        source: 'fallback',
      };
    }
  }
}

// ─── Engine Singleton & High-Level API ────────────────────────────────────────

class SystemOneEngine {
  readonly analytical: AstAnalyticalProvider;
  readonly semantic: UserRuntimeSemanticProvider;

  constructor() {
    this.analytical = new AstAnalyticalProvider();
    this.semantic = new UserRuntimeSemanticProvider(this.analytical);
  }

  private logDecision(
    planningDir: string | undefined,
    decision: {
      decisionType: string;
      target?: string;
      verdict: unknown;
      confidence: string;
      entropy?: number;
      latencyMs: number;
      source: string;
      details?: Record<string, unknown>;
    }
  ): void {
    if (!planningDir) return;
    try {
      const logger = new SessionLogger({ planningDir });
      logger.logSystemOneDecision(decision);
    } catch {
      // Non-blocking telemetry emission
    }
  }

  /**
   * Classifies regression risk for a file or diff.
   */
  async classifyRisk(filePath: string, options?: EvaluationOptions): Promise<SystemOneScoreResult> {
    const startTime = Date.now();
    let graph: CodebaseGraph | null = null;
    if (options?.planningDir) {
      graph = loadCodebaseGraph(options.planningDir);
    }
    if (!graph && options?.rootDir) {
      graph = buildCodebaseGraph(options.rootDir);
    }

    let result: SystemOneScoreResult;
    if (options?.useSemantic) {
      result = await this.semantic.evaluateSemanticScore(filePath, graph, options);
    } else {
      result = this.analytical.evaluateRiskScore(filePath, graph, options);
    }

    this.logDecision(options?.planningDir, {
      decisionType: 'risk_score',
      target: filePath,
      verdict: result.score,
      confidence: result.confidence,
      entropy: result.entropy,
      latencyMs: Date.now() - startTime,
      source: result.source,
      details: { heads: result.heads, learningRule: result.learningRule },
    });

    return result;
  }

  /**
   * Evaluates continuous truth value for an acceptance or safety assertion.
   */
  async evaluateAssertion(
    assertion: string,
    context?: EvaluationOptions & { filePath?: string }
  ): Promise<SystemOneNoulResult> {
    const startTime = Date.now();
    let graph: CodebaseGraph | null = null;
    if (context?.planningDir) {
      graph = loadCodebaseGraph(context.planningDir);
    }
    if (!graph && context?.rootDir) {
      graph = buildCodebaseGraph(context.rootDir);
    }

    let result: SystemOneNoulResult;
    if (context?.useSemantic) {
      result = await this.semantic.evaluateSemanticNoul(assertion, { ...context, graph });
    } else {
      result = this.analytical.evaluateNoul(assertion, { ...context, graph });
    }

    this.logDecision(context?.planningDir, {
      decisionType: 'noul_truth',
      target: assertion,
      verdict: result.noul,
      confidence: result.confidence,
      latencyMs: Date.now() - startTime,
      source: result.source,
      details: { filePath: context?.filePath },
    });

    return result;
  }

  /**
   * Synchronous risk classification via deterministic AST analytics (<5ms, zero tokens).
   */
  classifyRiskSync(filePath: string, options?: EvaluationOptions): SystemOneScoreResult {
    const startTime = Date.now();
    let graph: CodebaseGraph | null = null;
    if (options?.planningDir) {
      graph = loadCodebaseGraph(options.planningDir);
    }
    if (!graph && options?.rootDir) {
      graph = buildCodebaseGraph(options.rootDir);
    }
    const result = this.analytical.evaluateRiskScore(filePath, graph, options);

    this.logDecision(options?.planningDir, {
      decisionType: 'risk_score',
      target: filePath,
      verdict: result.score,
      confidence: result.confidence,
      entropy: result.entropy,
      latencyMs: Date.now() - startTime,
      source: result.source,
      details: { heads: result.heads, learningRule: result.learningRule },
    });

    return result;
  }

  /**
   * Synchronous assertion evaluation via deterministic AST analytics (<5ms, zero tokens).
   */
  evaluateAssertionSync(
    assertion: string,
    context?: EvaluationOptions & { filePath?: string }
  ): SystemOneNoulResult {
    const startTime = Date.now();
    let graph: CodebaseGraph | null = null;
    if (context?.planningDir) {
      graph = loadCodebaseGraph(context.planningDir);
    }
    if (!graph && context?.rootDir) {
      graph = buildCodebaseGraph(context.rootDir);
    }
    const result = this.analytical.evaluateNoul(assertion, { ...context, graph });

    this.logDecision(context?.planningDir, {
      decisionType: 'noul_truth',
      target: assertion,
      verdict: result.noul,
      confidence: result.confidence,
      latencyMs: Date.now() - startTime,
      source: result.source,
      details: { filePath: context?.filePath },
    });

    return result;
  }

  /**
   * Selects an option from a categorical set via contextual heuristic.
   */
  choose<T extends string>(choices: T[], context?: Record<string, unknown>): SystemOneChoiceResult<T> {
    const startTime = Date.now();
    const result = this.analytical.evaluateChoice(choices, context);
    const planningDir = typeof context?.planningDir === 'string' ? context.planningDir : undefined;

    this.logDecision(planningDir, {
      decisionType: 'categorical_choice',
      verdict: result.choice,
      confidence: result.confidence,
      entropy: result.entropy,
      latencyMs: Date.now() - startTime,
      source: result.source,
    });

    return result;
  }

  /**
   * Selects an option from a categorical set with semantic LLM evaluation and fallback.
   */
  async chooseSemantic<T extends string>(
    choices: T[],
    context?: Record<string, unknown> & EvaluationOptions
  ): Promise<SystemOneChoiceResult<T>> {
    const startTime = Date.now();
    const result = await this.semantic.evaluateSemanticChoice(choices, context);
    const planningDir = typeof context?.planningDir === 'string' ? context.planningDir : undefined;

    this.logDecision(planningDir, {
      decisionType: 'categorical_choice',
      verdict: result.choice,
      confidence: result.confidence,
      entropy: result.entropy,
      latencyMs: Date.now() - startTime,
      source: result.source,
    });

    return result;
  }

  /**
   * Re-ranks items (e.g. AST neighbors, types, decisions) according to Modo B — Qualidade Máxima.
   */
  reRankForJit<T extends SystemOneReRankItem>(
    items: T[],
    targetFiles: string[],
    options?: { planningDir?: string; rootDir?: string }
  ): SystemOneReRankResult<T> {
    const startTime = Date.now();
    let graph: CodebaseGraph | null = null;
    if (options?.planningDir) {
      graph = loadCodebaseGraph(options.planningDir);
    }
    if (!graph && options?.rootDir) {
      graph = buildCodebaseGraph(options.rootDir);
    }

    const result = this.analytical.reRankItems(items, targetFiles, graph);

    this.logDecision(options?.planningDir, {
      decisionType: 'rerank',
      verdict: result.items.length,
      confidence: result.confidence,
      latencyMs: Date.now() - startTime,
      source: result.source,
      details: { averageRelevance: result.averageRelevance, targetFiles },
    });

    return result;
  }
}

/**
 * Records a durable user manual override in the local Learning Store.
 */
function recordUserOverride(
  targetFile: string,
  reason = 'User manual override',
  planningDir?: string
): void {
  const store = new SystemOneLearningStore(planningDir);
  store.recordOverride(targetFile, reason, 3, true);
}

// Global Singleton Export
const defaultEngine = new SystemOneEngine();

export = {
  SystemOneEngine,
  AstAnalyticalProvider,
  UserRuntimeSemanticProvider,
  SecurityHead,
  ArchitectureHead,
  QualityHead,
  SystemOneLearningStore,
  SlidingWindowRateGuard,
  detectActiveRuntime,
  computeShannonEntropy,
  computeRrfScore,
  recordUserOverride,
  defaultEngine,
  classifyRisk: defaultEngine.classifyRisk.bind(defaultEngine),
  classifyRiskSync: defaultEngine.classifyRiskSync.bind(defaultEngine),
  evaluateAssertion: defaultEngine.evaluateAssertion.bind(defaultEngine),
  evaluateAssertionSync: defaultEngine.evaluateAssertionSync.bind(defaultEngine),
  choose: defaultEngine.choose.bind(defaultEngine),
  chooseSemantic: defaultEngine.chooseSemantic.bind(defaultEngine),
  reRankForJit: defaultEngine.reRankForJit.bind(defaultEngine),
};
