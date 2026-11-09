/**
 * Project Second Brain — Obsidian Vault Engine (GSD Core Nexus 3.7)
 *
 * Compiles `.planning/` metadata, architectural decisions, phase workflows,
 * and codebase AST topology into a unified, navigable Obsidian Vault under
 * `<project>/.planning/vault/` (Option A: isolated, regenerable, non-destructive).
 *
 * Deliverables:
 * - `00-Home.md`: Master Map of Content (MOC)
 * - `00-Vault.canvas`: Interactive 2D Visual Roadmap & Mindmap Canvas
 * - `Decisions/D-xxx.md`: Note per architectural decision with frontmatter & wikilinks
 * - `Phases/NN-name.md`: Note per phase connecting plans, specs, summaries and reviews
 * - `Modules/<slug>.md`: Structural note per source module with PageRank & governing decisions
 * - `Lessons/`: Self-healing lessons and anti-patterns
 * - `.obsidian/`: Pre-configured graph view palette and vault settings
 */

import fs from 'node:fs';
import path from 'node:path';
import { platformEnsureDir, platformWriteSync, platformReadSync } from './shell-command-projection.cjs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import codebaseAst = require('./codebase-ast-analyzer.cjs');
const { loadCodebaseGraph, buildCodebaseGraph } = codebaseAst;
// eslint-disable-next-line @typescript-eslint/no-require-imports
import continuousMem = require('./continuous-memory.cjs');
const { syncDecisionsToMemory, queryMemory } = continuousMem;
// eslint-disable-next-line @typescript-eslint/no-require-imports
import obsidianInterop = require('./obsidian-interop.cjs');
const { saveBacklinkIndex } = obsidianInterop;

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface SecondBrainReport {
  vaultPath: string;
  canvasPath: string;
  homePath: string;
  totalNotes: number;
  totalDecisions: number;
  totalPhases: number;
  totalModules: number;
  totalLessons: number;
  generatedAt: string;
}

interface CanvasNode {
  id: string;
  type: 'text' | 'file' | 'link' | 'group';
  text?: string;
  file?: string;
  label?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string; // 1=red, 2=orange, 3=yellow, 4=green, 5=cyan, 6=purple
}

interface CanvasEdge {
  id: string;
  fromNode: string;
  fromSide: 'top' | 'right' | 'bottom' | 'left';
  toNode: string;
  toSide: 'top' | 'right' | 'bottom' | 'left';
  color?: string;
  label?: string;
}

interface CanvasPayload {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

function sanitizeSlug(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/[/\\:]/g, '--');
}

function escapeYamlString(str: string): string {
  return JSON.stringify(str);
}

// ─── Second Brain Generator Engine ────────────────────────────────────────────

