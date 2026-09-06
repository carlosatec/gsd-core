/**
 * Codebase AST Analyzer — Universal Multi-Language Symbol & Topology Engine.
 *
 * Provides deep static analysis without external Python/compiler dependencies.
 * Analyzes Full-Stack, Mobile, Databases, Styling, DevOps, Backend & System files:
 * - TypeScript / JavaScript (.ts, .tsx, .cts, .mts, .js, .jsx, .cjs, .mjs)
 * - Mobile & Frontend (.dart / Flutter, .html, .vue, .svelte)
 * - Databases & Schemas (.sql MySQL/Postgres/SQLite, .prisma, .graphql, .gql)
 * - Styling & Tokens (.css, .scss, .sass, .less)
 * - Backend & Systems (.py, .go, .rs, .cs, .java, .kt, .php, .rb, .c, .cpp, .h, .hpp)
 * - DevOps & Shell (Dockerfile, docker-compose, .sh, .bash, .zsh)
 * - OpenAPI / Swagger specs (.yaml, .json)
 *
 * Builds and queries the unified codebase knowledge graph stored in `.planning/intel/codebase-graph.json`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { platformReadSync, platformWriteSync, platformEnsureDir } from './shell-command-projection.cjs';
import { splitLines } from './text-lines.cjs';

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
  | 'struct'
  | 'trait'
  | 'table'
  | 'model'
  | 'widget'
  | 'component'
  | 'token'
  | 'service'
  | 'default';

interface ExtractedSymbol {
  name: string;
  kind: SymbolKind;
  line: number;
  exported: boolean;
  isTypeOnly?: boolean;
  meta?: Record<string, string | number | boolean>;
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
  language?: string;
  hasErrors?: boolean;
  mtime?: number;
  size?: number;
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
    filesByLanguage?: Record<string, number>;
  };
  files: Record<string, FileAnalysisResult>;
  symbolIndex: Record<string, string[]>;
  reverseDependencies: Record<string, string[]>;
  pageRankScores: Record<string, number>;
  routes: ExtractedRoute[];
}

interface BuildGraphOptions {
  includeExtensions?: string[];
  excludePatterns?: (string | RegExp)[];
  maxFiles?: number;
  liteMode?: boolean;
  previousGraph?: CodebaseGraph | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_EXTENSIONS = new Set([
  // TypeScript & JavaScript
  '.ts', '.tsx', '.cts', '.mts', '.js', '.jsx', '.cjs', '.mjs',
  // Styles & Design Tokens
  '.css', '.scss', '.sass', '.less',
  // Mobile & Web Templates
  '.dart', '.swift', '.m', '.mm', '.html', '.htm', '.vue', '.svelte',
  // Databases & Schemas
  '.sql', '.prisma', '.graphql', '.gql',
  // Backend & Systems
  '.py', '.go', '.rs', '.cs', '.java', '.kt', '.php', '.rb',
  '.c', '.cpp', '.h', '.hpp',
  // DevOps & Shell
  '.sh', '.bash', '.zsh', '.yaml', '.yml'
]);

const SPECIAL_FILENAMES = new Set([
  'dockerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml',
  '.dockerignore',
  '.env.example',
  'package.swift',
  'podfile',
  'info.plist',
  'build.gradle.kts',
  'settings.gradle.kts',
  'androidmanifest.xml',
  'cargo.toml',
  'go.mod',
  'pyproject.toml',
  'requirements.txt',
  'pubspec.yaml'
]);

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
  'target',
  'bin',
  'obj',
  '__pycache__',
  '.venv',
  'venv',
  'pods',
  '.gradle',
  'deriveddata',
  '.build',
  'xcuserdata',
  '.swiftpm'
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toPosixPath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

// ─── Specialized Language Analyzers ───────────────────────────────────────────

/**
 * 1. Python Analyzer (.py)
 */
function analyzePythonFile(filePath: string, content: string): FileAnalysisResult {
  const lines = content.split('\n');
  const imports: ExtractedImport[] = [];
  const exports: ExtractedExport[] = [];
  const symbols: ExtractedSymbol[] = [];
  const routes: ExtractedRoute[] = [];
  const externalDepsSet = new Set<string>();
  const localDepsSet = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) continue;

    // Multi-line from import: from foo import ( ... )
    const multiFromMatch = trimmed.match(/^from\s+([a-zA-Z0-9_.]+)\s+import\s*\(/);
    if (multiFromMatch) {
      const source = multiFromMatch[1];
      let collected = '';
      if (trimmed.includes(')')) {
        collected = trimmed.substring(trimmed.indexOf('(') + 1, trimmed.indexOf(')'));
      } else {
        collected = trimmed.substring(trimmed.indexOf('(') + 1);
        while (i + 1 < lines.length) {
          i++;
          const nextLine = lines[i].split('#')[0].trim();
          collected += ' ' + nextLine;
          if (nextLine.includes(')')) break;
        }
        if (collected.includes(')')) {
          collected = collected.substring(0, collected.indexOf(')'));
        }
      }
      collected = collected.replace(/\)/g, '');
      const specifiers = collected.split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
      const isRelative = source.startsWith('.');
      if (isRelative) localDepsSet.add(source);
      else externalDepsSet.add(source.split('.')[0]);
      imports.push({ source, specifiers, isTypeOnly: false, isRelative });
      continue;
    }

    // Imports: import foo, from foo import bar
    const importMatch = trimmed.match(/^import\s+([a-zA-Z0-9_.,\s]+)/);
    if (importMatch) {
      const pkgs = importMatch[1].split(',').map(s => s.trim().split(' ')[0]);
      for (const p of pkgs) {
        if (p.startsWith('.')) {
          localDepsSet.add(p);
          imports.push({ source: p, specifiers: [], isTypeOnly: false, isRelative: true });
        } else {
          const rootPkg = p.split('.')[0];
          externalDepsSet.add(rootPkg);
          imports.push({ source: p, specifiers: [], isTypeOnly: false, isRelative: false });
        }
      }
    }

    const fromImportMatch = trimmed.match(/^from\s+([a-zA-Z0-9_.]+)\s+import\s+([a-zA-Z0-9_.,\s*]+)/);
    if (fromImportMatch) {
      const source = fromImportMatch[1];
      const specifiers = fromImportMatch[2].split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
      const isRelative = source.startsWith('.');
      if (isRelative) localDepsSet.add(source);
      else externalDepsSet.add(source.split('.')[0]);
      imports.push({ source, specifiers, isTypeOnly: false, isRelative });
    }

    // Classes: class Foo(Bar):
    const classMatch = trimmed.match(/^class\s+([a-zA-Z0-9_]+)/);
    if (classMatch) {
      const name = classMatch[1];
      symbols.push({ name, kind: 'class', line: lineNum, exported: !name.startsWith('_') });
      exports.push({ name, kind: 'class', isTypeOnly: false });
    }

    // Functions: def foo(): or async def foo():
    const funcMatch = trimmed.match(/^(?:async\s+)?def\s+([a-zA-Z0-9_]+)/);
    if (funcMatch) {
      const name = funcMatch[1];
      symbols.push({ name, kind: 'function', line: lineNum, exported: !name.startsWith('_') });
      exports.push({ name, kind: 'function', isTypeOnly: false });
    }

    // Routes (FastAPI/Flask): @app.get('/route'), @router.post('/route'), @bp.route('/route')
    const routeMatch = trimmed.match(/@(?:app|router|api|bp)\.(get|post|put|delete|patch|route)\(\s*['"]([^'"]+)['"]/i);
    if (routeMatch) {
      const method = routeMatch[1].toUpperCase() === 'ROUTE' ? 'GET' : (routeMatch[1].toUpperCase() as ExtractedRoute['method']);
      routes.push({ method, path: routeMatch[2], line: lineNum });
    }
  }

  return {
    filePath,
    imports,
    exports,
    symbols,
    routes,
    externalDeps: Array.from(externalDepsSet),
    localDeps: Array.from(localDepsSet),
    linesCount: lines.length,
    language: 'python'
  };
}

/**
 * 2. Go Analyzer (.go)
 */
