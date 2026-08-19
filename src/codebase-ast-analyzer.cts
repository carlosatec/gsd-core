/**
 * Codebase AST Analyzer — Native TypeScript/JavaScript symbol & topology engine.
 *
 * Provides deep static analysis without external Python dependencies.
 * Extracts symbols, exports, imports, interfaces, classes, functions, and HTTP routes.
 * Builds and queries the codebase knowledge graph stored in `.planning/intel/codebase-graph.json`.
 */

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { platformReadSync, platformWriteSync, platformEnsureDir } from './shell-command-projection.cjs';

// ─── Types ────────────────────────────────────────────────────────────────────

type SymbolKind =
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'const'
  | 'variable'
  | 'enum'
  | 'method'
  | 'default';

interface ExtractedSymbol {
  name: string;
  kind: SymbolKind;
  line: number;
  exported: boolean;
  isTypeOnly?: boolean;
}

interface ExtractedImport {
  source: string;
  specifiers: string[];
  isTypeOnly: boolean;
  isRelative: boolean;
}

interface ExtractedExport {
  name: string;
  kind: SymbolKind;
  isTypeOnly: boolean;
}

interface ExtractedRoute {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'ALL' | 'USE';
  path: string;
  line: number;
}

interface FileAnalysisResult {
  filePath: string;
  imports: ExtractedImport[];
  exports: ExtractedExport[];
  symbols: ExtractedSymbol[];
  routes: ExtractedRoute[];
  externalDeps: string[];
  localDeps: string[];
  linesCount: number;
  hasErrors?: boolean;
}

interface CodebaseGraph {
  version: string;
  createdAt: string;
  updatedAt: string;
  root: string;
  stats: {
    totalFiles: number;
    totalSymbols: number;
    totalExports: number;
    totalRoutes: number;
    scanDurationMs: number;
  };
  files: Record<string, FileAnalysisResult>;
  symbolIndex: Record<string, string[]>;
  reverseDependencies: Record<string, string[]>;
  routes: ExtractedRoute[];
}

