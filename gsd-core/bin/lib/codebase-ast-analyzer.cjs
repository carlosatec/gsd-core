"use strict";
/**
 * Codebase AST Analyzer — Native TypeScript/JavaScript symbol & topology engine.
 *
 * Provides deep static analysis without external Python dependencies.
 * Extracts symbols, exports, imports, interfaces, classes, functions, and HTTP routes.
 * Builds and queries the codebase knowledge graph stored in `.planning/intel/codebase-graph.json`.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const typescript_1 = __importDefault(require("typescript"));
const shell_command_projection_cjs_1 = require("./shell-command-projection.cjs");
// ─── Constants ───────────────────────────────────────────────────────────────
const DEFAULT_EXTENSIONS = new Set(['.ts', '.tsx', '.cts', '.mts', '.js', '.jsx', '.cjs', '.mjs']);
const DEFAULT_EXCLUDES = [
    'node_modules',
    '.git',
    'dist',
    'build',
    'coverage',
    '.next',
    '.turbo',
    '.planning',
    'vendor',
    '.gemini',
];
// ─── AST Analysis Core ────────────────────────────────────────────────────────
/**
 * Analyzes a single TypeScript or JavaScript file and extracts its symbols, imports, and exports.
 */
function analyzeSourceFile(filePath, sourceText) {
    const content = sourceText ?? (0, shell_command_projection_cjs_1.platformReadSync)(filePath) ?? '';
    const lines = content.split('\n');
    const linesCount = lines.length;
    const imports = [];
    const exports = [];
    const symbols = [];
    const routes = [];
    const externalDepsSet = new Set();
    const localDepsSet = new Set();
    if (!content.trim()) {
        return {
            filePath,
            imports,
            exports,
            symbols,
            routes,
            externalDeps: [],
            localDeps: [],
            linesCount,
        };
    }
    // Create TypeScript AST source file
    const sourceFile = typescript_1.default.createSourceFile(filePath, content, typescript_1.default.ScriptTarget.Latest, true, filePath.endsWith('.tsx') || filePath.endsWith('.jsx') ? typescript_1.default.ScriptKind.TSX : typescript_1.default.ScriptKind.TS);
    function getLineNumber(pos) {
        return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
    }
    function isExportedNode(node) {
        const modifiers = typescript_1.default.canHaveModifiers(node) ? typescript_1.default.getModifiers(node) : undefined;
        return !!modifiers?.some(m => m.kind === typescript_1.default.SyntaxKind.ExportKeyword);
    }
    function visit(node) {
        // 1. Import Declarations
        if (typescript_1.default.isImportDeclaration(node)) {
            const moduleSpecifier = node.moduleSpecifier;
            if (typescript_1.default.isStringLiteral(moduleSpecifier)) {
                const source = moduleSpecifier.text;
                const isRelative = source.startsWith('.') || source.startsWith('/');
                const isTypeOnly = !!node.importClause?.isTypeOnly;
                const specifiers = [];
                if (node.importClause) {
                    if (node.importClause.name) {
                        specifiers.push(node.importClause.name.text);
                    }
                    if (node.importClause.namedBindings) {
                        if (typescript_1.default.isNamedImports(node.importClause.namedBindings)) {
                            for (const element of node.importClause.namedBindings.elements) {
                                specifiers.push(element.name.text);
                            }
                        }
                        else if (typescript_1.default.isNamespaceImport(node.importClause.namedBindings)) {
                            specifiers.push(node.importClause.namedBindings.name.text);
                        }
                    }
                }
                imports.push({
                    source,
                    specifiers,
                    isTypeOnly,
                    isRelative,
                });
                if (isRelative) {
                    localDepsSet.add(source);
                }
                else {
                    // Normalize package name (e.g. '@scope/pkg/sub' -> '@scope/pkg', 'lodash/get' -> 'lodash')
                    const pkgName = source.startsWith('@')
                        ? source.split('/').slice(0, 2).join('/')
                        : source.split('/')[0];
                    if (!pkgName.startsWith('node:')) {
                        externalDepsSet.add(pkgName);
                    }
                }
            }
        }
        // 2. CommonJS require calls: const x = require('y')
        if (typescript_1.default.isCallExpression(node)) {
            if (typescript_1.default.isIdentifier(node.expression) && node.expression.text === 'require' && node.arguments.length > 0) {
                const firstArg = node.arguments[0];
                if (typescript_1.default.isStringLiteral(firstArg)) {
                    const source = firstArg.text;
                    const isRelative = source.startsWith('.') || source.startsWith('/');
                    imports.push({
                        source,
                        specifiers: [],
                        isTypeOnly: false,
                        isRelative,
                    });
                    if (isRelative) {
                        localDepsSet.add(source);
                    }
                    else {
                        const pkgName = source.startsWith('@')
                            ? source.split('/').slice(0, 2).join('/')
                            : source.split('/')[0];
                        if (!pkgName.startsWith('node:')) {
                            externalDepsSet.add(pkgName);
                        }
                    }
                }
            }
            // HTTP Route detection (e.g., app.get('/route', ...), router.post('/route', ...))
            if (typescript_1.default.isPropertyAccessExpression(node.expression)) {
                const methodName = node.expression.name.text.toUpperCase();
                const validMethods = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'ALL', 'USE']);
                if (validMethods.has(methodName) && node.arguments.length > 0) {
                    const firstArg = node.arguments[0];
                    if (typescript_1.default.isStringLiteral(firstArg) && firstArg.text.startsWith('/')) {
                        routes.push({
                            method: methodName,
                            path: firstArg.text,
                            line: getLineNumber(node.getStart(sourceFile)),
                        });
                    }
                }
            }
        }
        // 3. Functions
        if (typescript_1.default.isFunctionDeclaration(node) && node.name) {
            const isExported = isExportedNode(node);
            const name = node.name.text;
            const line = getLineNumber(node.getStart(sourceFile));
            symbols.push({
                name,
                kind: 'function',
                line,
                exported: isExported,
            });
            if (isExported) {
                exports.push({ name, kind: 'function', isTypeOnly: false });
            }
        }
        // 4. Classes
        if (typescript_1.default.isClassDeclaration(node) && node.name) {
            const isExported = isExportedNode(node);
            const name = node.name.text;
            const line = getLineNumber(node.getStart(sourceFile));
            symbols.push({
                name,
                kind: 'class',
                line,
                exported: isExported,
            });
            if (isExported) {
                exports.push({ name, kind: 'class', isTypeOnly: false });
            }
        }
        // 5. Interfaces
        if (typescript_1.default.isInterfaceDeclaration(node)) {
            const isExported = isExportedNode(node);
            const name = node.name.text;
            const line = getLineNumber(node.getStart(sourceFile));
            symbols.push({
                name,
                kind: 'interface',
                line,
                exported: isExported,
                isTypeOnly: true,
            });
            if (isExported) {
                exports.push({ name, kind: 'interface', isTypeOnly: true });
            }
        }
        // 6. Type Aliases
        if (typescript_1.default.isTypeAliasDeclaration(node)) {
            const isExported = isExportedNode(node);
            const name = node.name.text;
            const line = getLineNumber(node.getStart(sourceFile));
            symbols.push({
                name,
                kind: 'type',
                line,
                exported: isExported,
                isTypeOnly: true,
            });
            if (isExported) {
                exports.push({ name, kind: 'type', isTypeOnly: true });
            }
        }
        // 7. Enums
        if (typescript_1.default.isEnumDeclaration(node)) {
            const isExported = isExportedNode(node);
            const name = node.name.text;
            const line = getLineNumber(node.getStart(sourceFile));
            symbols.push({
                name,
                kind: 'enum',
                line,
                exported: isExported,
            });
            if (isExported) {
                exports.push({ name, kind: 'enum', isTypeOnly: false });
            }
        }
        // 8. Variable statements (const / let)
        if (typescript_1.default.isVariableStatement(node)) {
            const isExported = isExportedNode(node);
            for (const declaration of node.declarationList.declarations) {
                if (typescript_1.default.isIdentifier(declaration.name)) {
                    const name = declaration.name.text;
                    const line = getLineNumber(declaration.getStart(sourceFile));
                    const kind = node.declarationList.flags & typescript_1.default.NodeFlags.Const ? 'const' : 'variable';
                    symbols.push({
                        name,
                        kind,
                        line,
                        exported: isExported,
                    });
                    if (isExported) {
                        exports.push({ name, kind, isTypeOnly: false });
                    }
                }
            }
        }
        // 9. Export declarations (export { a, b as c })
        if (typescript_1.default.isExportDeclaration(node)) {
            const isTypeOnly = !!node.isTypeOnly;
            if (node.exportClause && typescript_1.default.isNamedExports(node.exportClause)) {
                for (const element of node.exportClause.elements) {
                    const name = element.name.text;
                    exports.push({
                        name,
                        kind: 'variable',
                        isTypeOnly: isTypeOnly || !!element.isTypeOnly,
                    });
                }
            }
        }
        // 10. Export Assignment (export default / module.exports =)
        if (typescript_1.default.isExportAssignment(node)) {
            exports.push({
                name: 'default',
                kind: 'default',
                isTypeOnly: false,
            });
        }
        // 11. CommonJS exports assignment (module.exports = { a, b })
        if (typescript_1.default.isBinaryExpression(node)) {
            if (typescript_1.default.isPropertyAccessExpression(node.left) &&
                node.left.expression.getText(sourceFile) === 'module' &&
                node.left.name.text === 'exports' &&
                typescript_1.default.isObjectLiteralExpression(node.right)) {
                for (const prop of node.right.properties) {
                    if (typescript_1.default.isPropertyAssignment(prop) || typescript_1.default.isShorthandPropertyAssignment(prop)) {
                        const name = prop.name.getText(sourceFile);
                        exports.push({
                            name,
                            kind: 'variable',
                            isTypeOnly: false,
                        });
                    }
                }
            }
            else if (typescript_1.default.isPropertyAccessExpression(node.left) &&
                node.left.expression.getText(sourceFile) === 'exports') {
                const name = node.left.name.text;
                exports.push({
                    name,
                    kind: 'variable',
                    isTypeOnly: false,
                });
            }
        }
        typescript_1.default.forEachChild(node, visit);
    }
    visit(sourceFile);
    return {
        filePath,
        imports,
        exports,
        symbols,
        routes,
        externalDeps: Array.from(externalDepsSet),
        localDeps: Array.from(localDepsSet),
        linesCount,
    };
}
// ─── Graph Construction & Traversal ──────────────────────────────────────────
/**
 * Scans the workspace and builds a comprehensive Codebase Graph.
 */
