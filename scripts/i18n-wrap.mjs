/**
 * Codemod: wrap user-visible Nepali text in client JSX/JS with tr() from @shared/i18n.
 * Skips data-bearing strings (attribute values like value/key/to, comparisons, object keys,
 * Devanagari digit codes). Idempotent. Usage: node scripts/i18n-wrap.mjs [--list]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../client/package.json', import.meta.url));
const recast = require('recast');
const babel = require('@babel/parser');
const b = recast.types.builders;

const ROOT = path.resolve(new URL('../client/src', import.meta.url).pathname);
const SKIP_FILES = [/\/test\//, /suggestions\.js$/, /offline\/db\.js$/, /main\.jsx$/];
const DEV = /[ऀ-ॿ]/;
const ONLY_CODES = /^[\s०-९.,()\-–:/]*$/;
const TEXT_ATTRS = new Set(['placeholder', 'title', 'aria-label', 'alt', 'label']);
const keys = new Set();

const parse = (src) => recast.parse(src, { parser: { parse: (s) => babel.parse(s, { sourceType: 'module', plugins: ['jsx'], tokens: true }) } });

function wrapCall(key, args) {
  keys.add(key);
  const params = [b.stringLiteral(key)];
  if (args?.length) params.push(b.arrayExpression(args));
  return b.callExpression(b.identifier('tr'), params);
}

function skipLiteral(p) {
  const parent = p.parent.node;
  if (p.parent.node.type === 'CallExpression' && parent.callee.type === 'Identifier' && parent.callee.name === 'tr') return true;
  if (parent.type === 'ImportDeclaration' || parent.type === 'ExportNamedDeclaration') return true;
  if ((parent.type === 'ObjectProperty' || parent.type === 'Property') && parent.key === p.node && !parent.computed) return true;
  if (parent.type === 'BinaryExpression' && ['===', '!==', '==', '!='].includes(parent.operator)) return true;
  if (parent.type === 'SwitchCase') return true;
  if (parent.type === 'JSXAttribute' && !TEXT_ATTRS.has(parent.name.name)) return true;
  if (parent.type === 'CallExpression' && parent.callee.type === 'MemberExpression' && ['includes', 'startsWith', 'indexOf', 'test', 'endsWith'].includes(parent.callee.property.name)) return true;
  return false;
}

const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(jsx|js)$/.test(f) && !SKIP_FILES.some((r) => r.test(p))) files.push(p); } })(ROOT);

let changedFiles = 0;
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  if (!DEV.test(src)) continue;
  const ast = parse(src);
  let changed = false;
  recast.visit(ast, {
    visitJSXText(p) {
      const raw = p.node.value;
      if (DEV.test(raw) && !ONLY_CODES.test(raw)) {
        const trimmed = raw.trim().replace(/\s+/g, ' ');
        const lead = /^\s/.test(raw) && !/^\s*\n/.test(raw) ? ' ' : '';
        const trail = /\s$/.test(raw) && !/\n\s*$/.test(raw) ? ' ' : '';
        const parts = [];
        if (lead) parts.push(b.jsxText(lead));
        parts.push(b.jsxExpressionContainer(wrapCall(trimmed)));
        if (trail) parts.push(b.jsxText(trail));
        p.replace(...parts); changed = true;
        return false;
      }
      return this.traverse(p);
    },
    visitStringLiteral(p) {
      const v = p.node.value;
      if (DEV.test(v) && !ONLY_CODES.test(v) && !skipLiteral(p)) {
        const call = wrapCall(v);
        if (p.parent.node.type === 'JSXAttribute') p.replace(b.jsxExpressionContainer(call)); else p.replace(call);
        changed = true; return false;
      }
      return this.traverse(p);
    },
    visitTemplateLiteral(p) {
      const n = p.node;
      if (p.parent.node.type === 'TaggedTemplateExpression') return this.traverse(p);
      const text = n.quasis.map((q) => q.value.cooked).join('');
      if (DEV.test(text) && !skipLiteral(p)) {
        let key = '';
        n.quasis.forEach((q, i) => { key += q.value.cooked; if (i < n.expressions.length) key += `{${i}}`; });
        p.replace(wrapCall(key, n.expressions)); changed = true; return false;
      }
      return this.traverse(p);
    },
  });
  if (changed) {
    let out = recast.print(ast).code;
    if (!/import \{ tr \} from '@shared\/i18n\/index\.js';/.test(out)) out = `import { tr } from '@shared/i18n/index.js';\n${out}`;
    fs.writeFileSync(file, out);
    changedFiles += 1;
  } else {
    // collect existing keys for --list on already-converted files
    recast.visit(ast, { visitCallExpression(p) { const c = p.node; if (c.callee.name === 'tr' && c.arguments[0]?.type === 'StringLiteral') keys.add(c.arguments[0].value); this.traverse(p); } });
  }
}
console.error(`wrapped strings in ${changedFiles} files; ${keys.size} unique keys`);
if (process.argv.includes('--list')) fs.writeFileSync('/tmp/ui_keys.txt', [...keys].join('\n'));
