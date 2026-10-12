'use strict';

/**
 * Phase 32 Wave 6 Unit Suite: Dual-Surface In-Process Mod Bridge & CI Hardening
 *
 * Validates:
 * 1. Host runtime detection for in-process Mod capabilities (Claude Code, DeepSeek Harness).
 * 2. Canonical `register(on)` wiring and event listener registration.
 * 3. In-process `tool.call` guardrails: blocking destructive bash and colliding file writes.
 * 4. In-process `command.run` Output Diet interception.
 * 5. In-process `turn.start` Compact-Keeper dossier reinjection.
 * 6. Graceful degradation when host lacks in-process Mod capabilities (Settings Hooks fallback).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const modBridge = require('../gsd-core/bin/lib/in-process-mod-bridge.cjs');
const { supportsInProcessMods, createModBridge, register } = modBridge;

describe('Phase 32 Wave 6 — Host Runtime Detection & Compatibility', () => {
  it('correctly detects in-process Mod support across runtimes', () => {
    assert.equal(supportsInProcessMods('claude'), true);
    assert.equal(supportsInProcessMods('claude-code'), true);
    assert.equal(supportsInProcessMods('deepseek-harness'), true);
    assert.equal(supportsInProcessMods('dsh'), true);

    // Fallback runtimes (rely on Settings Hooks)
    assert.equal(supportsInProcessMods('codex'), false);
    assert.equal(supportsInProcessMods('cursor'), false);
    assert.equal(supportsInProcessMods('antigravity'), false);
    assert.equal(supportsInProcessMods('opencode'), false);
    assert.equal(supportsInProcessMods(undefined), false);
  });

  it('handles graceful fallback when register is invoked in non-in-process mode', () => {
    // Calling register with null/undefined should not throw
    assert.doesNotThrow(() => {
      register(null);
    });
  });
});

describe('Phase 32 Wave 6 — In-Process Event Dispatch & Guardrails', () => {
  it('registers handlers via canonical register(on) entry point', () => {
    const registeredEvents = [];
    const fakeOn = (eventName, handler) => {
      registeredEvents.push({ eventName, handler });
    };

    register(fakeOn, { enableBlastRadius: true });
    assert.ok(registeredEvents.some(e => e.eventName === 'tool.call'));
    assert.ok(registeredEvents.some(e => e.eventName === 'command.run'));
    assert.ok(registeredEvents.some(e => e.eventName === 'turn.start'));
    assert.ok(registeredEvents.some(e => e.eventName === 'prompt.submit'));
  });

  it('blocks destructive shell commands in tool.call event', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-mod-blast-'));
    const bridge = createModBridge({
      projectRoot: tmpDir,
      enableBlastRadius: true,
    });

    const blockResult = await bridge.dispatchEvent('tool.call', {
      toolName: 'Bash',
      toolInput: { command: 'rm -rf important_data/' },
    });

    assert.equal(blockResult.allow, false);
    assert.ok(blockResult.reason && blockResult.reason.includes('CRITICAL'));
  });

  it('blocks concurrent edits from another agent in tool.call event', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-mod-concur-'));
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(path.join(planningDir, 'intel'), { recursive: true });

    // Bridge instance for agent-beta
    const bridgeB = createModBridge({
      projectRoot: tmpDir,
      planningDir,
      agentId: 'agent-beta',
      sessionId: 'session-b',
    });

    // Acquire lock directly by agent-alpha
    const ledgerMod = require('../gsd-core/bin/lib/active-session-ledger.cjs');
    ledgerMod.acquireFileLock(planningDir, 'src/shared.ts', 'agent-alpha', 'session-a');

    const result = await bridgeB.dispatchEvent('tool.call', {
      toolName: 'Write',
      toolInput: { path: 'src/shared.ts', content: 'new content' },
    });

    assert.equal(result.allow, false);
    assert.ok(result.reason && result.reason.includes('COLLISION_GUARD_BLOCK'));
  });

  it('applies Output Diet in command.run event for noisy outputs', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-mod-diet-'));
    const bridge = createModBridge({
      projectRoot: tmpDir,
      enableOutputDiet: true,
    });

    const heavyOutput = Array.from({ length: 150 }, (_, i) => `Heavy log line ${i}`).join('\n');
    const result = await bridge.dispatchEvent('command.run', {
      output: heavyOutput,
      exitCode: 0,
    });

    assert.equal(result.allow, true);
    assert.ok(result.processedOutput);
    assert.ok(result.processedOutput.includes('[gsd output-diet: omitted'));
  });

  it('injects CompactDossier in turn.start event', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-mod-turn-'));
    const bridge = createModBridge({
      projectRoot: tmpDir,
    });

    const result = await bridge.dispatchEvent('turn.start', { turnIndex: 1 });
    assert.equal(result.allow, true);
    assert.ok(result.additionalContext);
    assert.ok(result.additionalContext.includes('GSD Compact-Keeper: Micro-Dossier'));
  });
});
