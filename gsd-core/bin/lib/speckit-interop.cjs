'use strict';
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeExternalSpecContent = sanitizeExternalSpecContent;
exports.parseRfc2119Requirement = parseRfc2119Requirement;
exports.parseSpecKitDocument = parseSpecKitDocument;
exports.parseConstitution = parseConstitution;
exports.validateAgainstConstitution = validateAgainstConstitution;
exports.exportToSpecKit = exportToSpecKit;
/**
 * GitHub Spec-Kit Interoperability & RFC 2119 Normative Parser (Phase 34)
 *
 * Implements bidirectional conversion between the GitHub Spec-Kit specification
 * format (constitution.md, spec.md, plan.md, tasks.md) and GSD Core Nexus structures.
 * Features strict RFC 2119 requirements classification and anti-prompt-injection sanitization.
 */
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
/**
 * Anti-Prompt-Injection Spec Sanitizer (D4Vinci Scrapling pattern)
 * Neutralizes indirect prompt injection attacks embedded in imported external specs,
 * stripping hidden HTML elements, zero-width unicode, and prompt control markers.
 */
function sanitizeExternalSpecContent(raw) {
    if (!raw || typeof raw !== 'string')
        return '';
    let sanitized = raw;
    // 1. Strip zero-width characters and invisible unicode homoglyphs
    sanitized = sanitized.replace(/[\u200B-\u200D\uFEFF\u2060\u202A-\u202E]/g, '');
    // 2. Strip dangerous HTML execution/injection tags
    sanitized = sanitized.replace(/<\s*(?:script|iframe|object|embed|template|style)\b[^>]*>[\s\S]*?<\s*\/\s*(?:script|iframe|object|embed|template|style)\s*>/gi, '');
    // 3. Strip system instruction injection comments <!-- SYSTEM: ... -->
    sanitized = sanitized.replace(/<!--\s*(?:SYSTEM|INSTRUCTION|PROMPT|INST|ASSISTANT|ADMIN)[:\s][\s\S]*?-->/gi, '');
    // 4. Strip LLM delimiter injection tokens
    sanitized = sanitized.replace(/\[\s*(?:SYSTEM|INST|ASSISTANT)\s*\]/gi, '');
    sanitized = sanitized.replace(/<<\s*SYS\s*>>[\s\S]*?<<\s*\/\s*SYS\s*>>/gi, '');
    sanitized = sanitized.replace(/(?:^|\n)\s*(?:SYSTEM|INSTRUCTION):\s*(?:Ignore previous|Forget instructions|Bypass|Override).*/gi, '');
    return sanitized;
}
/**
 * Parse an individual requirement sentence using RFC 2119 normative keywords
 */
function parseRfc2119Requirement(text, id = 'REQ') {
    const clean = text.trim();
    const upper = clean.toUpperCase();
    let priority = 'MAY';
    let isNegative = false;
    let severity = 'info';
    if (/\b(?:MUST NOT|SHALL NOT)\b/.test(upper)) {
        priority = 'MUST';
        isNegative = true;
        severity = 'error';
    }
    else if (/\b(?:MUST|SHALL|REQUIRED)\b/.test(upper)) {
        priority = 'MUST';
        isNegative = false;
        severity = 'error';
    }
    else if (/\b(?:SHOULD NOT|NOT RECOMMENDED)\b/.test(upper)) {
        priority = 'SHOULD';
        isNegative = true;
        severity = 'warning';
    }
    else if (/\b(?:SHOULD|RECOMMENDED)\b/.test(upper)) {
        priority = 'SHOULD';
        isNegative = false;
        severity = 'warning';
    }
    else {
        priority = 'MAY';
        isNegative = false;
        severity = 'info';
    }
    return {
        id,
        text: clean,
        priority,
        isNegative,
        severity,
    };
}
/**
 * Parse a full Spec-Kit spec.md document
 */
function parseSpecKitDocument(rawContent) {
    const cleanContent = sanitizeExternalSpecContent(rawContent);
    const lines = cleanContent.split(/\r?\n/);
    let title = 'Untitled Specification';
    let overview = '';
    const userStories = [];
    const requirements = [];
    const acceptanceCriteria = [];
    let currentSection = 'intro';
    let reqCounter = 1;
    let storyCounter = 1;
    for (const line of lines) {
        const trimmed = line.trim();
        // Title detection
        if (trimmed.startsWith('# ') && title === 'Untitled Specification') {
            title = trimmed.slice(2).trim();
            continue;
        }
        // Section header detection
        if (trimmed.startsWith('## ')) {
            const heading = trimmed.slice(3).toLowerCase();
            if (heading.includes('overview') || heading.includes('summary')) {
                currentSection = 'overview';
            }
            else if (heading.includes('user stor') || heading.includes('persona')) {
                currentSection = 'user_stories';
            }
            else if (heading.includes('requirement')) {
                currentSection = 'requirements';
            }
            else if (heading.includes('acceptance') || heading.includes('criteria') || heading.includes('verification')) {
                currentSection = 'acceptance_criteria';
            }
            else {
                currentSection = 'other';
            }
            continue;
        }
        if (!trimmed)
            continue;
        if (currentSection === 'overview' && !trimmed.startsWith('#')) {
            overview += (overview ? ' ' : '') + trimmed;
        }
        else if (currentSection === 'user_stories') {
            const storyMatch = trimmed.match(/as an?\s+(.+?),\s*i want\s+(.+?)(?:,\s*so that\s+(.+))?$/i);
            if (storyMatch) {
                userStories.push({
                    id: `US-${storyCounter++}`,
                    asA: storyMatch[1].trim(),
                    iWant: storyMatch[2].trim(),
                    soThat: storyMatch[3] ? storyMatch[3].trim() : '',
                });
            }
        }
        else if (currentSection === 'requirements') {
            if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || /^\d+\.\s/.test(trimmed)) {
                const reqText = trimmed.replace(/^[-*\d.]+\s*/, '');
                requirements.push(parseRfc2119Requirement(reqText, `REQ-${reqCounter++}`));
            }
        }
        else if (currentSection === 'acceptance_criteria') {
            if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || /^\d+\.\s/.test(trimmed)) {
                acceptanceCriteria.push(trimmed.replace(/^[-*\d.]+\s*/, ''));
            }
        }
    }
    return {
        title,
        overview,
        userStories,
        requirements,
        acceptanceCriteria,
    };
}
/**
 * Parse a CONSTITUTION.md document
 */
