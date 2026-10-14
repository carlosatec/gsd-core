"use strict";
/**
 * GSD Shell Command Blast Radius (Phase 32 — Wave 4)
 *
 * Physical Safety Guardrails:
 * 1. Analyzes shell commands for destructive physical operations (rm -rf, git reset --hard,
 *    git clean -fd, git push --force, db migrations).
 * 2. Simulates dry-run impact to determine affected files and count.
 * 3. Enforces interactive confirmation while supporting seamless headless/CI bypass.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_child_process_1 = require("node:child_process");
const DESTRUCTIVE_RM_PATTERN = /(?:^|\s|;|&|\|)(?:rm|rimraf)\s+(?:-[a-zA-Z]*r[a-zA-Z]*f?|--recursive(?:\s+--force)?)\s+([^;&|]+)/i;
const POWERSHELL_RM_PATTERN = /(?:^|\s|;|&|\|)(?:Remove-Item|rmdir|rd)\s+(?:.*-(?:Recurse|r)\b.*|.*-(?:Force|fo)\b.*|\/s\s+\/q)\s*([^;&|]*)/i;
const WINDOWS_DEL_PATTERN = /(?:^|\s|;|&|\|)del\s+.*(?:\/s|\/q)\b\s*([^;&|]*)/i;
const GIT_RESET_HARD_PATTERN = /(?:^|\s|;|&|\|)git\s+reset\s+--hard(?:\s+([^\s;&|]+))?/i;
const GIT_RESTORE_PATTERN = /(?:^|\s|;|&|\|)git\s+(?:restore\s+\.|checkout\s+--\s+\.)/i;
const GIT_CLEAN_FORCE_PATTERN = /(?:^|\s|;|&|\|)git\s+clean\s+.*-[a-zA-Z]*f/i;
const GIT_FORCE_PUSH_PATTERN = /(?:^|\s|;|&|\|)git\s+push\s+.*(?:--force|-f\b)/i;
const DB_MIGRATE_DESTRUCTIVE_PATTERN = /(?:prisma\s+migrate\s+(?:reset|dev\s+--force)|(?:db:drop|db:reset))/i;
/**
 * Counts all files under a directory recursively.
 */
function listFilesRecursively(dirPath, maxFiles = 100) {
    const results = [];
    function recurse(current) {
        if (results.length >= maxFiles)
            return;
        try {
            if (!node_fs_1.default.existsSync(current))
                return;
            const stat = node_fs_1.default.statSync(current);
            if (stat.isDirectory()) {
                const entries = node_fs_1.default.readdirSync(current);
                for (const entry of entries) {
                    recurse(node_path_1.default.join(current, entry));
                    if (results.length >= maxFiles)
                        break;
                }
            }
            else {
                results.push(current);
            }
        }
        catch {
            // Non-blocking
        }
    }
    recurse(dirPath);
    return results;
}
/**
 * Simulates physical impact of destructive commands using dry-run primitives.
 */
function simulateCommandImpact(command, category, cwd = process.cwd()) {
    const affectedResources = [];
    let details = '';
    if (category === 'file_deletion') {
        const rmMatch = command.match(DESTRUCTIVE_RM_PATTERN);
        if (rmMatch && rmMatch[1]) {
            const targets = rmMatch[1].trim().split(/\s+/).filter(t => !t.startsWith('-'));
            for (const target of targets) {
                const fullTarget = node_path_1.default.isAbsolute(target) ? target : node_path_1.default.resolve(cwd, target);
                if (node_fs_1.default.existsSync(fullTarget)) {
                    const files = listFilesRecursively(fullTarget, 100);
                    for (const f of files) {
                        affectedResources.push(node_path_1.default.relative(cwd, f).replace(/\\/g, '/'));
                    }
                }
            }
            details = `Target directories/files in removal path (${affectedResources.length} files detected).`;
        }
    }
    else if (category === 'git_reset') {
        try {
            const statusOut = (0, node_child_process_1.execSync)('git status --porcelain', {
                cwd,
                encoding: 'utf8',
                windowsHide: true,
                timeout: 5000,
            });
            const lines = statusOut.split(/\r?\n/).filter(l => l.trim().length > 0);
            for (const line of lines) {
                const filePath = line.slice(3).trim();
                affectedResources.push(filePath);
            }
            details = `Uncommitted modified or staged files will be permanently discarded (${affectedResources.length} files).`;
        }
        catch {
            details = 'Unable to run git status dry-run.';
        }
    }
    else if (category === 'git_clean') {
        try {
            const cleanOut = (0, node_child_process_1.execSync)('git clean -n -d', {
                cwd,
                encoding: 'utf8',
                windowsHide: true,
                timeout: 5000,
            });
            const lines = cleanOut.split(/\r?\n/).filter(l => l.trim().length > 0);
            for (const line of lines) {
                const match = line.match(/^Would remove\s+(.+)/i);
                if (match) {
                    affectedResources.push(match[1].trim());
                }
            }
            details = `Untracked files to be deleted by git clean (${affectedResources.length} files).`;
        }
        catch {
            details = 'Unable to run git clean dry-run.';
        }
    }
    else if (category === 'git_force_push') {
        details = 'Remote git branch history will be overwritten; commits may be lost.';
    }
    else if (category === 'database_migration') {
        details = 'Database reset or migration will wipe local tables and schemas.';
    }
    return {
        affectedResources,
        affectedCount: affectedResources.length,
        details,
    };
}
/**
 * Inspects a shell command and calculates its destructive risk and blast radius.
 */
