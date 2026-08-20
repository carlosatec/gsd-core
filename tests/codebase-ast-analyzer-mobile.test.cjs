'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const codebaseAst = require('../gsd-core/bin/lib/codebase-ast-analyzer.cjs');
const testScaffolder = require('../gsd-core/bin/lib/test-scaffold-engine.cjs');
const normalizer = require('../gsd-core/bin/lib/normalize-test-command.cjs');

const { analyzeSourceFile } = codebaseAst;
const { generateTestScaffold } = testScaffolder;
const { normalizeTestCommand } = normalizer;

describe('Mobile 360° iOS (Swift & SwiftUI) AST Analyzer', () => {
  it('should analyze Swift files and extract structs, classes, protocols and SwiftUI views', () => {
    const swiftCode = `
import SwiftUI
import Foundation
@testable import CoreServices

public struct ContentView: View {
    @State private var counter = 0
    var body: some View {
        Text("Hello")
    }
}

public protocol UserAuthenticating {
    func authenticate(token: String) async throws -> Bool
}

final class UserRepository: UserAuthenticating {
    func authenticate(token: String) async throws -> Bool {
        return true
    }
}
`;

    const result = analyzeSourceFile('App/ContentView.swift', swiftCode);

    assert.equal(result.language, 'swift');
    assert.equal(result.imports.length >= 2, true);
    assert.equal(result.imports.some(i => i.source === 'SwiftUI'), true);
    assert.equal(result.imports.some(i => i.source === 'Foundation'), true);

    const symbols = result.symbols;
    assert.equal(symbols.some(s => s.name === 'ContentView' && s.kind === 'component'), true);
    assert.equal(symbols.some(s => s.name === 'UserAuthenticating' && s.kind === 'interface'), true);
    assert.equal(symbols.some(s => s.name === 'UserRepository' && s.kind === 'class'), true);
    assert.equal(symbols.some(s => s.name === 'authenticate' && s.kind === 'function'), true);
  });

  it('should generate XCTest scaffolding for Swift files', () => {
    const swiftCode = `
public struct Calculator {
    public func add(a: Int, b: Int) -> Int { a + b }
}
`;
    const scaffold = generateTestScaffold('Sources/Calculator.swift', swiftCode);

    assert.equal(scaffold.language, 'swift');
    assert.equal(scaffold.isInline, false);
    assert.match(scaffold.testFilePath, /Tests\/.*CalculatorTests\.swift/);
    assert.match(scaffold.testCode, /import XCTest/);
    assert.match(scaffold.testCode, /@testable import Calculator/);
    assert.match(scaffold.testCode, /class CalculatorTests: XCTestCase/);
  });

  it('should recognize swift test and xcodebuild as one-shot commands without modification', () => {
    const cmd1 = normalizeTestCommand('swift test --filter MyTests', process.cwd());
    assert.equal(cmd1, 'swift test --filter MyTests');

    const cmd2 = normalizeTestCommand('xcodebuild test -scheme MyApp', process.cwd());
    assert.equal(cmd2, 'xcodebuild test -scheme MyApp');

    const cmd3 = normalizeTestCommand('./gradlew test', process.cwd());
    assert.equal(cmd3, './gradlew test');
  });
});

describe('Mobile 360° Android (Kotlin & Compose) AST Analyzer', () => {
  it('should analyze Kotlin files and extract Compose components, sealed classes, objects, and Hilt ViewModels', () => {
    const kotlinCode = `
package com.example.app

import androidx.compose.runtime.Composable
import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel

sealed class UiState {
    object Loading : UiState()
    data class Success(val data: String) : UiState()
}

@HiltViewModel
class MainViewModel : ViewModel() {
    suspend fun loadData() {
    }
}

@Composable
fun HomeScreen(state: UiState) {
}
`;

    const result = analyzeSourceFile('app/src/main/java/com/example/HomeScreen.kt', kotlinCode);

    assert.equal(result.language, 'kotlin');
    assert.equal(result.imports.some(i => i.source.includes('Composable')), true);

    const symbols = result.symbols;
    assert.equal(symbols.some(s => s.name === 'UiState' && s.kind === 'class'), true);
    assert.equal(symbols.some(s => s.name === 'MainViewModel' && s.kind === 'service'), true);
    assert.equal(symbols.some(s => s.name === 'HomeScreen' && s.kind === 'component'), true);
    assert.equal(symbols.some(s => s.name === 'loadData' && s.kind === 'function'), true);
  });
});