function generateSecondBrainVault(planningDir: string, rootDir?: string): SecondBrainReport {
  const root = rootDir ?? path.dirname(planningDir);
  const vaultDir = path.join(planningDir, 'vault');

  // Subdirectories inside the isolated vault
  const decisionsDir = path.join(vaultDir, 'Decisions');
  const phasesDir = path.join(vaultDir, 'Phases');
  const modulesDir = path.join(vaultDir, 'Modules');
  const lessonsDir = path.join(vaultDir, 'Lessons');
  const obsidianConfigDir = path.join(vaultDir, '.obsidian');

  platformEnsureDir(decisionsDir);
  platformEnsureDir(phasesDir);
  platformEnsureDir(modulesDir);
  platformEnsureDir(lessonsDir);
  platformEnsureDir(obsidianConfigDir);

  // 1. Synchronize decisions to continuous memory first (guarantees decisions.jsonl is populated)
  syncDecisionsToMemory(planningDir, root);
  const rawDecisions = queryMemory(root, '', { category: 'architecture_decision', limit: 1000 });

  // 2. Generate Decisions/D-xxx.md
  let totalDecisions = 0;
  const decisionsMap = new Map<string, { id: string; title: string; category: string; files: string[] }>();

  for (const d of rawDecisions) {
    totalDecisions++;
    const decId = d.id;
    const summary = d.summary;
    let category = 'Architecture';
    if (d.details && d.details.includes('Category: ')) {
      const match = d.details.match(/Category:\s*([^|]+)/);
      if (match) category = match[1].trim();
    }
    const relevantFiles = d.relevantFiles || [];
    decisionsMap.set(decId, { id: decId, title: summary, category, files: relevantFiles });

    const decNotePath = path.join(decisionsDir, `${decId}.md`);
    const relFileLinks = relevantFiles.map((f: string) => {
      const base = path.basename(f);
      const slug = sanitizeSlug(f);
      return `- [[Modules/${slug}|${base}]] (\`${f}\`)`;
    }).join('\n');

    const frontmatter = [
      '---',
      `id: ${escapeYamlString(decId)}`,
      `title: ${escapeYamlString(summary)}`,
      `category: ${escapeYamlString(category)}`,
      'status: accepted',
      `aliases: [${escapeYamlString(decId)}, ${escapeYamlString(`${decId}: ${summary.slice(0, 50)}`)}]`,
      `tags: [gsd, decision, ${category.toLowerCase().replace(/[^a-z0-9]/g, '-')}]`,
      '---',
    ].join('\n');

    const content = [
      frontmatter,
      '',
      `# ${decId}: ${summary}`,
      '',
      `> **ID:** ${decId}  `,
      `> **Categoria:** ${category}  `,
      `> **Status:** Accepted  `,
      `> **Decisão Permanente:** Sim  `,
      '',
      '## Descrição e Racional',
      summary,
      '',
      relevantFiles.length > 0 ? `## Módulos de Código Relacionados\n${relFileLinks}\n` : '',
      '## Conexões do Segundo Cérebro',
      '- [[00-Home|Mapa Central de Conteúdo (MOC)]]',
      '- [[00-Vault.canvas|Canvas Interativo do Projeto]]',
      '',
    ].filter(Boolean).join('\n');

    platformWriteSync(decNotePath, content);
  }

  // 3. Generate Phases/NN-name.md
  let totalPhases = 0;
  const phaseList: Array<{ id: string; name: string; isCurrent: boolean }> = [];
  const srcPhasesDir = path.join(planningDir, 'phases');
  if (fs.existsSync(srcPhasesDir)) {
    const entries = fs.readdirSync(srcPhasesDir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isDirectory()) {
        totalPhases++;
        const pId = ent.name;
        const phaseSub = path.join(srcPhasesDir, pId);
        const subFiles = fs.readdirSync(phaseSub);

        const isCurrent = pId.startsWith('37');
        phaseList.push({ id: pId, name: pId, isCurrent });

        const phaseNotePath = path.join(phasesDir, `${pId}.md`);
        const specFile = subFiles.find(f => f.endsWith('-SPEC.md'));
        const planFiles = subFiles.filter(f => f.endsWith('-PLAN.md'));
        const summaryFile = subFiles.find(f => f.endsWith('-SUMMARY.md'));
        const reviewFile = subFiles.find(f => f.includes('REVIEW'));

        const artifactLinks = [
          specFile ? `- **Especificação:** \`.planning/phases/${pId}/${specFile}\`` : '',
          ...planFiles.map(pf => `- **Plano:** \`.planning/phases/${pId}/${pf}\``),
          summaryFile ? `- **Sumário:** \`.planning/phases/${pId}/${summaryFile}\`` : '',
          reviewFile ? `- **Code Review:** \`.planning/phases/${pId}/${reviewFile}\`` : '',
        ].filter(Boolean).join('\n');

        const frontmatter = [
          '---',
          `id: ${escapeYamlString(pId)}`,
          `name: ${escapeYamlString(pId)}`,
          `status: ${isCurrent ? 'active' : 'complete'}`,
          `aliases: [${escapeYamlString(`Phase ${pId.slice(0, 2)}`)}, ${escapeYamlString(pId)}]`,
          'tags: [gsd, phase]',
          '---',
        ].join('\n');

        const content = [
          frontmatter,
          '',
          `# Fase ${pId}`,
          '',
          `> **Status:** ${isCurrent ? '🟡 Em Execução' : '🟢 Concluída'}  `,
          '',
          '## Artefatos e Roteiro da Fase',
          artifactLinks || '- Nenhum artefato adicional catalogado.',
          '',
          '## Navegação',
          '- [[00-Home|Voltar ao Home]]',
          '',
        ].join('\n');

        platformWriteSync(phaseNotePath, content);
      }
    }
  }

  // 4. Generate Modules/<slug>.md from CodebaseGraph
  let totalModules = 0;
  const graph = loadCodebaseGraph(planningDir) || buildCodebaseGraph(root);
  const primaryModules: Array<{ file: string; pageRank: number; symbolsCount: number; exportsCount: number }> = [];

  for (const [fileRel, fData] of Object.entries(graph.files)) {
    // Index primary source modules (src/, gsd-core/bin/, or top PageRank files)
    const isPrimary = fileRel.startsWith('src/') || fileRel.startsWith('gsd-core/bin/lib/') || (graph.pageRankScores[fileRel] || 0) > 0.005;
    if (!isPrimary && (fData.isOrphan || fileRel.includes('fixtures'))) continue;

    totalModules++;
    const prScore = Number((graph.pageRankScores[fileRel] || 0).toFixed(4));
    const symCount = fData.symbols ? fData.symbols.length : 0;
    const expCount = fData.exports ? fData.exports.length : 0;
    primaryModules.push({ file: fileRel, pageRank: prScore, symbolsCount: symCount, exportsCount: expCount });

    const slug = sanitizeSlug(fileRel);
    const modNotePath = path.join(modulesDir, `${slug}.md`);
    const baseName = path.basename(fileRel);

    // Incoming / Outgoing dependencies
    const localDeps = fData.localDeps || [];
    const depLinks = localDeps.slice(0, 10).map((d: string) => {
      const depBase = path.basename(d);
      return `- [[Modules/${sanitizeSlug(d)}|${depBase}]] (\`${d}\`)`;
    }).join('\n');

    // Associated decisions
    const governingDecisions: string[] = [];
    for (const [decId, decInfo] of decisionsMap.entries()) {
      if (decInfo.files.some(f => f === fileRel || f.includes(baseName))) {
        governingDecisions.push(`- [[Decisions/${decId}|${decId}]]: ${decInfo.title}`);
      }
    }

    const frontmatter = [
      '---',
      `id: ${escapeYamlString(fileRel)}`,
      `aliases: [${escapeYamlString(baseName)}, ${escapeYamlString(fileRel)}]`,
      `pageRank: ${prScore}`,
      `exportsCount: ${expCount}`,
      'tags: [gsd, module]',
      '---',
    ].join('\n');

    const content = [
      frontmatter,
      '',
      `# Módulo: \`${fileRel}\``,
      '',
      `- **Centralidade (PageRank):** ${prScore}`,
      `- **Linhas de Código:** ${fData.linesCount || 0}`,
      `- **Exportações Totais:** ${expCount}`,
      `- **Símbolos Mapeados:** ${symCount}`,
      '',
      governingDecisions.length > 0 ? `## Decisões Arquiteturais Governantes\n${governingDecisions.join('\n')}\n` : '',
      localDeps.length > 0 ? `## Dependências Locais\n${depLinks}\n` : '',
      '## Navegação',
      '- [[00-Home|Voltar ao Home]]',
      '',
    ].filter(Boolean).join('\n');

    platformWriteSync(modNotePath, content);
  }

  // 5. Generate Lessons/
  let totalLessons = 0;
  const antiPatternsPath = path.join(planningDir, 'intel', 'anti-patterns.json');
  if (fs.existsSync(antiPatternsPath)) {
    try {
      const raw = platformReadSync(antiPatternsPath);
      if (raw) {
        interface AntiPatternItem {
          lesson?: string;
          pattern?: string;
          occurrences?: number;
          details?: string;
        }
        const parsed = JSON.parse(raw) as AntiPatternItem[] | { antiPatterns?: AntiPatternItem[] };
        const patterns: AntiPatternItem[] = Array.isArray(parsed) ? parsed : (parsed.antiPatterns || []);
        for (let i = 0; i < Math.min(patterns.length, 30); i++) {
          const ap = patterns[i];
          if (ap && (ap.lesson || ap.pattern)) {
            totalLessons++;
            const lessonId = `lesson-${i + 1}`;
            const notePath = path.join(lessonsDir, `${lessonId}.md`);
            const text = [
              '---',
              `id: ${escapeYamlString(lessonId)}`,
              'tags: [gsd, lesson, anti-pattern]',
              '---',
              '',
              `# Lição Aprendida #${i + 1}`,
              '',
              `> **Padrão:** ${ap.pattern || 'Detectado em testes'}  `,
              `> **Frequência:** ${ap.occurrences || 1}  `,
              '',
              '## Resolução / Anti-Pattern',
              ap.lesson || ap.details || 'Manter conformidade estrita com invariantes.',
              '',
              '## Navegação',
              '- [[00-Home|Voltar ao Home]]',
            ].join('\n');
            platformWriteSync(notePath, text);
          }
        }
      }
    } catch {
      // Non-blocking
    }
  }

  // 6. Generate 00-Home.md (Master Map of Content)
  const homePath = path.join(vaultDir, '00-Home.md');
  const homeContent = [
    '---',
    'id: 00-Home',
    'aliases: ["Home", "Map of Content", "Segundo Cérebro"]',
    'tags: [gsd, moc, home]',
    '---',
    '',
    '# 🧠 Projeto Segundo Cérebro (GSD Core Nexus 3.7)',
    '',
    '> **Status do Ecossistema:** Ativo  ',
    '> **Fase Corrente:** [[Phases/37-second-brain-knowledge-graph-obsidian-vault-and-quality-telemetry|Fase 37: Segundo Cérebro Obsidian & Telemetria]]  ',
    `> **Última Atualização:** ${new Date().toISOString()}  `,
    '',
    '## 🗺️ Visualização & Mapas Mentais',
    '- 🎨 **[[00-Vault.canvas|Abrir Canvas Interativo do Projeto (Obsidian Canvas)]]**',
    '',
    '## 📊 Estatísticas do Segundo Cérebro',
    `- 🏛️ **Decisões Arquiteturais Ativas:** ${totalDecisions} notas em \`Decisions/\``,
    `- 📦 **Módulos Centrais Mapeados:** ${totalModules} notas em \`Modules/\``,
    `- 🚀 **Fases do Roteiro:** ${totalPhases} notas em \`Phases/\``,
    `- 🛡️ **Lições & Anti-Patterns:** ${totalLessons} notas em \`Lessons/\``,
    '',
    '## 🏛️ Decisões Arquiteturais Fundamentais',
    '- [[Decisions/D-01|D-01: Analisador AST Nativo]]',
    '- [[Decisions/D-02|D-02: Documentação Viva Incremental]]',
    '- [[Decisions/D-03|D-03: Injeção Cirúrgica JIT]]',
    '- [[Decisions/D-153|D-153: Memória Contínua Claude-Mem]]',
    '- [[Decisions/D-162|D-162: System One Sovereign Sentry]]',
    '- [[Decisions/D-168|D-168: Modular State Lock Subsystem]]',
    '',
    '## 📦 Módulos Centrais (Top PageRank)',
    primaryModules
      .sort((a, b) => b.pageRank - a.pageRank)
      .slice(0, 8)
      .map(m => `- [[Modules/${sanitizeSlug(m.file)}|${path.basename(m.file)}]] (PageRank: ${m.pageRank}, ${m.exportsCount} exports)` )
      .join('\n'),
    '',
    '---',
    '*Gerado automaticamente pelo GSD Core Nexus. Todos os nós estão integrados e navegáveis bidirecionalmente.*',
    '',
  ].join('\n');
  platformWriteSync(homePath, homeContent);

  // 7. Generate 00-Vault.canvas (Obsidian Canvas Visual Mindmap)
  const canvasPath = path.join(vaultDir, '00-Vault.canvas');
  const canvasNodes: CanvasNode[] = [];
  const canvasEdges: CanvasEdge[] = [];

  // Center node: Active Phase (Purple)
  canvasNodes.push({
    id: 'node-active-phase',
    type: 'text',
    text: '# 🚀 Fase Ativa: Fase 37\n**Segundo Cérebro & Obsidian Vault**\n\n- Nós de conhecimento integrados\n- Zero amnésia com memória contínua',
    x: 400,
    y: 200,
    width: 320,
    height: 180,
    color: '6', // Purple
  });

  // Left column: Top Decisions (Cyan)
  const topDecisions = Array.from(decisionsMap.values()).slice(0, 4);
  topDecisions.forEach((dec, idx) => {
    const nodeId = `node-dec-${dec.id}`;
    canvasNodes.push({
      id: nodeId,
      type: 'text',
      text: `### 🏛️ [[Decisions/${dec.id}|${dec.id}]]\n**${dec.category}**\n${dec.title.slice(0, 100)}...`,
      x: 0,
      y: idx * 160,
      width: 300,
      height: 130,
      color: '5', // Cyan
    });

    canvasEdges.push({
      id: `edge-${nodeId}-to-phase`,
      fromNode: nodeId,
      fromSide: 'right',
      toNode: 'node-active-phase',
      toSide: 'left',
      color: '5',
    });
  });

  // Right column: Top Modules (Green)
  const topModules = primaryModules.slice(0, 4);
  topModules.forEach((mod, idx) => {
    const modNodeId = `node-mod-${idx}`;
    canvasNodes.push({
      id: modNodeId,
      type: 'text',
      text: `### 📦 [[Modules/${sanitizeSlug(mod.file)}|${path.basename(mod.file)}]]\nPageRank: ${mod.pageRank}\nExports: ${mod.exportsCount}`,
      x: 820,
      y: idx * 160,
      width: 280,
      height: 130,
      color: '4', // Green
    });

    canvasEdges.push({
      id: `edge-phase-to-${modNodeId}`,
      fromNode: 'node-active-phase',
      fromSide: 'right',
      toNode: modNodeId,
      toSide: 'left',
      color: '4',
    });
  });

  const canvasPayload: CanvasPayload = {
    nodes: canvasNodes,
    edges: canvasEdges,
  };
  platformWriteSync(canvasPath, JSON.stringify(canvasPayload, null, 2));

  // 8. Generate .obsidian/ configuration files
  const graphConfigPath = path.join(obsidianConfigDir, 'graph.json');
  const graphConfig = {
    'collapse-filter': false,
    search: '',
    showTags: false,
    showAttachments: false,
    hideUnresolved: false,
    showOrphans: true,
    colorGroups: [
      { query: 'path:Decisions', color: { a: 1, rgb: 3719160 } },    // Cyan
      { query: 'path:Phases', color: { a: 1, rgb: 11032055 } },      // Purple
      { query: 'path:Modules', color: { a: 1, rgb: 2278750 } },      // Emerald Green
      { query: 'path:Lessons', color: { a: 1, rgb: 16348438 } },     // Orange
    ],
  };
  platformWriteSync(graphConfigPath, JSON.stringify(graphConfig, null, 2));

  const appConfigPath = path.join(obsidianConfigDir, 'app.json');
  const appConfig = {
    useMarkdownLinks: false,
    newFileLocation: 'current',
  };
  platformWriteSync(appConfigPath, JSON.stringify(appConfig, null, 2));

  // 9. Rebuild backlinks index (now indexing all notes in .planning/vault)
  saveBacklinkIndex(planningDir, root);

  const totalNotes = totalDecisions + totalPhases + totalModules + totalLessons + 1; // + 00-Home.md

  return {
    vaultPath: vaultDir,
    canvasPath,
    homePath,
    totalNotes,
    totalDecisions,
    totalPhases,
    totalModules,
    totalLessons,
    generatedAt: new Date().toISOString(),
  };
}

export = {
  generateSecondBrainVault,
};
