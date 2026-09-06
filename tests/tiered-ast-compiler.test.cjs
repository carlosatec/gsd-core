/**
 * Tests for Tiered AST Engine (Wave 3)
 * - Camada 1: TypeScript Compiler (extends, type aliases, methods, exact signatures)
 * - Camada 2: Universal State-Machine Lexer (immunity to comments and docstrings)
 */

'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const codebaseAst = require('../gsd-core/bin/lib/codebase-ast-analyzer.cjs');
const { analyzeSourceFile } = codebaseAst;

describe('Tiered AST Engine — Camada 1: TypeScript Compiler', () => {
  test('extracts interfaces with heritage (extends), type aliases, and method signatures', () => {
    const tsCode = `
      export interface BaseEntity {
        id: string;
        createdAt: Date;
      }

      export interface UserProfile extends BaseEntity {
        username: string;
        roles: string[];
      }

      export type UserStatus = 'active' | 'suspended' | 'deleted';

      export class UserManager {
        findUser(id: string): UserProfile | null {
          return null;
        }

        async updateUser(id: string, patch: Partial<UserProfile>): Promise<boolean> {
          return true;
        }
      }
    `;

    const result = analyzeSourceFile('src/models/user.ts', tsCode);

    assert.strictEqual(result.language, 'typescript');
    assert.strictEqual(result.symbols.length >= 4, true);

    const baseEntity = result.symbols.find(s => s.name === 'BaseEntity');
    assert.ok(baseEntity, 'BaseEntity interface must exist');
    assert.strictEqual(baseEntity.kind, 'interface');
    assert.strictEqual(baseEntity.isTypeOnly, true);

    const userProfile = result.symbols.find(s => s.name === 'UserProfile');
    assert.ok(userProfile, 'UserProfile interface must exist');
    assert.strictEqual(userProfile.kind, 'interface');
    assert.strictEqual(userProfile.meta?.extends, 'BaseEntity');

    const userStatus = result.symbols.find(s => s.name === 'UserStatus');
    assert.ok(userStatus, 'UserStatus type must exist');
    assert.strictEqual(userStatus.kind, 'type');

    const userManager = result.symbols.find(s => s.name === 'UserManager');
    assert.ok(userManager, 'UserManager class must exist');
    assert.strictEqual(userManager.kind, 'class');

    const findUser = result.symbols.find(s => s.name === 'findUser');
    assert.ok(findUser, 'findUser method must be extracted');
    assert.strictEqual(findUser.kind, 'method');
    assert.ok(findUser.meta?.signature?.includes('id: string'));
  });

  test('extracts arrow functions with exact parameter types', () => {
    const tsCode = `
      export const calculateDiscount = (price: number, rate: number = 0.1): number => {
        return price * (1 - rate);
      };
    `;

    const result = analyzeSourceFile('src/pricing.ts', tsCode);
    const fn = result.symbols.find(s => s.name === 'calculateDiscount');
    assert.ok(fn, 'calculateDiscount function must exist');
    assert.strictEqual(fn.kind, 'function');
    assert.ok(fn.meta?.signature?.includes('price: number'));
  });
});

describe('Tiered AST Engine — Camada 2: Universal State-Machine Lexer', () => {
  test('ignores symbols commented out in multi-line block comments and line comments', () => {
    const pythonCode = `
"""
def fake_in_docstring():
    pass
"""

# def fake_in_comment():
#     pass

def real_python_function(arg1, arg2):
    return arg1 + arg2
    `;

    const result = analyzeSourceFile('scripts/worker.py', pythonCode);
    const symbolNames = result.symbols.map(s => s.name);

    assert.ok(!symbolNames.includes('fake_in_docstring'), 'Must ignore functions inside docstrings');
    assert.ok(!symbolNames.includes('fake_in_comment'), 'Must ignore functions inside single-line comments');
    assert.ok(symbolNames.includes('real_python_function'), 'Must detect real_python_function');
  });

  test('ignores Rust functions commented out in block comments', () => {
    const rustCode = `
/*
fn fake_rust_function() -> bool {
    true
}
*/

pub fn real_rust_function() -> i32 {
    42
}
    `;

    const result = analyzeSourceFile('src/lib.rs', rustCode);
    const symbolNames = result.symbols.map(s => s.name);

    assert.ok(!symbolNames.includes('fake_rust_function'), 'Must ignore Rust functions in block comments');
    assert.ok(symbolNames.includes('real_rust_function'), 'Must detect real_rust_function');
  });
});
