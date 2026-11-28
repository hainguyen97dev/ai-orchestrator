# P2 Strategic DDD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spec 01/04/05/06/14 và `CONTEXT.md` dùng chung một bộ thuật ngữ, một danh sách context (có AO substrate + ACL), một chuẩn event v1 và một thứ tự ưu tiên nguồn. Một script CI chặn chúng lệch lại.

**Architecture:** Viết `scripts/ddd-spec/check-consistency.mjs` trước (TDD). Script đọc các file Markdown và đối chiếu bảng thuật ngữ, bảng context, cột context của 05/06 và module layout của 14. Sau đó sửa từng tài liệu cho tới khi script xanh. Code Go chỉ đổi một chỗ: luật R4 trong `internal/archtest` cấm thêm `platform/eventbus/cdc`.

**Tech Stack:** Markdown, Node `node:test` (không thêm dependency), Go `internal/archtest`.

**Spec:** `docs/superpowers/specs/2026-11-27-ddd-platform-restructure-design.md` §5.3 (dòng "Thuật ngữ: Dùng bộ của spec"), §5.5 hàng P2: "Thống nhất thuật ngữ; context map có substrate + ACL; event v1; thứ tự ưu tiên nguồn (requirement vs code vs vault)". Xong khi: "Spec 01/04/05/06/14 + CONTEXT.md khớp nhau".

## Global Constraints

- Thuật ngữ: dùng bộ của spec (`WorkflowDefinition`, `WorkflowRun`, `NodeExecution`, `AgentRun`…); `Flow*` trong CONTEXT.md đổi theo (spec §5.3).
- Lưu trữ là SQLite (sqlc, goose), FTS5; không PostgreSQL/pgvector (16 §S1, K-bảng trong `docs/fork/README.md`).
- Tài liệu viết tiếng Việt, thuật ngữ giữ tiếng Anh. `CONTEXT.md` giữ tiếng Anh (file gốc của AO).
- Context mới không đọc store SQLite của AO ngoài `infrastructure/acl/**` (K10, luật R4).
- Không xoá thuật ngữ mobile/LAN khỏi `CONTEXT.md` ở P2: code vẫn còn tới khi P3b cắt F-13; chỉ đánh dấu "sẽ xoá (K5)".
- Làm trên nhánh `docs/p2-strategic-ddd`, worktree `../aio-p2`. Không push, không PR nếu chủ sản phẩm chưa đồng ý.

## Quyết định nội dung (plan chốt, tài liệu ghi lại)

1. **Agent Definition** là aggregate chuẩn (01/06/12). **RoleProfile** và **KnowledgeSnapshot** chuyển vào "Thuật ngữ bỏ": RoleProfile → Agent Definition (vai trò + skill + knowledge + agent mặc định); KnowledgeSnapshot → Context Package (bản pin revision). ToolProfile, SkillDefinition, MCPServer, Enforcement level giữ.
2. **Danh sách context chuẩn** (04 là nguồn duy nhất; tên hiển thị ở cột Context dùng nguyên văn ở 05/06/14):

| Context | Package | Loại | Nguồn AO (17) |
|---|---|---|---|
| Domain Modeling | `internal/domainmodel` | mới | F-20 |
| Knowledge | `internal/knowledge` | mới | F-21 |
| Context Engineering | `internal/context` | mới | F-22 |
| Workflow | `internal/workflow` | mới | F-12, F-23 |
| Budget | `internal/budget` | mới, bọc AO | F-04 |
| Agent | `internal/agent` | bọc AO | F-02 (agentlaunch, service/agent) |
| Execution | `internal/execution` | giữ AO | F-01, F-02, F-16 |
| Workspace | `internal/workspace` | giữ AO | F-01 |
| Provider | `internal/provider` | bọc AO | F-03 |
| Quality | `internal/quality` | bọc AO | F-05, F-18 |
| Artifact | `internal/artifact` | giữ AO | F-09 |
| Identity | `internal/identity` | giữ AO | F-06, settings |
| Task | `internal/task` | giữ AO | F-07 |
| Skill | `internal/skill` | bọc AO | F-08 |
| Notification | `internal/notification` | giữ AO | F-10 |
| Audit | `internal/audit` | giữ AO (local) | F-17 |

   Loại "mới" = đúng `archtest.NewContexts`. Scheduling (F-11) ghi ở mục "Chờ quyết", không vào bảng. **AO Substrate** = mọi package AO chưa dời; context mới nói chuyện với nó chỉ qua ACL.
