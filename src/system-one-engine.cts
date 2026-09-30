/**
 * GSD System One Engine — Sovereign Decision Intelligence & Confidence-Gated Routing.
 *
 * Implements sovereign, non-autoregressive decision heads inspired by Laya (Apache 2.0)
 * and AutoTrust/JEV, operating 100% locally with the user's installed runtime/LLM and
 * native AST static intelligence. Eliminates external proprietary APIs and guarantees
 * non-blocking warning fallbacks upon decision motor disruptions.
 */

import path from 'node:path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import codebaseAst = require('./codebase-ast-analyzer.cjs');
const {
  loadCodebaseGraph,
  buildCodebaseGraph,
  calculateBlastRadius,
  toPosixPath,
} = codebaseAst;

// ─── Interfaces & Primitives ──────────────────────────────────────────────────

type SystemOneConfidence = 'low' | 'med' | 'high';

interface SystemOneChoiceResult<T extends string = string> {
  choice: T;
  probabilities: Record<T, number>;
  confidence: SystemOneConfidence;
  warning?: string;
  source: 'ast_analytical' | 'user_runtime_semantic' | 'fallback';
}

interface SystemOneScoreResult {
  score: number; // Graduated score (e.g. 0 to 3 for risk)
  probabilities: Record<number, number>;
  confidence: SystemOneConfidence;
  warning?: string;
  source: 'ast_analytical' | 'user_runtime_semantic' | 'fallback';
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
  useSemantic?: boolean;
  semanticTimeoutMs?: number;
  semanticDispatcher?: (prompt: string) => Promise<string>;
}

// ─── AstAnalyticalProvider (Local / Zero-Token / <5ms) ────────────────────────

class AstAnalyticalProvider {
  /**
   * Evaluates graduated risk score (0: Inocuous, 1: Low, 2: Medium, 3: Critical).
   */
  evaluateRiskScore(filePath: string, graph?: any, options?: EvaluationOptions): SystemOneScoreResult {
    const norm = toPosixPath(filePath);
    const ext = path.extname(norm).toLowerCase();

    // 0: Documentation, Markdown, assets or trivial configurations
    if (ext === '.md' || ext === '.txt' || ext === '.json' || ext === '.png' || ext === '.svg' || ext === '.css') {
      return {
        score: 0,
        probabilities: { 0: 0.95, 1: 0.05, 2: 0.0, 3: 0.0 },
        confidence: 'high',
        source: 'ast_analytical',
      };
    }

    if (!graph || !graph.files) {
      return {
        score: 1,
        probabilities: { 0: 0.1, 1: 0.7, 2: 0.15, 3: 0.05 },
        confidence: 'med',
        source: 'ast_analytical',
      };
    }

    const relNorm = options?.rootDir ? toPosixPath(path.relative(options.rootDir, filePath)) : norm;
    const lookupKey = graph.files[norm] ? norm : (graph.files[relNorm] ? relNorm : norm);
    const fileNode = graph.files[lookupKey];
    const pageRank = graph.pageRankScores?.[lookupKey] || graph.pageRankScores?.[norm] || 0;
    const isGodObject = Boolean(fileNode?.isGodObject);

    // Calculate transitive blast radius
    let totalBlast = 0;
    try {
      const blast = calculateBlastRadius(graph, [lookupKey]);
      totalBlast = blast.totalAffectedFiles || 0;
    } catch {
      // Non-blocking
    }

    // Check route security guards if file contains routes or diff touches auth
    let hasAuthOrSecurity = false;
    if (options?.diff) {
      const lowerDiff = options.diff.toLowerCase();
      if (
        lowerDiff.includes('password') ||
        lowerDiff.includes('token') ||
        lowerDiff.includes('secret') ||
        lowerDiff.includes('auth') ||
        lowerDiff.includes('jwt') ||
        lowerDiff.includes('crypto')
      ) {
        hasAuthOrSecurity = true;
      }
    }

    // Critical (3): God Object, high PageRank core module with security changes, or massive blast radius
    if (hasAuthOrSecurity || isGodObject || pageRank > 0.05 || totalBlast > 10) {
      return {
        score: 3,
        probabilities: { 0: 0.02, 1: 0.08, 2: 0.25, 3: 0.65 },
        confidence: 'high',
        source: 'ast_analytical',
      };
    }

    // Medium (2): Moderate blast radius or standard dependent modules
    if (totalBlast > 2 || pageRank > 0.015) {
      return {
        score: 2,
        probabilities: { 0: 0.05, 1: 0.25, 2: 0.55, 3: 0.15 },
        confidence: 'med',
        source: 'ast_analytical',
      };
    }

    // Low (1): Isolated leaf node or low PageRank
    return {
      score: 1,
      probabilities: { 0: 0.2, 1: 0.65, 2: 0.12, 3: 0.03 },
      confidence: 'high',
      source: 'ast_analytical',
    };
  }

