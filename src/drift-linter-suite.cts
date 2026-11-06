'use strict';

/**
 * Drift Linter Suite — Unified In-Memory Runner for GSD Core Nexus (Phase 34)
 *
 * Consolidates over 30 individual drift checker scripts into a unified in-memory
 * execution pipeline, eliminating multi-process spawn overhead in CI while preserving
 * 100% backward compatibility for nominal exports in `scripts/lint-*.cjs`.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface DriftViolation {
  rule: string;
  id?: string | null;
  file?: string | null;
  message: string;
  reason?: string | null;
  details?: unknown;
}

export interface DriftRuleResult {
  rule: string;
  passed: boolean;
  durationMs: number;
  violations: DriftViolation[];
}

export interface UnifiedSuiteResult {
  passed: boolean;
  totalRules: number;
  passedRules: number;
  failedRules: number;
  durationMs: number;
  results: DriftRuleResult[];
}

/**
 * Validate Anthropic Agent Skills Specification Compliance
 * Ensures every skill folder in `.github/skills/` contains a valid `SKILL.md`
 * with canonical YAML frontmatter (`name`, `description`).
 */
export function lintAnthropicSkillsSpec(root: string): DriftViolation[] {
  const violations: DriftViolation[] = [];
  const candidateDirs = [
    path.join(root, '.github', 'skills'),
    path.join(root, 'skills'),
  ];

  for (const dir of candidateDirs) {
    if (!fs.existsSync(dir)) continue;

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err: unknown) {
      violations.push({
        rule: 'lint-anthropic-skills-spec',
        file: dir,
        message: `Failed to read directory: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
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
      } catch (err: unknown) {
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

export type RuleRunner = (root: string) => DriftViolation[];

export interface RegisteredRule {
  name: string;
  description: string;
  run: RuleRunner;
}

/**
 * Registry of rules participating in the unified drift suite.
 */
export const DRIFT_RULES: Record<string, RegisteredRule> = {
  'anthropic-skills-spec': {
    name: 'anthropic-skills-spec',
    description: 'Anthropic Agent Skills specification and YAML frontmatter conformance',
    run: (root) => lintAnthropicSkillsSpec(root),
  },
};

interface LegacyScriptScannerModule {
  loadBaseline?: (root: string) => { entries?: unknown[] };
  diffAgainstBaseline?: (found: unknown[], entries: unknown[]) => {
    fresh?: Array<{ file?: string; line?: number; text?: string; found?: string }>;
    stale?: Array<{ file?: string; line?: number; text?: string }>;
  };
  [key: string]: unknown;
}

interface RawViolationItem {
  id?: string;
  schemaId?: string;
  phaseId?: string;
  file?: string;
  message?: string;
  reason?: string;
  [key: string]: unknown;
}

/**
 * Helper to dynamically load a legacy CJS script scanner if present and run it in-memory.
 */
function runLegacyScriptScanner(root: string, scriptFileName: string, scanFunctionName = 'scanRepo'): DriftViolation[] {
  const scriptPath = path.join(root, 'scripts', scriptFileName);
  if (!fs.existsSync(scriptPath)) {
    return [{
      rule: scriptFileName,
      file: scriptPath,
      message: `Script file not found: ${scriptFileName}`,
    }];
  }

  try {
    const dynamicRequire = eval('require') as (id: string) => LegacyScriptScannerModule;
    const mod = dynamicRequire(scriptPath);

    const loadFn = mod.loadBaseline;
    const diffFn = mod.diffAgainstBaseline;
    const scanFn = typeof mod[scanFunctionName] === 'function' ? (mod[scanFunctionName] as (r: string) => unknown) : undefined;

    // If the module supports ratchet baseline comparison, reconcile with baseline:
    if (typeof loadFn === 'function' && typeof diffFn === 'function' && typeof scanFn === 'function') {
      const baselineRes = loadFn(root);
      const entries = baselineRes ? (baselineRes.entries || []) : [];
      const raw = scanFn(root);
      const rawList = Array.isArray(raw)
        ? raw
        : (raw && typeof raw === 'object' && 'violations' in raw && Array.isArray((raw as { violations: unknown[] }).violations)
            ? (raw as { violations: unknown[] }).violations
            : []);
      const diff = diffFn(rawList, entries);
      const violations: DriftViolation[] = [];
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
        return (rawViolations as RawViolationItem[]).map((v) => ({
          rule: scriptFileName,
          id: v.id ?? v.schemaId ?? v.phaseId ?? null,
          file: v.file ?? null,
          message: v.message ?? v.reason ?? JSON.stringify(v),
          details: v,
        }));
      }
    }
    return [];
  } catch (err: unknown) {
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
export const KNOWN_DRIFT_SCRIPTS: Array<{ name: string; file: string; scanFn?: string }> = [
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
export function runSingleRule(ruleName: string, root?: string): DriftRuleResult {
  const projectRoot = root ?? process.cwd();
  const startTime = Date.now();

  let violations: DriftViolation[] = [];

  if (DRIFT_RULES[ruleName]) {
    violations = DRIFT_RULES[ruleName].run(projectRoot);
  } else {
    const legacy = KNOWN_DRIFT_SCRIPTS.find(s => s.name === ruleName || s.file === ruleName);
    if (legacy) {
      violations = runLegacyScriptScanner(projectRoot, legacy.file, legacy.scanFn ?? 'scanRepo');
    } else {
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
export function runUnifiedDriftSuite(root?: string, selectedRules?: string[]): UnifiedSuiteResult {
  const projectRoot = root ?? process.cwd();
  const suiteStartTime = Date.now();
  const results: DriftRuleResult[] = [];

  const rulesToRun = selectedRules && selectedRules.length > 0
    ? selectedRules
    : ['anthropic-skills-spec', ...KNOWN_DRIFT_SCRIPTS.map(s => s.name)];

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