interface BuildGraphOptions {
  includeExtensions?: string[];
  excludePatterns?: (string | RegExp)[];
  maxFiles?: number;
}

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
function analyzeSourceFile(filePath: string, sourceText?: string): FileAnalysisResult {
  const content = sourceText ?? platformReadSync(filePath) ?? '';
  const lines = content.split('\n');
  const linesCount = lines.length;

  const imports: ExtractedImport[] = [];
  const exports: ExtractedExport[] = [];
  const symbols: ExtractedSymbol[] = [];
  const routes: ExtractedRoute[] = [];
  const externalDepsSet = new Set<string>();
  const localDepsSet = new Set<string>();

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
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') || filePath.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  function getLineNumber(pos: number): number {
    return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
  }

  function isExportedNode(node: ts.Node): boolean {
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    return !!modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
  }

  function visit(node: ts.Node): void {
    // 1. Import Declarations
    if (ts.isImportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier;
      if (ts.isStringLiteral(moduleSpecifier)) {
        const source = moduleSpecifier.text;
        const isRelative = source.startsWith('.') || source.startsWith('/');
        const isTypeOnly = !!node.importClause?.isTypeOnly;
        const specifiers: string[] = [];

        if (node.importClause) {
          if (node.importClause.name) {
            specifiers.push(node.importClause.name.text);
          }
          if (node.importClause.namedBindings) {
            if (ts.isNamedImports(node.importClause.namedBindings)) {
              for (const element of node.importClause.namedBindings.elements) {
                specifiers.push(element.name.text);
              }
            } else if (ts.isNamespaceImport(node.importClause.namedBindings)) {
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
        } else {
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
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression) && node.expression.text === 'require' && node.arguments.length > 0) {
        const firstArg = node.arguments[0];
        if (ts.isStringLiteral(firstArg)) {
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
          } else {
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
      if (ts.isPropertyAccessExpression(node.expression)) {
        const methodName = node.expression.name.text.toUpperCase();
        const validMethods = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'ALL', 'USE']);
        if (validMethods.has(methodName) && node.arguments.length > 0) {
          const firstArg = node.arguments[0];
          if (ts.isStringLiteral(firstArg) && firstArg.text.startsWith('/')) {
            routes.push({
              method: methodName as ExtractedRoute['method'],
              path: firstArg.text,
              line: getLineNumber(node.getStart(sourceFile)),
            });
          }
        }
      }
    }

    // 3. Functions
    if (ts.isFunctionDeclaration(node) && node.name) {
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
    if (ts.isClassDeclaration(node) && node.name) {
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
    if (ts.isInterfaceDeclaration(node)) {
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
    if (ts.isTypeAliasDeclaration(node)) {
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
    if (ts.isEnumDeclaration(node)) {
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
    if (ts.isVariableStatement(node)) {
      const isExported = isExportedNode(node);
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          const name = declaration.name.text;
          const line = getLineNumber(declaration.getStart(sourceFile));
          const kind: SymbolKind = node.declarationList.flags & ts.NodeFlags.Const ? 'const' : 'variable';

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
    if (ts.isExportDeclaration(node)) {
      const isTypeOnly = !!node.isTypeOnly;
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
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
    if (ts.isExportAssignment(node)) {
      exports.push({
        name: 'default',
        kind: 'default',
        isTypeOnly: false,
      });
    }

    // 11. CommonJS exports assignment (module.exports = { a, b })
    if (ts.isBinaryExpression(node)) {
      if (
        ts.isPropertyAccessExpression(node.left) &&
        node.left.expression.getText(sourceFile) === 'module' &&
        node.left.name.text === 'exports' &&
        ts.isObjectLiteralExpression(node.right)
      ) {
        for (const prop of node.right.properties) {
          if (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) {
            const name = prop.name.getText(sourceFile);
            exports.push({
              name,
              kind: 'variable',
              isTypeOnly: false,
            });
          }
        }
      } else if (
        ts.isPropertyAccessExpression(node.left) &&
        node.left.expression.getText(sourceFile) === 'exports'
      ) {
        const name = node.left.name.text;
        exports.push({
          name,
          kind: 'variable',
          isTypeOnly: false,
        });
      }
    }

    ts.forEachChild(node, visit);
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
function buildCodebaseGraph(rootDir: string, options: BuildGraphOptions = {}): CodebaseGraph {
  const startTime = Date.now();
  const maxFiles = options.maxFiles ?? 2000;
  const allowedExtensions = options.includeExtensions ? new Set(options.includeExtensions) : DEFAULT_EXTENSIONS;
  const excludePatterns = options.excludePatterns ?? DEFAULT_EXCLUDES;

  const filesMap: Record<string, FileAnalysisResult> = Object.create(null);
  const symbolIndex: Record<string, string[]> = Object.create(null);
  const reverseDependencies: Record<string, string[]> = Object.create(null);
  const allRoutes: ExtractedRoute[] = [];

  let scannedCount = 0;
  const visitedDirs = new Set<string>();

  function shouldExclude(relPath: string): boolean {
    const normalized = relPath.replace(/\\/g, '/');
    for (const pattern of excludePatterns) {
      if (typeof pattern === 'string') {
        if (normalized === pattern || normalized.startsWith(pattern + '/') || normalized.includes('/' + pattern + '/')) {
          return true;
        }
      } else if (pattern.test(normalized)) {
        return true;
      }
    }
    return false;
  }

  function scanDir(dir: string): void {
    if (scannedCount >= maxFiles) return;

    let realDir = dir;
    try {
      realDir = fs.realpathSync(dir);
    } catch {
      // If realpath fails, fallback to dir
    }
    if (visitedDirs.has(realDir)) return;
    visitedDirs.add(realDir);

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (scannedCount >= maxFiles) return;

      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(rootDir, fullPath);

      if (shouldExclude(relPath)) continue;

      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
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
    const fileDir = path.dirname(filePath);
    for (const localDep of fileData.localDeps) {
      // Resolve relative import to matching graph key
      const resolved = path.normalize(path.join(fileDir, localDep)).replace(/\\/g, '/');
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
function querySymbolLocations(
  graph: CodebaseGraph,
  symbolName: string
): Array<{ file: string; symbol: ExtractedSymbol }> {
  const files = graph.symbolIndex[symbolName] || [];
  const results: Array<{ file: string; symbol: ExtractedSymbol }> = [];

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
function queryFileDependencies(
  graph: CodebaseGraph,
  targetFile: string
): { imports: string[]; importedBy: string[]; external: string[] } {
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
function saveCodebaseGraph(planningDir: string, graph: CodebaseGraph): string {
  const intelDir = path.join(planningDir, 'intel');
  platformEnsureDir(intelDir);
  const outPath = path.join(intelDir, 'codebase-graph.json');
  platformWriteSync(outPath, JSON.stringify(graph, null, 2));
  return outPath;
}

/**
 * Loads the codebase graph from `.planning/intel/codebase-graph.json`.
 */
function loadCodebaseGraph(planningDir: string): CodebaseGraph | null {
  const graphPath = path.join(planningDir, 'intel', 'codebase-graph.json');
  try {
    const content = platformReadSync(graphPath);
    if (!content) return null;
    return JSON.parse(content) as CodebaseGraph;
  } catch {
    return null;
  }
}

export = {
  analyzeSourceFile,
  buildCodebaseGraph,
  querySymbolLocations,
  queryFileDependencies,
  saveCodebaseGraph,
  loadCodebaseGraph,
};
