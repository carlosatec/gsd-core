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
exports.KNOWN_DRIFT_SCRIPTS = exports.DRIFT_RULES = void 0;
exports.lintAnthropicSkillsSpec = lintAnthropicSkillsSpec;
exports.runSingleRule = runSingleRule;
exports.runUnifiedDriftSuite = runUnifiedDriftSuite;
/**
 * Drift Linter Suite — Unified In-Memory Runner for GSD Core Nexus (Phase 34)
 *
 * Consolidates over 30 individual drift checker scripts into a unified in-memory
 * execution pipeline, eliminating multi-process spawn overhead in CI while preserving
 * 100% backward compatibility for nominal exports in `scripts/lint-*.cjs`.
 */
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
/**
 * Validate Anthropic Agent Skills Specification Compliance
 * Ensures every skill folder in `.github/skills/` contains a valid `SKILL.md`
 * with canonical YAML frontmatter (`name`, `description`).
 */
function lintAnthropicSkillsSpec(root) {
    const violations = [];
    const candidateDirs = [
        path.join(root, '.github', 'skills'),
        path.join(root, 'skills'),
    ];
    for (const dir of candidateDirs) {
        if (!fs.existsSync(dir))
            continue;
        let entries = [];
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        }
        catch (err) {
            violations.push({
                rule: 'lint-anthropic-skills-spec',
                file: dir,
                message: `Failed to read directory: ${err instanceof Error ? err.message : String(err)}`,
            });
            continue;
        }
        for (const entry of entries) {
            if (!entry.isDirectory())
                continue;
            const skillName = entry.name;
            const skillMdPath = path.join(dir, skillName, 'SKILL.md');
            if (!fs.existsSync(skillMdPath)) {
                violations.push({
                    rule: 'lint-anthropic-skills-spec',
                    id: skillName,
                    file: skillMdPath,
                    message: `Skill directory '${skillName}' is missing required SKILL.md entrypoint`,
                });
                continue;
            }
            let content = '';
            try {
                content = fs.readFileSync(skillMdPath, 'utf8');
            }
            catch (err) {
                violations.push({
                    rule: 'lint-anthropic-skills-spec',
                    id: skillName,
                    file: skillMdPath,
                    message: `Failed to read SKILL.md: ${err instanceof Error ? err.message : String(err)}`,
                });
                continue;
            }
            // Check YAML frontmatter: must start with --- and have name and description
            const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
            if (!frontmatterMatch) {
                violations.push({
                    rule: 'lint-anthropic-skills-spec',
                    id: skillName,
                    file: skillMdPath,
                    message: `SKILL.md in '${skillName}' is missing valid YAML frontmatter (delimited by ---)`,
                });
                continue;
            }
            const frontmatter = frontmatterMatch[1];
            const hasName = /(?:^|\n)\s*name\s*:\s*[^\r\n]+/.test(frontmatter);
            const hasDescription = /(?:^|\n)\s*description\s*:\s*[^\r\n]+/.test(frontmatter);
            if (!hasName) {
                violations.push({
                    rule: 'lint-anthropic-skills-spec',
                    id: skillName,
                    file: skillMdPath,
                    message: `SKILL.md in '${skillName}' frontmatter is missing required 'name' field`,
                });
            }
            if (!hasDescription) {
                violations.push({
                    rule: 'lint-anthropic-skills-spec',
                    id: skillName,
                    file: skillMdPath,
                    message: `SKILL.md in '${skillName}' frontmatter is missing required 'description' field`,
                });
            }
        }
    }
    return violations;
}
/**
 * Registry of rules participating in the unified drift suite.
 */
exports.DRIFT_RULES = {
    'anthropic-skills-spec': {
        name: 'anthropic-skills-spec',
        description: 'Anthropic Agent Skills specification and YAML frontmatter conformance',
        run: (root) => lintAnthropicSkillsSpec(root),
    },
};
/**
 * Helper to dynamically load a legacy CJS script scanner if present and run it in-memory.
 */
