import assert from 'node:assert/strict';
import test from 'node:test';

import { checkDiff, classifyHunkLine } from './check-import-only-diff.mjs';

const OLD = 'github.com/aoagents/agent-orchestrator/backend';
const NEW = 'github.com/hainguyen97dev/ai-orchestrator/backend';

test('Go import specs and blank lines are ok', () => {
  assert.equal(classifyHunkLine(`+\t"${NEW}/internal/sharedkernel/domain"`, 'a.go'), 'ok');
  assert.equal(classifyHunkLine(`-\t"${OLD}/internal/domain"`, 'a.go'), 'ok');
  assert.equal(classifyHunkLine(`+\tsk "${NEW}/internal/sharedkernel/ports"`, 'a.go'), 'ok');
  assert.equal(classifyHunkLine(`+import "${NEW}/internal/cli"`, 'main.go'), 'ok');
  assert.equal(classifyHunkLine('+', 'a.go'), 'ok');
});

test('go.mod module line is ok', () => {
  assert.equal(classifyHunkLine(`+module ${NEW}`, 'backend/go.mod'), 'ok');
  assert.equal(classifyHunkLine(`-module ${OLD}`, 'backend/go.mod'), 'ok');
  assert.equal(classifyHunkLine('+require example.com/x v1.0.0', 'backend/go.mod'), 'violation');
});

test('non-Go lines are ok only when they carry a module path', () => {
  assert.equal(classifyHunkLine(`+const cliPackage = "${NEW}/internal/cli";`, 'frontend/scripts/build-daemon.mjs'), 'ok');
  assert.equal(classifyHunkLine(`+              import: "${NEW}/internal/domain"`, 'backend/sqlc.yaml'), 'ok');
  assert.equal(classifyHunkLine(`+      -ldflags "-X ${NEW}/internal/cli.releaseRepo=x" \\`, 'test/cli/Dockerfile'), 'ok');
  assert.equal(classifyHunkLine('+const x = 1;', 'frontend/scripts/build-daemon.mjs'), 'violation');
});

test('code, identifier and package changes are violations', () => {
  assert.equal(classifyHunkLine('+\tx := 1', 'a.go'), 'violation');
  assert.equal(classifyHunkLine('+\ts := sharedkernel.Session{}', 'a.go'), 'violation');
  assert.equal(classifyHunkLine('+package foo', 'a.go'), 'violation');
});

const diff = (file, lines, header = '') =>
  `diff --git a/${file} b/${file}\n${header}--- a/${file}\n+++ b/${file}\n@@ -1,1 +1,1 @@\n${lines.join('\n')}\n`;

test('checkDiff reports violations with file and ignores generated files and pure renames', () => {
  const text = [
    diff('backend/a.go', [`-\t"${OLD}/internal/domain"`, `+\t"${NEW}/internal/domain"`]),
    diff('backend/b.go', ['-\treturn 1', '+\treturn 2']),
    diff('backend/platform/persistence/sqlite/gen/models.go', ['+\tFoo int']),
    'diff --git a/backend/c.go b/backend/d.go\nsimilarity index 100%\nrename from backend/c.go\nrename to backend/d.go\n',
  ].join('');
  const violations = checkDiff(text, { isGenerated: (p) => p.includes('/gen/') });
  assert.deepEqual(violations, ['backend/b.go: -\treturn 1', 'backend/b.go: +\treturn 2']);
});

test('a Go line that differs from its counterpart only by module path is ok; other edits are not', () => {
  const text = diff('backend/e.go', [
    `-\tif strings.Contains(name, "${OLD}/internal/") {`,
    `+\tif strings.Contains(name, "${NEW}/internal/") {`,
    `-\tbuild := run("${OLD}/cmd/ao", 1)`,
    `+\tbuild := run("${NEW}/cmd/ao", 2)`,
  ]);
  assert.deepEqual(checkDiff(text, { isGenerated: () => false }), [
    `backend/e.go: -\tbuild := run("${OLD}/cmd/ao", 1)`,
    `backend/e.go: +\tbuild := run("${NEW}/cmd/ao", 2)`,
  ]);
});

test('a new non-generated file is a violation', () => {
  const text = 'diff --git a/backend/new.go b/backend/new.go\nnew file mode 100644\n--- /dev/null\n+++ b/backend/new.go\n@@ -0,0 +1,1 @@\n+package x\n';
  assert.deepEqual(checkDiff(text, { isGenerated: () => false }), ['backend/new.go: new file']);
});
