# P1 — Bản đồ tính năng ↔ code + cổng nhận — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mỗi cụm tính năng AO trong bảng §3 của [16] có một dòng bằng chứng (route HTTP, route UI, package, bảng DB, bao đóng phụ thuộc, test) và một quyết định Giữ/Bọc/Ẩn→Xoá có điều kiện kiểm được; `ai-orchestra` được bỏ.

**Architecture:** Lane L-doc, chỉ sửa `docs/`. Số liệu thô sinh bằng một script đọc-only (`scripts/feature-map/`) để chạy lại được ở các phase sau; tài liệu `17-feature-code-map.md` là kết quả đã duyệt, không sinh tự động.

**Tech Stack:** Node ≥ 22 (`.mjs`, `node --test`), `go list`, GitNexus CLI (`.gitnexus/run.cjs`, index đã có ở commit `85bbbfaab5`), OpenAPI `backend/internal/httpd/apispec/openapi.yaml`, TanStack routes `frontend/src/renderer/routes/`.

**Spec:** `docs/superpowers/specs/2026-11-27-ddd-platform-restructure-design.md` (§5.5 P1), `docs/fork/ddd-spec/16-assessment-and-build-plan.md` (§3, §6), `docs/fork/ddd-spec/02-domain-discovery.md` (Deliverable).

## Global Constraints

- Không đánh dấu feature đã có nếu chưa đọc code (02). Mỗi ô ghi `observed` / `inferred` / `unknown`.
- Hành động chỉ một trong: **Giữ** · **Bọc** · **Ẩn→Xoá** · **Mới** (16 §3).
- Danh sách cắt đã chốt (K5): mobile/LAN, device, cloud/sharing/WorkOS, importer ngoài Claude + Codex, telemetry gửi ra ngoài. Không mở lại.
- Không sửa code ngoài `scripts/feature-map/` và `docs/`.
- Đã xác nhận khi viết plan: `git rev-parse bb18b82^{tree}` = `ai-orchestra` HEAD tree = `433927439a1f…`. `ai-orchestra` chỉ còn thay đổi chưa commit ở `AGENTS.md`, `CLAUDE.md`, `.claude/skills/gitnexus-*` (không phải code).

## Review Focus

- Route HTTP thuộc nhiều cụm (vd. `/api/v1/sessions/{id}/pr/*` vừa Session vừa Quality) → script phải gán theo prefix dài nhất và liệt kê route không khớp cụm nào ở mục "Chưa gán", không âm thầm bỏ.
- Package xuất hiện ở hai cụm → bảng ghi cụm chính + "dùng chung", không đếm dòng hai lần.
- Bao đóng phụ thuộc chỉ tính package trong module (`internal/`, `pkg/`), không tính stdlib/3rd-party.
- Route UI không gọi API trực tiếp (gọi qua hook) → ghi `inferred` kèm file hook, không ghi `observed`.
- Cụm "Mới" không có code → các cột code để `—`, không bịa package.

---

### Task 1: Script số liệu thô

**Files:**
- Create: `scripts/feature-map/clusters.json` — định nghĩa cụm: `{ id, name, packages: [glob], httpPrefixes: [string], uiRoutes: [glob], tables: [string] }`, nội dung lấy từ bảng §3 [16] (23 dòng, giữ thứ tự).
- Create: `scripts/feature-map/feature-map.mjs`
- Test: `scripts/feature-map/feature-map.test.mjs`

**Interfaces:**
- Produces: `node scripts/feature-map/feature-map.mjs > docs/fork/ddd-spec/_feature-map-raw.json` với mỗi cụm: `{ id, packages: [{path, loc}], closure: {packages, loc}, httpRoutes: [string], uiRoutes: [string], tables: [string], tests: {go: n, ts: n} }` và mảng `unassigned: { httpRoutes, packages }`.
- Hàm xuất: `assignRoutes(routes: string[], clusters): Map<clusterId, string[]>` (prefix dài nhất thắng); `closureLoc(pkg: string, deps: Map<string,string[]>, loc: Map<string,number>): {packages:number, loc:number}`.

- [ ] **Step 1: Viết test thất bại** — `assignRoutes`: với cụm A prefix `/api/v1/sessions`, B prefix `/api/v1/sessions/{sessionId}/pr`, route `/api/v1/sessions/{sessionId}/pr/{prNumber}/files` → B; `/api/v1/devices` không khớp → nằm trong `unassigned`. `closureLoc` trên đồ thị `a→b, b→c, a→c` với loc `{a:10,b:20,c:30}` → `{packages:3, loc:60}` (không đếm trùng c).
- [ ] **Step 2:** `node --test scripts/feature-map/` → FAIL (module chưa có).
- [ ] **Step 3: Implement** — route lấy từ key cấp 1 dưới `paths:` của openapi.yaml (đọc bằng regex `^  (/api/[^:]+):`, không thêm dependency YAML); deps từ `go list -deps -f '{{.ImportPath}} {{join .Imports " "}}' ./...` chạy trong `backend/`; loc = tổng dòng file `.go` không `_test.go` trong thư mục package; bảng DB từ `CREATE TABLE` trong `backend/internal/storage/sqlite/migrations/*.sql` khớp `tables` của cụm; test đếm `*_test.go` trong package và `*.test.ts(x)` khớp `uiRoutes`.
- [ ] **Step 4:** `node --test scripts/feature-map/` → PASS; chạy script thật, kiểm `jq '.clusters|length'` = 23 và `unassigned.httpRoutes` là mảng (có thể khác rỗng).
- [ ] **Step 5: Commit** `docs(fork): add read-only feature map script`.

