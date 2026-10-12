"use strict";
/**
 * GSD Compact-Keeper & Task Drift Anchor (Phase 32 — Wave 2)
 *
 * Prevents Post-Compaction Amnesia and Scope Drift:
 * 1. Captures and reinjects high-fidelity Micro-Dossiers after context compaction.
 * 2. Anchors task execution by tracking declared vs target files and warning on drift.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = __importDefault(require("node:crypto"));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const decisionsMod = require("./decisions.cjs");
const { extractDecisions } = decisionsMod;
/**
 * Normalizes file paths to POSIX format and strips leading relative prefixes.
 */
function normalizePath(filePath) {
    return filePath.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}
/**
 * Computes SHA-256 hash snippet for a given file on disk.
 */
function getFileHash(fullPath) {
    try {
        if (node_fs_1.default.existsSync(fullPath) && node_fs_1.default.statSync(fullPath).isFile()) {
            const content = node_fs_1.default.readFileSync(fullPath);
            return node_crypto_1.default.createHash('sha256').update(content).digest('hex').slice(0, 10);
        }
    }
    catch {
        // Non-blocking
    }
    return undefined;
}
/**
 * Parses active phase and position from STATE.md content.
 */
function parseStatePosition(stateContent) {
    const lines = stateContent.split(/\r?\n/);
    let phaseStr = '';
    let statusStr = '';
    let planStr = '';
    for (const line of lines) {
        const phaseMatch = line.match(/[-*]\s+\*\*Current Phase:\*\*\s*(.+)/i) || line.match(/Phase:\s*Phase\s*(\d+)\s*\(([^)]+)\)/i);
        if (phaseMatch && !phaseStr) {
            phaseStr = phaseMatch[1].trim();
        }
        const statusMatch = line.match(/[-*]\s+\*\*Status:\*\*\s*(.+)/i) || line.match(/Status:\s*([^|>\n]+)/i);
        if (statusMatch && !statusStr) {
            statusStr = statusMatch[1].trim();
        }
        const planMatch = line.match(/[-*]\s+\*\*Active Plan:\*\*\s*(.+)/i);
        if (planMatch && !planStr) {
            planStr = planMatch[1].trim();
        }
    }
    if (phaseStr) {
        const numMatch = phaseStr.match(/(?:Phase\s*)?(\d+)(?:\s*[-:—]\s*|\s*\(([^)]+)\)|\s+)(.*)/i);
        if (numMatch) {
            return {
                number: numMatch[1],
                name: (numMatch[2] || numMatch[3] || phaseStr).trim(),
                status: statusStr || 'In Progress',
                plan: planStr || undefined,
            };
        }
        return {
            number: 'unknown',
            name: phaseStr,
            status: statusStr || 'In Progress',
            plan: planStr || undefined,
        };
    }
    return null;
}
/**
 * Parses active plan file to find current uncompleted wave and task.
 */
