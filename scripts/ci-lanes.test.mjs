import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

import { LANES, outputs, pickLanes } from './ci-lanes.mjs';

const pr = (paths, extra = {}) => ({
  event: 'pull_request',
  files: paths.map(path => (typeof path === 'string' ? { status: 'modified', filename: path } : path)),
  ...extra,
});
const everyLane = Object.keys(LANES);

test('a push to main runs every lane in full', () => {
  assert.deepEqual(pickLanes({ event: 'push' }), { lanes: Object.keys(LANES), full: true, macos: false, vitest: 'all' });
});

test('draft PRs run no lanes, even with ci:full', () => {
  const none = { lanes: [], full: false, macos: false, vitest: '' };
  assert.deepEqual(pickLanes(pr(['backend/a.go'], { draft: true, labels: ['ci:full'] })), none);
});

test('stacked PRs in the same repository run affected lanes', () => {
  assert.deepEqual(pickLanes(pr(['.github/workflows/ci.yml'], { base: 'feat/pipeline-foundation' })).lanes, everyLane);
});

test('a PR into stable runs every lane in full, whatever it changes', () => {
  const full = { lanes: Object.keys(LANES), full: true, macos: false, vitest: 'all' };
  assert.deepEqual(pickLanes(pr(['backend/a.go'], { base: 'stable' })), full);
  assert.deepEqual(pickLanes(pr(['README.md'], { base: 'stable' })), full);
  assert.deepEqual(pickLanes(pr(['backend/a.go'], { base: 'stable', fork: true })), full);
  assert.deepEqual(pickLanes(pr(['backend/a.go'], { base: 'stable', draft: true })).lanes, []);
});

test('enabled workflows only call enabled workflows and run on Ubuntu', () => {
  const dir = new URL('../.github/workflows/', import.meta.url);
  const files = readdirSync(dir).filter(name => name.endsWith('.yml'));
  for (const name of files) {
    const workflow = readFileSync(new URL(name, dir), 'utf8');
    for (const match of workflow.matchAll(/uses: \.\/\.github\/workflows\/([a-z0-9-]+\.yml)/g)) {
      assert.ok(files.includes(match[1]), `${name} calls missing ${match[1]}`);
    }
    assert.doesNotMatch(workflow, /macos-|windows-/i, `${name} references a paid native runner`);
  }
  assert.deepEqual(files.sort(), ['agent-automerge.yml', 'ci.yml', 'cli-e2e.yml', 'frontend.yml', 'gitleaks.yml', 'go.yml']);
});

test('a docs-only PR runs no lanes', () => {
  assert.deepEqual(pickLanes(pr(['README.md', 'docs/ci.md', 'AGENTS.md'])).lanes, []);
});

test('drafts and stacked PRs from forks', () => {
  assert.deepEqual(pickLanes(pr(['backend/a.go'], { draft: true, base: 'feat/parent', fork: true })).lanes, []);
  assert.throws(() => pickLanes(pr(['backend/a.go'], { base: 'feat/parent', fork: true })), /target main and push again/);
  assert.deepEqual(pickLanes(pr(['backend/a.go'], { fork: true })).lanes, ['go', 'cli-e2e']);
});

test('a renderer change runs the frontend lane, with related vitest files and the Electron boundary', () => {
  const pick = pickLanes(pr(['frontend/src/renderer/a.ts', 'frontend/src/renderer/a.test.ts']));
  assert.deepEqual(pick.lanes, ['frontend', 'boundary']);
  assert.equal(pick.vitest, 'src/renderer/a.ts src/renderer/a.test.ts');
  assert.equal(pick.macos, false);
});

test('an httpd change runs Go, CLI E2E and the Electron boundary', () => {
  assert.deepEqual(pickLanes(pr(['backend/internal/httpd/server.go'])).lanes, ['go', 'cli-e2e', 'boundary']);
});

test('files backend tests and Go CI read from outside backend/ run the Go lane', () => {
  assert.deepEqual(pickLanes(pr(['contracts/session-start-interface.json'])).lanes, ['go']);
  assert.deepEqual(pickLanes(pr(['go.work'])).lanes, ['go']);
  assert.deepEqual(pickLanes(pr(['.github/scripts/go-test-parallel.sh'])).lanes, ['go', 'config']);
  assert.ok(pickLanes(pr(['frontend/scripts/prepare-cloudflared.mjs'])).lanes.includes('go'));
});

test('packages/shared reaches the frontend, with all vitest files', () => {
  const pick = pickLanes(pr(['packages/shared/theme/palette.ts']));
  assert.deepEqual(pick.lanes, ['frontend', 'boundary']);
  assert.equal(pick.vitest, 'all');
});

test('the renderer typechecks against cloud-client types', () => {
  assert.deepEqual(pickLanes(pr(['packages/cloud-client/src/types.ts'])).lanes, ['frontend', 'boundary', 'cloud']);
  assert.deepEqual(pickLanes(pr(['contracts/cloud/openapi.yaml'])).lanes, ['cloud']);
});

test('a workflow edit runs every enabled lane', () => {
  const pick = pickLanes(pr(['.github/workflows/ci.yml']));
  assert.deepEqual(pick.lanes, everyLane);
  assert.equal(pick.vitest, 'all');
  assert.equal(pick.macos, false);
});

test('ci:full selects every enabled lane', () => {
  const full = pickLanes(pr(['README.md'], { labels: ['ci:full'] }));
  assert.deepEqual(full.lanes, Object.keys(LANES));
  assert.equal(full.full, true);
});

test('a rename counts its old path', () => {
  assert.deepEqual(pickLanes(pr([{ status: 'renamed', filename: 'docs/a.go', previous_filename: 'backend/a.go' }])).lanes, ['go', 'cli-e2e']);
});

test('a truncated file list runs every lane', () => {
  const files = Array.from({ length: 3000 }, (_, i) => `docs/${i}.md`);
  assert.deepEqual(pickLanes(pr(files)).lanes, everyLane);
});

test('vitest runs all files when related selection cannot be trusted', () => {
  assert.equal(pickLanes(pr(['frontend/src/renderer/test/setup.ts'])).vitest, 'all');
  assert.equal(pickLanes(pr(['frontend/package.json'])).vitest, 'all');
  assert.equal(pickLanes(pr(['frontend/src/renderer/my file.ts'])).vitest, 'all');
  assert.equal(pickLanes(pr([{ status: 'removed', filename: 'frontend/src/renderer/a.ts' }])).vitest, 'all');
});

test('outputs are one GitHub output line each', () => {
  const text = outputs(pickLanes(pr(['frontend/src/docs/content/a.mdx'])));
  assert.equal(text, 'lanes=["docs"]\nfrontend=true\nfull=false\nvitest=\n');
});

test('every lane is used by a workflow', () => {
  const workflows = ['ci.yml', 'frontend.yml'].map(name => readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), 'utf8')).join('\n');
  for (const lane of Object.keys(LANES)) {
    assert.ok(workflows.includes(`'${lane}')`), `no workflow job runs lane ${lane}`);
  }
});

test('every always-run vitest file exists', () => {
  const list = readFileSync(new URL('../frontend/scripts/ci-vitest-always-run.txt', import.meta.url), 'utf8').split('\n').filter(Boolean);
  assert.ok(list.length > 0);
  for (const path of list) {
    assert.doesNotThrow(() => readFileSync(new URL(`../frontend/${path}`, import.meta.url)), `missing ${path}`);
  }
});