3. **Event v1** (05):
   - Envelope gồm `event_id`, `type`, `schema_version`, `aggregate_id`, `aggregate_version`, `occurred_at`, `correlation_id`, `causation_id`, `payload`.
   - `type` có dạng `<package>.<EventName>`, ví dụ `workflow.WorkflowStarted`. `schema_version` bắt đầu từ 1; thay đổi phá vỡ thì tăng version, và consumer đọc được cả hai version trong một release.
   - Bảng `domain_outbox` do context mới ghi trong cùng transaction với aggregate. Dispatcher chạy poll, đảm bảo at-least-once.
   - Bảng `consumed_events(consumer, event_id)` làm idempotency.
   - Lỗi lần thứ 5 thì chuyển sang dead-letter (`dead_at`).
   - Không đưa secret vào event.
   - `change_log` của AO (CDC do trigger ghi: `session_*`, `pr_*`) là event nội bộ của substrate. Context mới chỉ đọc nó qua bộ dịch trong ACL của mình, và luật R4 cấm thêm `platform/eventbus/cdc`.
   - Bảng sự kiện của 05 có thêm cột "Context sở hữu".
4. **Thứ tự ưu tiên nguồn** (04, mục riêng; **đề xuất, chờ chủ sản phẩm xác nhận**):
   - Câu hỏi "hệ thống **phải** làm gì": requirement hoặc Business Rule APPROVED > code + test > vault DRAFT/IN_REVIEW > suy luận AI. Suy luận AI không bao giờ thành rule.
   - Câu hỏi "hệ thống **đang** làm gì": code + test > tài liệu.
   - Khi requirement APPROVED và code mâu thuẫn: không tự chọn. Context Package ghi vào `unresolved_conflicts` (10), node tạo Knowledge Proposal hoặc hỏi người duyệt, và không ghi đè vault (08).

## Review Focus

1. Thuật ngữ viết khác dạng ("Workflow Run" ở 01, `WorkflowRun` ở 06) phải được coi là một. Test `normalizes spacing and case of terms`.
2. "Quality Gate" không được báo là thuật ngữ bỏ "Gate". Test `canonical term containing a retired word is not flagged`.
3. Dòng trong mục "Thuật ngữ bỏ", và câu "… is retired" của CONTEXT.md, không bị báo vi phạm. Test `retired section itself is exempt`.
4. Context có ở 04 nhưng thiếu trong module layout của 14, hoặc ngược lại, đều phải fail. Test `layout must equal context table`.
5. Thuật ngữ trong CONTEXT.md mà 01 không có thì fail. Thuật ngữ mobile được miễn vì nằm ngoài mục "Platform domain". Test `context glossary platform terms must exist in 01`.

---

### Task 1: Script kiểm tính nhất quán

**Files:**
- Create: `scripts/ddd-spec/check-consistency.mjs`
- Create: `scripts/ddd-spec/check-consistency.test.mjs`
- Modify: `.github/workflows/ci.yml` (dòng `node --test` của job config: thêm file test mới)

**Interfaces:**
- Produces (export):
  - `normTerm(s: string): string`: bỏ khoảng trắng, dấu `*` và backtick, rồi chuyển về chữ thường.
  - `tableRows(md: string, heading: string): string[][]`: trả các hàng của bảng Markdown đầu tiên nằm sau heading `## <heading>`, đã bỏ hàng tiêu đề và hàng `---`.
  - `glossary(md01): {terms: Set<string>, retired: Map<string,string>}`: `terms` lấy từ bảng `## Thuật ngữ`, `retired` lấy từ bảng `## Thuật ngữ bỏ` (cột 1 là từ bỏ, cột 2 là từ thay).
  - `contextTerms(contextMd): string[]`: các mục `- **X**` trong mục `## Platform domain (fork)` của CONTEXT.md.
  - `contexts(md04): {name, pkg, kind}[]`: lấy từ bảng `## Context`.
  - `layoutPackages(md14): string[]`: các `internal/<x>` trên dòng bắt đầu bằng `Module layout:`.
  - `check(files: Record<'01'|'04'|'05'|'06'|'14'|'CONTEXT', string>, newContexts: string[]): string[]`: trả về danh sách vi phạm, mỗi vi phạm dạng `"<file>: <message>"`.
