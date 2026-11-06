/**
 * Session Context Hook — Automatic session handshake & context synchronization.
 *
 * Injects active project state (STATE.md + Topology Brief <= 15 lines) into
 * the host agent context files (GEMINI.md, AGENTS.md, or .agents/rules/gsd-session.md)
 * to eliminate initial LLM context blindness on session startup.
 */

import fs from 'node:fs';
import path from 'node:path';
import { platformReadSync, platformWriteSync } from './shell-command-projection.cjs';

const START_MARKER = '<!-- GSD-SESSION-CONTEXT -->';
const END_MARKER = '<!-- /GSD-SESSION-CONTEXT -->';

/**
 * Extracts a concise session brief (<= 15 lines) from STATE.md and active planning artifacts.
 */
function extractSessionBrief(planningDir: string): string {
  const statePath = path.join(planningDir, 'STATE.md');
  const stateContent = platformReadSync(statePath) || '';

  const lines = stateContent.split('\n');
  let currentPhase = 'Unknown';
  let status = 'Idle';
  const MAX_DECISIONS_LINE_CHARS = 1200;
  const invariantDecisions: string[] = [];
  const otherDecisions: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- **Current Phase:**') || trimmed.startsWith('Current Phase:')) {
      currentPhase = trimmed.replace(/.*Current Phase:\s*\**/i, '').replace(/\*+/g, '').trim();
    } else if (trimmed.startsWith('- **Status:**') || trimmed.startsWith('Status:')) {
      status = trimmed.replace(/.*Status:\s*\**/i, '').replace(/\*+/g, '').trim();
    } else if (trimmed.startsWith('- **D-') || trimmed.startsWith('- D-')) {
      const decisionText = trimmed.slice(2);
      if (/\[Invariant\]|\[Architecture\]/i.test(decisionText) || /^D-0[1-4]\b/.test(decisionText)) {
        invariantDecisions.push(decisionText);
      } else {
        otherDecisions.push(decisionText);
      }
    }
  }

  // Stable ordering: invariants first, then other decisions
  invariantDecisions.sort();
  otherDecisions.sort();
  const prioritized = [...invariantDecisions, ...otherDecisions];

  const selectedDecisions: string[] = [];
  let currentLength = 0;
  let remainingCount = 0;

  for (let i = 0; i < prioritized.length; i++) {
    const d = prioritized[i];
    const addedLength = d.length + 2;
    if (currentLength + addedLength <= MAX_DECISIONS_LINE_CHARS || selectedDecisions.length < 4) {
      selectedDecisions.push(d);
      currentLength += addedLength;
    } else {
      remainingCount = prioritized.length - i;
      break;
    }
  }

  let decisionsFormatted = selectedDecisions.join('; ');
  if (remainingCount > 0) {
    decisionsFormatted += `; ... and ${remainingCount} more decisions in STATE.md`;
  }

  const briefLines = [
    `> **GSD Active State**: Phase: ${currentPhase} | Status: ${status}`,
    `> **Decisions**: ${selectedDecisions.length > 0 ? decisionsFormatted : 'Standard constraints active'}`,
    `> **Unified Commands**: /gsd:status, /gsd:plan, /gsd:exec, /gsd:review, /gsd:verify, /gsd:ship, /gsd:auto, /gsd:tokens, /gsd:migrate, /gsd:graph, /gsd:help`
  ];

  return briefLines.join('\n');
}

/**
 * Synchronizes the active session context into target agent rule/context files.
 */
function syncSessionContext(planningDir: string, rootDir: string): boolean {
  try {
    const resolvedPlanning = path.resolve(planningDir);
    const resolvedRoot = path.resolve(rootDir);

    const brief = extractSessionBrief(resolvedPlanning);
    const contextBlock = `${START_MARKER}\n${brief}\n${END_MARKER}`;

    // Target files in priority order
    const candidateFiles = [
      path.join(resolvedRoot, 'GEMINI.md'),
      path.join(resolvedRoot, 'AGENTS.md'),
      path.join(resolvedRoot, '.agents', 'rules', 'gsd-session.md')
    ];

    let synchronized = false;

    for (const targetFile of candidateFiles) {
      if (fs.existsSync(targetFile)) {
        const content = platformReadSync(targetFile) || '';
        let newContent: string;

        if (content.includes(START_MARKER) && content.includes(END_MARKER)) {
          const regex = new RegExp(`${START_MARKER}[\\s\\S]*?${END_MARKER}`, 'm');
          newContent = content.replace(regex, contextBlock);
        } else {
          newContent = `${contextBlock}\n\n${content}`;
        }

        platformWriteSync(targetFile, newContent);
        synchronized = true;
      }
    }

    // If no existing file found, write to .agents/rules/gsd-session.md
    if (!synchronized) {
      const fallbackDir = path.join(resolvedRoot, '.agents', 'rules');
      fs.mkdirSync(fallbackDir, { recursive: true });
      const fallbackFile = path.join(fallbackDir, 'gsd-session.md');
      platformWriteSync(fallbackFile, contextBlock);
      synchronized = true;
    }

    return synchronized;
  } catch {
    return false;
  }
}

export = {
  syncSessionContext,
  extractSessionBrief,
  START_MARKER,
  END_MARKER,
};
