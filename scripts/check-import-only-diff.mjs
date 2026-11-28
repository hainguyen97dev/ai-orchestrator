#!/usr/bin/env node
// Proves a "move" PR only moves code. Every changed line must pair with a line
// on the other side of the same hunk that is identical once (a) the module
// path is normalized and (b) directories this diff renames are mapped old→new.
// That admits import rewrites, module-path strings and gofmt reordering, and
// nothing else. Blank lines pass. Generated files are skipped by path. New,
// deleted and binary files fail. Usage: node scripts/check-import-only-diff.mjs <baseRef>
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MODULE_PATHS = [
  'github.com/aoagents/agent-orchestrator',
  'github.com/hainguyen97dev/ai-orchestrator',
];

const GENERATED = [/^backend\/platform\/persistence\/sqlite\/gen\//, /^backend\/internal\/storage\/sqlite\/gen\//, /^frontend\/src\/api\/schema\.ts$/];
export const isGeneratedPath = (path) => GENERATED.some((re) => re.test(path));

const IMPORT_SPEC = /^\s*(?:import\s+)?(?:[A-Za-z_]\w*\s+|[_.]\s+)?"[^"\s]+"\s*$/;

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Directories moved by this diff, relative to backend/, from its rename headers.
// A parent with the same last segment on both sides is inferred too, but only
// when `gone(oldParent)` says it no longer exists (it moved as a whole).
export function dirRenames(text, { gone = () => false } = {}) {
  const map = new Map();
  let from = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('rename from ')) from = line.slice(12);
    else if (line.startsWith('rename to ') && from) {
      const strip = (p) => dirname(p.replace(/^backend\//, ''));
      const [a, b] = [strip(from), strip(line.slice(10))];
      if (a !== b && a !== '.') {
        map.set(a, b);
        let [x, y] = [a, b];
        while (basename(x) === basename(y) && dirname(x) !== dirname(y)) {
          [x, y] = [dirname(x), dirname(y)];
          if (x === '.' || basename(x) !== basename(y) || !gone(x)) break;
          if (!map.has(x)) map.set(x, y);
        }
      }
      from = null;
    }
  }
  return map;
}

function normalizer(renames) {
  const moved = [...renames].sort((x, y) => y[0].length - x[0].length)
    .map(([a, b]) => [new RegExp(`(?<![\\w.-])${escape(a)}(?=[/"'\`\\s\\]),;.<:*]|$)`, 'g'), b]);
  const module = (s) => MODULE_PATHS.reduce((acc, p) => acc.split(p).join('<module>'), s);
  return {
    minus: (s) => moved.reduce((acc, [re, b]) => acc.replace(re, b), module(s)),
    plus: (s) => module(s),
  };
}

function unpaired(hunk, norm) {
  const plusKeys = new Map();
  hunk.forEach((h, i) => {
    if (h.line[0] !== '+') return;
    const k = norm.plus(h.line.slice(1));
    plusKeys.set(k, [...(plusKeys.get(k) ?? []), i]);
  });
  const paired = new Set();
  hunk.forEach((h, i) => {
    if (h.line[0] !== '-') return;
    const slots = plusKeys.get(norm.minus(h.line.slice(1)));
    if (slots?.length) {
      paired.add(i);
      paired.add(slots.shift());
    }
  });
  return hunk.filter((h, i) => !paired.has(i) && h.line.slice(1).trim() !== '');
}

export function checkDiff(text, { isGenerated = isGeneratedPath, gone } = {}) {
  const norm = normalizer(dirRenames(text, { gone }));
  const violations = [];
  let file = null;
  let skip = false;
  let inHeader = false;
  let hunk = [];
  let fileImports = [];
  // Within a hunk any line may pair. Import specs left over may pair with an
  // import spec in another hunk of the same file (gofmt re-sorts the block).
  const flush = () => {
    for (const h of unpaired(hunk, norm)) {
      if (IMPORT_SPEC.test(h.line.slice(1))) fileImports.push(h);
      else violations.push(`${h.file}: ${h.line}`);
    }
    hunk = [];
  };
  const flushFile = () => {
    flush();
    for (const h of unpaired(fileImports, norm)) violations.push(`${h.file}: ${h.line}`);
    fileImports = [];
  };
  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ')) {
      flushFile();
      file = line.split(' b/').pop();
      skip = isGenerated(file);
      inHeader = true;
      continue;
    }
    if (file === null || skip) continue;
    if (line.startsWith('@@')) {
      flush();
      inHeader = false;
      continue;
    }
    if (inHeader) {
      const kind = line.startsWith('new file mode') ? 'new file'
        : line.startsWith('deleted file mode') ? 'deleted file'
        : line.startsWith('Binary files ') || line === 'GIT binary patch' ? 'binary change' : null;
      if (kind) {
        violations.push(`${file}: ${kind}`);
        skip = true;
      }
      continue;
    }
    if (line.startsWith('+') || line.startsWith('-')) hunk.push({ file, line });
  }
  flushFile();
  return violations;
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const base = process.argv[2];
  if (!base) {
    console.error('usage: check-import-only-diff.mjs <baseRef> [headRef]');
    process.exit(2);
  }
  const text = execFileSync('git', ['diff', '-M50%', '-l0', '--unified=0', `${base}...${process.argv[3] ?? 'HEAD'}`], {
    encoding: 'utf8',
    maxBuffer: 1 << 30,
  });
  const head = process.argv[3] ?? 'HEAD';
  const gone = (dir) => {
    try {
      execFileSync('git', ['cat-file', '-e', `${head}:backend/${dir}`], { stdio: 'ignore' });
      return false;
    } catch {
      return true;
    }
  };
  const violations = checkDiff(text, { gone });
  for (const v of violations) console.log(v);
  console.log(violations.length === 0 ? 'import-only: ok' : `import-only: ${violations.length} violation(s)`);
  process.exitCode = violations.length === 0 ? 0 : 1;
}