function analyzeGoFile(filePath: string, content: string): FileAnalysisResult {
  const lines = content.split('\n');
  const imports: ExtractedImport[] = [];
  const exports: ExtractedExport[] = [];
  const symbols: ExtractedSymbol[] = [];
  const routes: ExtractedRoute[] = [];
  const externalDepsSet = new Set<string>();
  const localDepsSet = new Set<string>();

  let inImportBlock = false;
  let inTypeBlock = false;
  let typeBlockStructDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('//')) continue;

    // Multi-line import block: import ( ... )
    if (trimmed === 'import (') {
      inImportBlock = true;
      continue;
    }
    if (inImportBlock) {
      if (trimmed === ')') {
        inImportBlock = false;
        continue;
      }
      const impMatch = trimmed.match(/["']([^"']+)["']/);
      if (impMatch) {
        const source = impMatch[1];
        if (source.startsWith('.') || source.startsWith('/')) {
          localDepsSet.add(source);
          imports.push({ source, specifiers: [], isTypeOnly: false, isRelative: true });
        } else {
          externalDepsSet.add(source.split('/')[0]);
          imports.push({ source, specifiers: [], isTypeOnly: false, isRelative: false });
        }
      }
      continue;
    }

    // Multi-line type block: type ( ... )
    if (trimmed === 'type (') {
      inTypeBlock = true;
      typeBlockStructDepth = 0;
      continue;
    }
    if (inTypeBlock) {
      if (trimmed === ')' && typeBlockStructDepth === 0) {
        inTypeBlock = false;
        continue;
      }
      if (typeBlockStructDepth === 0) {
        const typeInBlock = trimmed.match(/^([A-Za-z0-9_]+)\s+(struct|interface|[A-Za-z0-9_]+)/);
        if (typeInBlock) {
          const name = typeInBlock[1];
          const kindRaw = typeInBlock[2];
          const kind: SymbolKind = kindRaw === 'struct' ? 'struct' : kindRaw === 'interface' ? 'interface' : 'type';
          const isExported = /^[A-Z]/.test(name);
          symbols.push({ name, kind, line: lineNum, exported: isExported });
          if (isExported) {
            exports.push({ name, kind, isTypeOnly: true });
          }
        }
      }
      if (trimmed.includes('{')) typeBlockStructDepth += (trimmed.match(/\{/g) || []).length;
      if (trimmed.includes('}')) typeBlockStructDepth = Math.max(0, typeBlockStructDepth - (trimmed.match(/\}/g) || []).length);
      continue;
    }

    // Single import: import "fmt"
    const singleImp = trimmed.match(/^import\s+["']([^"']+)["']/);
    if (singleImp) {
      const source = singleImp[1];
      externalDepsSet.add(source.split('/')[0]);
      imports.push({ source, specifiers: [], isTypeOnly: false, isRelative: false });
    }

    // Structs / Interfaces: type Name struct / type Name interface
    const typeMatch = trimmed.match(/^type\s+([A-Z][a-zA-Z0-9_]*)\s+(struct|interface)/);
    if (typeMatch) {
      const name = typeMatch[1];
      const kind: SymbolKind = typeMatch[2] === 'struct' ? 'struct' : 'interface';
      symbols.push({ name, kind, line: lineNum, exported: true });
      exports.push({ name, kind, isTypeOnly: true });
    }

    // Functions / Methods: func Name(...) or func (r *Receiver) Name(...)
    const funcMatch = trimmed.match(/^func\s+(?:\([^)]+\)\s+)?([A-Za-z0-9_]+)\s*\(/);
    if (funcMatch) {
      const name = funcMatch[1];
      const isExported = /^[A-Z]/.test(name);
      symbols.push({ name, kind: 'function', line: lineNum, exported: isExported });
      if (isExported) {
        exports.push({ name, kind: 'function', isTypeOnly: false });
      }
    }

    // Routes (Gin/Fiber/Chi/Mux): r.GET("/route", ...), app.Post("/route", ...)
    const routeMatch = trimmed.match(/\.(GET|POST|PUT|DELETE|PATCH|Handle|HandleFunc|Get|Post|Put|Delete)\(\s*["']([^"']+)["']/i);
    if (routeMatch) {
      const rawMethod = routeMatch[1].toUpperCase();
      const method = (['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(rawMethod) ? rawMethod : 'GET') as ExtractedRoute['method'];
      routes.push({ method, path: routeMatch[2], line: lineNum });
    }
  }

  return {
    filePath,
    imports,
    exports,
    symbols,
    routes,
    externalDeps: Array.from(externalDepsSet),
    localDeps: Array.from(localDepsSet),
    linesCount: lines.length,
    language: 'go'
  };
}

/**
 * 3. Rust Analyzer (.rs)
 */
function analyzeRustFile(filePath: string, content: string): FileAnalysisResult {
  const lines = content.split('\n');
  const imports: ExtractedImport[] = [];
  const exports: ExtractedExport[] = [];
  const symbols: ExtractedSymbol[] = [];
  const routes: ExtractedRoute[] = [];
  const externalDepsSet = new Set<string>();
  const localDepsSet = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('//')) continue;

    // Multi-line or nested use statements: use crate::foo::{bar, baz};
    const nestedUseMatch = trimmed.match(/^use\s+([a-zA-Z0-9_:]+)::\{/);
    if (nestedUseMatch) {
      const baseSource = nestedUseMatch[1];
      let collected = '';
      if (trimmed.includes('}')) {
        collected = trimmed.substring(trimmed.indexOf('{') + 1, trimmed.indexOf('}'));
      } else {
        collected = trimmed.substring(trimmed.indexOf('{') + 1);
        while (i + 1 < lines.length) {
          i++;
          const nextLine = lines[i].split('//')[0].trim();
          collected += ' ' + nextLine;
          if (nextLine.includes('}')) break;
        }
        if (collected.includes('}')) {
          collected = collected.substring(0, collected.indexOf('}'));
        }
      }
      collected = collected.replace(/[};]/g, '');
      const specifiers = collected.split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
      const isRelative = baseSource.startsWith('crate') || baseSource.startsWith('super') || baseSource.startsWith('self');
      if (isRelative) localDepsSet.add(baseSource);
      else externalDepsSet.add(baseSource.split('::')[0]);
      imports.push({ source: baseSource, specifiers, isTypeOnly: false, isRelative });
      continue;
    }

    // Use statements: use crate::foo::bar; use std::collections::HashMap;
    const useMatch = trimmed.match(/^use\s+([a-zA-Z0-9_:]+)/);
    if (useMatch) {
      const source = useMatch[1];
      if (source.startsWith('crate') || source.startsWith('super') || source.startsWith('self')) {
        localDepsSet.add(source);
        imports.push({ source, specifiers: [], isTypeOnly: false, isRelative: true });
      } else {
        externalDepsSet.add(source.split('::')[0]);
        imports.push({ source, specifiers: [], isTypeOnly: false, isRelative: false });
      }
    }

    // Struct / Enum / Trait: pub struct Foo, struct Bar, pub trait Baz
    const typeMatch = trimmed.match(/^(pub\s+)?(struct|enum|trait)\s+([A-Za-z0-9_]+)/);
    if (typeMatch) {
      const isPublic = !!typeMatch[1];
      const kind = typeMatch[2] as 'struct' | 'enum' | 'trait';
      const name = typeMatch[3];
      symbols.push({ name, kind, line: lineNum, exported: isPublic });
      if (isPublic) exports.push({ name, kind, isTypeOnly: true });
    }

    // Functions: pub fn name(...), fn name(...)
    const fnMatch = trimmed.match(/^(pub\s+)?(?:async\s+)?fn\s+([a-zA-Z0-9_]+)/);
    if (fnMatch) {
      const isPublic = !!fnMatch[1];
      const name = fnMatch[2];
      symbols.push({ name, kind: 'function', line: lineNum, exported: isPublic });
      if (isPublic) exports.push({ name, kind: 'function', isTypeOnly: false });
    }

    // Routes (Axum/Actix): .route("/path", get(handler))
    const routeMatch = trimmed.match(/\.route\(\s*["']([^"']+)["'],\s*(get|post|put|delete|patch)/i);
    if (routeMatch) {
      routes.push({
        method: routeMatch[2].toUpperCase() as ExtractedRoute['method'],
        path: routeMatch[1],
        line: lineNum
      });
    }
  }

  return {
    filePath,
    imports,
    exports,
    symbols,
    routes,
    externalDeps: Array.from(externalDepsSet),
    localDeps: Array.from(localDepsSet),
    linesCount: lines.length,
    language: 'rust'
  };
}

/**
 * 4. Flutter / Dart Analyzer (.dart)
 */
function analyzeDartFile(filePath: string, content: string): FileAnalysisResult {
  const lines = content.split('\n');
  const imports: ExtractedImport[] = [];
  const exports: ExtractedExport[] = [];
  const symbols: ExtractedSymbol[] = [];
  const routes: ExtractedRoute[] = [];
  const externalDepsSet = new Set<string>();
  const localDepsSet = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('//')) continue;

    // Imports: import 'package:flutter/material.dart'; or import './widget.dart';
    const importMatch = trimmed.match(/^import\s+['"]([^'"]+)['"]/);
    if (importMatch) {
      const source = importMatch[1];
      if (source.startsWith('package:')) {
        const pkgName = source.replace('package:', '').split('/')[0];
        externalDepsSet.add(pkgName);
        imports.push({ source, specifiers: [], isTypeOnly: false, isRelative: false });
      } else {
        localDepsSet.add(source);
        imports.push({ source, specifiers: [], isTypeOnly: false, isRelative: true });
      }
    }

    // Classes / Widgets: class MyWidget extends StatelessWidget
    const classMatch = trimmed.match(/^class\s+([A-Za-z0-9_]+)(?:\s+extends\s+([A-Za-z0-9_]+))?/);
    if (classMatch) {
      const name = classMatch[1];
      const baseClass = classMatch[2] || '';
      const isWidget = baseClass.includes('Widget') || baseClass.includes('State');
      const kind: SymbolKind = isWidget ? 'widget' : 'class';
      const isExported = !name.startsWith('_');
      symbols.push({ name, kind, line: lineNum, exported: isExported });
      if (isExported) exports.push({ name, kind, isTypeOnly: false });
    }

    // Enums: enum Status { ... }
    const enumMatch = trimmed.match(/^enum\s+([A-Za-z0-9_]+)/);
    if (enumMatch) {
      const name = enumMatch[1];
      symbols.push({ name, kind: 'enum', line: lineNum, exported: !name.startsWith('_') });
      exports.push({ name, kind: 'enum', isTypeOnly: true });
    }
  }

  return {
    filePath,
    imports,
    exports,
    symbols,
    routes,
    externalDeps: Array.from(externalDepsSet),
    localDeps: Array.from(localDepsSet),
    linesCount: lines.length,
    language: 'dart'
  };
}

/**
 * 5. C# / .NET Analyzer (.cs)
 */
function analyzeCSharpFile(filePath: string, content: string): FileAnalysisResult {
  const lines = content.split('\n');
  const imports: ExtractedImport[] = [];
  const exports: ExtractedExport[] = [];
  const symbols: ExtractedSymbol[] = [];
  const routes: ExtractedRoute[] = [];
  const externalDepsSet = new Set<string>();
  const localDepsSet = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('//')) continue;

    // Using statements: using System.Collections.Generic;
    const usingMatch = trimmed.match(/^using\s+([A-Za-z0-9_.]+);/);
    if (usingMatch) {
      const source = usingMatch[1];
      externalDepsSet.add(source.split('.')[0]);
      imports.push({ source, specifiers: [], isTypeOnly: false, isRelative: false });
    }

    // Classes / Interfaces / Records / Structs: public static class Foo, public abstract class Bar, public record Baz
    const typeMatch = trimmed.match(/^(?:(?:public|internal|private|protected|static|abstract|sealed|partial|readonly)\s+)*(class|interface|record|enum|struct)\s+([A-Za-z0-9_]+)/);
    if (typeMatch) {
      const isPublic = !trimmed.startsWith('private') && !trimmed.startsWith('protected');
      const kindRaw = typeMatch[1];
      const name = typeMatch[2];
      const kind: SymbolKind = kindRaw === 'interface' ? 'interface' : kindRaw === 'enum' ? 'enum' : 'class';
      symbols.push({ name, kind, line: lineNum, exported: isPublic });
      if (isPublic) exports.push({ name, kind, isTypeOnly: kind === 'interface' });
    }

    // ASP.NET Web API Routes: [HttpGet("path")], [HttpPost("path")]
    const routeMatch = trimmed.match(/\[Http(Get|Post|Put|Delete|Patch)\(?["']?([^"']*)["']?\)?\]/i);
    if (routeMatch) {
      routes.push({
        method: routeMatch[1].toUpperCase() as ExtractedRoute['method'],
        path: routeMatch[2] ? (routeMatch[2].startsWith('/') ? routeMatch[2] : '/' + routeMatch[2]) : '/',
        line: lineNum
      });
    }
  }

  return {
    filePath,
    imports,
    exports,
    symbols,
    routes,
    externalDeps: Array.from(externalDepsSet),
    localDeps: Array.from(localDepsSet),
    linesCount: lines.length,
    language: 'csharp'
  };
}

