#!/usr/bin/env node
// Keeps the strategic DDD docs consistent (plan 2026-11-28-p2-strategic-ddd):
// one vocabulary (01 ↔ CONTEXT.md, no retired terms), one context list (04 ↔
// module layout in 14 ↔ archtest NewContexts), known contexts in the 05/06
// tables, and SQLite as the only store. Usage: node scripts/ddd-spec/check-consistency.mjs
import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const normTerm = (s) => s.replace(/[\s*`]/g, '').toLowerCase();

export function tableRows(md, heading) {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
  if (start < 0) return [];
  const rows = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('## ')) break;
    if (line.trim().startsWith('|')) rows.push(line.trim().split('|').slice(1, -1).map((c) => c.trim()));
    else if (rows.length) break;
  }
  return rows.slice(2);
}

export function glossary(md01) {
  return {
    terms: new Set(tableRows(md01, 'Thuật ngữ').map((r) => normTerm(r[0]))),
    canonical: tableRows(md01, 'Thuật ngữ').map((r) => r[0]),
    retired: new Map(tableRows(md01, 'Thuật ngữ bỏ').map((r) => [r[0], r[1]])),
  };
}

export function contextTerms(contextMd) {
  const out = [];
  let inPlatform = false;
  for (const line of contextMd.split('\n')) {
    if (line.startsWith('## ')) inPlatform = line.trim() === '## Platform domain (fork)';
    const m = inPlatform && line.match(/^- \*\*(.+?)\*\*/);
    if (m) out.push(m[1]);
  }
  return out;
}

export const contexts = (md04) =>
  tableRows(md04, 'Context').map(([name = '', pkg = '', kind = '']) => ({ name, pkg: pkg.replace(/`/g, ''), kind }));

// A context row needs all four cells; a short one is reported, not parsed.
const wellFormed = (md04) => tableRows(md04, 'Context').map((r) => r.length >= 4 && r.slice(0, 4).every(Boolean));

export function layoutPackages(md14) {
  const line = md14.split('\n').find((l) => l.startsWith('Module layout:')) ?? '';
  return line.match(/internal\/[a-z]+/g) ?? [];
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function retiredHits(line, word, canonical) {
  const covered = [];
  for (const term of canonical) {
    for (const form of new Set([term, term.replace(/\s+/g, '')])) {
      for (const m of line.matchAll(new RegExp(escape(form), 'g'))) covered.push([m.index, m.index + form.length]);
    }
  }
  return [...line.matchAll(new RegExp(`\\b${escape(word)}\\b`, 'g'))].filter(
    (m) => !covered.some(([a, b]) => m.index >= a && m.index + word.length <= b && b - a > word.length),
  ).length;
}

const RETIREMENT_SENTENCE = /^The earlier vocabulary is retired:/;
const DOCS = ['04', '05', '06', '14', 'CONTEXT'];

export function check(files, newContexts) {
  const v = [];
  const g = glossary(files['01']);

  for (const term of contextTerms(files.CONTEXT)) {
    if (!g.terms.has(normTerm(term))) v.push(`CONTEXT: term "${term}" missing from 01`);
  }

  for (const doc of DOCS) {
    for (const [word, use] of g.retired) {
      const n = files[doc]
        .split('\n')
        .filter((l) => !(doc === 'CONTEXT' && RETIREMENT_SENTENCE.test(l)))
        .reduce((acc, l) => acc + retiredHits(l, word, g.canonical), 0);
      if (n) v.push(`${doc}: retired term "${word}" (use ${use})`);
    }
  }

  const shape = wellFormed(files['04']);
  const all = contexts(files['04']);
  all.forEach((c, i) => {
    if (!shape[i]) v.push(`04: malformed context row "${c.name}" (need Context | Package | Loại | Nguồn AO)`);
  });
  const ctx = all.filter((_, i) => shape[i]);
  const pkgs = new Set(ctx.map((c) => c.pkg));
  const layout = new Set(layoutPackages(files['14']));
  for (const p of pkgs) if (!layout.has(p)) v.push(`14: layout missing ${p}`);
  for (const p of layout) if (!pkgs.has(p)) v.push(`14: layout has ${p}, not in 04 context table`);
  const fresh = ctx.filter((c) => c.kind.startsWith('mới')).map((c) => c.pkg.replace(/^internal\//, '')).sort();
  const want = [...newContexts].sort();
  if (fresh.join() !== want.join()) {
    v.push(`04: new contexts [${fresh.join(', ')}] differ from archtest NewContexts [${want.join(', ')}]`);
  }

  const names = new Set(ctx.map((c) => c.name));
  const columns = [
    ['05', tableRows(files['05'], 'Sự kiện').map((r) => r[r.length - 1])],
    ['06', tableRows(files['06'], 'Aggregate').map((r) => r[0])],
  ];
  for (const [doc, values] of columns) {
    for (const name of new Set(values)) if (name && !names.has(name)) v.push(`${doc}: unknown context "${name}"`);
  }

  for (const doc of ['04', '05', '06', '14']) {
    for (const word of ['PostgreSQL', 'pgvector']) {
      if (new RegExp(word, 'i').test(files[doc])) v.push(`${doc}: stack term "${word}" (SQLite only)`);
    }
  }
  return v;
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const root = resolve(fileURLToPath(import.meta.url), '../../..');
  const specDir = join(root, 'docs/fork/ddd-spec');
  const spec = (n) => readFileSync(join(specDir, readdirSync(specDir).find((f) => f.startsWith(`${n}-`))), 'utf8');
  const files = Object.fromEntries(['01', '04', '05', '06', '14'].map((n) => [n, spec(n)]));
  files.CONTEXT = readFileSync(join(root, 'CONTEXT.md'), 'utf8');
  const rules = readFileSync(join(root, 'backend/internal/archtest/rules.go'), 'utf8');
  const list = rules.match(/NewContexts = \[\]string\{([^}]*)\}/)?.[1] ?? '';
  const violations = check(files, [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]));
  for (const line of violations) console.log(line);
  console.log(violations.length === 0 ? 'ddd-spec: ok' : `ddd-spec: ${violations.length} violation(s)`);
  process.exitCode = violations.length === 0 ? 0 : 1;
}