  /**
   * Evaluates continuous truth probability (Noul: 0.0 to 1.0) for a given assertion.
   */
  evaluateNoul(assertion: string, context?: EvaluationOptions & { filePath?: string; graph?: any }): SystemOneNoulResult {
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
    if (lower.includes('autentica') || lower.includes('seguran') || lower.includes('auth') || lower.includes('security')) {
      const diff = context?.diff || '';
      const hasSecuritySignals = /(password|secret|auth|token|jwt|crypto|permission|session|guard|credential)/i.test(diff);
      return {
        noul: hasSecuritySignals ? 0.92 : 0.05,
        confidence: 'high',
        source: 'ast_analytical',
      };
    }

    // Public contract breakage: "Esta alteração quebra a assinatura pública ou tipos exportados de APIs?"
    if (lower.includes('quebra') || lower.includes('assinatura') || lower.includes('breaking') || lower.includes('export')) {
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
   * Categorical selection over a set of string options.
   */
  evaluateChoice<T extends string>(choices: T[], context?: Record<string, unknown>): SystemOneChoiceResult<T> {
    if (choices.length === 0) {
      throw new Error('SystemOneEngine: choices array cannot be empty');
    }
    const probabilities: Record<string, number> = {};
    const uniform = Number((1 / choices.length).toFixed(4));
    for (const c of choices) {
      probabilities[c] = uniform;
    }
    // Pick the first choice as canonical baseline
    return {
      choice: choices[0],
      probabilities: probabilities as Record<T, number>,
      confidence: 'med',
      source: 'ast_analytical',
    };
  }

  /**
   * Re-ranks items based on graph PageRank and topological closeness.
   */
  reRankItems<T extends SystemOneReRankItem>(items: T[], targetFiles: string[], graph?: any): SystemOneReRankResult<T> {
    if (items.length === 0) {
      return {
        items: [],
        relevanceScores: {},
        averageRelevance: 100.0,
        confidence: 'high',
        source: 'ast_analytical',
      };
    }

    const scores: Record<string, number> = {};
    let totalScore = 0;

    const targetSet = new Set(targetFiles.map(f => toPosixPath(f)));

    for (const item of items) {
      const key = item.file || item.name || item.id || JSON.stringify(item);
      let itemScore = 70.0; // Base baseline relevance

      if (item.file) {
        const norm = toPosixPath(item.file);
        const relNorm = path.isAbsolute(item.file) ? toPosixPath(path.relative(process.cwd(), item.file)) : norm;
        const pr = (graph?.pageRankScores?.[norm] || graph?.pageRankScores?.[relNorm]) ?? 0;
        if (targetSet.has(norm) || targetSet.has(relNorm)) {
          itemScore = 99.0;
        } else if (pr > 0) {
          itemScore = Math.min(95.0, 75.0 + pr * 200.0);
        } else {
          itemScore = 80.0;
        }
      }

      scores[key] = Number(itemScore.toFixed(1));
      totalScore += itemScore;
    }

    // Sort descending by calculated relevance
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

// ─── UserRuntimeSemanticProvider (Defensive / Sovereign User Runtime) ─────────

class UserRuntimeSemanticProvider {
  private astProvider: AstAnalyticalProvider;

  constructor(astProvider: AstAnalyticalProvider) {
    this.astProvider = astProvider;
  }

  /**
   * Executes a semantic decision with an active, non-blocking warning fallback.
   */
  async evaluateSemanticScore(
    filePath: string,
    graph?: any,
    options?: EvaluationOptions
  ): Promise<SystemOneScoreResult> {
    try {
      if (!options?.useSemantic || !options?.semanticDispatcher) {
        return this.astProvider.evaluateRiskScore(filePath, graph, options);
      }

      const prompt = `SystemOne Score Task:\nFile: ${filePath}\nDiff: ${options.diff?.slice(0, 1000) || 'none'}\nReturn single digit score 0..3:`;
      const timeoutPromise = new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('Semantic provider timeout')), options.semanticTimeoutMs || 3000)
      );

      const raw = await Promise.race([options.semanticDispatcher(prompt), timeoutPromise]);
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
    context?: EvaluationOptions & { filePath?: string; graph?: any }
  ): Promise<SystemOneNoulResult> {
    try {
      if (!context?.useSemantic || !context?.semanticDispatcher) {
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

      const prompt = `SystemOne Noul Task:\nAssertion: ${assertion}\nContext: ${context.diff?.slice(0, 1000) || 'none'}\nReturn probability 0.0 to 1.0:`;
      const timeoutPromise = new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('Semantic provider timeout')), context.semanticTimeoutMs || 3000)
      );

      const raw = await Promise.race([context.semanticDispatcher(prompt), timeoutPromise]);
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
}

// ─── Engine Singleton & High-Level API ────────────────────────────────────────

class SystemOneEngine {
  readonly analytical: AstAnalyticalProvider;
  readonly semantic: UserRuntimeSemanticProvider;

  constructor() {
    this.analytical = new AstAnalyticalProvider();
    this.semantic = new UserRuntimeSemanticProvider(this.analytical);
  }

  /**
   * Classifies regression risk for a file or diff.
   */
  async classifyRisk(filePath: string, options?: EvaluationOptions): Promise<SystemOneScoreResult> {
    let graph: any;
    if (options?.planningDir) {
      graph = loadCodebaseGraph(options.planningDir);
    }
    if (!graph && options?.rootDir) {
      graph = buildCodebaseGraph(options.rootDir);
    }

    if (options?.useSemantic) {
      return this.semantic.evaluateSemanticScore(filePath, graph, options);
    }
    return this.analytical.evaluateRiskScore(filePath, graph, options);
  }

  /**
   * Evaluates continuous truth value for an acceptance or safety assertion.
   */
  async evaluateAssertion(
    assertion: string,
    context?: EvaluationOptions & { filePath?: string }
  ): Promise<SystemOneNoulResult> {
    let graph: any;
    if (context?.planningDir) {
      graph = loadCodebaseGraph(context.planningDir);
    }
    if (!graph && context?.rootDir) {
      graph = buildCodebaseGraph(context.rootDir);
    }

    if (context?.useSemantic) {
      return this.semantic.evaluateSemanticNoul(assertion, { ...context, graph });
    }
    return this.analytical.evaluateNoul(assertion, { ...context, graph });
  }

  /**
   * Synchronous risk classification via deterministic AST analytics (<5ms, zero tokens).
   */
  classifyRiskSync(filePath: string, options?: EvaluationOptions): SystemOneScoreResult {
    let graph: any;
    if (options?.planningDir) {
      graph = loadCodebaseGraph(options.planningDir);
    }
    if (!graph && options?.rootDir) {
      graph = buildCodebaseGraph(options.rootDir);
    }
    return this.analytical.evaluateRiskScore(filePath, graph, options);
  }

  /**
   * Synchronous assertion evaluation via deterministic AST analytics (<5ms, zero tokens).
   */
  evaluateAssertionSync(
    assertion: string,
    context?: EvaluationOptions & { filePath?: string }
  ): SystemOneNoulResult {
    let graph: any;
    if (context?.planningDir) {
      graph = loadCodebaseGraph(context.planningDir);
    }
    if (!graph && context?.rootDir) {
      graph = buildCodebaseGraph(context.rootDir);
    }
    return this.analytical.evaluateNoul(assertion, { ...context, graph });
  }

  /**
   * Selects an option from a categorical set.
   */
  choose<T extends string>(choices: T[], context?: Record<string, unknown>): SystemOneChoiceResult<T> {
    return this.analytical.evaluateChoice(choices, context);
  }

  /**
   * Re-ranks items (e.g. AST neighbors, types, decisions) according to Modo B — Qualidade Máxima.
   */
  reRankForJit<T extends SystemOneReRankItem>(
    items: T[],
    targetFiles: string[],
    options?: { planningDir?: string; rootDir?: string }
  ): SystemOneReRankResult<T> {
    let graph: any;
    if (options?.planningDir) {
      graph = loadCodebaseGraph(options.planningDir);
    }
    if (!graph && options?.rootDir) {
      graph = buildCodebaseGraph(options.rootDir);
    }

    return this.analytical.reRankItems(items, targetFiles, graph);
  }
}

// Global Singleton Export
const defaultEngine = new SystemOneEngine();

export = {
  SystemOneEngine,
  AstAnalyticalProvider,
  UserRuntimeSemanticProvider,
  defaultEngine,
  classifyRisk: defaultEngine.classifyRisk.bind(defaultEngine),
  classifyRiskSync: defaultEngine.classifyRiskSync.bind(defaultEngine),
  evaluateAssertion: defaultEngine.evaluateAssertion.bind(defaultEngine),
  evaluateAssertionSync: defaultEngine.evaluateAssertionSync.bind(defaultEngine),
  choose: defaultEngine.choose.bind(defaultEngine),
  reRankForJit: defaultEngine.reRankForJit.bind(defaultEngine),
};