/**
 * 6. Java & Kotlin Analyzer (.java, .kt)
 */
function analyzeJvmFile(filePath: string, content: string): FileAnalysisResult {
  const lines = content.split('\n');
  const imports: ExtractedImport[] = [];
  const exports: ExtractedExport[] = [];
  const symbols: ExtractedSymbol[] = [];
  const routes: ExtractedRoute[] = [];
  const externalDepsSet = new Set<string>();
  const localDepsSet = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue;

    // Imports: import org.springframework.web.bind.annotation.GetMapping;
    const importMatch = trimmed.match(/^import\s+([A-Za-z0-9_.]+);?/);
    if (importMatch) {
      const source = importMatch[1];
      externalDepsSet.add(source.split('.')[0]);
      imports.push({ source, specifiers: [], isTypeOnly: false, isRelative: false });
    }

    // Kotlin Composable: @Composable fun MyScreen() or previous line had @Composable
    const isComposable = trimmed.includes('@Composable') || (i > 0 && lines[i - 1].trim().includes('@Composable'));

    // Classes / Interfaces / Data Classes / Sealed Classes / Objects / Enums:
    const classMatch = trimmed.match(/^(?:(?:public|private|internal|protected|data|sealed|abstract|open|final)\s+)*(class|interface|enum|object)\s+([A-Za-z0-9_]+)/);
    if (classMatch) {
      const kindRaw = classMatch[1];
      const name = classMatch[2];
      const isHilt = trimmed.includes('@HiltViewModel') || (i > 0 && lines[i - 1].trim().includes('@HiltViewModel'));
      const kind: SymbolKind = isHilt ? 'service' : kindRaw === 'interface' ? 'interface' : kindRaw === 'enum' ? 'enum' : 'class';
      const isExported = !trimmed.startsWith('private');
      symbols.push({ name, kind, line: lineNum, exported: isExported, meta: { isSealed: trimmed.includes('sealed'), isObject: kindRaw === 'object' } });
      if (isExported) {
        exports.push({ name, kind, isTypeOnly: kindRaw === 'interface' });
      }
    }

    // Kotlin Functions & Methods: fun doSomething(), suspend fun fetchUser()
    const funcMatch = trimmed.match(/^(?:(?:public|private|internal|protected|override|suspend|inline|tailrec|open|final)\s+)*fun\s+([A-Za-z0-9_]+)/);
    if (funcMatch) {
      const name = funcMatch[1];
      const isSuspend = trimmed.includes('suspend');
      const kind: SymbolKind = isComposable ? 'component' : 'function';
      const isExported = !trimmed.startsWith('private');
      symbols.push({ name, kind, line: lineNum, exported: isExported, meta: { isComposable, isSuspend } });
      if (isExported) {
        exports.push({ name, kind, isTypeOnly: false });
      }
    }

    // Spring Boot & Ktor Routes
    const routeMatch = trimmed.match(/@(Get|Post|Put|Delete|Patch)Mapping\(\s*["']([^"']+)["']/i) ||
                       trimmed.match(/(?:get|post|put|delete|patch)\(\s*["']([^"']+)["']/i);
    if (routeMatch) {
      const rawMethod = routeMatch[1] ? routeMatch[1].toUpperCase() : 'GET';
      const method = (['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(rawMethod) ? rawMethod : 'GET') as ExtractedRoute['method'];
      routes.push({
        method,
        path: routeMatch[2] || routeMatch[1],
        line: lineNum
      });
    }
  }

  return {
    filePath,
    imports,
    exports,
    symbols,
    routes,
    externalDeps: Array.from(externalDepsSet),
    localDeps: Array.from(localDepsSet),
    linesCount: lines.length,
    language: filePath.endsWith('.kt') ? 'kotlin' : 'java'
  };
}

/**
 * 6b. Swift Analyzer (.swift, .m, .mm)
 */
function analyzeSwiftFile(filePath: string, content: string): FileAnalysisResult {
  const lines = content.split('\n');
  const imports: ExtractedImport[] = [];
  const exports: ExtractedExport[] = [];
  const symbols: ExtractedSymbol[] = [];
  const routes: ExtractedRoute[] = [];
  const externalDepsSet = new Set<string>();
  const localDepsSet = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue;

    // Imports: import SwiftUI, import class UIKit.UIView, @testable import MyApp
    const importMatch = trimmed.match(/^(?:@testable\s+)?import\s+(?:(?:typealias|struct|class|enum|protocol|let|var|func)\s+)?([A-Za-z0-9_.]+)/);
    if (importMatch) {
      const source = importMatch[1];
      externalDepsSet.add(source.split('.')[0]);
      imports.push({ source, specifiers: [], isTypeOnly: false, isRelative: false });
    }

    // Structs / Classes / Actors / Protocols / Enums / Extensions
    const declMatch = trimmed.match(/^(?:(?:public|open|private|fileprivate|internal|final|frozen|indirect)\s+)*(struct|class|actor|protocol|enum|extension)\s+([A-Za-z0-9_]+)/);
    if (declMatch) {
      const kindRaw = declMatch[1];
      const name = declMatch[2];
      const isView = (kindRaw === 'struct' || kindRaw === 'class') && (trimmed.includes(': View') || trimmed.includes(': some View'));
      const kind: SymbolKind = isView ? 'component' : (kindRaw === 'protocol' ? 'interface' : kindRaw === 'enum' ? 'enum' : kindRaw === 'struct' ? 'struct' : 'class');
      const isExported = !trimmed.startsWith('private') && !trimmed.startsWith('fileprivate');
      symbols.push({ name, kind, line: lineNum, exported: isExported, meta: { isSwiftView: isView } });
      if (isExported) {
        exports.push({ name, kind, isTypeOnly: kindRaw === 'protocol' });
      }
    }

    // Functions: func fetchData(), static func shared()
    const funcMatch = trimmed.match(/^(?:(?:public|open|private|fileprivate|internal|static|class|mutating|override|async|throws)\s+)*func\s+([A-Za-z0-9_]+)/);
    if (funcMatch) {
      const name = funcMatch[1];
      const isExported = !trimmed.startsWith('private') && !trimmed.startsWith('fileprivate');
      symbols.push({ name, kind: 'function', line: lineNum, exported: isExported });
      if (isExported) {
        exports.push({ name, kind: 'function', isTypeOnly: false });
      }
    }

    // Vapor / Swift Server routes: app.get("path"), routes.post("path")
    const routeMatch = trimmed.match(/\.(get|post|put|delete|patch)\(\s*["']([^"']+)["']/i);
    if (routeMatch) {
      routes.push({
        method: routeMatch[1].toUpperCase() as ExtractedRoute['method'],
        path: routeMatch[2],
        line: lineNum,
      });
    }
  }

  return {
    filePath,
    imports,
    exports,
    symbols,
    routes,
    externalDeps: Array.from(externalDepsSet),
    localDeps: Array.from(localDepsSet),
    linesCount: lines.length,
    language: 'swift',
  };
}

/**
 * 7. PHP Analyzer (.php)
 */
function analyzePhpFile(filePath: string, content: string): FileAnalysisResult {
  const lines = content.split('\n');
  const imports: ExtractedImport[] = [];
  const exports: ExtractedExport[] = [];
  const symbols: ExtractedSymbol[] = [];
  const routes: ExtractedRoute[] = [];
  const externalDepsSet = new Set<string>();
  const localDepsSet = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) continue;

    // Use statements: use App\Models\User;
    const useMatch = trimmed.match(/^use\s+([A-Za-z0-9_\\]+);/);
    if (useMatch) {
      const source = useMatch[1];
      localDepsSet.add(source);
      imports.push({ source, specifiers: [], isTypeOnly: false, isRelative: true });
    }

    // Classes / Interfaces / Traits: class Foo, interface Bar, trait Baz
    const classMatch = trimmed.match(/^(?:abstract\s+|final\s+)?(class|interface|trait|enum)\s+([A-Za-z0-9_]+)/);
    if (classMatch) {
      const kindRaw = classMatch[1];
      const name = classMatch[2];
      const kind: SymbolKind = kindRaw === 'interface' ? 'interface' : 'class';
      symbols.push({ name, kind, line: lineNum, exported: true });
      exports.push({ name, kind, isTypeOnly: kind === 'interface' });
    }

    // Functions: function foo(...)
    const funcMatch = trimmed.match(/^(?:public\s+|protected\s+|private\s+)?function\s+([A-Za-z0-9_]+)/);
    if (funcMatch) {
      const name = funcMatch[1];
      symbols.push({ name, kind: 'function', line: lineNum, exported: true });
      exports.push({ name, kind: 'function', isTypeOnly: false });
    }

    // Laravel Routes: Route::get('/path', ...), Route::post('/path', ...)
    const routeMatch = trimmed.match(/Route::(get|post|put|delete|patch)\(\s*['"]([^'"]+)['"]/i);
    if (routeMatch) {
      routes.push({
        method: routeMatch[1].toUpperCase() as ExtractedRoute['method'],
        path: routeMatch[2],
        line: lineNum
      });
    }
  }

  return {
    filePath,
    imports,
    exports,
    symbols,
    routes,
    externalDeps: Array.from(externalDepsSet),
    localDeps: Array.from(localDepsSet),
    linesCount: lines.length,
    language: 'php'
  };
}

/**
 * 8. Ruby Analyzer (.rb)
 */
function analyzeRubyFile(filePath: string, content: string): FileAnalysisResult {
  const lines = content.split('\n');
  const imports: ExtractedImport[] = [];
  const exports: ExtractedExport[] = [];
  const symbols: ExtractedSymbol[] = [];
  const routes: ExtractedRoute[] = [];
  const externalDepsSet = new Set<string>();
  const localDepsSet = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) continue;

    // Requires: require 'json', require_relative 'user'
    const reqMatch = trimmed.match(/^require(?:_relative)?\s+['"]([^'"]+)['"]/);
    if (reqMatch) {
      const source = reqMatch[1];
      const isRel = trimmed.startsWith('require_relative');
      if (isRel) localDepsSet.add(source);
      else externalDepsSet.add(source);
      imports.push({ source, specifiers: [], isTypeOnly: false, isRelative: isRel });
    }

    // Classes / Modules: class User < ApplicationRecord, module Auth
    const classMatch = trimmed.match(/^(?:class|module)\s+([A-Za-z0-9_:]+)/);
    if (classMatch) {
      const name = classMatch[1];
      symbols.push({ name, kind: 'class', line: lineNum, exported: true });
      exports.push({ name, kind: 'class', isTypeOnly: false });
    }

    // Methods: def authenticate(user)
    const defMatch = trimmed.match(/^def\s+([A-Za-z0-9_!?]+)/);
    if (defMatch) {
      const name = defMatch[1];
      symbols.push({ name, kind: 'function', line: lineNum, exported: true });
      exports.push({ name, kind: 'function', isTypeOnly: false });
    }

    // Rails Routes: get '/path', to: 'controller#action'
    const routeMatch = trimmed.match(/^(get|post|put|delete|patch)\s+['"]([^'"]+)['"]/i);
    if (routeMatch) {
      routes.push({
        method: routeMatch[1].toUpperCase() as ExtractedRoute['method'],
        path: routeMatch[2],
        line: lineNum
      });
    }
  }

  return {
    filePath,
    imports,
    exports,
    symbols,
    routes,
    externalDeps: Array.from(externalDepsSet),
    localDeps: Array.from(localDepsSet),
    linesCount: lines.length,
    language: 'ruby'
  };
}

