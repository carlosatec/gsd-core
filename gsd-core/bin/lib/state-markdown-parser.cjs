"use strict";
/**
 * State Markdown Parser — Pure, stateless parsing & formatting utilities for STATE.md.
 *
 * Part of GSD Core 2.3 Safe Modularization (D-32).
 * Extracts pure string/markdown parsing logic out of the state.cts monolith without
 * touching any I/O locks, closures, or state machines.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseProsePhaseField = parseProsePhaseField;
exports.parseProseLastActivityField = parseProseLastActivityField;
exports.extractRetiredPhaseNumbers = extractRetiredPhaseNumbers;
exports.sanitizeMarkdownHeader = sanitizeMarkdownHeader;
/**
 * Parses prose phase string into phase number/identifier and optional name.
 * Handles formats: "1 - Foundation", "Phase 1: Setup", "01 (Init)", "1".
 */
function parseProsePhaseField(value) {
    if (!value || typeof value !== 'string') {
        return { phase: null, name: null };
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return { phase: null, name: null };
    }
    // Matches "Phase 1: Setup", "1 - Setup", "01: Setup"
    const match = trimmed.match(/^(?:Phase\s+)?(\d+|[a-zA-Z0-9_-]+)(?:\s*[:\-–—]\s*(.*))?$/i);
    if (match) {
        const phase = match[1].trim();
        const name = match[2] ? match[2].trim() : null;
        return { phase, name };
    }
    return { phase: trimmed, name: null };
}
/**
 * Parses last activity date and description from prose field.
 * Handles "2026-08-20: Completed phase 9", "2026-08-20 (Phase 9 done)".
 */
function parseProseLastActivityField(value) {
    if (!value || typeof value !== 'string') {
        return { date: null, description: null };
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return { date: null, description: null };
    }
    const dateMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})(?:\s*[:\-–—]\s*(.*))?$/);
    if (dateMatch) {
        return {
            date: dateMatch[1].trim(),
            description: dateMatch[2] ? dateMatch[2].trim() : null,
        };
    }
    return { date: null, description: trimmed };
}
/**
 * Extracts retired or strikethrough phase numbers from a text block.
 * Handles `~~Phase 1~~`, `~~1~~`, `~~Phase 01: Setup~~`.
 */
function extractRetiredPhaseNumbers(scope) {
    const result = new Set();
    if (!scope || typeof scope !== 'string') {
        return result;
    }
    const strikeMatches = scope.matchAll(/~~(?:Phase\s+)?(\d+)[^~]*~~/gi);
    for (const m of strikeMatches) {
        if (m[1]) {
            result.add(m[1].trim());
            // Also add unpadded or padded variant
            const num = parseInt(m[1], 10);
            if (!isNaN(num)) {
                result.add(String(num));
            }
        }
    }
    return result;
}
/**
 * Sanitizes markdown heading lines to prevent corrupted table rendering.
 */
function sanitizeMarkdownHeader(text) {
    if (!text || typeof text !== 'string')
        return '';
    return text.replace(/[|`]/g, '').trim();
}
exports.default = {
    parseProsePhaseField,
    parseProseLastActivityField,
    extractRetiredPhaseNumbers,
    sanitizeMarkdownHeader,
};
