"use strict";
/**
 * Deterministic Session Replay Engine — Reconstructs and inspects execution timelines
 * (Phase 14 / ADR-1239 / Decisions D-54, D-55, D-56).
 *
 * Capabilities:
 * - Load session by ID or 'latest' alias
 * - Terminal ANSI-formatted interactive replay
 * - Filters: --errors-only, --diffs, --summary
 * - Markdown export for GitHub issues/documentation
 * - Auto-extract anti-pattern candidates for learning
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sessionLoggerMod = require("./session-logger.cjs");
const { SessionLogger } = sessionLoggerMod;
const text_lines_cjs_1 = require("./text-lines.cjs");
function safeStr(val, fallback = '') {
    if (typeof val === 'string')
        return val;
    if (typeof val === 'number' || typeof val === 'boolean')
        return String(val);
    return fallback;
}
function safeNum(val, fallback = 0) {
    if (typeof val === 'number')
        return val;
    if (typeof val === 'string') {
        const parsed = Number(val);
        return Number.isNaN(parsed) ? fallback : parsed;
    }
    return fallback;
}
class SessionReplay {
    static resolveSessionId(idOrLatest = 'latest', planningDir = '.planning') {
        const sessions = SessionLogger.listSessions(planningDir);
        if (sessions.length === 0)
            return null;
        if (!idOrLatest || idOrLatest.toLowerCase() === 'latest') {
            return sessions[0].id;
        }
        const matched = sessions.find((s) => s.id === idOrLatest || s.id.startsWith(idOrLatest));
        return matched ? matched.id : null;
    }
    static loadSession(idOrLatest = 'latest', planningDir = '.planning') {
        const resolvedId = SessionReplay.resolveSessionId(idOrLatest, planningDir);
        if (!resolvedId)
            return null;
        const sessionsDir = node_path_1.default.join(planningDir, 'intel', 'sessions');
        const sessionFile = node_path_1.default.join(sessionsDir, `session_${resolvedId}.jsonl`);
        if (!node_fs_1.default.existsSync(sessionFile))
            return null;
        try {
            const raw = node_fs_1.default.readFileSync(sessionFile, 'utf8');
            const lines = (0, text_lines_cjs_1.splitLines)(raw.trim()).filter(Boolean);
            const events = [];
            let errorCount = 0;
            let mutationCount = 0;
            let toolCallCount = 0;
            for (const line of lines) {
                try {
                    const ev = JSON.parse(line);
                    events.push(ev);
                    if (ev.type === 'tool_result' && (ev.success === false || ev.error)) {
                        errorCount++;
                    }
                    else if (ev.type === 'guardrail_intercept') {
                        errorCount++;
                    }
                    else if (ev.type === 'test_result' && safeNum(ev.failed) > 0) {
                        errorCount++;
                    }
                    else if (ev.type === 'file_mutation') {
                        mutationCount++;
                    }
                    else if (ev.type === 'tool_call') {
                        toolCallCount++;
                    }
                }
                catch {
                    // Ignore malformed line
                }
            }
            const startEv = events.find((e) => e.type === 'session_start');
            const endEv = events.find((e) => e.type === 'session_end');
            return {
                sessionId: resolvedId,
                sessionFile,
                startTime: startEv?.timestamp || (events[0]?.timestamp ?? new Date().toISOString()),
                endTime: endEv?.timestamp || (events[events.length - 1]?.timestamp ?? undefined),
                status: typeof endEv?.status === 'string' ? endEv.status : (events.length > 0 ? 'completed' : 'empty'),
                command: typeof startEv?.command === 'string' ? startEv.command : undefined,
                phaseId: typeof startEv?.phaseId === 'string' ? startEv.phaseId : undefined,
                events,
                errorCount,
                mutationCount,
                toolCallCount,
                durationMs: typeof endEv?.totalDurationMs === 'number' ? endEv.totalDurationMs : undefined,
            };
        }
        catch {
            return null;
        }
    }
    static renderReplay(timeline, opts = {}) {
        const noColor = opts.noColor || process.env.NO_COLOR === '1';
        const c = noColor
            ? { cyan: '', green: '', yellow: '', red: '', bold: '', dim: '', reset: '' }
            : {
                cyan: '\x1b[36m',
                green: '\x1b[32m',
                yellow: '\x1b[33m',
                red: '\x1b[31m',
                bold: '\x1b[1m',
                dim: '\x1b[2m',
                reset: '\x1b[0m',
            };
        const lines = [];
        lines.push(`${c.bold}=== GSD Session Replay [${timeline.sessionId}] ===${c.reset}`);
        lines.push(`Command: ${c.cyan}${timeline.command || 'unknown'}${c.reset} | Phase: ${timeline.phaseId || 'N/A'} | Status: ${timeline.status === 'completed' ? c.green : c.red}${timeline.status}${c.reset}`);
        lines.push(`Time: ${timeline.startTime} | Events: ${timeline.events.length} | Errors: ${timeline.errorCount > 0 ? c.red : c.green}${timeline.errorCount}${c.reset}`);
        lines.push('------------------------------------------------------------');
        let stepIndex = 0;
        for (const ev of timeline.events) {
            const isError = (ev.type === 'tool_result' && (ev.success === false || Boolean(ev.error))) ||
                ev.type === 'guardrail_intercept' ||
                (ev.type === 'test_result' && safeNum(ev.failed) > 0);
            if (opts.errorsOnly && !isError && ev.type !== 'session_start' && ev.type !== 'session_end') {
                continue;
            }
            stepIndex++;
            const timeStr = typeof ev.timestamp === 'string' ? ev.timestamp.slice(11, 19) : '00:00:00';
            const toolNameStr = safeStr(ev.toolName);
            const changeTypeStr = safeStr(ev.changeType);
            const filePathStr = safeStr(ev.filePath);
            const ruleIdStr = safeStr(ev.ruleId);
            const targetStr = safeStr(ev.target);
            const reasonStr = safeStr(ev.reason);
            const actionStr = safeStr(ev.action);
            const statusStr = safeStr(ev.status);
            const runtimeStr = safeStr(ev.runtime, 'node');
            const durationMsVal = safeNum(ev.durationMs);
            const passedVal = safeNum(ev.passed);
            const failedVal = safeNum(ev.failed);
            const suiteStr = safeStr(ev.suite);
            const errorStr = safeStr(ev.error);
            const outputStr = safeStr(ev.output);
            const diffStr = safeStr(ev.diff);
            const totalToolsStr = safeStr(ev.totalToolsCalled, '0');
            const totalMutationsStr = safeStr(ev.totalMutations, '0');
            if (opts.summaryOnly) {
                if (ev.type === 'tool_call') {
                    lines.push(`[${timeStr}] ${c.cyan}TOOL${c.reset} ${toolNameStr}`);
                }
                else if (ev.type === 'file_mutation') {
                    lines.push(`[${timeStr}] ${c.yellow}FILE${c.reset} ${changeTypeStr} ${filePathStr}`);
                }
                else if (ev.type === 'guardrail_intercept') {
                    lines.push(`[${timeStr}] ${c.red}GUARD${c.reset} ${ruleIdStr} on ${targetStr}`);
                }
                else if (isError) {
                    lines.push(`[${timeStr}] ${c.red}FAIL${c.reset} ${toolNameStr || String(ev.type)}`);
                }
                continue;
            }
            switch (ev.type) {
                case 'session_start':
                    lines.push(`[${timeStr}] ${c.green}SESSION START${c.reset} (Runtime: ${runtimeStr})`);
                    break;
                case 'tool_call':
                    lines.push(`[${timeStr}] ${c.cyan}TOOL CALL (#${stepIndex})${c.reset} ${c.bold}${toolNameStr}${c.reset}`);
                    if (ev.params && typeof ev.params === 'object' && Object.keys(ev.params).length > 0) {
                        lines.push(`  ${c.dim}Args: ${JSON.stringify(ev.params)}${c.reset}`);
                    }
                    break;
                case 'tool_result':
                    if (ev.success === false || errorStr) {
                        lines.push(`[${timeStr}] ${c.red}TOOL FAILED${c.reset} ${toolNameStr} (${durationMsVal}ms)`);
                        if (errorStr)
                            lines.push(`  ${c.red}Error: ${errorStr}${c.reset}`);
                        if (outputStr)
                            lines.push(`  ${c.dim}${outputStr}${c.reset}`);
                    }
                    else {
                        lines.push(`[${timeStr}] ${c.green}TOOL OK${c.reset} ${toolNameStr} (${durationMsVal}ms)`);
                        if (opts.showDiffs && outputStr) {
                            lines.push(`  ${c.dim}${outputStr}${c.reset}`);
                        }
                    }
                    break;
                case 'file_mutation':
                    lines.push(`[${timeStr}] ${c.yellow}FILE MUTATION${c.reset} [${changeTypeStr}] ${filePathStr}`);
                    if (opts.showDiffs && diffStr) {
                        lines.push(`  ${c.dim}${diffStr}${c.reset}`);
                    }
                    break;
                case 'guardrail_intercept':
                    lines.push(`[${timeStr}] ${c.red}GUARDRAIL INTERCEPT [${actionStr}]${c.reset} Rule: ${ruleIdStr} -> Target: ${targetStr}`);
                    lines.push(`  ${c.yellow}Reason: ${reasonStr}${c.reset}`);
                    break;
                case 'test_result':
                    lines.push(`[${timeStr}] ${c.bold}TEST SUITE${c.reset} ${suiteStr} — Passed: ${c.green}${passedVal}${c.reset}, Failed: ${failedVal > 0 ? c.red : c.green}${failedVal}${c.reset}`);
                    break;
                case 'session_end':
                    lines.push(`[${timeStr}] ${c.bold}SESSION END${c.reset} Status: ${statusStr === 'completed' ? c.green : c.red}${statusStr}${c.reset} (Total Tools: ${totalToolsStr}, Mutations: ${totalMutationsStr})`);
                    break;
            }
        }
        lines.push('------------------------------------------------------------');
        return lines.join('\n');
    }
    static exportMarkdown(timeline) {
        const md = [];
        md.push(`# GSD Session Diagnostic Report — \`${timeline.sessionId}\`\n`);
        md.push(`- **Command:** \`${timeline.command || 'N/A'}\``);
        md.push(`- **Phase:** \`${timeline.phaseId || 'N/A'}\``);
        md.push(`- **Status:** \`${timeline.status}\``);
        md.push(`- **Start Time:** \`${timeline.startTime}\``);
        md.push(`- **Duration:** \`${timeline.durationMs || 0} ms\``);
        md.push(`- **Tool Calls:** \`${timeline.toolCallCount}\``);
        md.push(`- **Mutations:** \`${timeline.mutationCount}\``);
        md.push(`- **Errors/Warnings:** \`${timeline.errorCount}\`\n`);
        md.push('## Execution Timeline\n');
        for (const ev of timeline.events) {
            const timeStr = typeof ev.timestamp === 'string' ? ev.timestamp.slice(11, 19) : '00:00:00';
            const toolNameStr = safeStr(ev.toolName);
            const durationMsVal = safeNum(ev.durationMs);
            const changeTypeStr = safeStr(ev.changeType);
            const filePathStr = safeStr(ev.filePath);
            const ruleIdStr = safeStr(ev.ruleId);
            const targetStr = safeStr(ev.target);
            const reasonStr = safeStr(ev.reason);
            const actionStr = safeStr(ev.action);
            const errorStr = safeStr(ev.error);
            const diffStr = safeStr(ev.diff);
            if (ev.type === 'tool_call') {
                md.push(`### \`[${timeStr}]\` Tool Call: \`${toolNameStr}\``);
                if (ev.params) {
                    md.push('```json\n' + JSON.stringify(ev.params, null, 2) + '\n```');
                }
            }
            else if (ev.type === 'tool_result') {
                md.push(`- **Result:** ${ev.success ? '✅ Success' : '❌ Failed'} (\`${durationMsVal}ms\`)`);
                if (errorStr) {
                    md.push(`> ⚠️ **Error:** ${errorStr}\n`);
                }
            }
            else if (ev.type === 'file_mutation') {
                md.push(`### \`[${timeStr}]\` Mutation: \`${changeTypeStr}\` on \`${filePathStr}\``);
                if (diffStr) {
                    md.push('```diff\n' + diffStr + '\n```');
                }
            }
            else if (ev.type === 'guardrail_intercept') {
                md.push(`> 🛑 **Guardrail Intercept [${actionStr}]:** Rule \`${ruleIdStr}\` blocked on \`${targetStr}\`\n> **Reason:** ${reasonStr}\n`);
            }
        }
        return md.join('\n');
    }
    static extractAntiPatternCandidate(timeline) {
        if (timeline.errorCount === 0)
            return null;
        const failedResults = timeline.events.filter((e) => e.type === 'tool_result' && (e.success === false || Boolean(e.error)));
        if (failedResults.length === 0)
            return null;
        const lastFail = failedResults[failedResults.length - 1];
        const toolName = typeof lastFail.toolName === 'string' ? lastFail.toolName : 'tool';
        const errorMsg = typeof lastFail.error === 'string' ? lastFail.error : 'Execution error';
        return {
            pattern: `Failure during tool execution: ${toolName}`,
            antiPattern: errorMsg.slice(0, 300),
            repairedAction: `Inspect parameters and state before retrying ${toolName}`,
            category: 'session-failure-replay',
        };
    }
}
module.exports = {
    SessionReplay,
};