/**
 * 9. C / C++ Analyzer (.c, .cpp, .h, .hpp)
 */
function analyzeCppFile(filePath: string, content: string): FileAnalysisResult {
  const lines = content.split('\n');
  const imports: ExtractedImport[] = [];
  const exports: ExtractedExport[] = [];
  const symbols: ExtractedSymbol[] = [];
  const routes: ExtractedRoute[] = [];
  const externalDepsSet = new Set<string>();
  const localDepsSet = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('//')) continue;

    // Includes: #include <vector>, #include "my_header.h"
    const incMatch = trimmed.match(/^#include\s+([<"])([^>"]+)[>"]/);
    if (incMatch) {
      const isLocal = incMatch[1] === '"';
      const source = incMatch[2];
      if (isLocal) localDepsSet.add(source);
      else externalDepsSet.add(source);
      imports.push({ source, specifiers: [], isTypeOnly: false, isRelative: isLocal });
    }

    // Struct / Class / Enum: class Foo, struct Bar, enum Baz
    const typeMatch = trimmed.match(/^(?:class|struct|enum)\s+([A-Za-z0-9_]+)/);
    if (typeMatch) {
      const name = typeMatch[1];
      symbols.push({ name, kind: 'struct', line: lineNum, exported: true });
      exports.push({ name, kind: 'struct', isTypeOnly: true });
    }
  }

  return {
    filePath,
    imports,
    exports,
    symbols,
    routes,
    externalDeps: Array.from(externalDepsSet),
    localDeps: Array.from(localDepsSet),
    linesCount: lines.length,
    language: 'cpp'
  };
}

/**
 * 10. SQL DDL Analyzer (MySQL, PostgreSQL, SQLite em .sql)
 */
function analyzeSqlFile(filePath: string, content: string): FileAnalysisResult {
  const lines = content.split('\n');
  const imports: ExtractedImport[] = [];
  const exports: ExtractedExport[] = [];
  const symbols: ExtractedSymbol[] = [];
  const routes: ExtractedRoute[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    // Strip inline /* ... */ comments
    const stripped = line.replace(/\/\*.*?\*\//g, '').trim();

    if (!stripped || stripped.startsWith('--')) continue;

    // Tables: CREATE TABLE [IF NOT EXISTS] users ( ... )
    const tableMatch = stripped.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?([a-zA-Z0-9_]+)`?/i);
    if (tableMatch) {
      const name = tableMatch[1];
      symbols.push({ name, kind: 'table', line: lineNum, exported: true });
      exports.push({ name, kind: 'table', isTypeOnly: false });
    }

    // Views / Procedures
    const procMatch = stripped.match(/CREATE\s+(?:OR\s+REPLACE\s+)?(VIEW|PROCEDURE|FUNCTION)\s+`?([a-zA-Z0-9_]+)`?/i);
    if (procMatch) {
      const name = procMatch[2];
      symbols.push({ name, kind: 'function', line: lineNum, exported: true });
      exports.push({ name, kind: 'function', isTypeOnly: false });
    }
  }

  return {
    filePath,
    imports,
    exports,
    symbols,
    routes,
    externalDeps: [],
    localDeps: [],
    linesCount: lines.length,
    language: 'sql'
  };
}

/**
 * 11. Prisma & Schema Analyzer (.prisma, .graphql, .gql)
 */
function analyzeSchemaFile(filePath: string, content: string): FileAnalysisResult {
  const lines = content.split('\n');
  const imports: ExtractedImport[] = [];
  const exports: ExtractedExport[] = [];
  const symbols: ExtractedSymbol[] = [];
  const routes: ExtractedRoute[] = [];
  const isPrisma = filePath.toLowerCase().endsWith('.prisma');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) continue;

    if (isPrisma) {
      // Prisma: model User { ... } or enum Role { ... } or type Address { ... }
      const prismaModel = trimmed.match(/^(model|enum|type)\s+([A-Za-z0-9_]+)/);
      if (prismaModel) {
        const name = prismaModel[2];
        const kind: SymbolKind = prismaModel[1] === 'enum' ? 'enum' : 'model';
        symbols.push({ name, kind, line: lineNum, exported: true });
        exports.push({ name, kind, isTypeOnly: true });
      }
    } else {
      // GraphQL: type Query, type Mutation, input UserInput
      const gqlType = trimmed.match(/^(type|input|schema|interface)\s+([A-Za-z0-9_]+)/);
      if (gqlType) {
        const name = gqlType[2];
        symbols.push({ name, kind: 'interface', line: lineNum, exported: true });
        exports.push({ name, kind: 'interface', isTypeOnly: true });
      }
    }
  }

  return {
    filePath,
    imports,
    exports,
    symbols,
    routes,
    externalDeps: [],
    localDeps: [],
    linesCount: lines.length,
    language: isPrisma ? 'prisma' : 'graphql'
  };
}

/**
 * 12. CSS & Design Tokens Analyzer (.css, .scss, .sass, .less)
 */
function analyzeStyleFile(filePath: string, content: string): FileAnalysisResult {
  const lines = content.split('\n');
  const imports: ExtractedImport[] = [];
  const exports: ExtractedExport[] = [];
  const symbols: ExtractedSymbol[] = [];
  const routes: ExtractedRoute[] = [];
  const localDepsSet = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('/*') || trimmed.startsWith('//')) continue;

    // Imports: @import 'vars.css'; @use 'theme'; @forward 'mixins';
    const importMatch = trimmed.match(/^@(import|use|forward)\s+['"]([^'"]+)['"]/);
    if (importMatch) {
      const source = importMatch[2];
      localDepsSet.add(source);
      imports.push({ source, specifiers: [], isTypeOnly: false, isRelative: true });
    }

    // CSS Custom Properties / Design Tokens: --primary-color: #3b82f6;
    const varMatch = trimmed.match(/^(--[a-zA-Z0-9_-]+)\s*:/);
    if (varMatch) {
      const name = varMatch[1];
      symbols.push({ name, kind: 'token', line: lineNum, exported: true });
      exports.push({ name, kind: 'token', isTypeOnly: true });
    }

    // CSS Classes: .btn-primary, .card
    const classMatch = trimmed.match(/^\.([a-zA-Z0-9_-]+)(?:\s*[,{:\s]|$)/);
    if (classMatch) {
      const name = classMatch[1];
      symbols.push({ name: `.${name}`, kind: 'token', line: lineNum, exported: true });
      exports.push({ name: `.${name}`, kind: 'token', isTypeOnly: true });
    }

    // Keyframe Animations: @keyframes fadeIn
    const keyframesMatch = trimmed.match(/^@keyframes\s+([a-zA-Z0-9_-]+)/);
    if (keyframesMatch) {
      const name = `@keyframes ${keyframesMatch[1]}`;
      symbols.push({ name, kind: 'token', line: lineNum, exported: true });
    }
  }

  return {
    filePath,
    imports,
    exports,
    symbols,
    routes,
    externalDeps: [],
    localDeps: Array.from(localDepsSet),
    linesCount: lines.length,
    language: 'css'
  };
}

/**
 * 13. HTML & SFC Components Analyzer (.html, .vue, .svelte)
 */
function analyzeHtmlAndSfcFile(filePath: string, content: string): FileAnalysisResult {
  const lines = content.split('\n');
  const imports: ExtractedImport[] = [];
  const exports: ExtractedExport[] = [];
  const symbols: ExtractedSymbol[] = [];
  const routes: ExtractedRoute[] = [];
  const localDepsSet = new Set<string>();
  const externalDepsSet = new Set<string>();

  const isSfc = filePath.endsWith('.vue') || filePath.endsWith('.svelte');

  if (isSfc) {
    // Extract internal script blocks: <script ...> ... </script>
    const scriptBlockRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    let match: RegExpExecArray | null;
    while ((match = scriptBlockRegex.exec(content)) !== null) {
      const scriptCode = match[1];
      if (scriptCode.trim()) {
        const subResult = analyzeSourceFile(filePath.replace(/\.(vue|svelte)$/, '.ts'), scriptCode);
        imports.push(...subResult.imports);
        exports.push(...subResult.exports);
        symbols.push(...subResult.symbols);
        routes.push(...subResult.routes);
        for (const ed of subResult.externalDeps) externalDepsSet.add(ed);
        for (const ld of subResult.localDeps) localDepsSet.add(ld);
      }
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    if (!trimmed) continue;

    // Script src or stylesheet link: <script src="./main.js">, <link href="./style.css">
    const scriptSrc = trimmed.match(/<script\s+[^>]*src=["']([^"']+)["']/i);
    if (scriptSrc) {
      const source = scriptSrc[1];
      localDepsSet.add(source);
      imports.push({ source, specifiers: [], isTypeOnly: false, isRelative: true });
    }

    // Form actions: <form action="/api/login" method="POST">
    const formMatch = trimmed.match(/<form\s+[^>]*action=["']([^"']+)["'](?:\s+[^>]*method=["']([^"']+)["'])?/i);
    if (formMatch) {
      const path = formMatch[1];
      const method = (formMatch[2]?.toUpperCase() || 'POST') as ExtractedRoute['method'];
      routes.push({ method, path, line: lineNum });
    }

    // Elements with ID: <button id="submit-btn">
    const idMatch = trimmed.match(/id=["']([a-zA-Z0-9_-]+)["']/i);
    if (idMatch) {
      const name = `#${idMatch[1]}`;
      symbols.push({ name, kind: 'component', line: lineNum, exported: true });
    }
  }

  return {
    filePath,
    imports,
    exports,
    symbols,
    routes,
    externalDeps: Array.from(externalDepsSet),
    localDeps: Array.from(localDepsSet),
    linesCount: lines.length,
    language: filePath.endsWith('.vue') ? 'vue' : filePath.endsWith('.svelte') ? 'svelte' : 'html'
  };
}

