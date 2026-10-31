import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import { createResolver } from '../migration/lib/analysis.mjs';

/**
 * Unused-export audit.
 *
 * A local variable is dead when the compiler says so. An export is different: it may
 * be part of a package's published surface, or reached through a barrel. This script
 * therefore only reports exports that no other file imports or re-exports, and then
 * separates "remove the export keyword, keep the declaration" (used inside its own
 * file) from "delete the declaration".
 *
 * Public package entry points (package.json `exports`, including wildcards) are kept:
 * an external consumer is a contract this repository cannot see. Database/HTTP surfaces
 * are unaffected because this only reads TypeScript modules.
 *
 * Usage:
 *   node scripts/quality/unused-exports.mjs
 *   node scripts/quality/unused-exports.mjs --json
 *   node scripts/quality/unused-exports.mjs --check
 */

const ROOT = process.cwd();
const json = process.argv.includes('--json');
const check = process.argv.includes('--check');
const resolve = createResolver(ROOT);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.tmp') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

const sourceFiles = [
  ...walk(path.join(ROOT, 'src')),
  ...walk(path.join(ROOT, 'api')),
  ...walk(path.join(ROOT, 'packages')),
  ...walk(path.join(ROOT, 'plugins')),
];
const consumerFiles = [
  ...sourceFiles,
  ...walk(path.join(ROOT, 'tests')),
  ...walk(path.join(ROOT, 'scripts')),
];
const isTest = (file) => /\.(test|spec)\.(ts|tsx)$/.test(file) || /[\\/]tests[\\/]/.test(file);

const publicFiles = new Set();
for (const dir of ['packages']) {
  const root = path.join(ROOT, dir);
  if (!fs.existsSync(root)) continue;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(root, entry.name, 'package.json');
    if (!fs.existsSync(manifestPath)) continue;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const targets = [];
    const exported = manifest.exports;
    if (typeof exported === 'string') targets.push(exported);
    else if (exported && typeof exported === 'object') {
      for (const value of Object.values(exported)) {
        if (typeof value === 'string') targets.push(value);
        else if (value && typeof value === 'object') {
          for (const nested of Object.values(value)) if (typeof nested === 'string') targets.push(nested);
        }
      }
    }
    for (const target of targets) {
      const rel = target.replace(/^\.\//, '');
      if (rel.includes('*')) {
        const [prefix, suffix] = rel.split('*');
        const scanRoot = path.join(root, entry.name, prefix);
        for (const file of walk(scanRoot)) {
          if (file.replace(/\\/g, '/').endsWith(suffix)) publicFiles.add(file);
        }
      } else {
        publicFiles.add(path.join(root, entry.name, rel));
      }
    }
  }
}

const sources = new Map();
for (const file of sourceFiles) {
  const text = fs.readFileSync(file, 'utf8');
  sources.set(file, { text, sf: ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true) });
}
const consumers = [...new Set(consumerFiles)].map((file) => {
  const text = fs.readFileSync(file, 'utf8');
  return { file, sf: ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true) };
});

// Every name imported from a target file, plus "all names" sentinel for namespace/dynamic imports.
const used = new Map();
const mark = (file, name) => {
  if (!file) return;
  const key = path.resolve(file);
  if (!used.has(key)) used.set(key, new Set());
  used.get(key).add(name);
};
const markAll = (file) => {
  if (!file) return;
  const key = path.resolve(file);
  if (!used.has(key)) used.set(key, new Set());
  used.get(key).add('*');
};

for (const { file, sf } of consumers) {
  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt)) {
      const target = resolve(file, stmt.moduleSpecifier.text);
      if (!target) continue;
      const clause = stmt.importClause;
      if (!clause) {
        markAll(target);
        continue;
      }
      if (clause.name) mark(target, 'default');
      const bindings = clause.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) mark(target, (element.propertyName ?? element.name).text);
      } else if (bindings && ts.isNamespaceImport(bindings)) {
        markAll(target);
      }
    } else if (ts.isExportDeclaration(stmt) && stmt.moduleSpecifier) {
      const target = resolve(file, stmt.moduleSpecifier.text);
      if (!target) continue;
      if (!stmt.exportClause) markAll(target);
      else if (ts.isNamedExports(stmt.exportClause)) {
        for (const element of stmt.exportClause.elements) mark(target, (element.propertyName ?? element.name).text);
      }
    } else if (ts.isCallExpression(stmt) && stmt.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = stmt.arguments[0];
      if (arg && ts.isStringLiteral(arg)) markAll(resolve(file, arg.text));
    }
  }
}

// Dynamic imports can sit inside a function (the e2e harness imports `api/app.js` in
// teardown). The top-level scan above only sees module statements, so walk the whole tree
// for `import()` call expressions as well.
for (const { file, sf } of consumers) {
  const walk = (node) => {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteral(arg)) markAll(resolve(file, arg.text));
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
}

const findings = [];
for (const [file, { sf }] of sources) {
  if (isTest(file) || publicFiles.has(file)) continue;
  const usedNames = used.get(file) ?? new Set();
  const lineText = sf.getFullText();
  for (const stmt of sf.statements) {
    const modifiers = ts.canHaveModifiers(stmt) ? ts.getModifiers(stmt) : undefined;
    const exported = modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) continue;
    if (modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) continue;
    if (ts.isExportDeclaration(stmt)) continue;

    let name;
    if (ts.isVariableStatement(stmt)) {
      const declaration = stmt.declarationList.declarations[0];
      if (declaration && ts.isIdentifier(declaration.name)) name = declaration.name.text;
    } else if (
      ts.isFunctionDeclaration(stmt) ||
      ts.isClassDeclaration(stmt) ||
      ts.isInterfaceDeclaration(stmt) ||
      ts.isTypeAliasDeclaration(stmt) ||
      ts.isEnumDeclaration(stmt)
    ) {
      name = stmt.name?.text;
    }
    if (!name || name === 'default') continue;
    if (/^__.*ForTest(s)?$/.test(name)) continue;
    if (usedNames.has('*') || usedNames.has(name)) continue;

    const occurrences = [...lineText.matchAll(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'))].length;
    findings.push({
      file: path.relative(ROOT, file).replace(/\\/g, '/'),
      line: sf.getLineAndCharacterOfPosition(stmt.getStart()).line + 1,
      name,
      action: occurrences > 1 ? 'remove export keyword' : 'delete declaration',
    });
  }
}

findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
if (json) {
  process.stdout.write(`${JSON.stringify({ count: findings.length, findings }, null, 2)}\n`);
} else {
  process.stdout.write(`unused exports: ${findings.length}\n`);
  for (const item of findings) {
    process.stdout.write(`  ${item.file}:${item.line} ${item.name} (${item.action})\n`);
  }
}
if (check && findings.length > 0) {
  process.stderr.write('\nunused-export audit failed; no export may stay without a consumer\n');
  process.exitCode = 1;
}
