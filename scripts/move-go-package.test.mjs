import assert from 'node:assert/strict';
import test from 'node:test';

import { isHistorical, rewrite } from './move-go-package.mjs';

test('rewrites import paths on a boundary only', () => {
  assert.equal(
    rewrite('"m/backend/internal/push"\n"m/backend/internal/pushx"', [['internal/push', 'internal/notification/push']]),
    '"m/backend/internal/notification/push"\n"m/backend/internal/pushx"',
  );
});

test('rewrites subpaths and doc paths', () => {
  assert.equal(
    rewrite('see backend/internal/push/server.go', [['internal/push', 'internal/notification/push']]),
    'see backend/internal/notification/push/server.go',
  );
});

test('longer source wins and no chained rewrite', () => {
  const moves = [
    ['internal/service/notification', 'internal/notification'],
    ['internal/notify', 'internal/notification/notify'],
  ];
  assert.equal(
    rewrite('"x/internal/service/notification" "x/internal/notify"', moves),
    '"x/internal/notification" "x/internal/notification/notify"',
  );
  // The output of one move must not be rewritten again by another.
  assert.equal(rewrite('"x/internal/a"', [['internal/a', 'internal/b'], ['internal/b', 'internal/c']]), '"x/internal/b"');
});

test('does not touch a lookalike prefix or a suffix match', () => {
  const moves = [['internal/observe/artifacts', 'internal/artifact/observe/artifacts']];
  assert.equal(rewrite('"x/internal/observe/artifactsx"', moves), '"x/internal/observe/artifactsx"');
  assert.equal(rewrite('"x/otherinternal/observe/artifacts"', moves), '"x/otherinternal/observe/artifacts"');
});

test('rewrites at end of line and before backtick, comma or paren', () => {
  const moves = [['internal/push', 'internal/notification/push']];
  assert.equal(rewrite('dir internal/push\n`internal/push`, (internal/push)', moves),
    'dir internal/notification/push\n`internal/notification/push`, (internal/notification/push)');
});

test('rewrites a path that ends a sentence', () => {
  assert.equal(rewrite('lives in internal/push. Then internal/push; done', [['internal/push', 'internal/notification/push']]),
    'lives in internal/notification/push. Then internal/notification/push; done');
});

test('history and measurement docs are not rewritten', () => {
  for (const f of ['docs/superpowers/plans/2026-11-28-p3b-wave1-leaf-moves.md', 'docs/pr-evidence/x.md', '.ao-rescue/a.md',
    'docs/fork/ddd-spec/16-assessment-and-build-plan.md', 'docs/fork/ddd-spec/17-feature-code-map.md']) assert.equal(isHistorical(f), true, f);
  for (const f of ['docs/documentation-map.md', 'backend/internal/daemon/daemon.go', 'scripts/feature-map/clusters.json']) assert.equal(isHistorical(f), false, f);
});
