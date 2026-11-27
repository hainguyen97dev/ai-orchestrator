#!/usr/bin/env node
// Proves a "move" PR only moves code: every changed line must be a Go import
// spec, the go.mod module line, or a non-Go line carrying the module path.
// Pure renames (git -M100%) have no hunks and pass; generated files are skipped.
// Usage: node scripts/check-import-only-diff.mjs <baseRef>
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const MODULE_PATHS = [
  'github.com/aoagents/agent-orchestrator',
  'github.com/hainguyen97dev/ai-orchestrator',
];

const GO_IMPORT_SPEC = /^\s*(?:import\s+)?(?:[\w.]+\s+)?"[^"]+"\s*$/;

export function classifyHunkLine(line, file) {
  const body = line.slice(1);
  if (body.trim() === '') return 'ok';
  if (file.endsWith('.go')) return GO_IMPORT_SPEC.test(body) ? 'ok' : 'violation';
  if (file.endsWith('go.mod')) return /^module\s+\S+\s*$/.test(body) ? 'ok' : 'violation';
  return MODULE_PATHS.some((p) => body.includes(p)) ? 'ok' : 'violation';
}

const normalize = (body) => MODULE_PATHS.reduce((s, p) => s.split(p).join('<module>'), body);

// A changed line that carries a module path passes when the opposite side of
// the same hunk has a line identical to it once module paths are normalized.
function dropModuleOnlyPairs(hunk) {
  const counts = new Map();
  for (const { line } of hunk) {
    const key = line[0] + normalize(line.slice(1));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return hunk.filter(({ line }) => {
    if (!MODULE_PATHS.some((p) => line.includes(p))) return true;
    const other = (line[0] === '+' ? '-' : '+') + normalize(line.slice(1));
    return !counts.get(other);
  });
}

export function checkDiff(text, { isGenerated }) {
  const violations = [];
  let file = null;
  let skip = false;
  let hunk = [];
  const flush = () => {
    for (const { file: f, line } of dropModuleOnlyPairs(hunk)) violations.push(`${f}: ${line}`);
    hunk = [];
  };
  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ') || line.startsWith('@@')) flush();
    if (line.startsWith('diff --git ')) {
      file = line.split(' b/').pop();
      skip = isGenerated(file);
      continue;
    }
    if (file === null || skip) continue;
    if (line.startsWith('new file mode') || line.startsWith('deleted file mode')) {
      violations.push(`${file}: ${line.startsWith('new') ? 'new file' : 'deleted file'}`);
      skip = true;
      continue;
    }
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if ((line.startsWith('+') || line.startsWith('-')) && classifyHunkLine(line, file) === 'violation') {
      hunk.push({ file, line });
    }
  }
  flush();
  return violations;
}

function isGeneratedOnDisk(path) {
  if (path.endsWith('frontend/src/api/schema.ts')) return true;
  if (!existsSync(path)) return false;
  return /^\/\/ Code generated .* DO NOT EDIT\.$/m.test(readFileSync(path, 'utf8').split('\n').slice(0, 5).join('\n'));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const base = process.argv[2];
  if (!base) {
    console.error('usage: check-import-only-diff.mjs <baseRef>');
    process.exit(2);
  }
  const text = execFileSync('git', ['diff', '-M100%', '--unified=0', `${base}...HEAD`], {
    encoding: 'utf8',
    maxBuffer: 1 << 30,
  });
  const violations = checkDiff(text, { isGenerated: isGeneratedOnDisk });
  for (const v of violations) console.log(v);
  console.log(violations.length === 0 ? 'import-only: ok' : `import-only: ${violations.length} violation(s)`);
  process.exit(violations.length === 0 ? 0 : 1);
}
