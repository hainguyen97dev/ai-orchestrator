import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = resolve(fileURLToPath(import.meta.url), '..');

// A symlinked path to the entry (macOS /tmp, symlinked workspaces) must still run the CLI.
const viaSymlink = (rel, args = []) => {
  const link = join(mkdtempSync(join(tmpdir(), 'cli-entry-')), 'entry.mjs');
  symlinkSync(join(here, rel), link);
  return spawnSync(process.execPath, [link, ...args], { encoding: 'utf8', cwd: resolve(here, '..') });
};

test('ddd-spec checker runs when invoked through a symlink', () => {
  assert.match(viaSymlink('ddd-spec/check-consistency.mjs').stdout, /^ddd-spec: /m);
});

test('import-only checker runs when invoked through a symlink', () => {
  const r = viaSymlink('check-import-only-diff.mjs');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /usage:/);
});