### Task 2: GitNexus impact cho các cụm cắt/bọc

**Files:**
- Create: `docs/fork/ddd-spec/_gitnexus-impact.md` (ghi chú thô, sẽ gộp vào 17)

**Interfaces:**
- Consumes: danh sách cụm hành động Ẩn→Xoá và Bọc từ `clusters.json`.

- [ ] **Step 1:** Kiểm index còn khớp: `.gitnexus/meta.json` → `lastCommit` = `git rev-parse HEAD`; lệch thì `npx gitnexus analyze --index-only` từ main checkout.
- [ ] **Step 2:** Với mỗi cụm Ẩn→Xoá (cloud, devices, mobilebridge, sessionimport ngoài claude/codex, telemetry remote) và Bọc (agentaccounts, usage, review/pr, skills): chạy `npx gitnexus impact <Symbol> --direction upstream --repo ai-orchestrator` trên 1–3 symbol entry chính (constructor/handler đăng ký route), ghi: số caller upstream, package ngoài cụm bị chạm, route HTTP liên quan, `risk`. Caller rỗng / `risk: UNKNOWN` không phải bằng chứng code chết — xác nhận lại bằng `grep`.
- [ ] **Step 3:** Mỗi cụm một mục ≤ 6 dòng; package ngoài cụm bị chạm là input cho PR cắt ở P3b.
- [ ] **Step 4: Commit** `docs(fork): record gitnexus impact for cut/wrap clusters`.

### Task 3: `17-feature-code-map.md` + cổng nhận

**Files:**
- Create: `docs/fork/ddd-spec/17-feature-code-map.md`
- Modify: `docs/fork/ddd-spec/README.md` (thêm `[[17-feature-code-map]]`)
- Modify: `docs/fork/ddd-spec/02-domain-discovery.md` (mục Deliverable trỏ sang 17; câu hỏi mở "Runtime hiện tại hỗ trợ resume không?" trả lời bằng bằng chứng `e2e/chat_approval_restart_stub_test.go`)
- Delete: `docs/fork/ddd-spec/_feature-map-raw.json`, `_gitnexus-impact.md` sau khi gộp (script vẫn chạy lại được)

- [ ] **Step 1:** Mục "Cổng nhận" — một tính năng AO **được nhận** khi đủ cả ba: (a) có bounded context đích trong layout §5.1; (b) có mục điều hướng đích trong 11 mục (Overview, Projects, Domains, Knowledge, Workflows, Agents, Tasks, Terminals, Skills, Providers, Analytics) hoặc ghi rõ "không UI"; (c) smoke P3a (`TestSmokeProjectSessionWorktreeDiff`) pass sau PR chạm vào nó. Tính năng không qua (a)+(b) → Ẩn→Xoá.
- [ ] **Step 2:** Bảng chính, cột theo 02: `ID | Cụm | Nguồn (observed/inferred/unknown) | Package (dòng) | Bao đóng | Route HTTP (số + ví dụ) | Route UI | Bảng DB | Test | BC đích | Mục UI | Hành động | Điều kiện xong | Rủi ro`. ID dạng `F-01…F-23` theo thứ tự §3.
- [ ] **Step 3:** Mục "Chưa gán": mọi route/package trong `unassigned` của script, mỗi cái một quyết định (gán cụm nào, hoặc Ẩn→Xoá).
- [ ] **Step 4:** Mục "Thứ tự dời P3b" (16 §8 để lại cho plan): sắp các cụm Giữ/Bọc theo bao đóng tăng dần, lá trước (budget, provider, quality…), execution cuối. Ghi số package ngoài cụm bị chạm (từ Task 2).
- [ ] **Step 5:** Mục "ai-orchestra": ghi bằng chứng tree trùng (Global Constraints) và đề xuất xoá thư mục workspace `../ai-orchestra` sau khi chủ sản phẩm duyệt (thay đổi chưa commit chỉ là AGENTS/CLAUDE/skills, đã có bản tương đương trong `ai-orchestrator` ở #12).
- [ ] **Step 6:** Kiểm: `grep -c '^| F-' docs/fork/ddd-spec/17-feature-code-map.md` = 23; không ô "Hành động" nào trống; mỗi cụm Ẩn→Xoá có trong K5 hoặc có lý do.
- [ ] **Step 7: Commit + PR** `docs(fork): P1 feature-code map and acceptance gate` — cần chủ sản phẩm duyệt (đổi quyết định tính năng).

### Task 4: Bỏ `ai-orchestra` (sau khi PR Task 3 được duyệt)

- [ ] **Step 1:** Chủ sản phẩm xác nhận trong PR.
- [ ] **Step 2:** `mv ../ai-orchestra ../archive/2026-11-27/ai-orchestra` (giữ một bản ngoài repo thay vì `rm -rf`; xoá hẳn khi chủ sản phẩm muốn).
- [ ] **Step 3:** Sửa `docs/fork/README.md` mục Trạng thái: "P1 xong; `ai-orchestra` đã bỏ". Commit `docs(fork): mark P1 done`.
