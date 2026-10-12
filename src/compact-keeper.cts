/**
 * GSD Compact-Keeper & Task Drift Anchor (Phase 32 — Wave 2)
 *
 * Prevents Post-Compaction Amnesia and Scope Drift:
 * 1. Captures and reinjects high-fidelity Micro-Dossiers after context compaction.
 * 2. Anchors task execution by tracking declared vs target files and warning on drift.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// eslint-disable-next-line @typescript-eslint/no-require-imports
import decisionsMod = require('./decisions.cjs');
const { extractDecisions } = decisionsMod;

interface CompactKeeperOptions {
  planningDir?: string;
  projectRoot?: string;
  maxRecentFiles?: number;
  maxDecisions?: number;
  activePlanPath?: string;
}

interface CompactDossier {
  timestamp: string;
  activePhase?: {
    number: string;
    name: string;
    status: string;
    plan?: string;
  };
  activeWaveAndTask?: {
    wave?: string;
    task?: string;
    planFile?: string;
  };
  recentModifiedFiles: Array<{
    path: string;
    hash?: string;
    mtime?: string;
  }>;
  lastTestCommand?: {
    command?: string;
    exitCode?: number;
    summary?: string;
  };
  canonicalDecisions: Array<{
    id: string;
    text: string;
  }>;
  notes?: string;
}

interface TaskDriftReport {
  isDrift: boolean;
  targetFile: string;
  declaredFiles: string[];
  warning?: string;
  reason?: string;
}

/**
 * Normalizes file paths to POSIX format and strips leading relative prefixes.
 */
function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

/**
 * Computes SHA-256 hash snippet for a given file on disk.
 */
function getFileHash(fullPath: string): string | undefined {
  try {
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      const content = fs.readFileSync(fullPath);
      return crypto.createHash('sha256').update(content).digest('hex').slice(0, 10);
    }
  } catch {
    // Non-blocking
  }
  return undefined;
}

/**
 * Parses active phase and position from STATE.md content.
 */
function parseStatePosition(stateContent: string): { number: string; name: string; status: string; plan?: string } | null {
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
function parseActiveWaveAndTask(planContent: string): { wave?: string; task?: string } | null {
  const lines = planContent.split(/\r?\n/);
  let currentWave: string | undefined;
  let activeTask: string | undefined;

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
function buildCompactDossier(projectRoot?: string, options: CompactKeeperOptions = {}): CompactDossier {
  const root = projectRoot || process.cwd();
  const planning = options.planningDir || path.join(root, '.planning');
  const maxRecent = options.maxRecentFiles ?? 3;
  const maxDecisions = options.maxDecisions ?? 5;

  let activePhaseInfo: { number: string; name: string; status: string; plan?: string } | undefined;
  let canonicalDecisions: Array<{ id: string; text: string }> = [];

  // 1. Read STATE.md
  const statePath = path.join(planning, 'STATE.md');
  if (fs.existsSync(statePath)) {
    try {
      const stateContent = fs.readFileSync(statePath, 'utf8');
      const pos = parseStatePosition(stateContent);
      if (pos) activePhaseInfo = pos;

      const extracted = extractDecisions(stateContent);
      if (extracted && extracted.decisions && extracted.decisions.length > 0) {
        canonicalDecisions = extracted.decisions.slice(-maxDecisions).map(d => ({
          id: d.id,
          text: d.text,
        }));
      }
    } catch {
      // Non-blocking
    }
  }

  // 2. Parse active plan if available
  let activeWaveTask: { wave?: string; task?: string; planFile?: string } | undefined;
  const planPath = options.activePlanPath || (activePhaseInfo?.plan ? path.resolve(root, activePhaseInfo.plan) : undefined);
  if (planPath && fs.existsSync(planPath)) {
    try {
      const planContent = fs.readFileSync(planPath, 'utf8');
      const waveTask = parseActiveWaveAndTask(planContent);
      if (waveTask) {
        activeWaveTask = {
          wave: waveTask.wave,
          task: waveTask.task,
          planFile: path.basename(planPath),
        };
      }
    } catch {
      // Non-blocking
    }
  }

  // 3. Scan recent modified files in src/ or tests/
  const recentModifiedFiles: Array<{ path: string; hash?: string; mtime?: string }> = [];
  const candidates: Array<{ relPath: string; mtime: number }> = [];

  for (const subDir of ['src', 'tests', 'hooks']) {
    const fullDir = path.join(root, subDir);
    if (fs.existsSync(fullDir)) {
      try {
        const entries = fs.readdirSync(fullDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile()) {
            const fPath = path.join(fullDir, entry.name);
            const stat = fs.statSync(fPath);
            candidates.push({
              relPath: path.relative(root, fPath).replace(/\\/g, '/'),
              mtime: stat.mtimeMs,
            });
          }
        }
      } catch {
        // Non-blocking
      }
    }
  }

  candidates.sort((a, b) => b.mtime - a.mtime);
  for (const c of candidates.slice(0, maxRecent)) {
    const full = path.join(root, c.relPath);
    recentModifiedFiles.push({
      path: c.relPath,
      hash: getFileHash(full),
      mtime: new Date(c.mtime).toISOString(),
    });
  }

  // 4. Read last test record if present in .planning/intel/last-test.json
  let lastTestCommand: { command?: string; exitCode?: number; summary?: string } | undefined;
  const lastTestPath = path.join(planning, 'intel', 'last-test.json');
  if (fs.existsSync(lastTestPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(lastTestPath, 'utf8')) as Record<string, unknown>;
      lastTestCommand = {
        command: typeof parsed.command === 'string' ? parsed.command : undefined,
        exitCode: typeof parsed.exitCode === 'number' ? parsed.exitCode : undefined,
        summary: typeof parsed.summary === 'string' ? parsed.summary : undefined,
      };
    } catch {
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
function formatCompactDossier(dossier: CompactDossier): string {
  const lines: string[] = [
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
function saveCompactDossier(dossier: CompactDossier, projectRoot?: string): string {
  const root = projectRoot || process.cwd();
  const dir = path.join(root, '.planning', 'intel');
  fs.mkdirSync(dir, { recursive: true });

  const target = path.join(dir, 'compact-dossier.json');
  fs.writeFileSync(target, JSON.stringify(dossier, null, 2), 'utf8');
  return target;
}

/**
 * Loads latest dossier from disk if available.
 */
function loadLatestCompactDossier(projectRoot?: string): CompactDossier | null {
  const root = projectRoot || process.cwd();
  const target = path.join(root, '.planning', 'intel', 'compact-dossier.json');
  if (fs.existsSync(target)) {
    try {
      return JSON.parse(fs.readFileSync(target, 'utf8')) as CompactDossier;
    } catch {
      // Non-blocking
    }
  }
  return null;
}

/**
 * Task Drift Anchor: compares candidate edit file against declared task scope.
 */
function checkTaskDrift(
  targetFile: string,
  declaredFiles: string[],
  options: { allowPlanning?: boolean; allowTests?: boolean } = {}
): TaskDriftReport {
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
    if (normTarget === declared) return true;
    const baseTarget = path.basename(normTarget).replace(/\.[^/.]+$/, '');
    const baseDeclared = path.basename(declared).replace(/\.[^/.]+$/, '');
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

export = {
  buildCompactDossier,
  formatCompactDossier,
  saveCompactDossier,
  loadLatestCompactDossier,
  checkTaskDrift,
  parseStatePosition,
  parseActiveWaveAndTask,
};