- CLI: `node scripts/ddd-spec/check-consistency.mjs` đọc `docs/fork/ddd-spec/{01,04,05,06,14}-*.md`, `CONTEXT.md` và `NewContexts` (regex trên `backend/internal/archtest/rules.go`). In từng vi phạm; nếu có vi phạm thì exit 1, nếu không thì in `ddd-spec: ok`.

Các luật của `check`:
- R-term: mọi `contextTerms` (đã chuẩn hoá) phải có trong `glossary.terms`.
- R-retired: không từ bỏ nào được xuất hiện dưới dạng từ trọn vẹn (word boundary) trong 04/05/06/14 hoặc CONTEXT.md. Có hai ngoại lệ: dòng nằm trong mục `Thuật ngữ bỏ`, và dòng CONTEXT.md có chứa "retired". Một lần xuất hiện nằm trong một thuật ngữ chuẩn dài hơn (ví dụ "Quality Gate") không tính.
- R-ctx: tập `pkg` của 04 phải bằng tập `layoutPackages(14)`. Các `kind` bắt đầu bằng `mới` phải bằng `newContexts`.
- R-col: mỗi giá trị ở cột "Context" của bảng `## Aggregate` (06) và cột "Context sở hữu" của bảng `## Sự kiện` (05) phải là một `name` của 04.
- R-stack: `PostgreSQL` và `pgvector` không được xuất hiện ở 04/05/06/14 (không phân biệt hoa thường).

- [ ] **Step 1: Viết test fail.** Một test cho mỗi luật, cộng 5 test của Review Focus. Fixture là chuỗi Markdown nhỏ dựng trong file test, gồm một bộ "đúng" và các biến thể làm hỏng từng luật. Các assertion chính:

```js
test('normalizes spacing and case of terms', () => assert.equal(normTerm('Workflow Run'), normTerm('`WorkflowRun`')));
test('canonical term containing a retired word is not flagged', () => {
  assert.deepEqual(check(good({ '06': aggregates('| Quality | QualityGate | Quality Gate gắn revision |') }), NEW), []);
});
test('retired word outside a canonical term is flagged', () => {
  assert.deepEqual(check(good({ '05': events('| Qua Gate | GatePassed | x | Quality |') }), NEW), ['05: retired term "Gate" (use Approval / Quality Gate)']);
});
test('retired section itself is exempt', () => assert.deepEqual(check(good(), NEW), []));
test('layout must equal context table', () => {
  assert.deepEqual(check(good({ '14': 'Module layout: internal/workflow.' }), NEW).filter((v) => v.startsWith('14:')).length > 0, true);
});
test('context glossary platform terms must exist in 01', () => {
  assert.deepEqual(check(good({ CONTEXT: ctx('- **Warp Drive**: x') }), NEW), ['CONTEXT: term "Warp Drive" missing from 01']);
});
test('new-kind contexts must equal archtest NewContexts', () => {
  assert.equal(check(good(), ['workflow']).some((v) => v.startsWith('04:')), true);
});
test('PostgreSQL in 14 is a violation', () => {
  assert.equal(check(good({ '14': layout + '\nDB: PostgreSQL' }), NEW).length, 1);
});
test('unknown context in 06 column is a violation', () => { /* "Ghost" context → ['06: unknown context "Ghost"'] */ });
```

- [ ] **Step 2: Chạy.** `node --test scripts/ddd-spec/check-consistency.test.mjs` → Expected: FAIL (`Cannot find module`).
- [ ] **Step 3: Viết `check-consistency.mjs` theo Interfaces.** Guard phần CLI bằng `resolve(process.argv[1]) === fileURLToPath(import.meta.url)`, giống `scripts/check-import-only-diff.mjs`.
- [ ] **Step 4: Chạy lại.** Expected: PASS hết. Sau đó chạy `node scripts/ddd-spec/check-consistency.mjs` trên tài liệu hiện tại. Expected: exit 1 và có vi phạm R-stack (14: PostgreSQL), R-ctx, R-col. Ghi số vi phạm vào ledger để làm baseline.
- [ ] **Step 5:** Thêm file test vào dòng `node --test` của job config trong `ci.yml`. Chạy `node --test scripts/ci-lanes.test.mjs` → PASS.
- [ ] **Step 6: Commit** `test(ddd-spec): consistency checker for spec 01/04/05/06/14 and CONTEXT.md`. Lúc này CLI chưa nằm trong CI. Task 5 mới thêm nó vào.

