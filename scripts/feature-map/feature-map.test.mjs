import assert from 'node:assert/strict';
import test from 'node:test';

import { assignPackages, assignRoutes, closureLoc, liveTables, parseRoutes, upSection } from './feature-map.mjs';

const clusters = [
  { id: 'A', httpPrefixes: ['/api/v1/sessions'], packages: ['internal/service/session', 'internal/adapters/agent/...'] },
  { id: 'B', httpPrefixes: ['/api/v1/sessions/{sessionId}/pr'], packages: [] },
];

test('assignRoutes: longest prefix wins, unmatched routes are reported', () => {
  const { byCluster, unassigned } = assignRoutes(
    ['/api/v1/sessions/{sessionId}/pr/{prNumber}/files', '/api/v1/sessions/{sessionId}', '/api/v1/devices', '/api/v1/sessionsx'],
    clusters,
  );
  assert.deepEqual(byCluster.get('B'), ['/api/v1/sessions/{sessionId}/pr/{prNumber}/files']);
  assert.deepEqual(byCluster.get('A'), ['/api/v1/sessions/{sessionId}']);
  assert.deepEqual(unassigned, ['/api/v1/devices', '/api/v1/sessionsx']);
});

test('assignPackages: exact path or "/..." subtree; first cluster owns a package', () => {
  const { byCluster, unassigned } = assignPackages(
    ['internal/service/session', 'internal/service/sessionimport', 'internal/adapters/agent/codex', 'internal/devices'],
    clusters,
  );
  assert.deepEqual(byCluster.get('A'), ['internal/service/session', 'internal/adapters/agent/codex']);
  assert.deepEqual(unassigned, ['internal/service/sessionimport', 'internal/devices']);
});

test('closureLoc counts each reachable package once, root included', () => {
  const deps = new Map([['a', ['b', 'c']], ['b', ['c']], ['c', []]]);
  const loc = new Map([['a', 10], ['b', 20], ['c', 30]]);
  assert.deepEqual(closureLoc(['a'], deps, loc), { packages: 3, loc: 60 });
  assert.deepEqual(closureLoc(['b', 'c'], deps, loc), { packages: 2, loc: 50 });
});

test('parseRoutes reads top-level path keys of openapi.yaml', () => {
  const yaml = 'openapi: 3.1.0\npaths:\n  /api/v1/a:\n    get:\n      summary: x\n  /api/v1/b/{id}:\n    post: {}\ncomponents:\n  schemas:\n    X:\n      type: object\n';
  assert.deepEqual(parseRoutes(yaml), ['/api/v1/a', '/api/v1/b/{id}']);
});

test('liveTables follows renames and drops', () => {
  const sql = [
    'CREATE TABLE sessions (id TEXT);',
    'CREATE TABLE review_next (id TEXT);',
    'CREATE TABLE IF NOT EXISTS "review" (id TEXT);',
    'DROP TABLE review;',
    'ALTER TABLE review_next RENAME TO review;',
    'CREATE TABLE tmp (x INT); DROP TABLE IF EXISTS tmp;',
  ].join('\n');
  assert.deepEqual(liveTables(sql), ['review', 'sessions']);
});

test('upSection keeps only the goose Up part so Down drops do not erase live tables', () => {
  const sql = '-- +goose Up\nCREATE TABLE sessions (id TEXT);\n-- +goose Down\nDROP TABLE sessions;\n';
  assert.deepEqual(liveTables(upSection(sql)), ['sessions']);
  assert.equal(upSection('CREATE TABLE a (x INT);\n'), 'CREATE TABLE a (x INT);\n');
});
