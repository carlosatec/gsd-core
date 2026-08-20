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
  '.dart', '.html', '.htm', '.vue', '.svelte',
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
  '.env.example'
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
  'venv'
];

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
      const specifiers = fromImportMatch[2].split(',').map(s => s.trim().split(' ')[0]);
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

    // Classes / Interfaces / Records: public class Foo, public interface IBar, public record Baz
    const typeMatch = trimmed.match(/^(public|internal)?\s*(class|interface|record|enum|struct)\s+([A-Za-z0-9_]+)/);
    if (typeMatch) {
      const isPublic = typeMatch[1] === 'public';
      const kindRaw = typeMatch[2];
      const name = typeMatch[3];
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

    if (!trimmed || trimmed.startsWith('//')) continue;

    // Imports: import org.springframework.web.bind.annotation.GetMapping;
    const importMatch = trimmed.match(/^import\s+([A-Za-z0-9_.]+);/);
    if (importMatch) {
      const source = importMatch[1];
      externalDepsSet.add(source.split('.')[0]);
      imports.push({ source, specifiers: [], isTypeOnly: false, isRelative: false });
    }

    // Classes / Interfaces / Data Classes: public class Foo, data class Bar, interface IBaz
    const classMatch = trimmed.match(/^(?:public\s+|data\s+|abstract\s+)?(class|interface|enum)\s+([A-Za-z0-9_]+)/);
    if (classMatch) {
      const kindRaw = classMatch[1];
      const name = classMatch[2];
      const kind: SymbolKind = kindRaw === 'interface' ? 'interface' : kindRaw === 'enum' ? 'enum' : 'class';
      symbols.push({ name, kind, line: lineNum, exported: true });
      exports.push({ name, kind, isTypeOnly: kind === 'interface' });
    }

    // Spring Boot Routes: @GetMapping("/path"), @PostMapping("/path")
    const routeMatch = trimmed.match(/@(Get|Post|Put|Delete|Patch)Mapping\(\s*["']([^"']+)["']/i);
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
    language: filePath.endsWith('.kt') ? 'kotlin' : 'java'
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
    externalDeps: [],
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
  if (ext === '.py') return analyzePythonFile(filePath, content);

  // 2. Go
  if (ext === '.go') return analyzeGoFile(filePath, content);

  // 3. Rust
  if (ext === '.rs') return analyzeRustFile(filePath, content);

  // 4. Flutter / Dart
  if (ext === '.dart') return analyzeDartFile(filePath, content);

  // 5. C# / .NET
  if (ext === '.cs') return analyzeCSharpFile(filePath, content);

  // 6. Java & Kotlin
  if (ext === '.java' || ext === '.kt') return analyzeJvmFile(filePath, content);

  // 7. PHP
  if (ext === '.php') return analyzePhpFile(filePath, content);

  // 8. Ruby
  if (ext === '.rb') return analyzeRubyFile(filePath, content);

  // 9. C / C++
  if (['.c', '.cpp', '.h', '.hpp', '.cc', '.cxx'].includes(ext)) return analyzeCppFile(filePath, content);

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

  // 15. TypeScript / JavaScript AST Compiler
  const lines = content.split('\n');
  const imports: ExtractedImport[] = [];
  const exports: ExtractedExport[] = [];
  const symbols: ExtractedSymbol[] = [];
  const routes: ExtractedRoute[] = [];
  const externalDepsSet = new Set<string>();
  const localDepsSet = new Set<string>();

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

        imports.push({ source, specifiers, isTypeOnly, isRelative });
        if (isRelative) localDepsSet.add(source);
        else {
          const pkgName = source.startsWith('@') ? source.split('/').slice(0, 2).join('/') : source.split('/')[0];
          if (!pkgName.startsWith('node:')) externalDepsSet.add(pkgName);
        }
      }
    }

    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression) && node.expression.text === 'require' && node.arguments.length > 0) {
        const firstArg = node.arguments[0];
        if (ts.isStringLiteral(firstArg)) {
          const source = firstArg.text;
          const isRelative = source.startsWith('.') || source.startsWith('/');
          imports.push({ source, specifiers: [], isTypeOnly: false, isRelative });
          if (isRelative) localDepsSet.add(source);
          else {
            const pkgName = source.startsWith('@') ? source.split('/').slice(0, 2).join('/') : source.split('/')[0];
            if (!pkgName.startsWith('node:')) externalDepsSet.add(pkgName);
          }
        }
      }

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

    if (ts.isFunctionDeclaration(node) && node.name) {
      const isExported = isExportedNode(node);
      const name = node.name.text;
      const line = getLineNumber(node.getStart(sourceFile));
      symbols.push({ name, kind: 'function', line, exported: isExported });
      if (isExported) exports.push({ name, kind: 'function', isTypeOnly: false });
    }

    if (ts.isClassDeclaration(node) && node.name) {
      const isExported = isExportedNode(node);
      const name = node.name.text;
      const line = getLineNumber(node.getStart(sourceFile));
      symbols.push({ name, kind: 'class', line, exported: isExported });
      if (isExported) exports.push({ name, kind: 'class', isTypeOnly: false });
    }

    if (ts.isInterfaceDeclaration(node)) {
      const isExported = isExportedNode(node);
      const name = node.name.text;
      const line = getLineNumber(node.getStart(sourceFile));
      symbols.push({ name, kind: 'interface', line, exported: isExported, isTypeOnly: true });
      if (isExported) exports.push({ name, kind: 'interface', isTypeOnly: true });
    }

    if (ts.isTypeAliasDeclaration(node)) {
      const isExported = isExportedNode(node);
      const name = node.name.text;
      const line = getLineNumber(node.getStart(sourceFile));
      symbols.push({ name, kind: 'type', line, exported: isExported, isTypeOnly: true });
      if (isExported) exports.push({ name, kind: 'type', isTypeOnly: true });
    }

    if (ts.isEnumDeclaration(node)) {
      const isExported = isExportedNode(node);
      const name = node.name.text;
      const line = getLineNumber(node.getStart(sourceFile));
      symbols.push({ name, kind: 'enum', line, exported: isExported });
      if (isExported) exports.push({ name, kind: 'enum', isTypeOnly: false });
    }

    if (ts.isVariableStatement(node)) {
      const isExported = isExportedNode(node);
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          const name = declaration.name.text;
          const line = getLineNumber(declaration.getStart(sourceFile));
          const kind: SymbolKind = node.declarationList.flags & ts.NodeFlags.Const ? 'const' : 'variable';
          symbols.push({ name, kind, line, exported: isExported });
          if (isExported) exports.push({ name, kind, isTypeOnly: false });
        }
      }
    }

    if (ts.isExportDeclaration(node)) {
      const isTypeOnly = !!node.isTypeOnly;
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) {
          exports.push({ name: element.name.text, kind: 'variable', isTypeOnly: isTypeOnly || !!element.isTypeOnly });
        }
      }
    }

    if (ts.isExportAssignment(node)) {
      exports.push({ name: 'default', kind: 'default', isTypeOnly: false });
    }

    if (ts.isBinaryExpression(node)) {
      if (
        ts.isPropertyAccessExpression(node.left) &&
        node.left.expression.getText(sourceFile) === 'module' &&
        node.left.name.text === 'exports' &&
        ts.isObjectLiteralExpression(node.right)
      ) {
        for (const prop of node.right.properties) {
          if (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) {
            exports.push({ name: prop.name.getText(sourceFile), kind: 'variable', isTypeOnly: false });
          }
        }
      } else if (
        ts.isPropertyAccessExpression(node.left) &&
        node.left.expression.getText(sourceFile) === 'exports'
      ) {
        exports.push({ name: node.left.name.text, kind: 'variable', isTypeOnly: false });
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
          const relKey = relPath.replace(/\\/g, '/');

          let mtime = 0;
          try {
            const stat = fs.statSync(fullPath);
            mtime = stat.mtimeMs;
          } catch {
            // Non-blocking
          }

          let result: FileAnalysisResult;
          const prevFile = options.previousGraph?.files?.[relKey];
          if (prevFile && prevFile.mtime && prevFile.mtime === mtime) {
            // Incremental AST cache hit via mtime
            result = prevFile;
          } else {
            result = analyzeSourceFile(fullPath);
            result.filePath = relKey;
            result.mtime = mtime;
          }

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
      const resolved = path.normalize(path.join(fileDir, localDep)).replace(/\\/g, '/');
      const candidates = [
        resolved,
        resolved + '.ts',
        resolved + '.tsx',
        resolved + '.cts',
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
  const pageRankScores: Record<string, number> = Object.create(null);
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
        const nextScores: Record<string, number> = Object.create(null);
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
  const normalized = targetFile.replace(/\\/g, '/');
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
  analyzeSourceFile,
  buildCodebaseGraph,
  querySymbolLocations,
  queryFileDependencies,
  queryTopCentralFiles,
  saveCodebaseGraph,
  loadCodebaseGraph,
};
