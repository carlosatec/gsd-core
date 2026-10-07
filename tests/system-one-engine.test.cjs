/**
 * Tests for GSD System One Engine — Sovereign Decision Intelligence, Fallback Guards & Routing.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { cleanup, createTempProject } = require('./helpers.cjs');
const { SessionLogger } = require('../gsd-core/bin/lib/session-logger.cjs');
const systemOne = require('../gsd-core/bin/lib/system-one-engine.cjs');

describe('System One Engine — AstAnalyticalProvider (Primitivas AST)', () => {
  const { AstAnalyticalProvider } = systemOne;
  const provider = new AstAnalyticalProvider();

  test('classifies documentation and markdown files as Score 0 (Inocuous) with high confidence', () => {
    const res = provider.evaluateRiskScore('docs/ARCHITECTURE.md');
    assert.strictEqual(res.score, 0);
    assert.strictEqual(res.confidence, 'high');
    assert.strictEqual(res.source, 'ast_analytical');
    assert.ok(res.probabilities[0] >= 0.9);
  });

  test('classifies God Objects or modules with auth keywords as Score 3 (Critical)', () => {
    const mockGraph = {
      files: {
        'src/auth.ts': { filePath: 'src/auth.ts', isGodObject: false },
      },
      pageRankScores: { 'src/auth.ts': 0.08 },
    };
    const res = provider.evaluateRiskScore('src/auth.ts', mockGraph, { diff: '+ export function verifyJwtToken() {}' });
    assert.strictEqual(res.score, 3);
    assert.strictEqual(res.confidence, 'high');
    assert.ok(res.probabilities[3] > 0.5);
  });

  test('evaluates Noul truth probability for security changes', () => {
    const resAuth = provider.evaluateNoul('Esta alteração introduz ou altera lógica de segurança?', {
      diff: '+ const userPassword = hash(pwd);',
    });
    assert.ok(resAuth.noul >= 0.9, 'should detect security signals');

    const resClean = provider.evaluateNoul('Esta alteração introduz ou altera lógica de segurança?', {
      diff: '+ const title = "Hello World";',
    });
    assert.ok(resClean.noul <= 0.1, 'should not flag clean diff as security risk');
  });

  test('evaluates Noul truth probability for public contract breakage', () => {
    const resBreak = provider.evaluateNoul('Esta alteração quebra a assinatura pública de APIs?', {
      diff: '- export function fetchUserData(id: string): User',
    });
    assert.ok(resBreak.noul >= 0.85);

    const resNoBreak = provider.evaluateNoul('Esta alteração quebra a assinatura pública de APIs?', {
      diff: '+ // added comment',
    });
    assert.ok(resNoBreak.noul <= 0.15);
  });

  test('enforces hard interlock: Noul is strictly 0.0 if tests failed', () => {
    const res = provider.evaluateNoul('Todos os critérios de aceitação foram cumpridos?', {
      testsPassed: false,
    });
    assert.strictEqual(res.noul, 0.0);
    assert.strictEqual(res.confidence, 'high');
  });

  test('evaluates Choice primitive with uniform baseline distribution', () => {
    const res = provider.evaluateChoice(['APPROVE', 'REQUEST_CHANGES', 'DELEGATE_TO_USER']);
    assert.strictEqual(res.choice, 'APPROVE');
    assert.ok(res.probabilities['APPROVE'] > 0.3);
    assert.strictEqual(res.confidence, 'med');
  });
});

describe('System One Engine — UserRuntimeSemanticProvider & Fallback Warning Guard', () => {
  const { UserRuntimeSemanticProvider, AstAnalyticalProvider } = systemOne;
  const ast = new AstAnalyticalProvider();
  const semantic = new UserRuntimeSemanticProvider(ast);

  test('executes semantic score successfully when dispatcher succeeds', async () => {
    const res = await semantic.evaluateSemanticScore('src/service.ts', null, {
      useSemantic: true,
      semanticDispatcher: async () => '2',
    });
    assert.strictEqual(res.score, 2);
    assert.strictEqual(res.source, 'user_runtime_semantic');
    assert.strictEqual(res.warning, undefined);
  });

  test('FALLBACK & WARNING: catches runtime failure and falls back to AST with explicit warning', async () => {
    const res = await semantic.evaluateSemanticScore('src/service.ts', null, {
      useSemantic: true,
      semanticDispatcher: async () => {
        throw new Error('LLM connection refused (Ollama offline)');
      },
    });
    assert.strictEqual(res.source, 'fallback');
    assert.ok(res.warning, 'should have warning message');
    assert.ok(res.warning.includes('[System-One] Fallback ativado'), 'warning should follow standard format');
    assert.ok(res.warning.includes('Ollama offline'));
    assert.strictEqual(typeof res.score, 'number');
  });

  test('FALLBACK & WARNING: handles timeout in semantic evaluation gracefully', async () => {
    const res = await semantic.evaluateSemanticNoul('Critério UAT X satisfeito?', {
      useSemantic: true,
      semanticTimeoutMs: 50,
      semanticDispatcher: () => new Promise(() => {}),
    });
    assert.strictEqual(res.source, 'fallback');
    assert.ok(res.warning.includes('timeout'));
    assert.ok(typeof res.noul === 'number');
  });
});

describe('System One Engine — High-Level API & Re-ranking Quality-First', () => {
  test('reRankForJit re-ranks items and calculates average relevance score', () => {
    const items = [
      { file: 'src/unrelated.ts' },
      { file: 'src/target.ts' },
      { file: 'src/central.ts' },
    ];
    const { AstAnalyticalProvider } = systemOne;
    const provider = new AstAnalyticalProvider();
    const mockGraph = {
      files: {
        'src/central.ts': { filePath: 'src/central.ts' },
        'src/unrelated.ts': { filePath: 'src/unrelated.ts' },
      },
      pageRankScores: {
        'src/central.ts': 0.09,
        'src/unrelated.ts': 0.001,
      },
    };

    const result = provider.reRankItems(items, ['src/target.ts'], mockGraph);
    assert.strictEqual(result.items.length, 3);
    assert.strictEqual(result.items[0].file, 'src/target.ts', 'target file should be ranked highest');
    assert.ok(result.relevanceScores['src/target.ts'] >= 99.0);
    assert.ok(result.averageRelevance >= 70.0 && result.averageRelevance <= 100.0);
    assert.strictEqual(result.confidence, 'high');
  });
});

describe('System One Engine — Wave 1: Multi-Head Evaluators & Shannon Entropy (Jev & Laya Parity)', () => {
  const {
    SecurityHead,
    ArchitectureHead,
    QualityHead,
    computeShannonEntropy,
    AstAnalyticalProvider,
    UserRuntimeSemanticProvider,
    chooseSemantic,
  } = systemOne;

  test('computeShannonEntropy calculates normalized uncertainty correctly', () => {
    // Single or deterministic probability has 0 entropy
    assert.strictEqual(computeShannonEntropy({ 0: 1.0 }), 0.0);
    assert.strictEqual(computeShannonEntropy({ 0: 1.0, 1: 0.0 }), 0.0);

    // Completely uniform distribution across 4 options has maximum normalized entropy 1.0
    const uniformEntropy = computeShannonEntropy({ 0: 0.25, 1: 0.25, 2: 0.25, 3: 0.25 });
    assert.strictEqual(uniformEntropy, 1.0);

    // Skewed distribution has intermediate entropy
    const skewedEntropy = computeShannonEntropy({ 0: 0.9, 1: 0.05, 2: 0.03, 3: 0.02 });
    assert.ok(skewedEntropy > 0.0 && skewedEntropy < 0.6);
  });

  test('SecurityHead detects authentication and secret keywords', () => {
    const secHead = new SecurityHead();
    const repCritical = secHead.evaluate('src/auth.ts', { diff: '+ const jwtToken = sign(payload);' });
    assert.strictEqual(repCritical.score, 3);
    assert.strictEqual(repCritical.weight, 0.4);
    assert.ok(repCritical.reason.includes('Alterações sensíveis'));

    const repClean = secHead.evaluate('src/utils.ts', { diff: '+ const count = 1;' });
    assert.strictEqual(repClean.score, 0);
  });

  test('ArchitectureHead detects God Objects and breaking export signatures', () => {
    const archHead = new ArchitectureHead();
    const mockGraph = {
      files: {
        'src/core.ts': { filePath: 'src/core.ts', isGodObject: true },
      },
      pageRankScores: { 'src/core.ts': 0.06 },
    };
    const repGod = archHead.evaluate('src/core.ts', mockGraph, { diff: '- export function oldApi(): void' });
    assert.strictEqual(repGod.score, 3);
    assert.strictEqual(repGod.weight, 0.4);
    assert.ok(repGod.reason.includes('Módulo central de alto acoplamento'));
  });

  test('QualityHead evaluates LOC diff ratio', () => {
    const qualHead = new QualityHead();
    const bigDiff = Array(350).fill('+ console.log("line");').join('\n');
    const repBig = qualHead.evaluate('src/app.ts', { diff: bigDiff });
    assert.strictEqual(repBig.score, 3);
    assert.ok(repBig.reason.includes('Volume massivo'));

    const smallDiff = '+ console.log("one");\n+ console.log("two");';
    const repSmall = qualHead.evaluate('src/app.ts', { diff: smallDiff });
    assert.strictEqual(repSmall.score, 1);
  });

  test('evaluateRiskScore populates multi-head report breakdown and entropy', () => {
    const provider = new AstAnalyticalProvider();
    const res = provider.evaluateRiskScore('src/payment.ts', null, {
      diff: '+ const secretKey = getStripeKey();',
    });
    assert.ok(res.heads, 'should include heads report');
    assert.strictEqual(res.heads.security.score, 3);
    assert.strictEqual(res.score, 3);
    assert.strictEqual(typeof res.entropy, 'number');
    assert.ok(res.entropy >= 0 && res.entropy <= 1);
  });

  test('contextual evaluateChoice selects calibrated choices based on complexity and blast radius', () => {
    const provider = new AstAnalyticalProvider();
    const choices = ['quick', 'fast', 'deep'];

    // High complexity context should favor 'deep'
    const resDeep = provider.evaluateChoice(choices, { complexity: 'high', blastRadius: 15 });
    assert.strictEqual(resDeep.choice, 'deep');
    assert.ok(resDeep.probabilities['deep'] > resDeep.probabilities['quick']);
    assert.strictEqual(typeof resDeep.entropy, 'number');

    // Low complexity context should favor 'quick' or 'fast'
    const resQuick = provider.evaluateChoice(choices, { complexity: 'low', blastRadius: 1 });
    assert.ok(resQuick.choice === 'quick' || resQuick.choice === 'fast');
    assert.ok(resQuick.probabilities['quick'] > resQuick.probabilities['deep']);
  });

  test('evaluateSemanticChoice parses LLM choice and falls back safely upon error', async () => {
    const ast = new AstAnalyticalProvider();
    const semantic = new UserRuntimeSemanticProvider(ast);
    const choices = ['PARALLEL', 'SERIAL', 'HUMAN_INTERVENTION'];

    // Successful semantic choice
    const resSuccess = await semantic.evaluateSemanticChoice(choices, {
      useSemantic: true,
      semanticDispatcher: async () => 'PARALLEL',
    });
    assert.strictEqual(resSuccess.choice, 'PARALLEL');
    assert.strictEqual(resSuccess.source, 'user_runtime_semantic');
    assert.strictEqual(resSuccess.confidence, 'high');
    assert.ok(resSuccess.probabilities['PARALLEL'] >= 0.7);

    // Timeout or failure fallback
    const resFallback = await semantic.evaluateSemanticChoice(choices, {
      useSemantic: true,
      semanticTimeoutMs: 50,
      semanticDispatcher: () => new Promise(() => {}),
    });
    assert.strictEqual(resFallback.source, 'fallback');
    assert.ok(resFallback.warning.includes('timeout'));
    assert.ok(choices.includes(resFallback.choice));
  });

  test('high-level chooseSemantic delegates to semantic provider with fallback', async () => {
    const choices = ['A', 'B'];
    const res = await chooseSemantic(choices, {
      useSemantic: true,
      semanticDispatcher: async () => 'B',
    });
    assert.strictEqual(res.choice, 'B');
    assert.strictEqual(res.source, 'user_runtime_semantic');
  });
});

describe('System One Engine — Wave 2: Hybrid RRF Re-ranking (PageRank + Okapi BM25)', () => {
  const { computeRrfScore, AstAnalyticalProvider } = systemOne;

  test('computeRrfScore calculates reciprocal rank fusion deterministically', () => {
    const rrf11 = computeRrfScore(1, 1);
    assert.strictEqual(rrf11, 0.016393);

    const rrf15 = computeRrfScore(1, 5);
    assert.ok(rrf15 < rrf11);
    assert.ok(rrf15 > 0.01);

    const rrf1010 = computeRrfScore(10, 10);
    assert.ok(rrf1010 < rrf15);
  });

  test('reRankItems leverages RRF combining topological PageRank and lexical token overlap', () => {
    const provider = new AstAnalyticalProvider();
    const items = [
      { file: 'src/payment-gateway.ts' },
      { file: 'src/user-profile.ts' },
      { file: 'src/payment-crypto-service.ts' },
    ];

    const mockGraph = {
      files: {
        'src/payment-gateway.ts': { filePath: 'src/payment-gateway.ts' },
        'src/user-profile.ts': { filePath: 'src/user-profile.ts' },
        'src/payment-crypto-service.ts': { filePath: 'src/payment-crypto-service.ts' },
      },
      pageRankScores: {
        'src/payment-gateway.ts': 0.04,
        'src/user-profile.ts': 0.001,
        'src/payment-crypto-service.ts': 0.08,
      },
    };

    const result = provider.reRankItems(items, ['src/payment-security.ts'], mockGraph);

    assert.strictEqual(result.items.length, 3);
    assert.strictEqual(result.items[0].file, 'src/payment-crypto-service.ts');
    assert.strictEqual(result.items[2].file, 'src/user-profile.ts');
    assert.ok(result.relevanceScores['src/payment-crypto-service.ts'] > result.relevanceScores['src/user-profile.ts']);
  });
});

describe('System One Engine — Wave 3: Context Learning Store & Decision Firing Log', () => {
  const { SystemOneLearningStore, AstAnalyticalProvider, recordUserOverride, classifyRiskSync } = systemOne;

  test('SystemOneLearningStore loads empty rules initially and records overrides', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-test-so-learn-'));
    try {
      const store = new SystemOneLearningStore(tmpDir);
      assert.deepStrictEqual(store.loadRules(), []);

      store.recordOverride('src/security.cts', 'Declined in review', 3, true);
      const rules = store.loadRules();
      assert.strictEqual(rules.length, 1);
      assert.strictEqual(rules[0].pattern, 'src/security.cts');
      assert.strictEqual(rules[0].forcedMinScore, 3);
      assert.strictEqual(rules[0].disallowAutoApprove, true);

      const match = store.getMatchingRule('src/security.cts');
      assert.ok(match);
      assert.strictEqual(match.pattern, 'src/security.cts');

      const matchSub = store.getMatchingRule('c:/workspace/src/security.cts');
      assert.ok(matchSub);

      const globMatch = store.getMatchingRule('src/other.cts');
      assert.strictEqual(globMatch, undefined);
    } finally {
      cleanup(tmpDir);
    }
  });

  test('SystemOneLearningStore enforces FIFO retention ceiling of 100 rules', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-test-so-fifo-'));
    try {
      const store = new SystemOneLearningStore(tmpDir);
      for (let i = 0; i < 105; i++) {
        store.recordOverride(`file-${i}.ts`, `reason ${i}`);
      }
      const rules = store.loadRules();
      assert.strictEqual(rules.length, 100);
      assert.strictEqual(rules[0].pattern, 'file-5.ts');
      assert.strictEqual(rules[99].pattern, 'file-104.ts');
    } finally {
      cleanup(tmpDir);
    }
  });

  test('AstAnalyticalProvider respects learning store overrides and disables auto-approve', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-test-so-ast-'));
    try {
      const store = new SystemOneLearningStore(tmpDir);
      store.recordOverride('docs/README.md', 'User manual override', 3, true);

      const provider = new AstAnalyticalProvider();
      const res = provider.evaluateRiskScore('docs/README.md', null, { planningDir: tmpDir });
      assert.strictEqual(res.score, 3);
      assert.ok(res.warning && res.warning.includes('auto-aprovação desabilitada'));
      assert.ok(res.learningRule);
      assert.strictEqual(res.learningRule.pattern, 'docs/README.md');
    } finally {
      cleanup(tmpDir);
    }
  });

  test('SessionLogger records system_one_decision events into jsonl session stream', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-test-so-log-'));
    try {
      const logger = new SessionLogger({ planningDir: tmpDir });
      logger.startSession({ command: 'test' });
      logger.logSystemOneDecision({
        decisionType: 'risk_score',
        target: 'src/main.ts',
        verdict: 2,
        confidence: 'med',
        latencyMs: 3,
        source: 'ast_analytical',
      });
      logger.endSession('completed');

      const content = fs.readFileSync(logger.sessionFile, 'utf8');
      assert.ok(content.includes('system_one_decision'));
      assert.ok(content.includes('risk_score'));
      assert.ok(content.includes('ast_analytical'));
    } finally {
      cleanup(tmpDir);
    }
  });

  test('High-level recordUserOverride helper persists override and affects classifyRiskSync', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-test-so-hl-'));
    try {
      recordUserOverride('src/service.ts', 'Declined in UAT', tmpDir);
      const result = classifyRiskSync('src/service.ts', { planningDir: tmpDir });
      assert.strictEqual(result.score, 3);
      assert.ok(result.warning && result.warning.includes('auto-aprovação desabilitada'));
      assert.ok(result.learningRule);
    } finally {
      cleanup(tmpDir);
    }
  });
});

describe('System One Engine — Wave 4: Native CLI Dispatchers, Rate Guard & Hub Gatekeeping', () => {
  const {
    SlidingWindowRateGuard,
    detectActiveRuntime,
    UserRuntimeSemanticProvider,
    AstAnalyticalProvider,
  } = systemOne;

  test('detectActiveRuntime recognizes environment flags accurately', () => {
    const oldAntigravity = process.env.ANTIGRAVITY_SESSION_ID;
    const oldRuntime = process.env.GSD_RUNTIME;
    try {
      delete process.env.ANTIGRAVITY_SESSION_ID;
      process.env.GSD_RUNTIME = 'gemini';
      assert.strictEqual(detectActiveRuntime(), 'gemini');

      process.env.ANTIGRAVITY_SESSION_ID = 'session-123';
      assert.strictEqual(detectActiveRuntime(), 'antigravity');
    } finally {
      if (oldAntigravity !== undefined) process.env.ANTIGRAVITY_SESSION_ID = oldAntigravity;
      else delete process.env.ANTIGRAVITY_SESSION_ID;
      if (oldRuntime !== undefined) process.env.GSD_RUNTIME = oldRuntime;
      else delete process.env.GSD_RUNTIME;
    }
  });

  test('SlidingWindowRateGuard limits requests within 60s sliding window', () => {
    const guard = new SlidingWindowRateGuard(60000, 3);
    assert.strictEqual(guard.checkAndRecord(), true);
    assert.strictEqual(guard.checkAndRecord(), true);
    assert.strictEqual(guard.checkAndRecord(), true);
    // 4th request must be blocked
    assert.strictEqual(guard.checkAndRecord(), false);

    const usage = guard.getCurrentUsage();
    assert.strictEqual(usage.count, 3);
    assert.strictEqual(usage.max, 3);
    assert.ok(usage.resetMs > 0);

    guard.reset();
    assert.strictEqual(guard.checkAndRecord(), true);
  });

  test('UserRuntimeSemanticProvider triggers rate guard fallback when limit is exceeded', async () => {
    const ast = new AstAnalyticalProvider();
    const guard = new SlidingWindowRateGuard(60000, 1);
    const semantic = new UserRuntimeSemanticProvider(ast, guard);

    // First request succeeds
    const res1 = await semantic.evaluateSemanticScore('src/file.ts', null, {
      useSemantic: true,
      semanticDispatcher: async () => '1',
    });
    assert.strictEqual(res1.score, 1);
    assert.strictEqual(res1.source, 'user_runtime_semantic');

    // Second request exceeds rate guard and falls back to AST analytical
    const res2 = await semantic.evaluateSemanticScore('src/file.ts', null, {
      useSemantic: true,
      semanticDispatcher: async () => '1',
    });
    assert.strictEqual(res2.source, 'fallback');
    assert.ok(res2.warning && res2.warning.includes('Rate Guard ativado'));
  });

  test('Unified Workflow Hub gatekeeping chooses planMode and executionMode dynamically', () => {
    const hub = require('../gsd-core/bin/lib/unified-workflow-hub.cjs');
    const tmpProject = createTempProject('gsd-hub-gatekeeping-');
    try {
      const planRes = hub.dispatchUnifiedCommand('/gsd:plan', {
        args: [],
        cwd: tmpProject,
        raw: true,
      });
      assert.strictEqual(planRes.command, 'plan');
      assert.ok(planRes.data && planRes.data.planMode);
      assert.ok(['fast', 'deep'].includes(planRes.data.planMode));

      const execRes = hub.dispatchUnifiedCommand('/gsd:exec', {
        args: [],
        cwd: tmpProject,
        raw: true,
      });
      assert.strictEqual(execRes.command, 'exec');
      assert.ok(execRes.data && execRes.data.executionMode);
      assert.ok(['parallel', 'serial'].includes(execRes.data.executionMode));
    } finally {
      cleanup(tmpProject);
    }
  });
});