/**
 * 14. DevOps & Shell Analyzer (Dockerfile, docker-compose, .sh, .bash, .zsh)
 */
function analyzeDevOpsAndShellFile(filePath: string, content: string): FileAnalysisResult {
  const lines = content.split('\n');
  const imports: ExtractedImport[] = [];
  const exports: ExtractedExport[] = [];
  const symbols: ExtractedSymbol[] = [];
  const routes: ExtractedRoute[] = [];
  const localDepsSet = new Set<string>();
  const externalDepsSet = new Set<string>();

  const baseName = path.basename(filePath).toLowerCase();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) continue;

    // Dockerfile: FROM node:20, EXPOSE 3000, ENV PORT=3000
    if (baseName.includes('dockerfile')) {
      const fromMatch = trimmed.match(/^FROM\s+([a-zA-Z0-9_/.:-]+)/i);
      if (fromMatch) {
        externalDepsSet.add(fromMatch[1]);
        symbols.push({ name: `image:${fromMatch[1]}`, kind: 'service', line: lineNum, exported: true });
      }
      const exposeMatch = trimmed.match(/^EXPOSE\s+([0-9]+)/i);
      if (exposeMatch) {
        symbols.push({ name: `port:${exposeMatch[1]}`, kind: 'token', line: lineNum, exported: true });
      }
    }

    // Docker Compose: services: api, db, redis
    if (baseName.includes('compose') || baseName.includes('docker-compose')) {
      const serviceMatch = line.match(/^\s{2}([a-zA-Z0-9_-]+):/);
      if (serviceMatch && !['version', 'services', 'networks', 'volumes'].includes(serviceMatch[1])) {
        const name = `service:${serviceMatch[1]}`;
        symbols.push({ name, kind: 'service', line: lineNum, exported: true });
        exports.push({ name, kind: 'service', isTypeOnly: false });
      }
      const portMatch = trimmed.match(/["']?([0-9]+):([0-9]+)["']?/);
      if (portMatch) {
        symbols.push({ name: `port:${portMatch[1]}->${portMatch[2]}`, kind: 'token', line: lineNum, exported: true });
      }
    }

    // Cargo.toml: [dependencies], [dev-dependencies], [build-dependencies]
    if (baseName === 'cargo.toml') {
      const pkgMatch = trimmed.match(/^name\s*=\s*["']([^"']+)["']/);
      if (pkgMatch) {
        symbols.push({ name: `crate:${pkgMatch[1]}`, kind: 'service', line: lineNum, exported: true });
        exports.push({ name: `crate:${pkgMatch[1]}`, kind: 'service', isTypeOnly: false });
      }
      const depMatch = trimmed.match(/^([a-zA-Z0-9_-]+)\s*=/);
      if (depMatch && !['name', 'version', 'edition', 'authors', 'description', 'license', 'workspace', 'default-run'].includes(depMatch[1])) {
        externalDepsSet.add(depMatch[1]);
      }
    }

    // go.mod: module name, require (...)
    if (baseName === 'go.mod') {
      const modMatch = trimmed.match(/^module\s+([^\s]+)/);
      if (modMatch) {
        symbols.push({ name: `module:${modMatch[1]}`, kind: 'service', line: lineNum, exported: true });
        exports.push({ name: `module:${modMatch[1]}`, kind: 'service', isTypeOnly: false });
      }
      const reqMatch = trimmed.match(/^(?:require\s+)?([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*)\s+v[0-9]/);
      if (reqMatch) {
        externalDepsSet.add(reqMatch[1]);
      }
    }

    // pyproject.toml & requirements.txt
    if (baseName === 'requirements.txt' || baseName === 'pyproject.toml') {
      const reqPkgMatch = trimmed.match(/^([a-zA-Z0-9_-]+)(?:\[.*\])?(?:[=><~!]|\s|$)/);
      if (reqPkgMatch && !reqPkgMatch[1].startsWith('-') && !['version', 'name', 'description', 'dependencies', 'requires-python', 'readme'].includes(reqPkgMatch[1])) {
        externalDepsSet.add(reqPkgMatch[1]);
      }
    }

    // pubspec.yaml: name:, dependencies:, dev_dependencies:
    if (baseName === 'pubspec.yaml') {
      const pubName = trimmed.match(/^name:\s*([a-zA-Z0-9_]+)/);
      if (pubName) {
        symbols.push({ name: `package:${pubName[1]}`, kind: 'service', line: lineNum, exported: true });
        exports.push({ name: `package:${pubName[1]}`, kind: 'service', isTypeOnly: false });
      }
      const pubDep = line.match(/^\s{2}([a-zA-Z0-9_]+):/);
      if (pubDep && !['sdk', 'flutter', 'flutter_test', 'version', 'description', 'environment'].includes(pubDep[1])) {
        externalDepsSet.add(pubDep[1]);
      }
    }

    // Shell Scripts: function deploy() or build_app() { ... }, export VAR=...
    if (filePath.endsWith('.sh') || filePath.endsWith('.bash') || filePath.endsWith('.zsh')) {
      const fnMatch = trimmed.match(/^(?:function\s+)?([a-zA-Z0-9_]+)\s*\(\)\s*\{/);
      if (fnMatch) {
        const name = fnMatch[1];
        symbols.push({ name, kind: 'function', line: lineNum, exported: true });
        exports.push({ name, kind: 'function', isTypeOnly: false });
      }
      const exportMatch = trimmed.match(/^export\s+([a-zA-Z0-9_]+)=/);
      if (exportMatch) {
        const name = exportMatch[1];
        symbols.push({ name, kind: 'token', line: lineNum, exported: true });
      }
      const sourceMatch = trimmed.match(/^(?:source|\.)\s+['"]?([^'"\s]+)['"]?/);
      if (sourceMatch) {
        const source = sourceMatch[1];
        localDepsSet.add(source);
        imports.push({ source, specifiers: [], isTypeOnly: false, isRelative: true });
      }
    }
  }

  return {
    filePath,
    imports,
    exports,
    symbols,
    routes,
    externalDeps: Array.from(externalDepsSet),
    localDeps: Array.from(localDepsSet),
    linesCount: lines.length,
    language: baseName.includes('docker') ? 'docker' : 'shell'
  };
}

// ─── AST Analysis Core ────────────────────────────────────────────────────────

interface TsConfigAliases {
  paths: Record<string, string[]>;
  baseUrl: string;
}

const tsConfigCache = new Map<string, TsConfigAliases | null>();

function loadTsConfigAliases(root: string): TsConfigAliases | null {
  if (tsConfigCache.has(root)) return tsConfigCache.get(root) ?? null;

  const tsConfigPath = path.join(root, 'tsconfig.json');
  const jsConfigPath = path.join(root, 'jsconfig.json');
  const candidatePath = fs.existsSync(tsConfigPath) ? tsConfigPath : fs.existsSync(jsConfigPath) ? jsConfigPath : null;

  if (!candidatePath) {
    tsConfigCache.set(root, null);
    return null;
  }

  try {
    const raw = fs.readFileSync(candidatePath, 'utf-8');
    const lines = splitLines(raw);
    const cleanLines: string[] = [];
    let inBlockComment = false;
    for (const line of lines) {
      let l = line.trim();
      if (inBlockComment) {
        if (l.includes('*/')) {
          inBlockComment = false;
          l = l.substring(l.indexOf('*/') + 2).trim();
        } else {
          continue;
        }
      }
      if (l.startsWith('/*')) {
        if (l.includes('*/')) {
          l = l.substring(l.indexOf('*/') + 2).trim();
        } else {
          inBlockComment = true;
          continue;
        }
      }
      if (l.startsWith('//')) continue;
      cleanLines.push(line.replace(/\/\/[^"']*$/, ''));
    }
    const stripped = cleanLines.join('\n');
    const parsed = JSON.parse(stripped) as { compilerOptions?: { paths?: Record<string, string[]>; baseUrl?: string } };
    const paths = parsed.compilerOptions?.paths || {};
    const baseUrl = parsed.compilerOptions?.baseUrl || '.';
    const result: TsConfigAliases = { paths, baseUrl };
    tsConfigCache.set(root, result);
    return result;
  } catch {
    tsConfigCache.set(root, null);
    return null;
  }
}

function resolvePathAlias(source: string, root: string, aliases: TsConfigAliases | null): string | null {
  if (!aliases || !aliases.paths) return null;
  for (const [aliasPattern, targetList] of Object.entries(aliases.paths)) {
    const aliasPrefix = aliasPattern.replace(/\*$/, '');
    if (source.startsWith(aliasPrefix) && targetList.length > 0) {
      const targetPrefix = targetList[0].replace(/\*$/, '');
      const remainder = source.slice(aliasPrefix.length);
      const relativeTarget = toPosixPath(path.join(aliases.baseUrl, targetPrefix, remainder));
      return relativeTarget.startsWith('.') ? relativeTarget : `./${relativeTarget}`;
    }
  }
  return null;
}

// ─── Tiered AST Engine (Camada 1: TS Compiler, Camada 2: State-Machine Lexer) ──

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment */
let cachedTsModule: any = undefined;
function getTsModule(): any {
  if (cachedTsModule !== undefined) return cachedTsModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, local/no-external-require-in-bin
    cachedTsModule = require('typescript');
  } catch {
    cachedTsModule = null;
  }
  return cachedTsModule;
}
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment */

/**
 * Camada 2: State-Machine Lexer Universal (Passe 1).
 * Sanitizes block comments, line comments, docstrings, and strings
 * while preserving exact newline positions (\n) for line-accurate symbol indexing.
 */
function sanitizeCodePreservingLines(content: string, lang: string): string {
  let inBlockComment = false;
  let inLineComment = false;
  let inDocstring: string | null = null;
  const chars = content.split('');
  const len = chars.length;

  for (let i = 0; i < len; i++) {
    const ch = chars[i];
    const next = i + 1 < len ? chars[i + 1] : '';

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        chars[i] = ' ';
        chars[i + 1] = ' ';
        i++;
        inBlockComment = false;
      } else if (ch !== '\n') {
        chars[i] = ' ';
      }
      continue;
    }

    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false;
      } else {
        chars[i] = ' ';
      }
      continue;
    }

    if (inDocstring) {
      if (ch === inDocstring[0] && next === inDocstring[0] && i + 2 < len && chars[i + 2] === inDocstring[0]) {
        chars[i] = ' ';
        chars[i + 1] = ' ';
        chars[i + 2] = ' ';
        i += 2;
        inDocstring = null;
      } else if (ch !== '\n') {
        chars[i] = ' ';
      }
      continue;
    }

    // Block comment /* ... */
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      chars[i] = ' ';
      chars[i + 1] = ' ';
      i++;
      continue;
    }

    // Line comments // or #
    if (
      (ch === '/' && next === '/') ||
      (ch === '#' && ['python', 'ruby', 'shell', 'yaml', 'toml'].includes(lang))
    ) {
      inLineComment = true;
      chars[i] = ' ';
      if (next === '/') {
        chars[i + 1] = ' ';
        i++;
      }
      continue;
    }

    // Python docstrings: """ or '''
    if (lang === 'python' && (ch === '"' || ch === "'")) {
      if (next === ch && i + 2 < len && chars[i + 2] === ch) {
        inDocstring = ch + ch + ch;
        chars[i] = ' ';
        chars[i + 1] = ' ';
        chars[i + 2] = ' ';
        i += 2;
        continue;
      }
    }
  }

  return chars.join('');
}

