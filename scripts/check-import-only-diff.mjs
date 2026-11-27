#!/usr/bin/env node
// Proves a "move" PR only moves code: every changed line must be a Go import
// spec, the go.mod module line, or a non-Go line carrying the module path.
// Pure renames (git -M100%) have no hunks and pass; generated files are skipped.
// Usage: node scripts/check-import-only-diff.mjs <baseRef>
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const MODULE_PATHS = [
  'github.com/aoagents/agent-orchestrator/backend',
  'github.com/hainguyen97dev/ai-orchestrator/backend',
];

const GO_IMPORT_SPEC = /^\s*(?:import\s+)?(?:[\w.]+\s+)?"[^"]+"\s*$/;

export function classifyHunkLine(line, file) {
  const body = line.slice(1);
  if (body.trim() === '') return 'ok';
  if (file.endsWith('.go')) return GO_IMPORT_SPEC.test(body) ? 'ok' : 'violation';
  if (file.endsWith('go.mod')) return /^module\s+\S+\s*$/.test(body) ? 'ok' : 'violation';
  return MODULE_PATHS.some((p) => body.includes(p)) ? 'ok' : 'violation';
}

export function checkDiff(text, { isGenerated }) {
  const violations = [];
  let file = null;
  let skip = false;
  for (const line of text.split('\n')) {
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
      violations.push(`${file}: ${line}`);
    }
  }
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