function parseActiveWaveAndTask(planContent) {
    const lines = planContent.split(/\r?\n/);
    let currentWave;
    let activeTask;
    for (const line of lines) {
        const waveMatch = line.match(/^###?\s*(Wave\s*\d+[^:\n]*)/i);
        if (waveMatch) {
            currentWave = waveMatch[1].trim();
        }
        const taskMatch = line.match(/^[-*]\s*\[\s*\]\s*\*\*([^*]+)\*\*/);
        if (taskMatch && !activeTask) {
            activeTask = taskMatch[1].trim();
            break;
        }
    }
    if (currentWave || activeTask) {
        return { wave: currentWave, task: activeTask };
    }
    return null;
}
/**
 * Build a high-fidelity Micro-Dossier capturing active progress, files, and decisions.
 */
function buildCompactDossier(projectRoot, options = {}) {
    const root = projectRoot || process.cwd();
    const planning = options.planningDir || node_path_1.default.join(root, '.planning');
    const maxRecent = options.maxRecentFiles ?? 3;
    const maxDecisions = options.maxDecisions ?? 5;
    let activePhaseInfo;
    let canonicalDecisions = [];
    // 1. Read STATE.md
    const statePath = node_path_1.default.join(planning, 'STATE.md');
    if (node_fs_1.default.existsSync(statePath)) {
        try {
            const stateContent = node_fs_1.default.readFileSync(statePath, 'utf8');
            const pos = parseStatePosition(stateContent);
            if (pos)
                activePhaseInfo = pos;
            const extracted = extractDecisions(stateContent);
            if (extracted && extracted.decisions && extracted.decisions.length > 0) {
                canonicalDecisions = extracted.decisions.slice(-maxDecisions).map(d => ({
                    id: d.id,
                    text: d.text,
                }));
            }
        }
        catch {
            // Non-blocking
        }
    }
    // 2. Parse active plan if available
    let activeWaveTask;
    const planPath = options.activePlanPath || (activePhaseInfo?.plan ? node_path_1.default.resolve(root, activePhaseInfo.plan) : undefined);
    if (planPath && node_fs_1.default.existsSync(planPath)) {
        try {
            const planContent = node_fs_1.default.readFileSync(planPath, 'utf8');
            const waveTask = parseActiveWaveAndTask(planContent);
            if (waveTask) {
                activeWaveTask = {
                    wave: waveTask.wave,
                    task: waveTask.task,
                    planFile: node_path_1.default.basename(planPath),
                };
            }
        }
        catch {
            // Non-blocking
        }
    }
    // 3. Scan recent modified files in src/ or tests/
    const recentModifiedFiles = [];
    const candidates = [];
    for (const subDir of ['src', 'tests', 'hooks']) {
        const fullDir = node_path_1.default.join(root, subDir);
        if (node_fs_1.default.existsSync(fullDir)) {
            try {
                const entries = node_fs_1.default.readdirSync(fullDir, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.isFile()) {
                        const fPath = node_path_1.default.join(fullDir, entry.name);
                        const stat = node_fs_1.default.statSync(fPath);
                        candidates.push({
                            relPath: node_path_1.default.relative(root, fPath).replace(/\\/g, '/'),
                            mtime: stat.mtimeMs,
                        });
                    }
                }
            }
            catch {
                // Non-blocking
            }
        }
    }
    candidates.sort((a, b) => b.mtime - a.mtime);
    for (const c of candidates.slice(0, maxRecent)) {
        const full = node_path_1.default.join(root, c.relPath);
        recentModifiedFiles.push({
            path: c.relPath,
            hash: getFileHash(full),
            mtime: new Date(c.mtime).toISOString(),
        });
    }
    // 4. Read last test record if present in .planning/intel/last-test.json
    let lastTestCommand;
    const lastTestPath = node_path_1.default.join(planning, 'intel', 'last-test.json');
    if (node_fs_1.default.existsSync(lastTestPath)) {
        try {
            const parsed = JSON.parse(node_fs_1.default.readFileSync(lastTestPath, 'utf8'));
            lastTestCommand = {
                command: typeof parsed.command === 'string' ? parsed.command : undefined,
                exitCode: typeof parsed.exitCode === 'number' ? parsed.exitCode : undefined,
                summary: typeof parsed.summary === 'string' ? parsed.summary : undefined,
            };
        }
        catch {
            // Non-blocking
        }
    }
    return {
        timestamp: new Date().toISOString(),
        activePhase: activePhaseInfo,
        activeWaveAndTask: activeWaveTask,
        recentModifiedFiles,
        lastTestCommand,
        canonicalDecisions,
    };
}
/**
 * Formats a CompactDossier into Markdown for immediate post-compaction reinjection.
 */
