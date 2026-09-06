/**
 * Tests for Quality-First JIT Context Injector (Wave 4)
 * - Transitive Type Closure (3 hops deep)
 * - Respect of maxTypeClosureDepth and maxUniqueTypes
 * - dryRun flag operation
 */

'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { cleanup } = require('./helpers.cjs');
const jitInjector = require('../gsd-core/bin/lib/jit-context-injector.cjs');
const { assembleJitContext } = jitInjector;

describe('Quality-First JIT — Transitive Type Closure', () => {
  test('recursively discovers types across 3 degrees of dependency (OrderDto -> CustomerDto -> AddressDto)', () => {
    const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'jit-closure-test-'));

    try {
      const srcDir = path.join(tmpProject, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      // File C: AddressDto (2nd hop from Order)
      fs.writeFileSync(
        path.join(srcDir, 'address.ts'),
        `
        export interface AddressDto {
          street: string;
          city: string;
        }
        `
      );

      // File B: CustomerDto (1st hop from Order)
      fs.writeFileSync(
        path.join(srcDir, 'customer.ts'),
        `
        import { AddressDto } from './address';
        export interface CustomerDto {
          id: string;
          address: AddressDto;
        }
        `
      );

      // File A: OrderDto (target file)
      fs.writeFileSync(
        path.join(srcDir, 'order.ts'),
        `
        import { CustomerDto } from './customer';
        export interface OrderDto {
          orderId: string;
          customer: CustomerDto;
        }
        `
      );

      const planningDir = path.join(tmpProject, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });

      // Invocação JIT com fechamento transitivo até 3 graus
      const pkg = assembleJitContext({
        targetFiles: ['src/order.ts'],
        planningDir,
        rootDir: tmpProject,
        maxTypeClosureDepth: 3,
        maxUniqueTypes: 50,
      });

      assert.ok(pkg.applicableTypes.some(t => t.includes('OrderDto')), 'Must include OrderDto (direct)');
      assert.ok(pkg.applicableTypes.some(t => t.includes('CustomerDto')), 'Must include CustomerDto (1st hop)');
      assert.ok(pkg.applicableTypes.some(t => t.includes('AddressDto')), 'Must include AddressDto (2nd hop transitively)');
    } finally {
      cleanup(tmpProject);
    }
  });

  test('respects maxUniqueTypes cap when types exceed limit', () => {
    const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'jit-cap-test-'));

    try {
      const srcDir = path.join(tmpProject, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      fs.writeFileSync(
        path.join(srcDir, 'models.ts'),
        `
        export interface TypeA {}
        export interface TypeB {}
        export interface TypeC {}
        export interface TypeD {}
        export interface TypeE {}
        `
      );

      const planningDir = path.join(tmpProject, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });

      const pkg = assembleJitContext({
        targetFiles: ['src/models.ts'],
        planningDir,
        rootDir: tmpProject,
        maxUniqueTypes: 2,
      });

      assert.strictEqual(pkg.applicableTypes.length, 2, 'Must be capped at maxUniqueTypes: 2');
    } finally {
      cleanup(tmpProject);
    }
  });

  test('supports dryRun flag returning applicableTypes without rendering markdown', () => {
    const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'jit-dryrun-test-'));

    try {
      const srcDir = path.join(tmpProject, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      fs.writeFileSync(
        path.join(srcDir, 'dto.ts'),
        `
        export interface ItemDto { id: string; }
        `
      );

      const planningDir = path.join(tmpProject, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });

      const pkg = assembleJitContext({
        targetFiles: ['src/dto.ts'],
        planningDir,
        rootDir: tmpProject,
        dryRun: true,
      });

      assert.strictEqual(pkg.markdownBlock, '', 'markdownBlock must be empty on dryRun');
      assert.strictEqual(pkg.estimatedTokens, 0, 'estimatedTokens must be 0 on dryRun');
      assert.ok(pkg.applicableTypes.some(t => t.includes('ItemDto')), 'applicableTypes must still be resolved');
    } finally {
      cleanup(tmpProject);
    }
  });
});