function inspectCommandRisk(command, options = {}) {
    const cwd = options.cwd || process.cwd();
    const trimmed = command.trim();
    // Environment detection for non-interactive bypass
    const isCi = process.env['CI'] === 'true';
    const isAuto = process.env['GSD_AUTO'] === '1';
    const isDebianNonInteractive = process.env['DEBIAN_FRONTEND'] === 'noninteractive';
    const isForce = options.force === true || /--force|--non-interactive/.test(trimmed);
    const nonInteractive = options.nonInteractive ?? (isCi || isAuto || isDebianNonInteractive || isForce);
    let category = 'other';
    let riskLevel = 'safe';
    let isDestructive = false;
    if (DESTRUCTIVE_RM_PATTERN.test(trimmed) || POWERSHELL_RM_PATTERN.test(trimmed) || WINDOWS_DEL_PATTERN.test(trimmed)) {
        category = 'file_deletion';
        riskLevel = 'critical';
        isDestructive = true;
    }
    else if (GIT_RESET_HARD_PATTERN.test(trimmed) || GIT_RESTORE_PATTERN.test(trimmed)) {
        category = 'git_reset';
        riskLevel = 'critical';
        isDestructive = true;
    }
    else if (GIT_CLEAN_FORCE_PATTERN.test(trimmed)) {
        category = 'git_clean';
        riskLevel = 'high';
        isDestructive = true;
    }
    else if (GIT_FORCE_PUSH_PATTERN.test(trimmed)) {
        category = 'git_force_push';
        riskLevel = 'critical';
        isDestructive = true;
    }
    else if (DB_MIGRATE_DESTRUCTIVE_PATTERN.test(trimmed)) {
        category = 'database_migration';
        riskLevel = 'high';
        isDestructive = true;
    }
    else if (/^(?:git\s+(?:status|diff|log|branch)|npm\s+(?:test|run|list)|node|tsc|cat|echo|ls|dir|pwd)\b/i.test(trimmed)) {
        category = 'safe_command';
        riskLevel = 'safe';
        isDestructive = false;
    }
    if (!isDestructive) {
        return {
            command: trimmed,
            riskLevel,
            category,
            isDestructive: false,
            affectedResources: [],
            affectedCount: 0,
            requiresConfirmation: false,
            bypassNonInteractive: nonInteractive,
        };
    }
    // Simulate blast radius
    const simulation = simulateCommandImpact(trimmed, category, cwd);
    const requiresConfirmation = !nonInteractive;
    const warning = `[GSD Shell Blast Radius Warning] O comando \`${trimmed}\` tem risco ${riskLevel.toUpperCase()} (${category}). ` +
        `${simulation.details}` +
        (requiresConfirmation ? ' Requer confirmação explícita do usuário.' : ' (Bypass não-interativo ativo)');
    return {
        command: trimmed,
        riskLevel,
        category,
        isDestructive: true,
        affectedResources: simulation.affectedResources,
        affectedCount: simulation.affectedCount,
        dryRunOutput: simulation.details,
        warning,
        requiresConfirmation,
        bypassNonInteractive: nonInteractive,
    };
}
/**
 * Format a risk report into user-facing markdown.
 */
function formatRiskReport(report) {
    const lines = [
        `### [GSD Command Blast Radius: ${report.riskLevel.toUpperCase()}]`,
        `- **Comando**: \`${report.command}\``,
        `- **Categoria de Risco**: \`${report.category}\``,
        `- **Impacto Físico**: ${report.dryRunOutput || 'Operação destrutiva'}`,
    ];
    if (report.affectedCount > 0) {
        lines.push(`- **Recursos em Risco (${report.affectedCount} total)**:`);
        for (const r of report.affectedResources.slice(0, 10)) {
            lines.push(`  - \`${r}\``);
        }
        if (report.affectedCount > 10) {
            lines.push(`  - ... e mais ${report.affectedCount - 10} recursos.`);
        }
    }
    if (report.bypassNonInteractive) {
        lines.push('- **Modo de Execução**: Headless/Non-Interactive Bypass ativo (não bloqueante).');
    }
    else if (report.requiresConfirmation) {
        lines.push('- **Ação Requerida**: Confirmação humana explícita obrigatória antes da execução.');
    }
    return lines.join('\n');
}
module.exports = {
    inspectCommandRisk,
    simulateCommandImpact,
    formatRiskReport,
};
