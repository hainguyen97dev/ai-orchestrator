import assert from 'node:assert/strict';
import test from 'node:test';

import { check, contexts, contextTerms, glossary, layoutPackages, normTerm, tableRows } from './check-consistency.mjs';

const NEW = ['workflow', 'knowledge'];

const md01 = `# UL
## Thuật ngữ
| Thuật ngữ | Định nghĩa |
|---|---|
| Workflow Run | x |
| Quality Gate | x |
| Approval | x |

## Thuật ngữ bỏ
| Từ bỏ | Dùng |
|---|---|
| Gate | Approval / Quality Gate |
| FlowRun | Workflow Run |
`;
const md04 = `## Context
| Context | Package | Loại | Nguồn AO |
|---|---|---|---|
| Workflow | \`internal/workflow\` | mới | F-12 |
| Knowledge | \`internal/knowledge\` | mới | F-21 |
| Quality | \`internal/quality\` | bọc AO | F-05 |
`;
const events = (row = '| StartWorkflow | WorkflowStarted | x | Workflow |') =>
  `## Sự kiện\n| Command | Domain Event | Policy | Context sở hữu |\n|---|---|---|---|\n${row}\n`;
const aggregates = (row = '| Workflow | WorkflowRun | pin |') =>
  `## Aggregate\n| Context | Aggregate root | Invariant |\n|---|---|---|\n${row}\n`;
const layout = 'Module layout: internal/workflow, internal/knowledge, internal/quality; platform/persistence.';
const ctx = (item = '- **Workflow Run**: x') =>
  `# G\n## Mobile connectivity\n- **Pairing QR**: x\n## Platform domain (fork)\nThe earlier "Flow" vocabulary is retired: FlowRun → **Workflow Run**, Gate → **Approval**.\n${item}\n`;
const good = (over = {}) => ({ '01': md01, '04': md04, '05': events(), '06': aggregates(), '14': layout, CONTEXT: ctx(), ...over });

test('a consistent set has no violations', () => assert.deepEqual(check(good(), NEW), []));

test('normalizes spacing and case of terms', () => {
  assert.equal(normTerm('Workflow Run'), normTerm('`WorkflowRun`'));
  assert.equal(normTerm('**Quality Gate**'), 'qualitygate');
});

test('tableRows returns body rows of the first table under a heading', () => {
  assert.deepEqual(tableRows(md04, 'Context')[2], ['Quality', '`internal/quality`', 'bọc AO', 'F-05']);
  assert.deepEqual(tableRows(md04, 'Missing'), []);
});

test('glossary, contexts, layout and context terms parse', () => {
  const g = glossary(md01);
  assert.equal(g.terms.has('workflowrun'), true);
  assert.equal(g.retired.get('Gate'), 'Approval / Quality Gate');
  assert.deepEqual(contexts(md04)[0], { name: 'Workflow', pkg: 'internal/workflow', kind: 'mới' });
  assert.deepEqual(layoutPackages(layout), ['internal/workflow', 'internal/knowledge', 'internal/quality']);
  assert.deepEqual(contextTerms(ctx()), ['Workflow Run']);
});

test('canonical term containing a retired word is not flagged', () => {
  assert.deepEqual(check(good({ '06': aggregates('| Quality | QualityGate | Quality Gate gắn revision |') }), NEW), []);
});

test('retired word outside a canonical term is flagged', () => {
  assert.deepEqual(check(good({ '05': events('| Qua Gate | GatePassed | x | Quality |') }), NEW), [
    '05: retired term "Gate" (use Approval / Quality Gate)',
  ]);
});

test('retired section itself is exempt', () => {
  // ctx() carries the "… is retired" sentence naming FlowRun and Gate.
  assert.deepEqual(check(good(), NEW), []);
  assert.deepEqual(check(good({ CONTEXT: ctx('- **Workflow Run**: was FlowRun') }), NEW), ['CONTEXT: retired term "FlowRun" (use Workflow Run)']);
});

test('layout must equal context table', () => {
  const v = check(good({ '14': 'Module layout: internal/workflow, internal/knowledge, internal/agent.' }), NEW);
  assert.deepEqual(v, ['14: layout missing internal/quality', '14: layout has internal/agent, not in 04 context table']);
});

test('context glossary platform terms must exist in 01', () => {
  assert.deepEqual(check(good({ CONTEXT: ctx('- **Warp Drive**: x') }), NEW), ['CONTEXT: term "Warp Drive" missing from 01']);
});

test('new-kind contexts must equal archtest NewContexts', () => {
  assert.deepEqual(check(good(), ['workflow']), ['04: new contexts [knowledge, workflow] differ from archtest NewContexts [workflow]']);
});

test('PostgreSQL in 14 is a violation', () => {
  assert.deepEqual(check(good({ '14': `${layout}\nDB: PostgreSQL` }), NEW), ['14: stack term "PostgreSQL" (SQLite only)']);
});

test('unknown context in 06 or 05 column is a violation', () => {
  assert.deepEqual(check(good({ '06': aggregates('| Ghost | X | y |'), '05': events('| A | B | c | Phantom |') }), NEW), [
    '05: unknown context "Phantom"',
    '06: unknown context "Ghost"',
  ]);
});