/**
 * Camada 1: Compilador TypeScript Oficial.
 * Strictly self-contained to guarantee zero memory retention by the V8 garbage collector (Fix L-02).
 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unnecessary-type-assertion */
function analyzeWithTypeScriptCompiler(
  filePath: string,
  content: string,
  ts: any,
  aliases: TsConfigAliases | null
): FileAnalysisResult | null {
  try {
    const rootDir = process.cwd();
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      false
    );

    const imports: ExtractedImport[] = [];
    const exports: ExtractedExport[] = [];
    const symbols: ExtractedSymbol[] = [];
    const routes: ExtractedRoute[] = [];
    const externalDepsSet = new Set<string>();
    const localDepsSet = new Set<string>();

    function addImport(rawSource: string, specifiers: string[], isTypeOnly: boolean) {
      const resolvedAlias = resolvePathAlias(rawSource, rootDir, aliases);
      const source = resolvedAlias || rawSource;
      const isRelative = source.startsWith('.') || source.startsWith('/');
      imports.push({ source, specifiers, isTypeOnly, isRelative });
      if (isRelative) localDepsSet.add(source);
      else {
        const pkgName = source.startsWith('@') ? source.split('/').slice(0, 2).join('/') : source.split('/')[0];
        if (!pkgName.startsWith('node:')) externalDepsSet.add(pkgName);
      }
    }

    function getLine(pos: number): number {
      return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
    }

    function hasExportModifier(node: any): boolean {
      if (!node.modifiers) return false;
      return node.modifiers.some((m: any) => m.kind === ts.SyntaxKind.ExportKeyword);
    }

    // Walk statements
    for (const statement of sourceFile.statements) {
      const isExported = hasExportModifier(statement);
      const lineNum = getLine(statement.getStart(sourceFile));

      // 1. ImportDeclaration: import ... from '...'
      if (ts.isImportDeclaration(statement)) {
        const rawSource = (statement.moduleSpecifier as any).text || '';
        const isTypeOnly = !!(statement.importClause && (statement.importClause as any).isTypeOnly);
        const specifiers: string[] = [];

        if (statement.importClause) {
          if (statement.importClause.name) {
            specifiers.push(statement.importClause.name.text);
          }
          if (statement.importClause.namedBindings) {
            if (ts.isNamespaceImport(statement.importClause.namedBindings)) {
              specifiers.push(statement.importClause.namedBindings.name.text);
            } else if (ts.isNamedImports(statement.importClause.namedBindings)) {
              for (const el of statement.importClause.namedBindings.elements) {
                specifiers.push(el.name.text);
              }
            }
          }
        }
        addImport(rawSource, specifiers, isTypeOnly);
      }
      // 2. FunctionDeclaration
      else if (ts.isFunctionDeclaration(statement) && statement.name) {
        const name = statement.name.text;
        const params = statement.parameters.map((p: any) => p.getText(sourceFile)).join(', ');
        const sig = `(${params})`;
        symbols.push({ name, kind: 'function', line: lineNum, exported: isExported, meta: { signature: sig } });
        if (isExported) exports.push({ name, kind: 'function', isTypeOnly: false });
      }
      // 3. ClassDeclaration
      else if (ts.isClassDeclaration(statement) && statement.name) {
        const name = statement.name.text;
        symbols.push({ name, kind: 'class', line: lineNum, exported: isExported });
        if (isExported) exports.push({ name, kind: 'class', isTypeOnly: false });

        for (const member of statement.members) {
          if (ts.isMethodDeclaration(member) && member.name) {
            const mName = member.name.getText(sourceFile);
            const mLine = getLine(member.getStart(sourceFile));
            const mParams = member.parameters.map((p: any) => p.getText(sourceFile)).join(', ');
            symbols.push({
              name: mName,
              kind: 'method',
              line: mLine,
              exported: false,
              meta: { signature: `(${mParams})`, parent: name },
            });
          }
        }
      }
      // 4. InterfaceDeclaration (supports extends / inheritance)
      else if (ts.isInterfaceDeclaration(statement)) {
        const name = statement.name.text;
        const meta: Record<string, string> = {};
        if (statement.heritageClauses) {
          const extendsList: string[] = [];
          for (const clause of statement.heritageClauses) {
            for (const type of clause.types) {
              extendsList.push(type.expression.getText(sourceFile));
            }
          }
          if (extendsList.length > 0) meta.extends = extendsList.join(', ');
        }
        symbols.push({
          name,
          kind: 'interface',
          line: lineNum,
          exported: isExported,
          isTypeOnly: true,
          meta: Object.keys(meta).length > 0 ? meta : undefined,
        });
        if (isExported) exports.push({ name, kind: 'interface', isTypeOnly: true });
      }
      // 5. TypeAliasDeclaration
      else if (ts.isTypeAliasDeclaration(statement)) {
        const name = statement.name.text;
        symbols.push({ name, kind: 'type', line: lineNum, exported: isExported, isTypeOnly: true });
        if (isExported) exports.push({ name, kind: 'type', isTypeOnly: true });
      }
      // 6. EnumDeclaration
      else if (ts.isEnumDeclaration(statement)) {
        const name = statement.name.text;
        symbols.push({ name, kind: 'enum', line: lineNum, exported: isExported });
        if (isExported) exports.push({ name, kind: 'enum', isTypeOnly: false });
      }
      // 7. VariableStatement (const, let, var, arrow functions, CommonJS require)
      else if (ts.isVariableStatement(statement)) {
        for (const decl of statement.declarationList.declarations) {
          // Check CommonJS require: const ... = require('...')
          if (
            decl.initializer &&
            ts.isCallExpression(decl.initializer) &&
            decl.initializer.expression.getText(sourceFile) === 'require' &&
            decl.initializer.arguments.length > 0
          ) {
            const rawSource = (decl.initializer.arguments[0] as any).text || '';
            const reqSpecs: string[] = [];
            if (ts.isIdentifier(decl.name)) {
              reqSpecs.push(decl.name.text);
            } else if (ts.isObjectBindingPattern(decl.name)) {
              for (const elem of decl.name.elements) {
                reqSpecs.push(elem.name.getText(sourceFile));
              }
            }
            addImport(rawSource, reqSpecs, false);
          }

          if (ts.isIdentifier(decl.name)) {
            const name = decl.name.text;
            let kind: SymbolKind = 'const';
            let sig: string | undefined;
            if (
              decl.initializer &&
              (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))
            ) {
              kind = 'function';
              const pNames = decl.initializer.parameters.map((p: any) => p.getText(sourceFile)).join(', ');
              sig = `(${pNames})`;
            }
            symbols.push({
              name,
              kind,
              line: lineNum,
              exported: isExported,
              meta: sig ? { signature: sig } : undefined,
            });
            if (isExported) exports.push({ name, kind, isTypeOnly: false });
          }
        }
      }
      // 8. ExportDeclaration: export { ... } from '...' / export * from '...'
      else if (ts.isExportDeclaration(statement)) {
        const rawSource = statement.moduleSpecifier ? (statement.moduleSpecifier as any).text : undefined;
        if (rawSource) {
          addImport(rawSource, [], !!statement.isTypeOnly);
        }
        if (statement.exportClause) {
          if (ts.isNamedExports(statement.exportClause)) {
            for (const el of statement.exportClause.elements) {
              exports.push({
                name: el.name.text,
                kind: 'variable',
                isTypeOnly: !!statement.isTypeOnly || !!(el as any).isTypeOnly,
              });
            }
          } else if (ts.isNamespaceExport(statement.exportClause)) {
            exports.push({
              name: statement.exportClause.name.text,
              kind: 'variable',
              isTypeOnly: false,
            });
          }
        }
      }
      // 9. ExportAssignment: export default ...
      else if (ts.isExportAssignment(statement)) {
        exports.push({ name: 'default', kind: 'default', isTypeOnly: false });
      }
      // 10. ExpressionStatement: module.exports.foo = ... / exports.foo = ...
      else if (ts.isExpressionStatement(statement) && ts.isBinaryExpression(statement.expression)) {
        const leftText = statement.expression.left.getText(sourceFile);
        if (leftText.startsWith('module.exports.') || leftText.startsWith('exports.')) {
          const expName = leftText.split('.')[leftText.startsWith('module.') ? 2 : 1];
          if (expName) {
            exports.push({ name: expName, kind: 'variable', isTypeOnly: false });
          }
        }
      }
    }

    // Extract HTTP Routes
    const routeRegex = /(?:app|router|server|api)\.(get|post|put|delete|patch|use|all)\(\s*['"]([^'"]+)['"]/gi;
    let rMatch: RegExpExecArray | null;
    while ((rMatch = routeRegex.exec(content)) !== null) {
      if (rMatch[2].startsWith('/')) {
        const lineNum = content.slice(0, rMatch.index).split('\n').length;
        routes.push({
          method: rMatch[1].toUpperCase() as any,
          path: rMatch[2],
          line: lineNum,
        });
      }
    }

    return {
      filePath,
      imports,
      exports,
      symbols,
      routes,
      externalDeps: Array.from(externalDepsSet),
      localDeps: Array.from(localDepsSet),
      linesCount: content.split('\n').length,
      language: 'typescript',
    };
  } catch {
    return null;
  }
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unnecessary-type-assertion */

