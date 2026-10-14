"use strict";
/**
 * GSD In-Process Mod Bridge (Phase 32 — Wave 6)
 *
 * Implements the first-class in-process Mod architecture for Claude Code v2.1.287+
 * and DeepSeek Harness (@deepseek-ai/dsh-experimental-claude-code-mods), providing
 * sub-millisecond event interception while guaranteeing 100% transparent fallback
 * to Settings Hooks across all other supported runtimes.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const node_path_1 = __importDefault(require("node:path"));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const outputDietMod = require("./output-diet.cjs");
const { processOutputDiet } = outputDietMod;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const compactKeeperMod = require("./compact-keeper.cjs");
const { buildCompactDossier, formatCompactDossier, checkTaskDrift } = compactKeeperMod;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const blastRadiusMod = require("./shell-blast-radius.cjs");
const { inspectCommandRisk } = blastRadiusMod;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ledgerMod = require("./active-session-ledger.cjs");
const { acquireFileLock, releaseAgentLocks } = ledgerMod;
/**
 * Checks if the specified runtime natively supports in-process Mods.
 */
function supportsInProcessMods(runtime) {
    if (!runtime)
        return false;
    const clean = runtime.trim().toLowerCase();
    return clean === 'claude' || clean === 'claude-code' || clean === 'deepseek-harness' || clean === 'dsh';
}
/**
 * Creates and configures an In-Process Mod Bridge instance.
 */
function createModBridge(options = {}) {
    const root = options.projectRoot || process.cwd();
    const planning = options.planningDir || node_path_1.default.join(root, '.planning');
    const agentId = options.agentId || 'in-process-agent';
    const sessionId = options.sessionId || 'in-process-session';
    const handlers = new Map();
    function registerHandler(eventName, handler) {
        const list = handlers.get(eventName) || [];
        list.push(handler);
        handlers.set(eventName, list);
    }
    async function dispatchEvent(eventName, context) {
        const list = handlers.get(eventName) || [];
        let aggregatedContext = '';
        for (const handler of list) {
            const res = await handler(context);
            if (res) {
                if (res.allow === false) {
                    return { allow: false, reason: res.reason };
                }
                if (res.additionalContext) {
                    aggregatedContext += (aggregatedContext ? '\n\n' : '') + res.additionalContext;
                }
                if (res.processedOutput) {
                    context.output = res.processedOutput;
                }
            }
        }
        return {
            allow: true,
            additionalContext: aggregatedContext || undefined,
            processedOutput: context.output,
        };
    }
    // 1. Tool Call Handler
    registerHandler('tool.call', (event) => {
        const tool = event.toolName;
        const input = event.toolInput || {};
        // Shell Blast Radius inspection on terminal commands
        if (tool === 'Bash' || tool === 'Shell') {
            const cmd = typeof input.command === 'string' ? input.command : event.command;
            if (cmd && options.enableBlastRadius !== false) {
                const risk = inspectCommandRisk(cmd, { cwd: root });
                if (risk.isDestructive && risk.requiresConfirmation) {
                    return {
                        allow: false,
                        reason: risk.warning || `Blocked destructive shell command: ${cmd}`,
                    };
                }
            }
        }
        // Write / Edit Guardrails: Collision Guard & Task Drift Anchor
        if (tool === 'Write' || tool === 'Edit') {
            const rawFile = (input.file_path || input.path || '');
            if (rawFile) {
                // Multi-Agent Collision Check
                if (options.enableCollisionGuard !== false) {
                    const lockResult = acquireFileLock(planning, rawFile, agentId, sessionId);
                    if (!lockResult.acquired) {
                        return {
                            allow: false,
                            reason: lockResult.reason || `COLLISION_GUARD_BLOCK: File "${rawFile}" is locked by another agent.`,
                        };
                    }
                }
                // Task Drift Check
                if (options.enableTaskDriftAnchor !== false && Array.isArray(event.declaredScopeFiles) && event.declaredScopeFiles.length > 0) {
                    const drift = checkTaskDrift(rawFile, event.declaredScopeFiles);
                    if (drift.isDrift) {
                        return {
                            additionalContext: drift.warning,
                        };
                    }
                }
            }
        }
        return { allow: true };
    });
    // 2. Command Run Output Diet Handler
    registerHandler('command.run', (event) => {
        if (options.enableOutputDiet !== false && typeof event.output === 'string') {
            const diet = processOutputDiet(event.output, {
                exitCode: event.exitCode ?? 0,
                projectRoot: root,
            });
            return {
                processedOutput: diet.content,
            };
        }
    });
    // 3. Turn Start Compact-Keeper Handler
    registerHandler('turn.start', () => {
        try {
            const dossier = buildCompactDossier(root, { planningDir: planning });
            const formatted = formatCompactDossier(dossier);
            return {
                additionalContext: formatted,
            };
        }
        catch {
            // Non-blocking
        }
    });
    // 4. Turn End Lock Cleanup Handler
    registerHandler('turn.end', () => {
        try {
            if (typeof releaseAgentLocks === 'function') {
                releaseAgentLocks(planning, agentId);
            }
        }
        catch {
            // Non-blocking lock cleanup
        }
        return { allow: true };
    });
    return {
        registerHandler,
        dispatchEvent,
        handlers,
    };
}
/**
 * Canonical entry point called by Claude Code Mods and DeepSeek Harness (@deepseek-ai/dsh-experimental-claude-code-mods).
 */
function register(on, options = {}) {
    if (typeof on !== 'function') {
        // Graceful fallback for non-in-process environments (Settings Hooks mode)
        return;
    }
    const bridge = createModBridge(options);
    // Wire standard events to the host-provided registrar
    on('tool.call', async (ctx) => {
        return bridge.dispatchEvent('tool.call', ctx);
    });
    on('command.run', async (ctx) => {
        return bridge.dispatchEvent('command.run', ctx);
    });
    on('turn.start', async (ctx) => {
        return bridge.dispatchEvent('turn.start', ctx);
    });
    on('turn.end', async (ctx) => {
        return bridge.dispatchEvent('turn.end', ctx);
    });
    on('prompt.submit', async (ctx) => {
        return bridge.dispatchEvent('prompt.submit', ctx);
    });
}
module.exports = {
    supportsInProcessMods,
    createModBridge,
    register,
};