function formatCompactDossier(dossier) {
    const lines = [
        '### [GSD Compact-Keeper: Micro-Dossier de Fidelidade Pós-Compactação]',
        `> **Snapshot Timestamp**: \`${dossier.timestamp}\``,
    ];
    if (dossier.activePhase) {
        lines.push(`- **Fase Ativa**: Phase ${dossier.activePhase.number} — ${dossier.activePhase.name} (Status: \`${dossier.activePhase.status}\`)`);
    }
    if (dossier.activeWaveAndTask) {
        const wave = dossier.activeWaveAndTask.wave || 'Onda em andamento';
        const task = dossier.activeWaveAndTask.task || 'Tarefa atual';
        const plan = dossier.activeWaveAndTask.planFile ? ` [${dossier.activeWaveAndTask.planFile}]` : '';
        lines.push(`- **Plano & Tarefa**: ${wave} — \`${task}\`${plan}`);
    }
    if (dossier.recentModifiedFiles.length > 0) {
        lines.push('- **Arquivos Recentes sob Foco**:');
        for (const f of dossier.recentModifiedFiles) {
            const hashStr = f.hash ? ` (hash: \`${f.hash}\`)` : '';
            lines.push(`  - \`${f.path}\`${hashStr}`);
        }
    }
    if (dossier.lastTestCommand) {
        const code = dossier.lastTestCommand.exitCode !== undefined ? ` [Exit Code: ${dossier.lastTestCommand.exitCode}]` : '';
        lines.push(`- **Último Teste Executado**: \`${dossier.lastTestCommand.command || 'npm test'}\`${code}`);
        if (dossier.lastTestCommand.summary) {
            lines.push(`  - Diagnóstico: ${dossier.lastTestCommand.summary}`);
        }
    }
    if (dossier.canonicalDecisions.length > 0) {
        lines.push('- **Decisões Canônicas Vigentes (STATE.md)**:');
        for (const d of dossier.canonicalDecisions) {
            lines.push(`  - **${d.id}**: ${d.text}`);
        }
    }
    return lines.join('\n');
}
/**
 * Saves dossier to `.planning/intel/compact-dossier.json`.
 */
function saveCompactDossier(dossier, projectRoot) {
    const root = projectRoot || process.cwd();
    const dir = node_path_1.default.join(root, '.planning', 'intel');
    node_fs_1.default.mkdirSync(dir, { recursive: true });
    const target = node_path_1.default.join(dir, 'compact-dossier.json');
    node_fs_1.default.writeFileSync(target, JSON.stringify(dossier, null, 2), 'utf8');
    return target;
}
/**
 * Loads latest dossier from disk if available.
 */
function loadLatestCompactDossier(projectRoot) {
    const root = projectRoot || process.cwd();
    const target = node_path_1.default.join(root, '.planning', 'intel', 'compact-dossier.json');
    if (node_fs_1.default.existsSync(target)) {
        try {
            return JSON.parse(node_fs_1.default.readFileSync(target, 'utf8'));
        }
        catch {
            // Non-blocking
        }
    }
    return null;
}
/**
 * Task Drift Anchor: compares candidate edit file against declared task scope.
 */
function checkTaskDrift(targetFile, declaredFiles, options = {}) {
    const normTarget = normalizePath(targetFile);
    // By default, files within .planning/ are control files and exempt from drift
    if (options.allowPlanning !== false && normTarget.startsWith('.planning/')) {
        return {
            isDrift: false,
            targetFile: normTarget,
            declaredFiles,
        };
    }
    const normalizedDeclared = declaredFiles.map(normalizePath);
    // Check exact or suffix/stem matches (e.g. src/foo.cts vs gsd-core/bin/lib/foo.cjs)
    const isMatch = normalizedDeclared.some(declared => {
        if (normTarget === declared)
            return true;
        const baseTarget = node_path_1.default.basename(normTarget).replace(/\.[^/.]+$/, '');
        const baseDeclared = node_path_1.default.basename(declared).replace(/\.[^/.]+$/, '');
        return baseTarget === baseDeclared;
    });
    if (isMatch) {
        return {
            isDrift: false,
            targetFile: normTarget,
            declaredFiles: normalizedDeclared,
        };
    }
    const declaredStr = normalizedDeclared.length > 0 ? normalizedDeclared.map(f => `\`${f}\``).join(', ') : 'nenhum arquivo declarado';
    const warning = `[GSD Task Drift Warning] O arquivo \`${normTarget}\` está fora do escopo declarado da tarefa ativa (${declaredStr}). Mantenha o foco nos objetivos da onda para evitar regressões.`;
    return {
        isDrift: true,
        targetFile: normTarget,
        declaredFiles: normalizedDeclared,
        warning,
        reason: `File ${normTarget} not found in declared scope: [${normalizedDeclared.join(', ')}]`,
    };
}
module.exports = {
    buildCompactDossier,
    formatCompactDossier,
    saveCompactDossier,
    loadLatestCompactDossier,
    checkTaskDrift,
    parseStatePosition,
    parseActiveWaveAndTask,
};