/**
 * Analyzes a source file across any supported ecosystem (TS/JS, Python, Go, Rust, C#, Java, PHP, Ruby, C/C++, Flutter, SQL, CSS, Docker, Shell).
 */
function analyzeSourceFile(filePath: string, sourceText?: string): FileAnalysisResult {
  const content = sourceText ?? platformReadSync(filePath) ?? '';
  const ext = path.extname(filePath).toLowerCase();
  const baseName = path.basename(filePath).toLowerCase();

  if (!content.trim()) {
    return {
      filePath,
      imports: [],
      exports: [],
      symbols: [],
      routes: [],
      externalDeps: [],
      localDeps: [],
      linesCount: content.split('\n').length,
    };
  }

  // 1. Python
  if (ext === '.py') return analyzePythonFile(filePath, sanitizeCodePreservingLines(content, 'python'));

  // 2. Go
  if (ext === '.go') return analyzeGoFile(filePath, sanitizeCodePreservingLines(content, 'go'));

  // 3. Rust
  if (ext === '.rs') return analyzeRustFile(filePath, sanitizeCodePreservingLines(content, 'rust'));

  // 4. Flutter / Dart
  if (ext === '.dart') return analyzeDartFile(filePath, sanitizeCodePreservingLines(content, 'dart'));

  // 4b. Swift / iOS
  if (ext === '.swift' || ext === '.m' || ext === '.mm') return analyzeSwiftFile(filePath, sanitizeCodePreservingLines(content, 'swift'));

  // 5. C# / .NET
  if (ext === '.cs') return analyzeCSharpFile(filePath, sanitizeCodePreservingLines(content, 'csharp'));

  // 6. Java & Kotlin
  if (ext === '.java' || ext === '.kt') return analyzeJvmFile(filePath, sanitizeCodePreservingLines(content, 'java'));

  // 7. PHP
  if (ext === '.php') return analyzePhpFile(filePath, sanitizeCodePreservingLines(content, 'php'));

  // 8. Ruby
  if (ext === '.rb') return analyzeRubyFile(filePath, sanitizeCodePreservingLines(content, 'ruby'));

  // 9. C / C++
  if (['.c', '.cpp', '.h', '.hpp', '.cc', '.cxx'].includes(ext)) return analyzeCppFile(filePath, sanitizeCodePreservingLines(content, 'cpp'));

  // 10. SQL DDL
  if (ext === '.sql') return analyzeSqlFile(filePath, content);

  // 11. Prisma & GraphQL
  if (ext === '.prisma' || ext === '.graphql' || ext === '.gql') return analyzeSchemaFile(filePath, content);

  // 12. CSS & Design Tokens
  if (['.css', '.scss', '.sass', '.less'].includes(ext)) return analyzeStyleFile(filePath, content);

  // 13. HTML & SFCs
  if (['.html', '.htm', '.vue', '.svelte'].includes(ext)) return analyzeHtmlAndSfcFile(filePath, content);

  // 14. DevOps & Shell
  if (
    ext === '.sh' ||
    ext === '.bash' ||
    ext === '.zsh' ||
    SPECIAL_FILENAMES.has(baseName) ||
    baseName.includes('dockerfile') ||
    baseName.includes('compose')
  ) {
    return analyzeDevOpsAndShellFile(filePath, content);
  }

  // 15. TypeScript / JavaScript — Tiered AST Engine
  const rootDir = process.cwd();
  const tsConfigAliases = loadTsConfigAliases(rootDir);

  // Camada 1: Compilador TypeScript Oficial
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const tsModule = getTsModule();
  if (tsModule) {
    const compiled = analyzeWithTypeScriptCompiler(filePath, content, tsModule, tsConfigAliases);
    if (compiled) return compiled;
  }

  // Camada 2: State-Machine Lexer Universal (Fallback)
  const lines = content.split('\n');
  const imports: ExtractedImport[] = [];
  const exports: ExtractedExport[] = [];
  const symbols: ExtractedSymbol[] = [];
  const routes: ExtractedRoute[] = [];
  const externalDepsSet = new Set<string>();
  const localDepsSet = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;

    // 1. ES Imports (including combined: import Default, { Named } from '...' / import Default, * as Ns from '...')
    const importMatch = trimmed.match(/^import\s+(?:type\s+)?(?:([a-zA-Z0-9_$]+)\s*,\s*)?(?:\{([^}]+)\}|\*\s+as\s+([a-zA-Z0-9_$]+)|([a-zA-Z0-9_$]+))?\s+from\s+['"]([^'"]+)['"]/);
    if (importMatch) {
      const defaultPrefix = importMatch[1];
      const namedSpecs = importMatch[2];
      const nsSpec = importMatch[3];
      const standaloneDefault = importMatch[4];
      const rawSource = importMatch[5];
      const resolvedAlias = resolvePathAlias(rawSource, rootDir, tsConfigAliases);
      const source = resolvedAlias || rawSource;
      const isRelative = source.startsWith('.') || source.startsWith('/');
      const isTypeOnly = trimmed.startsWith('import type');
      const specifiers: string[] = [];

      if (defaultPrefix) specifiers.push(defaultPrefix.trim());
      if (standaloneDefault) specifiers.push(standaloneDefault.trim());
      if (nsSpec) specifiers.push(nsSpec.trim());
      if (namedSpecs) {
        for (const part of namedSpecs.split(',')) {
          const spec = part.trim().split(/\s+as\s+/)[0].trim();
          if (spec) specifiers.push(spec);
        }
      }

      imports.push({ source, specifiers, isTypeOnly, isRelative });
      if (isRelative) localDepsSet.add(source);
      else {
        const pkgName = source.startsWith('@') ? source.split('/').slice(0, 2).join('/') : source.split('/')[0];
        if (!pkgName.startsWith('node:')) externalDepsSet.add(pkgName);
      }
    }

    // 2. CommonJS require: const ... = require('...')
    const requireMatch = trimmed.match(/(?:const|let|var)\s+(?:\{([^}]+)\}|([a-zA-Z0-9_$]+))\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/);
    if (requireMatch) {
      const namedSpecs = requireMatch[1];
      const defaultSpec = requireMatch[2];
      const rawSource = requireMatch[3];
      const resolvedAlias = resolvePathAlias(rawSource, rootDir, tsConfigAliases);
      const source = resolvedAlias || rawSource;
      const isRelative = source.startsWith('.') || source.startsWith('/');
      const specifiers: string[] = [];

      if (defaultSpec) specifiers.push(defaultSpec.trim());
      if (namedSpecs) {
        for (const part of namedSpecs.split(',')) {
          const spec = part.trim().split(/\s*:\s*/)[0].trim();
          if (spec) specifiers.push(spec);
        }
      }

      imports.push({ source, specifiers, isTypeOnly: false, isRelative });
      if (isRelative) localDepsSet.add(source);
      else {
        const pkgName = source.startsWith('@') ? source.split('/').slice(0, 2).join('/') : source.split('/')[0];
        if (!pkgName.startsWith('node:')) externalDepsSet.add(pkgName);
      }
    }

    // 3. Functions
    const funcMatch = trimmed.match(/^(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*(\([^)]*\))?/);
    if (funcMatch) {
      const name = funcMatch[1];
      const sig = funcMatch[2] ? funcMatch[2].trim() : undefined;
      const isExported = trimmed.startsWith('export');
      symbols.push({ name, kind: 'function', line: lineNum, exported: isExported, meta: sig ? { signature: sig } : undefined });
      if (isExported) exports.push({ name, kind: 'function', isTypeOnly: false });
    }

    // 4. Classes
    const classMatch = trimmed.match(/^(?:export\s+)?(?:abstract\s+)?class\s+([a-zA-Z0-9_$]+)/);
    if (classMatch) {
      const name = classMatch[1];
      const isExported = trimmed.startsWith('export');
      symbols.push({ name, kind: 'class', line: lineNum, exported: isExported });
      if (isExported) exports.push({ name, kind: 'class', isTypeOnly: false });
    }

    // 5. Interfaces
    const ifaceMatch = trimmed.match(/^(?:export\s+)?interface\s+([a-zA-Z0-9_$]+)/);
    if (ifaceMatch) {
      const name = ifaceMatch[1];
      const isExported = trimmed.startsWith('export');
      symbols.push({ name, kind: 'interface', line: lineNum, exported: isExported, isTypeOnly: true });
      if (isExported) exports.push({ name, kind: 'interface', isTypeOnly: true });
    }

    // 6. Types
    const typeMatch = trimmed.match(/^(?:export\s+)?type\s+([a-zA-Z0-9_$]+)\s*=/);
    if (typeMatch) {
      const name = typeMatch[1];
      const isExported = trimmed.startsWith('export');
      symbols.push({ name, kind: 'type', line: lineNum, exported: isExported, isTypeOnly: true });
      if (isExported) exports.push({ name, kind: 'type', isTypeOnly: true });
    }

    // 7. Enums
    const enumMatch = trimmed.match(/^(?:export\s+)?(?:const\s+)?enum\s+([a-zA-Z0-9_$]+)/);
    if (enumMatch) {
      const name = enumMatch[1];
      const isExported = trimmed.startsWith('export');
      symbols.push({ name, kind: 'enum', line: lineNum, exported: isExported });
      if (isExported) exports.push({ name, kind: 'enum', isTypeOnly: false });
    }

    // 8. Variables / Consts
    const varMatch = trimmed.match(/^(?:export\s+)?(const|let|var)\s+([a-zA-Z0-9_$]+)/);
    if (varMatch && !trimmed.startsWith('const enum')) {
      const kind = varMatch[1] === 'const' ? 'const' : 'variable';
      const name = varMatch[2];
      const isExported = trimmed.startsWith('export');
      symbols.push({ name, kind, line: lineNum, exported: isExported });
      if (isExported) exports.push({ name, kind, isTypeOnly: false });
    }

    // 9. Re-exports: export * from '...' / export * as ns from '...' / export { ... } from '...'
    const starExportMatch = trimmed.match(/^export\s+(?:\*\s+as\s+([a-zA-Z0-9_$]+)|\*)\s+from\s+['"]([^'"]+)['"]/);
    if (starExportMatch) {
      const nsName = starExportMatch[1];
      const rawSource = starExportMatch[2];
      const resolvedAlias = resolvePathAlias(rawSource, rootDir, tsConfigAliases);
      const source = resolvedAlias || rawSource;
      const isRelative = source.startsWith('.') || source.startsWith('/');
      if (nsName) {
        exports.push({ name: nsName, kind: 'variable', isTypeOnly: false });
      }
      if (isRelative) localDepsSet.add(source);
      else {
        const pkgName = source.startsWith('@') ? source.split('/').slice(0, 2).join('/') : source.split('/')[0];
        if (!pkgName.startsWith('node:')) externalDepsSet.add(pkgName);
      }
    }

    const namedExportMatch = trimmed.match(/^export\s+(?:type\s+)?\{([^}]+)\}(?:\s+from\s+['"]([^'"]+)['"])?/);
    if (namedExportMatch) {
      const isTypeOnly = trimmed.startsWith('export type');
      const rawSource = namedExportMatch[2];
      for (const part of namedExportMatch[1].split(',')) {
        const spec = part.trim().split(/\s+as\s+/)[0].trim();
        if (spec) exports.push({ name: spec, kind: 'variable', isTypeOnly });
      }
      if (rawSource) {
        const resolvedAlias = resolvePathAlias(rawSource, rootDir, tsConfigAliases);
        const source = resolvedAlias || rawSource;
        const isRelative = source.startsWith('.') || source.startsWith('/');
        if (isRelative) localDepsSet.add(source);
        else {
          const pkgName = source.startsWith('@') ? source.split('/').slice(0, 2).join('/') : source.split('/')[0];
          if (!pkgName.startsWith('node:')) externalDepsSet.add(pkgName);
        }
      }
    }

    // 10. Default export: export default ...
    if (trimmed.startsWith('export default')) {
      exports.push({ name: 'default', kind: 'default', isTypeOnly: false });
    }

    // 11. module.exports = { ... } / exports.foo = ...
    const cjsExportMatch = trimmed.match(/^(?:module\.)?exports\.([a-zA-Z0-9_$]+)\s*=/);
    if (cjsExportMatch) {
      exports.push({ name: cjsExportMatch[1], kind: 'variable', isTypeOnly: false });
    }

    // 12. HTTP Routes: app.get('/...'), router.post('/...'), server.put('/...')
    const routeMatch = trimmed.match(/(?:app|router|server|api)\.(get|post|put|delete|patch|use|all)\(\s*['"]([^'"]+)['"]/i);
    if (routeMatch && routeMatch[2].startsWith('/')) {
      const method = routeMatch[1].toUpperCase() as ExtractedRoute['method'];
      routes.push({ method, path: routeMatch[2], line: lineNum });
    }
  }

  return {
    filePath,
    imports,
    exports,
    symbols,
    routes,
    externalDeps: Array.from(externalDepsSet),
    localDeps: Array.from(localDepsSet),
    linesCount: lines.length,
    language: 'typescript'
  };
}

