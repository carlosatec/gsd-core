"use strict";
/**
 * Test Scaffold Engine — Polyglot, topology-aware test skeleton synthesizer.
 *
 * Synthesizes test skeletons based on AST exported symbols while respecting
 * each language's native test placement conventions (inline for Go/Rust, isolated for JS/Python).
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const node_path_1 = __importDefault(require("node:path"));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const codebaseAst = require("./codebase-ast-analyzer.cjs");
const { analyzeSourceFile } = codebaseAst;
// ─── Scaffolding Logic ────────────────────────────────────────────────────────
/**
 * Synthesizes a test skeleton for a given source file based on its AST exports.
 */
function generateTestScaffold(filePath, content, rootDir = '.') {
    const normalized = filePath.replace(/\\/g, '/');
    const fullPath = node_path_1.default.isAbsolute(filePath) ? filePath : node_path_1.default.join(rootDir, filePath);
    const analysis = analyzeSourceFile(fullPath, content);
    const ext = node_path_1.default.extname(normalized).toLowerCase();
    const baseName = node_path_1.default.basename(normalized, ext);
    const dirName = node_path_1.default.dirname(normalized);
    // 1. Go (*.go) -> Inline foo_test.go
    if (ext === '.go') {
        const testFileName = `${baseName}_test.go`;
        const testFilePath = dirName === '.' ? testFileName : `${dirName}/${testFileName}`;
        const lines = [
            'package main',
            '',
            'import (',
            '\t"testing"',
            ')',
            '',
        ];
        for (const exp of analysis.exports) {
            if (exp.kind === 'function') {
                lines.push(`func Test${exp.name}(t *testing.T) {`);
                lines.push(`\t// TODO: implement unit test for ${exp.name}`);
                lines.push('}');
                lines.push('');
            }
        }
        if (analysis.exports.length === 0) {
            lines.push('func TestSmoke(t *testing.T) {');
            lines.push('\t// TODO: add smoke tests');
            lines.push('}');
        }
        return {
            targetFile: normalized,
            testFilePath,
            testCode: lines.join('\n'),
            language: 'go',
            isInline: true,
        };
    }
    // 2. Rust (*.rs) -> Inline #[cfg(test)] mod tests
    if (ext === '.rs') {
        const lines = [
            '',
            '#[cfg(test)]',
            'mod tests {',
            '    use super::*;',
            '',
        ];
        for (const exp of analysis.exports) {
            lines.push(`    #[test]`);
            lines.push(`    fn test_${exp.name.toLowerCase()}() {`);
            lines.push(`        // TODO: test ${exp.name}`);
            lines.push(`    }`);
            lines.push('');
        }
        if (analysis.exports.length === 0) {
            lines.push('    #[test]');
            lines.push('    fn test_smoke() {}');
        }
        lines.push('}');
        return {
            targetFile: normalized,
            testFilePath: normalized,
            testCode: lines.join('\n'),
            language: 'rust',
            isInline: true,
        };
    }
    // 3. Python (*.py) -> tests/test_foo.py
    if (ext === '.py') {
        const testFilePath = `tests/test_${baseName}.py`;
        const modImport = baseName;
        const lines = [
            `import pytest`,
            `from ${modImport} import *`,
            '',
        ];
        for (const exp of analysis.exports) {
            lines.push(`def test_${exp.name.toLowerCase()}():`);
            lines.push(`    """Unit test for ${exp.name}."""`);
            lines.push(`    pass`);
            lines.push('');
        }
        if (analysis.exports.length === 0) {
            lines.push('def test_smoke():');
            lines.push('    assert True');
        }
        return {
            targetFile: normalized,
            testFilePath,
            testCode: lines.join('\n'),
            language: 'python',
            isInline: false,
        };
    }
    // 4. Dart (*.dart) -> test/foo_test.dart
    if (ext === '.dart') {
        const testFileName = `${baseName}_test.dart`;
        const testFilePath = dirName === '.' ? `test/${testFileName}` : `test/${dirName}/${testFileName}`;
        const lines = [
            "import 'package:test/test.dart';",
            `import '../${dirName === '.' ? '' : dirName + '/'}${baseName}.dart';`,
            '',
            'void main() {',
        ];
        for (const exp of analysis.exports) {
            lines.push(`  test('test ${exp.name}', () {`);
            lines.push(`    // TODO: implement unit test for ${exp.name}`);
            lines.push('  });');
            lines.push('');
        }
        if (analysis.exports.length === 0) {
            lines.push("  test('smoke test', () {");
            lines.push('    // TODO: add smoke tests');
            lines.push('  });');
        }
        lines.push('}');
        return {
            targetFile: normalized,
            testFilePath,
            testCode: lines.join('\n'),
            language: 'dart',
            isInline: false,
        };
    }
    // 5. Java / Kotlin (*.java, *.kt) -> src/test/java/foo/FooTest.java
    if (ext === '.java' || ext === '.kt') {
        const isKt = ext === '.kt';
        const testFileName = `${baseName}Test${ext}`;
        const langDir = isKt ? 'kotlin' : 'java';
        const testFilePath = dirName === '.' ? `src/test/${langDir}/${testFileName}` : `src/test/${langDir}/${dirName}/${testFileName}`;
        const lines = [
            'import org.junit.jupiter.api.Test;',
            'import static org.junit.jupiter.api.Assertions.*;',
            '',
            `class ${baseName}Test {`,
            '',
        ];
        for (const exp of analysis.exports) {
            lines.push('    @Test');
            lines.push(`    ${isKt ? 'fun' : 'void'} test${exp.name}() {`);
            lines.push(`        // TODO: implement unit test for ${exp.name}`);
            lines.push('    }');
            lines.push('');
        }
        if (analysis.exports.length === 0) {
            lines.push('    @Test');
            lines.push(`    ${isKt ? 'fun' : 'void'} testSmoke() {`);
            lines.push('        // TODO: add smoke tests');
            lines.push('        assertTrue(true);');
            lines.push('    }');
        }
        lines.push('}');
        return {
            targetFile: normalized,
            testFilePath,
            testCode: lines.join('\n'),
            language: isKt ? 'kotlin' : 'java',
            isInline: false,
        };
    }
    // 6. Node / TypeScript (*.ts, *.cts, *.js, *.cjs) -> tests/foo.test.cjs
    const testFilePath = `tests/${baseName}.test.cjs`;
    const relRequire = dirName === '.' ? `../${baseName}.cjs` : `../${dirName}/${baseName}.cjs`;
    const lines = [
        "'use strict';",
        '',
        "const { test, describe } = require('node:test');",
        "const assert = require('node:assert/strict');",
        `const target = require('${relRequire.replace(/\\/g, '/')}');`,
        '',
        `describe('${baseName} unit tests', () => {`,
    ];
    for (const exp of analysis.exports) {
        lines.push(`  test('should correctly execute ${exp.name}', () => {`);
        lines.push(`    // TODO: assert behavior for ${exp.name}`);
        lines.push(`    assert.ok(target.${exp.name});`);
        lines.push('  });');
        lines.push('');
    }
    if (analysis.exports.length === 0) {
        lines.push("  test('smoke test', () => {");
        lines.push('    assert.ok(true);');
        lines.push('  });');
    }
    lines.push('});');
    return {
        targetFile: normalized,
        testFilePath,
        testCode: lines.join('\n'),
        language: 'typescript',
        isInline: false,
    };
}
module.exports = {
    generateTestScaffold,
};
