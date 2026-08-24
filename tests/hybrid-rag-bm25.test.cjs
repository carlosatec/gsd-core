'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const helpers = require('./helpers.cjs');

const ragEngine = require('../gsd-core/bin/lib/hybrid-semantic-rag.cjs');
const {
  tokenize,
  buildSemanticIndex,
  querySemanticSimilarFiles,
} = ragEngine;

describe('Hybrid Semantic RAG — Okapi BM25 & Code Tokenizer (D-33)', () => {
  let tmpDir;
  let planningDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-rag-test-'));
    planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });

    // Create polyglot files (TypeScript, Swift, Kotlin, Python)
    fs.writeFileSync(path.join(tmpDir, 'UserRepository.swift'), `
import SwiftUI
public class UserRepository {
  public func fetchUserData() -> String { "user_123" }
}
`);

    fs.writeFileSync(path.join(tmpDir, 'HomeScreen.kt'), `
package com.example.ui
import androidx.compose.runtime.Composable
@Composable
fun HomeScreen() {
  val user = "Alice"
}
`);

    fs.writeFileSync(path.join(tmpDir, 'auth_service.py'), `
def authenticate_user(token: str) -> bool:
    return True
`);
  });

  afterEach(() => {
    helpers.cleanup(tmpDir);
  });

  it('should tokenize camelCase, PascalCase, kebab-case, and snake_case properly', () => {
    const tokens1 = tokenize('userRepository');
    assert.equal(tokens1.includes('user'), true);
    assert.equal(tokens1.includes('repository'), true);

    const tokens2 = tokenize('HTMLParser');
    assert.equal(tokens2.includes('html'), true);
    assert.equal(tokens2.includes('parser'), true);

    const tokens3 = tokenize('my-custom-component');
    assert.equal(tokens3.includes('custom'), true);
    assert.equal(tokens3.includes('component'), true);

    const tokens4 = tokenize('fetch_user_profile_data');
    assert.equal(tokens4.includes('fetch'), true);
    assert.equal(tokens4.includes('user'), true);
    assert.equal(tokens4.includes('profile'), true);
    assert.equal(tokens4.includes('data'), true);
  });

  it('should build BM25 index with avgdl and index Swift, Kotlin, and Python files', () => {
    const index = buildSemanticIndex(tmpDir, planningDir);

    assert.equal(index.version, '2.0.0-bm25');
    assert.equal(index.totalDocs >= 3, true);
    assert.equal(typeof index.avgdl, 'number');
    assert.equal(index.avgdl > 0, true);

    const files = Object.keys(index.docs);
    assert.equal(files.some(f => f.endsWith('UserRepository.swift')), true);
    assert.equal(files.some(f => f.endsWith('HomeScreen.kt')), true);
    assert.equal(files.some(f => f.endsWith('auth_service.py')), true);
  });

  it('should query and rank files matching concepts using BM25', () => {
    buildSemanticIndex(tmpDir, planningDir);

    // Query for Swift UserRepository
    const resultsSwift = querySemanticSimilarFiles('user repository data', planningDir, tmpDir);
    assert.equal(resultsSwift.length > 0, true);
    assert.equal(resultsSwift[0].file.includes('UserRepository.swift'), true);

    // Query for Kotlin HomeScreen
    const resultsKotlin = querySemanticSimilarFiles('home screen composable', planningDir, tmpDir);
    assert.equal(resultsKotlin.length > 0, true);
    assert.equal(resultsKotlin[0].file.includes('HomeScreen.kt'), true);

    // Query for Python auth
    const resultsPython = querySemanticSimilarFiles('authenticate token', planningDir, tmpDir);
    assert.equal(resultsPython.length > 0, true);
    assert.equal(resultsPython[0].file.includes('auth_service.py'), true);
  });
});