function parseConstitution(rawContent) {
    const cleanContent = sanitizeExternalSpecContent(rawContent);
    const lines = cleanContent.split(/\r?\n/);
    const invariants = [];
    const codingStandards = [];
    const guardrails = [];
    let currentSection = 'invariants';
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('## ')) {
            const heading = trimmed.slice(3).toLowerCase();
            if (heading.includes('invariant') || heading.includes('rule') || heading.includes('principle')) {
                currentSection = 'invariants';
            }
            else if (heading.includes('standard') || heading.includes('style') || heading.includes('convention')) {
                currentSection = 'coding_standards';
            }
            else if (heading.includes('guardrail') || heading.includes('security')) {
                currentSection = 'guardrails';
            }
            continue;
        }
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            const item = trimmed.replace(/^[-*]\s*/, '');
            if (currentSection === 'invariants')
                invariants.push(item);
            else if (currentSection === 'coding_standards')
                codingStandards.push(item);
            else if (currentSection === 'guardrails')
                guardrails.push(item);
        }
    }
    return { invariants, codingStandards, guardrails };
}
/**
 * Validate a proposed task or commit against project CONSTITUTION.md invariants
 */
function validateAgainstConstitution(taskText, root) {
    const constitutionPath = path.join(root, 'CONSTITUTION.md');
    if (!fs.existsSync(constitutionPath)) {
        return { valid: true, violations: [] };
    }
    let constitutionContent = '';
    try {
        constitutionContent = fs.readFileSync(constitutionPath, 'utf8');
    }
    catch {
        return { valid: true, violations: [] };
    }
    const constitution = parseConstitution(constitutionContent);
    const violations = [];
    const textUpper = taskText.toUpperCase();
    for (const inv of constitution.invariants) {
        // Detect prohibited tools or libraries
        if (/\b(?:NO PYTHON|SEM PYTHON|ZERO PYTHON)\b/i.test(inv)) {
            if (/\b(?:python|pip|chromadb|langchain)\b/i.test(textUpper)) {
                violations.push(`Violates constitutional invariant: '${inv}' (task mentions Python/ChromaDB toolchain)`);
            }
        }
        if (/\b(?:NO-THROW|NÃO LANÇAR EXCEÇÕES)\b/i.test(inv)) {
            if (/\b(?:process\.exit|throw unhandled)\b/i.test(textUpper)) {
                violations.push(`Violates constitutional invariant: '${inv}' (task introduces process.exit or unhandled throw)`);
            }
        }
    }
    return {
        valid: violations.length === 0,
        violations,
    };
}
/**
 * Export a GSD Phase Spec to standard GitHub Spec-Kit format
 */
function exportToSpecKit(phaseSpec) {
    const specLines = [
        `# Specification: ${phaseSpec.title}`,
        '',
        '## Overview',
        phaseSpec.goal,
        '',
        '## Requirements',
    ];
    for (let i = 0; i < (phaseSpec.requirements || []).length; i++) {
        specLines.push(`- **REQ-${i + 1}**: MUST ${phaseSpec.requirements[i]}`);
    }
    const tasksLines = [
        `# Tasks: ${phaseSpec.title}`,
        '',
        '| Task ID | Wave | Description | Status |',
        '| :---: | :---: | :--- | :---: |',
    ];
    for (const t of phaseSpec.tasks || []) {
        tasksLines.push(`| ${t.id} | Wave ${t.wave || 1} | ${t.description} | Pending |`);
    }
    const planLines = [
        `# Plan: ${phaseSpec.title}`,
        '',
        '## Architecture Blueprint',
        `Execution strategy for: ${phaseSpec.title}`,
        '',
        '## Execution Waves',
        `Organized across ${Math.max(1, ...((phaseSpec.tasks || []).map(t => t.wave || 1)))} waves with pre-flight verification.`,
    ];
    return {
        specMd: specLines.join('\n') + '\n',
        planMd: planLines.join('\n') + '\n',
        tasksMd: tasksLines.join('\n') + '\n',
    };
}