function buildCodebaseGraph(rootDir, options = {}) {
    const startTime = Date.now();
    const maxFiles = options.maxFiles ?? 2000;
    const allowedExtensions = options.includeExtensions ? new Set(options.includeExtensions) : DEFAULT_EXTENSIONS;
    const excludePatterns = options.excludePatterns ?? DEFAULT_EXCLUDES;
    const filesMap = Object.create(null);
    const symbolIndex = Object.create(null);
    const reverseDependencies = Object.create(null);
    const allRoutes = [];
    let scannedCount = 0;
    const visitedDirs = new Set();
    function shouldExclude(relPath) {
        const normalized = relPath.replace(/\\/g, '/');
        for (const pattern of excludePatterns) {
            if (typeof pattern === 'string') {
                if (normalized === pattern || normalized.startsWith(pattern + '/') || normalized.includes('/' + pattern + '/')) {
                    return true;
                }
            }
            else if (pattern.test(normalized)) {
                return true;
            }
        }
        return false;
    }
    function scanDir(dir) {
        if (scannedCount >= maxFiles)
            return;
        let realDir = dir;
        try {
            realDir = node_fs_1.default.realpathSync(dir);
        }
        catch {
            // If realpath fails, fallback to dir
        }
        if (visitedDirs.has(realDir))
            return;
        visitedDirs.add(realDir);
        let entries = [];
        try {
            entries = node_fs_1.default.readdirSync(dir, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const entry of entries) {
            if (scannedCount >= maxFiles)
                return;
            const fullPath = node_path_1.default.join(dir, entry.name);
            const relPath = node_path_1.default.relative(rootDir, fullPath);
            if (shouldExclude(relPath))
                continue;
            if (entry.isDirectory()) {
                scanDir(fullPath);
            }
            else if (entry.isFile()) {
                const ext = node_path_1.default.extname(entry.name).toLowerCase();
                if (allowedExtensions.has(ext)) {
                    scannedCount++;
                    const relKey = relPath.replace(/\\/g, '/');
                    const result = analyzeSourceFile(fullPath);
                    result.filePath = relKey;
                    filesMap[relKey] = result;
                    // Index symbols
                    for (const s of result.symbols) {
                        if (!Array.isArray(symbolIndex[s.name])) {
                            symbolIndex[s.name] = [];
                        }
                        if (!symbolIndex[s.name].includes(relKey)) {
                            symbolIndex[s.name].push(relKey);
                        }
                    }
                    // Aggregate routes
                    for (const r of result.routes) {
                        allRoutes.push(r);
                    }
                }
            }
        }
    }
    scanDir(rootDir);
    // Compute reverse dependencies (importedBy)
    for (const [filePath, fileData] of Object.entries(filesMap)) {
        const fileDir = node_path_1.default.dirname(filePath);
        for (const localDep of fileData.localDeps) {
            // Resolve relative import to matching graph key
            const resolved = node_path_1.default.normalize(node_path_1.default.join(fileDir, localDep)).replace(/\\/g, '/');
            // Match candidate keys with extensions
            const candidates = [
                resolved,
                resolved + '.ts',
                resolved + '.tsx',
                resolved + '.cts',
                resolved + '.js',
                resolved + '.cjs',
                resolved + '/index.ts',
                resolved + '/index.js',
            ];
            for (const cand of candidates) {
                if (filesMap[cand]) {
                    if (!Array.isArray(reverseDependencies[cand])) {
                        reverseDependencies[cand] = [];
                    }
                    if (!reverseDependencies[cand].includes(filePath)) {
                        reverseDependencies[cand].push(filePath);
                    }
                    break;
                }
            }
        }
    }
    const duration = Date.now() - startTime;
    let totalSymbols = 0;
    let totalExports = 0;
    for (const f of Object.values(filesMap)) {
        totalSymbols += f.symbols.length;
        totalExports += f.exports.length;
    }
    return {
        version: '2.0.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        root: rootDir,
        stats: {
            totalFiles: Object.keys(filesMap).length,
            totalSymbols,
            totalExports,
            totalRoutes: allRoutes.length,
            scanDurationMs: duration,
        },
        files: filesMap,
        symbolIndex,
        reverseDependencies,
        routes: allRoutes,
    };
}
// ─── Queries & Persistence ───────────────────────────────────────────────────
/**
 * Searches for a symbol across the graph and returns all files and lines where it is defined.
 */
function querySymbolLocations(graph, symbolName) {
    const files = graph.symbolIndex[symbolName] || [];
    const results = [];
    for (const file of files) {
        const fileData = graph.files[file];
        if (fileData) {
            for (const s of fileData.symbols) {
                if (s.name === symbolName) {
                    results.push({ file, symbol: s });
                }
            }
        }
    }
    return results;
}
/**
 * Returns incoming and outgoing dependencies for a specific file.
 */
function queryFileDependencies(graph, targetFile) {
    const normalized = targetFile.replace(/\\/g, '/');
    const fileData = graph.files[normalized];
    return {
        imports: fileData ? fileData.localDeps : [],
        importedBy: graph.reverseDependencies[normalized] || [],
        external: fileData ? fileData.externalDeps : [],
    };
}
/**
 * Saves the codebase graph to `.planning/intel/codebase-graph.json`.
 */
function saveCodebaseGraph(planningDir, graph) {
    const intelDir = node_path_1.default.join(planningDir, 'intel');
    (0, shell_command_projection_cjs_1.platformEnsureDir)(intelDir);
    const outPath = node_path_1.default.join(intelDir, 'codebase-graph.json');
    (0, shell_command_projection_cjs_1.platformWriteSync)(outPath, JSON.stringify(graph, null, 2));
    return outPath;
}
/**
 * Loads the codebase graph from `.planning/intel/codebase-graph.json`.
 */
function loadCodebaseGraph(planningDir) {
    const graphPath = node_path_1.default.join(planningDir, 'intel', 'codebase-graph.json');
    try {
        const content = (0, shell_command_projection_cjs_1.platformReadSync)(graphPath);
        if (!content)
            return null;
        return JSON.parse(content);
    }
    catch {
        return null;
    }
}
module.exports = {
    analyzeSourceFile,
    buildCodebaseGraph,
    querySymbolLocations,
    queryFileDependencies,
    saveCodebaseGraph,
    loadCodebaseGraph,
};
