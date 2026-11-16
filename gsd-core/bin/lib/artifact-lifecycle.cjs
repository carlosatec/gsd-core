"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
/** Read-only lifecycle inventory for GSD project knowledge artifacts. */
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const codebaseAst = require("./codebase-ast-analyzer.cjs");
const { computeCodebaseContentFingerprint } = codebaseAst;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const semanticRag = require("./hybrid-semantic-rag.cjs");
const { loadSemanticIndex, indexIsFresh } = semanticRag;
const ARTIFACT_LIFECYCLE = [
    { id: 'project-state', path: '.planning/STATE.md, ROADMAP.md, PROJECT.md', owner: 'project/user', class: 'authoritative', trigger: 'project setup and phase planning', freshness: 'authoritative user-maintained content', rebuild: 'never generated over existing state', retention: 'retain user content', refresh: '/gsd:plan or direct project edit', status: 'present' },
    { id: 'phase-plans', path: '.planning/phases/**', owner: 'phase planner/user', class: 'authoritative', trigger: 'phase planning and execution', freshness: 'plan and summary state', rebuild: 'edit through phase workflow', retention: 'retain', refresh: '/gsd:plan', status: 'present' },
    { id: 'codebase-graph', path: '.planning/intel/codebase-graph.json', owner: 'AST analyzer', class: 'derived', trigger: 'graph command or JIT prerequisite', freshness: 'supported-source content fingerprint', rebuild: 're-scan supported project files', retention: 'replace derived cache only', refresh: '/gsd:graph', status: 'missing' },
    { id: 'semantic-index', path: '.planning/intel/semantic-index.json', owner: 'offline RAG indexer', class: 'derived', trigger: 'retrieval query prerequisite', freshness: 'supported-file content fingerprints and schema', rebuild: 'reconcile changed files incrementally', retention: 'replace derived cache only', refresh: '/gsd:plan or /gsd:exec when retrieval is needed', status: 'missing' },
    { id: 'telemetry', path: '.planning/intel/telemetry.json', owner: 'JIT telemetry', class: 'derived', trigger: 'JIT invocation', freshness: 'not applicable; cumulative measurements', rebuild: 'append/update through telemetry writer', retention: 'retain unless user requests reset', refresh: 'created by JIT use', status: 'absent' },
    { id: 'living-docs', path: '.planning/codebase/ARCHITECTURE.md, APIS.md', owner: 'living docs generator', class: 'derived', trigger: 'explicit docs sync or requested drift repair', freshness: 'generator run against current source', rebuild: 'regenerate from AST/API surface', retention: 'regenerable outputs', refresh: '/gsd:review --fix when drift is found', status: 'missing' },
    { id: 'memory', path: '.planning/memory/decisions.jsonl', owner: 'user and memory engine', class: 'durable', trigger: 'explicit memory record, decision sync, verified self-healing lesson', freshness: 'not applicable; durable history', rebuild: 'never discard user-authored entries', retention: 'permanent for architecture decisions; preserve remaining records/archive', refresh: 'record through memory or decision workflow', status: 'absent' },
    { id: 'codebase-map', path: '.planning/codebase/CONTEXT.md', owner: 'map-codebase workflow', class: 'optional', trigger: 'user selects map offer or explicit request', freshness: 'explicit map generation timestamp', rebuild: 'regenerate on explicit request', retention: 'retain until user requests removal', refresh: '/gsd:map-codebase', status: 'not generated' },
    { id: 'vault-visual-exports', path: '.planning/vault/, .planning/graphs/', owner: 'export commands', class: 'optional', trigger: 'explicit export request', freshness: 'export timestamp', rebuild: 'regenerate only requested export', retention: 'retain user-managed exports', refresh: '/gsd:graph --vault or visual export command', status: 'not generated' },
    { id: 'temporary-workflow', path: '.planning/tmp/', owner: 'active workflow', class: 'transient', trigger: 'workflow operation', freshness: 'active operation only', rebuild: 'operation-specific', retention: 'remove only known tool-owned temporary files', refresh: 'next workflow run', status: 'absent' },
];
function inspectArtifactLifecycle(planningDir, rootDir = node_path_1.default.dirname(planningDir)) {
    const exists = (relativePath) => node_fs_1.default.existsSync(node_path_1.default.join(planningDir, relativePath));
    return ARTIFACT_LIFECYCLE.map(item => {
        let status = item.status;
        if (item.id === 'project-state')
            status = ['STATE.md', 'ROADMAP.md'].every(name => exists(name)) ? 'present' : 'missing';
        if (item.id === 'phase-plans')
            status = exists('phases') ? 'present' : 'missing';
        if (item.id === 'codebase-graph') {
            const graphPath = node_path_1.default.join(planningDir, 'intel', 'codebase-graph.json');
            if (!node_fs_1.default.existsSync(graphPath))
                status = 'missing';
            else {
                try {
                    const graph = JSON.parse(node_fs_1.default.readFileSync(graphPath, 'utf8'));
                    status = graph.stats?.contentFingerprint === computeCodebaseContentFingerprint(rootDir) ? 'current' : 'stale';
                }
                catch {
                    status = 'stale';
                }
            }
        }
        if (item.id === 'semantic-index') {
            const index = loadSemanticIndex(planningDir);
            status = !index ? 'missing' : indexIsFresh(rootDir, index) ? 'current' : 'stale';
        }
        if (item.id === 'telemetry')
            status = exists('intel/telemetry.json') ? 'present' : 'absent';
        if (item.id === 'living-docs')
            status = exists('codebase/ARCHITECTURE.md') || exists('codebase/APIS.md') ? 'present' : 'missing';
        if (item.id === 'memory')
            status = exists('memory/decisions.jsonl') ? 'present' : 'absent';
        if (item.id === 'codebase-map')
            status = exists('codebase/CONTEXT.md') ? 'present' : 'not generated';
        if (item.id === 'vault-visual-exports')
            status = exists('vault') || exists('graphs') ? 'present' : 'not generated';
        if (item.id === 'temporary-workflow')
            status = exists('tmp') ? 'present' : 'absent';
        return { ...item, status };
    });
}
module.exports = { ARTIFACT_LIFECYCLE, inspectArtifactLifecycle };