### Task 2: Thuật ngữ — 01 và CONTEXT.md

**Files:** Modify `docs/fork/ddd-spec/01-ubiquitous-language.md`, `CONTEXT.md`.

**Interfaces:** Consumes `glossary`, `contextTerms` (Task 1). Produces: các heading `## Thuật ngữ`, `## Thuật ngữ bỏ` trong 01.

- [ ] **Step 1: Sửa 01.**
  - Đổi bảng hiện có thành `## Thuật ngữ`.
  - Thêm các thuật ngữ đang có trong CONTEXT.md mà 01 thiếu: Node, Node Execution, Approval, Quality Gate, Artifact, SkillDefinition, ToolProfile, MCPServer, Enforcement level, AO Substrate, Anti-corruption Layer.
  - Sửa định nghĩa Agent Definition theo Quyết định 1.
  - Thêm bảng `## Thuật ngữ bỏ`: Flow → Workflow Definition; FlowRun → Workflow Run; Stage → Node; Gate → Approval / Quality Gate; RoleProfile → Agent Definition; KnowledgeSnapshot → Context Package.
  - Frontmatter đổi thành `version: 0.2`.
- [ ] **Step 2: Sửa CONTEXT.md.**
  - Mục `## Platform domain (fork)`: bỏ mục RoleProfile; đổi câu "retired" cho đủ cả 6 từ bỏ; Workflow Run "pins … a knowledge snapshot" đổi thành "pins … the Context Package revisions"; thêm Agent Definition có ghi "absorbs the former RoleProfile".
  - Mục `## Mobile connectivity`: thêm một dòng dưới heading: "Scheduled for removal with the mobile cut (fork decision K5); kept until that code is deleted."
- [ ] **Step 3: Chạy** `node scripts/ddd-spec/check-consistency.mjs`. Expected: không còn vi phạm R-term hoặc R-retired nào dính tới CONTEXT/01.
- [ ] **Step 4: Commit** `docs(ddd-spec): one vocabulary across 01 and CONTEXT.md`.

### Task 3: Context map — 04 (substrate, ACL, ưu tiên nguồn)

**Files:** Modify `docs/fork/ddd-spec/04-bounded-context-map.md`.

**Interfaces:** Produces bảng `## Context` (cột `Context | Package | Loại | Nguồn AO`), là nguồn của R-ctx/R-col.

- [ ] **Step 1: Viết lại 04.**
  - `## Context`: bảng Quyết định 2.
  - Sơ đồ mermaid: thêm node `AO[AO Substrate]`. Mỗi context "mới" nối tới AO bằng nhãn `ACL`. Giữ các cạnh upstream → downstream cũ, đổi tên cho khớp bảng.
  - `## Hợp đồng`: bảng contract cũ, cộng ba hàng: Workflow → Execution (ExecutionRequest qua ACL, AgentRun ↔ AO Session), Execution → Workflow (`change_log` dịch qua ACL thành event), Provider/Budget ↔ AO usage (bọc).
  - `## Luật import`: R1–R4, trỏ tới `backend/internal/archtest/rules.go`.
  - `## Thứ tự ưu tiên nguồn`: Quyết định 4, ghi rõ "Trạng thái: đề xuất, chờ chủ sản phẩm duyệt".
  - `## Chờ quyết`: Scheduling (F-11).
  - Frontmatter đổi thành `version: 0.2`.
- [ ] **Step 2: Chạy** checker. Expected: vi phạm R-ctx chỉ còn ở phía 14 (layout chưa sửa).
- [ ] **Step 3: Commit** `docs(ddd-spec): context map with AO substrate, ACL and source priority`.

### Task 4: Event v1, aggregate, kiến trúc — 05, 06, 14 và luật R4

**Files:** Modify `docs/fork/ddd-spec/{05-event-storming,06-aggregate-design,14-system-architecture}.md`, `backend/internal/archtest/rules.go`, `backend/internal/archtest/rules_test.go`.