// ─── Graph Construction & Traversal ──────────────────────────────────────────

/**
 * Scans the workspace and builds a comprehensive Codebase Graph across all supported technologies.
 */
function buildCodebaseGraph(rootDir: string, options: BuildGraphOptions = {}): CodebaseGraph {
  const startTime = Date.now();
  const maxFiles = options.maxFiles ?? 2000;
  const allowedExtensions = options.includeExtensions ? new Set(options.includeExtensions) : DEFAULT_EXTENSIONS;
  const excludePatterns = options.excludePatterns ?? DEFAULT_EXCLUDES;

  const filesMap: Record<string, FileAnalysisResult> = Object.create(null) as Record<string, FileAnalysisResult>;
  const symbolIndex: Record<string, string[]> = Object.create(null) as Record<string, string[]>;
  const reverseDependencies: Record<string, string[]> = Object.create(null) as Record<string, string[]>;
  const filesByLanguage: Record<string, number> = Object.create(null) as Record<string, number>;
  const allRoutes: ExtractedRoute[] = [];

  let scannedCount = 0;
  const visitedDirs = new Set<string>();

  function shouldExclude(relPath: string): boolean {
    const normalized = toPosixPath(relPath);
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
      // Fallback
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
        const baseName = entry.name.toLowerCase();

        if (allowedExtensions.has(ext) || SPECIAL_FILENAMES.has(baseName) || baseName.includes('dockerfile')) {
          scannedCount++;
          const relKey = toPosixPath(relPath);

          let mtime = 0;
          let size = 0;
          try {
            const stat = fs.statSync(fullPath);
            mtime = Math.floor(stat.mtimeMs);
            size = stat.size;
          } catch {
            // Non-blocking
          }

          let result: FileAnalysisResult;
          const prevFile = options.previousGraph?.files?.[relKey];
          if (prevFile && prevFile.mtime && prevFile.mtime === mtime && prevFile.size === size) {
            // Incremental AST cache hit via mtime + size
            result = prevFile;
          } else {
            result = analyzeSourceFile(fullPath);
            result.filePath = relKey;
            result.mtime = mtime;
            result.size = size;
          }

          const lang = result.language || 'unknown';
          filesByLanguage[lang] = (filesByLanguage[lang] || 0) + 1;

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
      const resolved = toPosixPath(path.normalize(path.join(fileDir, localDep)));
      let candidates: string[];
      if (resolved.endsWith('.js')) {
        const withoutExt = resolved.slice(0, -3);
        candidates = [
          withoutExt + '.ts',
          withoutExt + '.tsx',
          withoutExt + '.cts',
          withoutExt + '.mts',
          resolved,
        ];
      } else {
        candidates = [
          resolved,
          resolved + '.ts',
          resolved + '.tsx',
          resolved + '.cts',
          resolved + '.mts',
          resolved + '.js',
          resolved + '.cjs',
          resolved + '.py',
          resolved + '.go',
          resolved + '.rs',
          resolved + '.dart',
          resolved + '.css',
          resolved + '/index.ts',
          resolved + '/index.js',
        ];
      }

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

  // Compute PageRank scores
  const pageRankScores: Record<string, number> = Object.create(null) as Record<string, number>;
  const fileKeys = Object.keys(filesMap);
  const N = fileKeys.length;
  if (N > 0) {
    const initialScore = 1 / N;
    if (options.liteMode || N < 50) {
      // Lite mode: Degree-based fast scoring without multi-iteration power method
      for (const k of fileKeys) {
        const inDegree = (reverseDependencies[k] || []).length;
        const outDegree = (filesMap[k]?.localDeps || []).length;
        pageRankScores[k] = Number(((inDegree * 2 + outDegree + 1) / (N * 3)).toFixed(6));
      }
    } else {
      for (const k of fileKeys) {
        pageRankScores[k] = initialScore;
      }

      const d = 0.85;
      const iterations = 20;

      for (let it = 0; it < iterations; it++) {
        const nextScores: Record<string, number> = Object.create(null) as Record<string, number>;
        for (const k of fileKeys) {
          let rankSum = 0;
          const callers = reverseDependencies[k] || [];
          for (const caller of callers) {
            const callerData = filesMap[caller];
            const outDegree = callerData ? callerData.localDeps.length : 0;
            if (outDegree > 0) {
              rankSum += (pageRankScores[caller] || initialScore) / outDegree;
            }
          }
          nextScores[k] = (1 - d) / N + d * rankSum;
        }

        for (const k of fileKeys) {
          pageRankScores[k] = Number((nextScores[k] || 0).toFixed(6));
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
    version: '2.2.0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    root: rootDir,
    stats: {
      totalFiles: Object.keys(filesMap).length,
      totalSymbols,
      totalExports,
      totalRoutes: allRoutes.length,
      scanDurationMs: duration,
      filesByLanguage,
    },
    files: filesMap,
    symbolIndex,
    reverseDependencies,
    pageRankScores,
    routes: allRoutes,
  };
}

// ─── Queries & Persistence ───────────────────────────────────────────────────

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

function queryFileDependencies(
  graph: CodebaseGraph,
  targetFile: string
): { imports: string[]; importedBy: string[]; external: string[] } {
  const normalized = toPosixPath(targetFile);
  const fileData = graph.files[normalized];

  return {
    imports: fileData ? fileData.localDeps : [],
    importedBy: graph.reverseDependencies[normalized] || [],
    external: fileData ? fileData.externalDeps : [],
  };
}

function saveCodebaseGraph(planningDir: string, graph: CodebaseGraph): string {
  const intelDir = path.join(planningDir, 'intel');
  platformEnsureDir(intelDir);
  const outPath = path.join(intelDir, 'codebase-graph.json');
  platformWriteSync(outPath, JSON.stringify(graph, null, 2));
  return outPath;
}

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

function queryTopCentralFiles(
  graph: CodebaseGraph,
  limit: number = 10
): Array<{ file: string; score: number }> {
  const scores = graph.pageRankScores || {};
  return Object.entries(scores)
    .map(([file, score]) => ({ file, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export = {
  toPosixPath,
  analyzeSourceFile,
  buildCodebaseGraph,
  querySymbolLocations,
  queryFileDependencies,
  queryTopCentralFiles,
  saveCodebaseGraph,
  loadCodebaseGraph,
};
