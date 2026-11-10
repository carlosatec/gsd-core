"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const shell_command_projection_cjs_1 = require("./shell-command-projection.cjs");
const pattern_cjs_1 = require("./pattern.cjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const codebaseAst = require("./codebase-ast-analyzer.cjs");
const { loadCodebaseGraph, buildCodebaseGraph } = codebaseAst;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const continuousMem = require("./continuous-memory.cjs");
const { syncDecisionsToMemory, queryMemory } = continuousMem;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const obsidianInterop = require("./obsidian-interop.cjs");
const { saveBacklinkIndex } = obsidianInterop;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const canvasGenMod = require("./canvas-roadmap-generator.cjs");
// ─── Helper Functions ─────────────────────────────────────────────────────────
function sanitizeSlug(filePath) {
    return filePath.replace(/\\/g, '/').replace(/[/\\:]/g, '--');
}
function escapeYamlString(str) {
    return JSON.stringify(str);
}
// ─── Second Brain Generator Engine ────────────────────────────────────────────
function generateSecondBrainVault(planningDir, rootDir) {
    const root = rootDir ?? node_path_1.default.dirname(planningDir);
    const vaultDir = node_path_1.default.join(planningDir, 'vault');
    // Subdirectories inside the isolated vault
    const decisionsDir = node_path_1.default.join(vaultDir, 'Decisions');
    const phasesDir = node_path_1.default.join(vaultDir, 'Phases');
    const modulesDir = node_path_1.default.join(vaultDir, 'Modules');
    const lessonsDir = node_path_1.default.join(vaultDir, 'Lessons');
    const obsidianConfigDir = node_path_1.default.join(vaultDir, '.obsidian');
    (0, shell_command_projection_cjs_1.platformEnsureDir)(decisionsDir);
    (0, shell_command_projection_cjs_1.platformEnsureDir)(phasesDir);
    (0, shell_command_projection_cjs_1.platformEnsureDir)(modulesDir);
    (0, shell_command_projection_cjs_1.platformEnsureDir)(lessonsDir);
    (0, shell_command_projection_cjs_1.platformEnsureDir)(obsidianConfigDir);
    // 1. Synchronize decisions to continuous memory first (guarantees decisions.jsonl is populated)
    syncDecisionsToMemory(planningDir, root);
    const rawDecisions = queryMemory(root, '', { category: 'architecture_decision', limit: 1000 });
    // 2. Generate Decisions/D-xxx.md
    let totalDecisions = 0;
    const decisionsMap = new Map();
    for (const d of rawDecisions) {
        totalDecisions++;
        const decId = d.id;
        const summary = d.summary;
        let category = 'Architecture';
        if (d.details && d.details.includes('Category: ')) {
            const match = d.details.match(/Category:\s*([^|]+)/);
            if (match)
                category = match[1].trim();
        }
        const relevantFiles = d.relevantFiles || [];
        decisionsMap.set(decId, { id: decId, title: summary, category, files: relevantFiles });
        const decNotePath = node_path_1.default.join(decisionsDir, `${decId}.md`);
        const relFileLinks = relevantFiles.map((f) => {
            const base = node_path_1.default.basename(f);
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
        (0, shell_command_projection_cjs_1.platformWriteSync)(decNotePath, content);
    }
    // 3. Generate Phases/NN-name.md
    let totalPhases = 0;
    const phaseList = [];
    const srcPhasesDir = node_path_1.default.join(planningDir, 'phases');
    let activePhasePrefix = '37';
    try {
        const statePath = node_path_1.default.join(planningDir, 'STATE.md');
        if (node_fs_1.default.existsSync(statePath)) {
            const stateContent = node_fs_1.default.readFileSync(statePath, 'utf8');
            const m = stateContent.match(/Current Phase:.*Phase\s+(\d+)/i);
            if (m && m[1])
                activePhasePrefix = m[1];
        }
    }
    catch {
        // fallback
    }
    if (node_fs_1.default.existsSync(srcPhasesDir)) {
        const entries = node_fs_1.default.readdirSync(srcPhasesDir, { withFileTypes: true });
        for (const ent of entries) {
            if (ent.isDirectory()) {
                totalPhases++;
                const pId = ent.name;
                const phaseSub = node_path_1.default.join(srcPhasesDir, pId);
                const subFiles = node_fs_1.default.readdirSync(phaseSub);
                const isCurrent = pId.startsWith(activePhasePrefix);
                phaseList.push({ id: pId, name: pId, isCurrent });
                const phaseNotePath = node_path_1.default.join(phasesDir, `${pId}.md`);
                const specFile = subFiles.find(f => f.endsWith('-SPEC.md'));
                const planFiles = subFiles.filter(f => f.endsWith('-PLAN.md'));
                const summaryFile = subFiles.find(f => f.endsWith('-SUMMARY.md'));
                const reviewFile = subFiles.find(f => f.includes('REVIEW'));
                const hasSummary = Boolean(summaryFile);
                const status = isCurrent ? 'active' : (hasSummary ? 'complete' : 'planned');
                const statusLabel = isCurrent ? '🟡 Em Execução' : (hasSummary ? '🟢 Concluída' : '📋 Planejada');
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
                    `status: ${status}`,
                    `aliases: [${escapeYamlString(`Phase ${pId.slice(0, 2)}`)}, ${escapeYamlString(pId)}]`,
                    'tags: [gsd, phase]',
                    '---',
                ].join('\n');
                const content = [
                    frontmatter,
                    '',
                    `# Fase ${pId}`,
                    '',
                    `> **Status:** ${statusLabel}  `,
                    '',
                    '## Artefatos e Roteiro da Fase',
                    artifactLinks || '- Nenhum artefato adicional catalogado.',
                    '',
                    '## Navegação',
                    '- [[00-Home|Voltar ao Home]]',
                    '',
                ].join('\n');
                (0, shell_command_projection_cjs_1.platformWriteSync)(phaseNotePath, content);
            }
        }
    }
    // 4. Generate Modules/<slug>.md from CodebaseGraph
    let totalModules = 0;
    const graph = loadCodebaseGraph(planningDir) || buildCodebaseGraph(root);
    const primaryModules = [];
    for (const [fileRel, fData] of Object.entries(graph.files)) {
        // Index primary source modules (src/, gsd-core/bin/, or top PageRank files)
        const isPrimary = fileRel.startsWith('src/') || fileRel.startsWith('gsd-core/bin/lib/') || (graph.pageRankScores[fileRel] || 0) > 0.005;
        if (!isPrimary && (fData.isOrphan || fileRel.includes('fixtures')))
            continue;
        totalModules++;
        const prScore = Number((graph.pageRankScores[fileRel] || 0).toFixed(4));
        const symCount = fData.symbols ? fData.symbols.length : 0;
        const expCount = fData.exports ? fData.exports.length : 0;
        primaryModules.push({ file: fileRel, pageRank: prScore, symbolsCount: symCount, exportsCount: expCount });
        const slug = sanitizeSlug(fileRel);
        const modNotePath = node_path_1.default.join(modulesDir, `${slug}.md`);
        const baseName = node_path_1.default.basename(fileRel);
        // Incoming / Outgoing dependencies
        const localDeps = fData.localDeps || [];
        const depLinks = localDeps.slice(0, 10).map((d) => {
            const depBase = node_path_1.default.basename(d);
            return `- [[Modules/${sanitizeSlug(d)}|${depBase}]] (\`${d}\`)`;
        }).join('\n');
        // Associated decisions
        const governingDecisions = [];
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
        (0, shell_command_projection_cjs_1.platformWriteSync)(modNotePath, content);
    }
    // 5. Generate Lessons/
    let totalLessons = 0;
    const lessonsList = [];
    // 5a. From Continuous Memory (self_healing_fix, self_healing_lesson, anti_pattern)
    const memEntries = queryMemory(root, '', { limit: 1000 });
    for (const m of memEntries) {
        if (m.category === 'architecture_decision')
            continue;
        totalLessons++;
        const lessonId = `L-${String(totalLessons).padStart(2, '0')}`;
        const summary = m.summary || 'Lição de Auto-Cura';
        const details = m.details || 'Manter conformidade com testes e invariantes.';
        const relevantFiles = m.relevantFiles || [];
        lessonsList.push({ id: lessonId, title: summary, category: m.category, files: relevantFiles });
        const notePath = node_path_1.default.join(lessonsDir, `${lessonId}.md`);
        const relFileLinks = relevantFiles.map((f) => {
            const base = node_path_1.default.basename(f);
            const slug = sanitizeSlug(f);
            return `- [[Modules/${slug}|${base}]] (\`${f}\`)`;
        }).join('\n');
        const frontmatter = [
            '---',
            `id: ${escapeYamlString(lessonId)}`,
            `title: ${escapeYamlString(summary)}`,
            `category: ${escapeYamlString(m.category)}`,
            m.phase ? `phase: ${escapeYamlString(m.phase)}` : '',
            `aliases: [${escapeYamlString(lessonId)}, ${escapeYamlString(`${lessonId}: ${summary.slice(0, 50)}`)}]`,
            'tags: [gsd, lesson, self-healing]',
            '---',
        ].filter(Boolean).join('\n');
        const content = [
            frontmatter,
            '',
            `# ${lessonId}: ${summary}`,
            '',
            `> **Categoria:** ${m.category}  `,
            m.phase ? `> **Fase de Origem:** [[Phases/${m.phase}|Fase ${m.phase}]]  ` : '',
            `> **Timestamp:** ${new Date(m.timestamp).toISOString()}  `,
            '',
            '## Causa Raiz e Detalhes',
            details,
            '',
            relevantFiles.length > 0 ? `## Módulos Relacionados\n${relFileLinks}\n` : '',
            '## Navegação',
            '- [[00-Home|Voltar ao Home (MOC)]]',
            '- [[00-Vault.canvas|Canvas Interativo do Projeto]]',
            '',
        ].filter(Boolean).join('\n');
        (0, shell_command_projection_cjs_1.platformWriteSync)(notePath, content);
    }
    // 5b. From anti-patterns.json (if present)
    const antiPatternsPath = node_path_1.default.join(planningDir, 'intel', 'anti-patterns.json');
    if (node_fs_1.default.existsSync(antiPatternsPath)) {
        try {
            const raw = (0, shell_command_projection_cjs_1.platformReadSync)(antiPatternsPath);
            if (raw) {
                const parsed = JSON.parse(raw);
                const patterns = Array.isArray(parsed) ? parsed : (parsed.antiPatterns || []);
                for (let i = 0; i < Math.min(patterns.length, 30); i++) {
                    const ap = patterns[i];
                    if (ap && (ap.lesson || ap.pattern)) {
                        totalLessons++;
                        const lessonId = `AP-${String(i + 1).padStart(2, '0')}`;
                        const summary = ap.lesson || ap.details || 'Anti-Pattern identificado';
                        lessonsList.push({ id: lessonId, title: summary, category: 'anti_pattern', files: [] });
                        const notePath = node_path_1.default.join(lessonsDir, `${lessonId}.md`);
                        const text = [
                            '---',
                            `id: ${escapeYamlString(lessonId)}`,
                            `title: ${escapeYamlString(summary)}`,
                            'tags: [gsd, lesson, anti-pattern]',
                            '---',
                            '',
                            `# ${lessonId}: ${ap.pattern || 'Anti-Pattern'}`,
                            '',
                            `> **Padrão:** ${ap.pattern || 'Detectado em testes'}  `,
                            `> **Frequência:** ${ap.occurrences || 1}  `,
                            '',
                            '## Resolução / Anti-Pattern',
                            ap.lesson || ap.details || 'Manter conformidade estrita com invariantes.',
                            '',
                            '## Navegação',
                            '- [[00-Home|Voltar ao Home]]',
                            '',
                        ].join('\n');
                        (0, shell_command_projection_cjs_1.platformWriteSync)(notePath, text);
                    }
                }
            }
        }
        catch {
            // Non-blocking
        }
    }
    // 6. Separate Production Modules vs Tooling/Tests Modules
    const productionModules = primaryModules
        .filter(m => m.file.startsWith('src/') || m.file.startsWith('gsd-core/bin/lib/'))
        .sort((a, b) => b.pageRank - a.pageRank);
    const toolingModules = primaryModules
        .filter(m => !m.file.startsWith('src/') && !m.file.startsWith('gsd-core/bin/lib/'))
        .sort((a, b) => b.pageRank - a.pageRank);
    // 7. Generate 00-Home.md (Master Map of Content)
    const homePath = node_path_1.default.join(vaultDir, '00-Home.md');
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
        '- 🎨 **[[00-Vault.canvas|Abrir Canvas do Segundo Cérebro (Mindmap Ativo)]]** — Visão 2D interativa conectando Fase Ativa, Decisões, Módulos e Lições.',
        '- 🗺️ **[[01-Roadmap.canvas|Abrir Canvas do Roteiro Completo (Linha do Tempo)]]** — Visão panorâmica dos Milestones e das 37 fases organizadas cronologicamente.',
        '- 🌐 [Grafo Visual Interativo de Conhecimento (HTML)](file:///../intel/graph-view.html) — Visualizador gráfico 3D/2D offline com física de partículas.',
        '- 📈 [Dashboard Visual de Observabilidade 360° (HTML)](file:///../intel/dashboard.html) — Painel executivo com simulador de custos e métricas.',
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
        '- [[Decisions/D-174|D-174: Universal Second Brain Obsidian Vault Engine]]',
        '- [[Decisions/D-175|D-175: Quality-First Telemetry & Zero Amnesia Dashboard]]',
        '',
        '## 📦 Módulos Centrais de Produção (src/)',
        productionModules
            .slice(0, 8)
            .map(m => `- [[Modules/${sanitizeSlug(m.file)}|${node_path_1.default.basename(m.file)}]] (\`${m.file}\`, PageRank: ${m.pageRank}, ${m.exportsCount} exports)`)
            .join('\n'),
        '',
        toolingModules.length > 0 ? '## 🛠️ Suporte, Testes e Tooling' : '',
        toolingModules.length > 0
            ? toolingModules
                .slice(0, 4)
                .map(m => `- [[Modules/${sanitizeSlug(m.file)}|${node_path_1.default.basename(m.file)}]] (\`${m.file}\`, PageRank: ${m.pageRank})`)
                .join('\n')
            : '',
        '',
        lessonsList.length > 0 ? '## 🛡️ Lições de Auto-Cura & Anti-Patterns Recentes' : '',
        lessonsList.length > 0
            ? lessonsList
                .slice(0, 6)
                .map(l => `- [[Lessons/${l.id}|${l.id}: ${l.title.slice(0, 70)}]]`)
                .join('\n')
            : '',
        '',
        '---',
        '*Gerado automaticamente pelo GSD Core Nexus. Todos os nós estão integrados e navegáveis bidirecionalmente.*',
        '',
    ].filter(Boolean).join('\n');
    (0, shell_command_projection_cjs_1.platformWriteSync)(homePath, homeContent);
    // 8. Generate 00-Vault.canvas (Obsidian Canvas Visual Mindmap)
    const canvasPath = node_path_1.default.join(vaultDir, '00-Vault.canvas');
    const canvasNodes = [];
    const canvasEdges = [];
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
    // Right column: Top Production Modules from src/ (Green)
    const topProdModules = (productionModules.length > 0 ? productionModules : primaryModules).slice(0, 4);
    topProdModules.forEach((mod, idx) => {
        const modNodeId = `node-mod-${idx}`;
        canvasNodes.push({
            id: modNodeId,
            type: 'text',
            text: `### 📦 [[Modules/${sanitizeSlug(mod.file)}|${node_path_1.default.basename(mod.file)}]]\nPageRank: ${mod.pageRank}\nExports: ${mod.exportsCount}`,
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
    // Bottom row: Top Self-Healing Lessons (Orange, color: 2)
    const topLessons = lessonsList.slice(0, 3);
    topLessons.forEach((les, idx) => {
        const lesNodeId = `node-lesson-${idx}`;
        canvasNodes.push({
            id: lesNodeId,
            type: 'text',
            text: `### 🛡️ [[Lessons/${les.id}|${les.id}]]\n**${les.category}**\n${les.title.slice(0, 80)}...`,
            x: 180 + idx * 300,
            y: 450,
            width: 270,
            height: 120,
            color: '2', // Orange
        });
        canvasEdges.push({
            id: `edge-${lesNodeId}-to-phase`,
            fromNode: lesNodeId,
            fromSide: 'top',
            toNode: 'node-active-phase',
            toSide: 'bottom',
            color: '2',
        });
    });
    const canvasPayload = {
        nodes: canvasNodes,
        edges: canvasEdges,
    };
    (0, shell_command_projection_cjs_1.platformWriteSync)(canvasPath, JSON.stringify(canvasPayload, null, 2));
    // 9. Generate 01-Roadmap.canvas inside the vault (Full 37-Phase Visual Roadmap)
    const roadmapCanvasPath = node_path_1.default.join(vaultDir, '01-Roadmap.canvas');
    try {
        const { payload: roadmapPayload } = canvasGenMod.exportRoadmapCanvas(planningDir);
        (0, shell_command_projection_cjs_1.platformWriteSync)(roadmapCanvasPath, JSON.stringify(roadmapPayload, null, 2));
    }
    catch {
        // Non-blocking
    }
    // 8. Generate .obsidian/ configuration files
    const graphConfigPath = node_path_1.default.join(obsidianConfigDir, 'graph.json');
    const graphConfig = {
        'collapse-filter': false,
        search: '',
        showTags: false,
        showAttachments: false,
        hideUnresolved: false,
        showOrphans: true,
        colorGroups: [
            { query: 'path:Decisions', color: { a: 1, rgb: 3719160 } }, // Cyan
            { query: 'path:Phases', color: { a: 1, rgb: 11032055 } }, // Purple
            { query: 'path:Modules', color: { a: 1, rgb: 2278750 } }, // Emerald Green
            { query: 'path:Lessons', color: { a: 1, rgb: 16348438 } }, // Orange
        ],
    };
    (0, shell_command_projection_cjs_1.platformWriteSync)(graphConfigPath, JSON.stringify(graphConfig, null, 2));
    const appConfigPath = node_path_1.default.join(obsidianConfigDir, 'app.json');
    const appConfig = {
        useMarkdownLinks: false,
        newFileLocation: 'current',
    };
    (0, shell_command_projection_cjs_1.platformWriteSync)(appConfigPath, JSON.stringify(appConfig, null, 2));
    // 9. Rebuild backlinks index (now indexing all notes in .planning/vault)
    saveBacklinkIndex(planningDir, root);
    const totalNotes = totalDecisions + totalPhases + totalModules + totalLessons + 1; // + 00-Home.md
    return {
        vaultPath: vaultDir,
        canvasPath,
        roadmapCanvasPath,
        homePath,
        totalNotes,
        totalDecisions,
        totalPhases,
        totalModules,
        totalLessons,
        generatedAt: new Date().toISOString(),
    };
}
function querySecondBrain(planningDir, queryStr, rootDir) {
    const root = rootDir || node_path_1.default.resolve(planningDir, '..');
    const vaultDir = node_path_1.default.join(planningDir, 'vault');
    const queryTokens = queryStr
        .toLowerCase()
        .split(/[\s,;:_-]+/)
        .map(t => t.trim())
        .filter(t => t.length > 1);
    if (queryTokens.length === 0) {
        return { query: queryStr, totalMatches: 0, results: [] };
    }
    const items = [];
    if (node_fs_1.default.existsSync(vaultDir)) {
        const subDirs = [
            { dir: node_path_1.default.join(vaultDir, 'Decisions'), category: 'decision' },
            { dir: node_path_1.default.join(vaultDir, 'Phases'), category: 'phase' },
            { dir: node_path_1.default.join(vaultDir, 'Modules'), category: 'module' },
            { dir: node_path_1.default.join(vaultDir, 'Lessons'), category: 'lesson' },
        ];
        for (const { dir, category } of subDirs) {
            if (!node_fs_1.default.existsSync(dir))
                continue;
            const files = node_fs_1.default.readdirSync(dir);
            for (const f of files) {
                if (!f.endsWith('.md'))
                    continue;
                const noteId = f.replace(/\.md$/, '');
                const fullPath = node_path_1.default.join(dir, f);
                const content = (0, shell_command_projection_cjs_1.platformReadSync)(fullPath) || '';
                const lowerContent = content.toLowerCase();
                const lowerName = noteId.toLowerCase();
                let score = 0;
                for (const token of queryTokens) {
                    if (lowerName === token) {
                        score += 50;
                    }
                    else if (lowerName.includes(token)) {
                        score += 20;
                    }
                    const regex = new RegExp(`\\b${(0, pattern_cjs_1.escapeRegex)(token)}`, 'gi');
                    const matches = lowerContent.match(regex);
                    if (matches) {
                        score += Math.min(30, matches.length * 5);
                    }
                }
                if (score > 0) {
                    const titleMatch = content.match(/^#\s+(.+)$/m) || content.match(/^title:\s*(.+)$/m);
                    const title = titleMatch ? titleMatch[1].replace(/["']/g, '').trim() : noteId;
                    let snippet = '';
                    const firstToken = queryTokens.find(t => lowerContent.includes(t)) || queryTokens[0];
                    const idx = lowerContent.indexOf(firstToken);
                    if (idx >= 0) {
                        const start = Math.max(0, idx - 40);
                        const end = Math.min(content.length, idx + 80);
                        snippet = (start > 0 ? '...' : '') + content.slice(start, end).replace(/\r?\n/g, ' ').trim() + (end < content.length ? '...' : '');
                    }
                    else {
                        snippet = content.slice(0, 100).replace(/\r?\n/g, ' ').trim();
                    }
                    items.push({
                        category,
                        id: noteId,
                        title,
                        wikilink: `[[${category.charAt(0).toUpperCase() + category.slice(1)}s/${noteId}|${title}]]`,
                        relPath: node_path_1.default.relative(root, fullPath),
                        snippet,
                        score,
                    });
                }
            }
        }
    }
    items.sort((a, b) => b.score - a.score);
    return {
        query: queryStr,
        totalMatches: items.length,
        results: items.slice(0, 15),
    };
}
module.exports = {
    generateSecondBrainVault,
    querySecondBrain,
};
