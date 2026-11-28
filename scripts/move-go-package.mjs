#!/usr/bin/env node
// Moves backend Go packages for P3b (plan 2026-11-28-p3b-wave1-leaf-moves):
// `git mv` each directory, rewrite every reference to the old path in tracked
// source and doc files, then gofmt the changed Go files. Paths are relative to
// backend/. Usage: node scripts/move-go-package.mjs <from> <to> [<from> <to>...]
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// One pass over the text with every source path in one alternation, longest
// first, so a replaced span is never rewritten again by another move.
export function rewrite(text, moves) {
  if (moves.length === 0) return text;
  const sorted = [...moves].sort((a, b) => b[0].length - a[0].length);
  const to = new Map(sorted);
  const re = new RegExp(`(?<![\\w.-])(${sorted.map(([from]) => escape(from)).join('|')})(?=["/\`'\\s,;.<)\\]:*]|$)`, 'gm');
  return text.replace(re, (from) => to.get(from));
}

// History and measurements stay as they were written: plans (including the one
// that names these moves), PR evidence, rescue notes, and the assessment/feature
// maps that record where code came from.
const HISTORICAL = [
  /^docs\/pr-evidence\//,
  /^docs\/superpowers\/plans\//,
  /^\.ao-rescue\//,
  /^docs\/fork\/ddd-spec\/1[67]-/,
  // Path fixtures of this tool and of the import-only checker.
  /^scripts\/(move-go-package|check-import-only-diff)(\.test)?\.mjs$/,
];
export const isHistorical = (file) => HISTORICAL.some((re) => re.test(file));
const EXTENSIONS = /\.(go|md|json|ya?ml|mjs|sql|tsx?)$/;

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.length % 2 !== 0) {
    console.error('usage: move-go-package.mjs <from> <to> [<from> <to>...]  (paths relative to backend/)');
    process.exit(2);
  }
  const root = resolve(fileURLToPath(import.meta.url), '../..');
  const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' });
  const moves = [];
  for (let i = 0; i < args.length; i += 2) moves.push([args[i], args[i + 1]]);
  for (const [from, to] of moves) {
    mkdirSync(dirname(join(root, 'backend', to)), { recursive: true });
    git('mv', `backend/${from}`, `backend/${to}`);
  }
  const files = git('ls-files').split('\n').filter((f) => EXTENSIONS.test(f) && !isHistorical(f));
  const changedGo = [];
  let changed = 0;
  for (const file of files) {
    const path = join(root, file);
    const before = readFileSync(path, 'utf8');
    const after = rewrite(before, moves);
    if (after === before) continue;
    writeFileSync(path, after);
    changed++;
    if (file.endsWith('.go')) changedGo.push(path);
  }
  if (changedGo.length) execFileSync('gofmt', ['-w', ...changedGo]);
  console.log(`moved ${moves.length} package(s); rewrote ${changed} file(s)`);
}