function runLegacyScriptScanner(root, scriptFileName, scanFunctionName = 'scanRepo') {
    const scriptPath = path.join(root, 'scripts', scriptFileName);
    if (!fs.existsSync(scriptPath)) {
        return [{
                rule: scriptFileName,
                file: scriptPath,
                message: `Script file not found: ${scriptFileName}`,
            }];
    }
    try {
        const dynamicRequire = eval('require');
        const mod = dynamicRequire(scriptPath);
        const loadFn = mod.loadBaseline;
        const diffFn = mod.diffAgainstBaseline;
        const scanFn = typeof mod[scanFunctionName] === 'function' ? mod[scanFunctionName] : undefined;
        // If the module supports ratchet baseline comparison, reconcile with baseline:
        if (typeof loadFn === 'function' && typeof diffFn === 'function' && typeof scanFn === 'function') {
            const baselineRes = loadFn(root);
            const entries = baselineRes ? (baselineRes.entries || []) : [];
            const raw = scanFn(root);
            const rawList = Array.isArray(raw)
                ? raw
                : (raw && typeof raw === 'object' && 'violations' in raw && Array.isArray(raw.violations)
                    ? raw.violations
                    : []);
            const diff = diffFn(rawList, entries);
            const violations = [];
            for (const f of diff.fresh || []) {
                violations.push({
                    rule: scriptFileName,
                    file: f.file || null,
                    message: `Unacknowledged raw read: ${f.text || f.found || JSON.stringify(f)}`,
                    details: f,
                });
            }
            for (const s of diff.stale || []) {
                violations.push({
                    rule: scriptFileName,
                    file: s.file || null,
                    message: `Stale baseline entry: ${s.text || JSON.stringify(s)}`,
                    details: s,
                });
            }
            return violations;
        }
        if (typeof scanFn === 'function') {
            const rawViolations = scanFn(root);
            if (Array.isArray(rawViolations)) {
                return rawViolations.map((v) => ({
                    rule: scriptFileName,
                    id: v.id ?? v.schemaId ?? v.phaseId ?? null,
                    file: v.file ?? null,
                    message: v.message ?? v.reason ?? JSON.stringify(v),
                    details: v,
                }));
            }
        }
        return [];
    }
    catch (err) {
        return [{
                rule: scriptFileName,
                file: scriptPath,
                message: `Failed executing ${scriptFileName} in-memory: ${err instanceof Error ? err.message : String(err)}`,
            }];
    }
}
/**
 * Known legacy drift scripts that export pure scanners
 */
exports.KNOWN_DRIFT_SCRIPTS = [
    { name: 'table-schema-drift', file: 'lint-table-schema-drift.cjs', scanFn: 'scanRepo' },
    { name: 'plan-count-drift', file: 'lint-plan-count-drift.cjs', scanFn: 'scanRepo' },
    { name: 'phase-enumeration-drift', file: 'lint-phase-enumeration-drift.cjs', scanFn: 'scanRepo' },
    { name: 'state-field-drift', file: 'lint-state-field-drift.cjs', scanFn: 'scanRepo' },
    { name: 'completion-predicate-drift', file: 'lint-completion-predicate-drift.cjs', scanFn: 'scanRepo' },
    { name: 'milestone-window-drift', file: 'lint-milestone-window-drift.cjs', scanFn: 'scanRepo' },
    { name: 'planning-prompt-drift', file: 'lint-planning-prompt-drift.cjs', scanFn: 'scanRepo' },
    { name: 'unreachable-guard-drift', file: 'lint-unreachable-guard-drift.cjs', scanFn: 'scanRepo' },
    { name: 'state-write-path-drift', file: 'lint-state-write-path-drift.cjs', scanFn: 'scanRepo' },
    { name: 'planning-snapshot-bypass-drift', file: 'lint-planning-snapshot-bypass-drift.cjs', scanFn: 'scanRepo' },
    { name: 'planning-artifact-writer-drift', file: 'lint-planning-artifact-writer-drift.cjs', scanFn: 'scanRepo' },
    { name: 'emitted-drift-ack', file: 'lint-emitted-drift-ack.cjs', scanFn: 'scanRepo' },
];
/**
 * Run a single named drift rule
 */
function runSingleRule(ruleName, root) {
    const projectRoot = root ?? process.cwd();
    const startTime = Date.now();
    let violations = [];
    if (exports.DRIFT_RULES[ruleName]) {
        violations = exports.DRIFT_RULES[ruleName].run(projectRoot);
    }
    else {
        const legacy = exports.KNOWN_DRIFT_SCRIPTS.find(s => s.name === ruleName || s.file === ruleName);
        if (legacy) {
            violations = runLegacyScriptScanner(projectRoot, legacy.file, legacy.scanFn ?? 'scanRepo');
        }
        else {
            violations.push({
                rule: ruleName,
                message: `Unknown drift rule '${ruleName}'`,
            });
        }
    }
    const durationMs = Date.now() - startTime;
    return {
        rule: ruleName,
        passed: violations.length === 0,
        durationMs,
        violations,
    };
}
/**
 * Run the entire unified drift suite in-memory
 */
function runUnifiedDriftSuite(root, selectedRules) {
    const projectRoot = root ?? process.cwd();
    const suiteStartTime = Date.now();
    const results = [];
    const rulesToRun = selectedRules && selectedRules.length > 0
        ? selectedRules
        : ['anthropic-skills-spec', ...exports.KNOWN_DRIFT_SCRIPTS.map(s => s.name)];
    for (const rule of rulesToRun) {
        results.push(runSingleRule(rule, projectRoot));
    }
    const passedRules = results.filter(r => r.passed).length;
    const failedRules = results.length - passedRules;
    const durationMs = Date.now() - suiteStartTime;
    return {
        passed: failedRules === 0,
        totalRules: results.length,
        passedRules,
        failedRules,
        durationMs,
        results,
    };
}
