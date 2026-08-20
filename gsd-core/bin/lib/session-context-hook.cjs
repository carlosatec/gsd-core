"use strict";
/**
 * Session Context Hook — Automatic session handshake & context synchronization.
 *
 * Injects active project state (STATE.md + Topology Brief <= 15 lines) into
 * the host agent context files (GEMINI.md, AGENTS.md, or .agents/rules/gsd-session.md)
 * to eliminate initial LLM context blindness on session startup.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const shell_command_projection_cjs_1 = require("./shell-command-projection.cjs");
const START_MARKER = '<!-- GSD-SESSION-CONTEXT -->';
const END_MARKER = '<!-- /GSD-SESSION-CONTEXT -->';
/**
 * Extracts a concise session brief (<= 15 lines) from STATE.md and active planning artifacts.
 */
function extractSessionBrief(planningDir) {
    const statePath = node_path_1.default.join(planningDir, 'STATE.md');
    const stateContent = (0, shell_command_projection_cjs_1.platformReadSync)(statePath) || '';
    const lines = stateContent.split('\n');
    let currentPhase = 'Unknown';
    let status = 'Idle';
    const decisions = [];
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('- **Current Phase:**') || trimmed.startsWith('Current Phase:')) {
            currentPhase = trimmed.replace(/.*Current Phase:\s*\**/i, '').replace(/\*+/g, '').trim();
        }
        else if (trimmed.startsWith('- **Status:**') || trimmed.startsWith('Status:')) {
            status = trimmed.replace(/.*Status:\s*\**/i, '').replace(/\*+/g, '').trim();
        }
        else if (trimmed.startsWith('- **D-') || trimmed.startsWith('- D-')) {
            if (decisions.length < 4) {
                decisions.push(trimmed.slice(2));
            }
        }
    }
    const briefLines = [
        `> **GSD Active State**: Phase: ${currentPhase} | Status: ${status}`,
        `> **Decisions**: ${decisions.length > 0 ? decisions.join('; ') : 'Standard constraints active'}`,
        `> **Unified Commands**: /gsd:status, /gsd:plan, /gsd:exec, /gsd:review, /gsd:verify, /gsd:ship`
    ];
    return briefLines.join('\n');
}
/**
 * Synchronizes the active session context into target agent rule/context files.
 */
function syncSessionContext(planningDir, rootDir) {
    try {
        const resolvedPlanning = node_path_1.default.resolve(planningDir);
        const resolvedRoot = node_path_1.default.resolve(rootDir);
        const brief = extractSessionBrief(resolvedPlanning);
        const contextBlock = `${START_MARKER}\n${brief}\n${END_MARKER}`;
        // Target files in priority order
        const candidateFiles = [
            node_path_1.default.join(resolvedRoot, 'GEMINI.md'),
            node_path_1.default.join(resolvedRoot, 'AGENTS.md'),
            node_path_1.default.join(resolvedRoot, '.agents', 'rules', 'gsd-session.md')
        ];
        let synchronized = false;
        for (const targetFile of candidateFiles) {
            if (node_fs_1.default.existsSync(targetFile)) {
                const content = (0, shell_command_projection_cjs_1.platformReadSync)(targetFile) || '';
                let newContent;
                if (content.includes(START_MARKER) && content.includes(END_MARKER)) {
                    const regex = new RegExp(`${START_MARKER}[\\s\\S]*?${END_MARKER}`, 'm');
                    newContent = content.replace(regex, contextBlock);
                }
                else {
                    newContent = `${contextBlock}\n\n${content}`;
                }
                (0, shell_command_projection_cjs_1.platformWriteSync)(targetFile, newContent);
                synchronized = true;
                break; // Only update the primary existing file
            }
        }
        // If no existing file found, write to .agents/rules/gsd-session.md
        if (!synchronized) {
            const fallbackDir = node_path_1.default.join(resolvedRoot, '.agents', 'rules');
            node_fs_1.default.mkdirSync(fallbackDir, { recursive: true });
            const fallbackFile = node_path_1.default.join(fallbackDir, 'gsd-session.md');
            (0, shell_command_projection_cjs_1.platformWriteSync)(fallbackFile, contextBlock);
            synchronized = true;
        }
        return synchronized;
    }
    catch {
        return false;
    }
}
module.exports = {
    syncSessionContext,
    extractSessionBrief,
    START_MARKER,
    END_MARKER,
};