**Interfaces:** Consumes bảng `## Context` (Task 3). Produces: bảng `## Sự kiện` (05, có cột cuối "Context sở hữu"), bảng `## Aggregate` (06), dòng `Module layout:` (14).

- [ ] **Step 1: Test R4 cho cdc (Go, RED).** Thêm vào `rules_test.go` hai case:
  - `{"new context importing AO change_log CDC", "m/internal/workflow/application", "m/platform/eventbus/cdc", 1}`
  - `{"acl may import AO change_log CDC", "m/internal/workflow/infrastructure/acl/events", "m/platform/eventbus/cdc", 0}`

  Case cũ `"new context importing platform"` đổi import thành `m/platform/observability` (vẫn 0). Chạy `cd backend && go test ./internal/archtest/` → Expected: FAIL đúng case cdc.
- [ ] **Step 2:** Thêm `"platform/eventbus/cdc"` vào `AOStorePackages` và đổi tên biến thành `AOSubstratePackages`, sửa comment R4 cho khớp. Chạy `go test -count=1 ./internal/archtest/` → PASS (gồm `TestRepoHasNoViolations`).
- [ ] **Step 3: Sửa 05.**
  - `## Sự kiện`: bảng cũ, thêm cột "Context sở hữu" lấy tên từ 04. Ví dụ: SubmitChangeRequest → Task, CompileContext → Context Engineering, ReserveBudget → Budget, ValidateOutput → Quality.
  - `## Event v1`: Quyết định 3, gồm bảng cột của `domain_outbox` (envelope, cộng `dispatched_at`, `attempts`, `last_error`, `dead_at`) và của `consumed_events`.
  - `## AO change_log`: các event_type hiện có, và luật "chỉ qua ACL".
  - Giữ mục Hotspots.
- [ ] **Step 4: Sửa 06.**
  - `## Aggregate`: cột Context dùng tên ở 04 (Domain → Domain Modeling).
  - Thêm hàng Artifact (Artifact, "revision bất biến, gắn node execution") và Task (Task, "một task kích hoạt tối đa một WorkflowRun active").
  - AgentRun ghi "tham chiếu AO Session qua ACL (16 §S4)".
- [ ] **Step 5: Sửa 14.**
  - Mermaid: `DB[(SQLite)]`.
  - Đoạn stack: "Go + React/TypeScript + SQLite (sqlc, goose), FTS5; embedding để sau" (16 §S1).
  - Dòng `Module layout:` liệt kê đúng 16 package của 04, cộng `integrations/…` và `platform/{persistence,eventbus,sandbox,secrets,observability}`.
  - Thêm câu "AO Substrate chạy chung tiến trình; context mới gọi nó qua ACL (04)".
- [ ] **Step 6: Chạy** `node scripts/ddd-spec/check-consistency.mjs`. Expected: `ddd-spec: ok`.
- [ ] **Step 7: Commit** `docs(ddd-spec): event v1, aggregates and SQLite architecture; R4 covers change_log CDC`.

### Task 5: Đóng phase

**Files:** Modify `.github/workflows/ci.yml` (job config: chạy `node scripts/ddd-spec/check-consistency.mjs`), `docs/fork/README.md` (trạng thái + K-hàng cho Quyết định 1–3), `docs/fork/ddd-spec/16-assessment-and-build-plan.md` (S1, S3, S4 đánh dấu "đã xử lý ở P2"), `docs/fork/ddd-spec/README.md` (ghi chú phiên bản 0.2 cho 01/04/05/06/14).

- [ ] **Step 1:** Thêm bước chạy CLI vào job config của `ci.yml`. Chạy `node --test scripts/ci-lanes.test.mjs scripts/ddd-spec/check-consistency.test.mjs` → PASS. Chạy `node scripts/ddd-spec/check-consistency.mjs` → `ddd-spec: ok`.
- [ ] **Step 2:** Sửa README và 16 như mục Files. Thứ tự ưu tiên nguồn ghi "chờ duyệt" cho tới khi chủ sản phẩm trả lời.
- [ ] **Step 3: Chứng minh gate bắt được lỗi.** Tạm thêm "FlowRun" vào 06 → CLI exit 1 → bỏ thay đổi đó.
- [ ] **Step 4: Commit** `docs(fork): close P2 strategic DDD`.
