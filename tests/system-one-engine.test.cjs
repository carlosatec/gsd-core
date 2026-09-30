/**
 * Tests for GSD System One Engine — Sovereign Decision Intelligence, Fallback Guards & Routing.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert');
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
      semanticDispatcher: () => new Promise(resolve => setTimeout(() => resolve('0.95'), 200)),
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
    const mockGraph = {
      pageRankScores: {
        'src/central.ts': 0.09,
        'src/unrelated.ts': 0.001,
      },
    };

    const result = systemOne.reRankForJit(items, ['src/target.ts'], { rootDir: '.' });
    assert.strictEqual(result.items.length, 3);
    assert.strictEqual(result.items[0].file, 'src/target.ts', 'target file should be ranked highest');
    assert.ok(result.relevanceScores['src/target.ts'] >= 99.0);
    assert.ok(result.averageRelevance >= 70.0 && result.averageRelevance <= 100.0);
    assert.strictEqual(result.confidence, 'high');
  });
});
