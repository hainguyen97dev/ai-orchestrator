# P3a — Dời khung (smoke, module path, cmd/platform, sharedkernel) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `backend/` có khung layout đích (`cmd/server`, `internal/sharedkernel`, `platform/persistence`, `platform/eventbus`), module path của fork, test kiến trúc chặn import sai hướng, và smoke tự động chạy trong CI — app vẫn chạy được sau mỗi PR.

**Architecture:** Lane **L0, độc quyền** (chỉ L-doc chạy song song). Mỗi task = một PR. Hai PR lớn (module path, sharedkernel) chỉ chứa dòng import/package path, có script CI chứng minh. Tên package Go **giữ nguyên** khi dời (vd. thư mục `internal/sharedkernel/domain` vẫn `package domain`) để không phải đổi identifier nào.

**Tech Stack:** Go 1.27.4 (`go.work` dùng `./backend`), sqlc v1.31.1, `goimports`, Node `.mjs` + `node --test`, GitHub Actions `.github/workflows/go.yml`.

**Spec:** `docs/superpowers/specs/2026-11-27-ddd-platform-restructure-design.md` (§5.1, §5.2, §5.4, §6 lane L0), bảng map §6 trong `docs/fork/ddd-spec/16-assessment-and-build-plan.md`.

## Global Constraints

- PR dời chỉ dời: `git mv` + sửa import, không đổi logic.
- Module path mới: `github.com/hainguyen97dev/ai-orchestrator/backend` (K7).
- Không sửa migration đã merge; dời cả thư mục `storage/sqlite` (kèm `migrations/`) giữ nguyên tên file. Không gom migration ra gốc. Cập nhật `sqlc.yaml` cùng PR.
- Không sửa tay file generated (`internal/storage/sqlite/gen`, `frontend/src/api/schema.ts`); chạy `npm run sqlc && npm run api`, CI kiểm `git diff --exit-code`.
- Mọi PR P3a cần chủ sản phẩm duyệt trước khi merge.
- Trước mỗi PR dời: `npx gitnexus impact <Symbol> --direction upstream --repo ai-orchestrator` cho package bị dời và `npx gitnexus detect-changes --scope compare --base-ref main --repo ai-orchestrator`; dán kết quả (ngắn) vào PR.
- Kiểm chuẩn mỗi PR ("**gate**"): `cd backend && go build ./... && go vet ./... && go test ./...`; `cd frontend && npm run typecheck`; `npm run sqlc && npm run api && git diff --exit-code`; smoke Task 1 pass.

## Review Focus

- `-ldflags -X <pkg>.Var=…` dùng đường dẫn package dạng chuỗi (`frontend/scripts/build-daemon.mjs:55,96`, `test/cli/Dockerfile:28`): đổi path mà quên chỗ này thì build vẫn xanh nhưng `ao version` in "dev". Task 3 thêm test kiểm `ao version` của binary build bằng script.
- Đường dẫn package dạng chuỗi trong CI/script (`go.yml:50,71,140-141`, `scripts/create-migration.mjs:5`, `scripts/ci-sharding.test.mjs`, `.github/scripts/contributor-project/data/path-areas.json`): sau Task 5 phải `grep -rn 'internal/storage/sqlite' .github scripts frontend/scripts package.json` ra rỗng.
- `//go:embed migrations/*.sql` tương đối theo package: Task 5 kiểm số migration embed sau dời bằng test có sẵn `migrate_burned_versions_test.go` + đếm `ls migrations/*.sql | wc -l` = 269.
- `sqlc.yaml` `overrides.go_type.import` trỏ `internal/domain` (79 dòng): Task 4 đổi sang `internal/sharedkernel/domain`, rồi `npm run sqlc` phải ra diff chỉ ở import của `gen/`.
- `go run .` trong `backend/` (wrapper `backend/main.go`) được script/dev dùng: sau Task 6 `go run ./cmd/server` thay thế; `grep -rn 'go run \.' scripts frontend/scripts package.json docs/*.md AGENTS.md` để sửa theo.

---

### Task 1: Smoke tự động trên harness stub

**Files:**
- Create: `backend/e2e/smoke_stub_test.go`
- CI: không cần sửa — `./e2e` đã nằm trong `go list ./...` của job test sharded (`go.yml:50`), test stub không bị gate `AO_CHAT_E2E`.

**Interfaces:**
- Consumes: helper có sẵn trong `backend/e2e/harness_test.go`: `startDaemon`, `seedProject`, `setPermissions`, `spawn`, `(*daemon).awaitConversation`, `(*daemon).mustCall`; mẫu shim `opencode` + fake ACP trong `chat_approval_restart_stub_test.go`.
- Produces: `TestSmokeProjectSessionWorktreeDiff` — tên này là "smoke P3a" mà P1 và các phase sau tham chiếu.

- [ ] **Step 1: Viết test**
  - `TestFakeSmokeACP` (chạy khi `AO_E2E_FAKE_SMOKE_ACP=1`): trả `initialize`, `session/new`; khi nhận `session/prompt` thì ghi file `SMOKE.md` nội dung `smoke\n` vào `params.cwd` của `session/new`, gửi một `agent_message_chunk` "done", rồi `end_turn`.
  - `TestSmokeProjectSessionWorktreeDiff`: shim `opencode` như test restart nhưng gọi `-test.run='^TestFakeSmokeACP$'`; `startDaemon` → `seedProject(t, d, "smoke")` → `setPermissions(..., "default")` → `spawn` `{kind:"worker", harness:"opencode", mode:"chat", prompt:"write SMOKE.md"}` → `awaitConversation` tới turn `completed` (30s).
  - Assert 1: đường dẫn workspace của session (field `workspacePath` trong `GET /sessions/{id}`) khác thư mục repo của project, và `git -C <workspacePath> rev-parse --git-common-dir` trỏ vào `.git` của repo project (tức là worktree).
  - Assert 2: `POST /sessions/{id}/workspace/diffs` (body theo schema `WorkspaceDiffRequest`) trả danh sách file có `SMOKE.md`.
  - Cuối test: `POST /sessions/{id}/kill` → 200.
- [ ] **Step 2:** `cd backend && go test ./e2e -run TestSmokeProjectSessionWorktreeDiff -v -timeout 5m` → nếu một assert FAIL vì field/route khác tên, sửa theo `openapi.yaml` (không đổi daemon). PASS khi chạy.
- [ ] **Step 3:** Kiểm test không cần account thật: chạy với `PATH` không có `claude`/`codex` vẫn PASS.
- [ ] **Step 4:** Ghi vào `docs/fork/README.md` mục Quy tắc thường trực: "Smoke = `go test ./e2e -run TestSmokeProjectSessionWorktreeDiff`; bước PR làm tay một lần mỗi phase".
- [ ] **Step 5: Commit + PR** `test(e2e): stub-harness smoke project→session→worktree→diff`.

> Rủi ro đã biết: smoke dùng harness `opencode`, trong khi K5/§3 thu hẹp harness về Claude + Codex. Khi L1 cắt harness, phải giữ `opencode` (chỉ cho test) hoặc chuyển smoke sang fake Codex trước — ghi vào `docs/fork/devendor-log.md` ngay ở PR này.

### Task 2: Script kiểm "diff chỉ gồm import"

**Files:**
- Create: `scripts/check-import-only-diff.mjs`
- Test: `scripts/check-import-only-diff.test.mjs`
- Modify: `.github/workflows/go.yml` — job chạy `node scripts/check-import-only-diff.mjs origin/main` **chỉ khi** PR có label `import-only`.

**Interfaces:**
- Produces: CLI `node scripts/check-import-only-diff.mjs <baseRef>` → exit 0 nếu hợp lệ, exit 1 và in `file:line` của từng dòng vi phạm. Hàm xuất `classifyHunkLine(line: string, file: string): "ok" | "violation"`.

- [ ] **Step 1: Viết test thất bại** — `ok`: dòng `+\t"github.com/x/backend/internal/sharedkernel/domain"`, `-\t"github.com/aoagents/.../internal/domain"`, dòng `import "…"` một dòng, dòng `module …` trong `go.mod`, dòng chứa chuỗi module path trong `.yaml`/`.yml`/`.mjs`/`Dockerfile`/`.json`, dòng rỗng, file rename 100% (`R100`), mọi dòng trong file generated (header `// Code generated … DO NOT EDIT.`). `violation`: `+\tx := 1`, đổi tên identifier `domain.Session` → `sharedkernel.Session`, dòng `package foo` đổi tên.
- [ ] **Step 2:** `node --test scripts/check-import-only-diff.test.mjs` → FAIL.
- [ ] **Step 3: Implement** — đọc `git diff -M100% --unified=0 <base>...HEAD`; dòng import Go nhận diện theo trạng thái "đang trong khối `import (`"; chuỗi module path cũ/mới là hằng trong script.
- [ ] **Step 4:** Test PASS; chạy thử trên `HEAD~1` của chính PR này → exit 1 (vì có code mới), đúng kỳ vọng.
- [ ] **Step 5: Commit + PR** `ci: add import-only diff check for move PRs`.

### Task 3: Đổi module path (PR `import-only`)

**Files:**
- Modify: `backend/go.mod` (dòng `module`), mọi `*.go` trong `backend/` (2.358 file import module), `backend/sqlc.yaml`, `frontend/scripts/build-daemon.mjs:55,96`, `test/cli/Dockerfile:28`, generated `backend/internal/storage/sqlite/gen/*` (qua `npm run sqlc`).
- Không sửa: `frontend/src/renderer/lib/chat-fixture.ts` (chuỗi trong fixture hiển thị, không phải import).
- Test: `frontend/scripts/build-daemon.test.mjs` (tạo nếu chưa có)

- [ ] **Step 1: Viết test thất bại** — build bằng `node frontend/scripts/build-daemon.mjs`, chạy `<out>/ao version`, assert output chứa version của `frontend/package.json` (không phải `dev`).
- [ ] **Step 2:** `cd backend && go mod edit -module github.com/hainguyen97dev/ai-orchestrator/backend`, thay chuỗi trong `*.go` bằng `perl -pi -e` giới hạn trong chuỗi import, rồi `goimports -w` chỉ để sắp xếp nhóm import. Sửa 3 file chuỗi ở trên. `npm run sqlc && npm run api`.
- [ ] **Step 3:** `grep -rn 'aoagents/agent-orchestrator/backend' --include='*.go' --include='*.mjs' --include='*.yaml' --include='Dockerfile' . | grep -v node_modules` → rỗng.
- [ ] **Step 4:** gate + test Step 1 PASS + `node scripts/check-import-only-diff.mjs origin/main` exit 0.
- [ ] **Step 5: Commit + PR** (label `import-only`) `refactor: change Go module path to hainguyen97dev fork`.

### Task 4: `internal/domain` + `internal/ports` → `internal/sharedkernel/` (PR `import-only`)

**Files:**
- Move: `backend/internal/domain` → `backend/internal/sharedkernel/domain` (giữ `package domain`)
- Move: `backend/internal/ports` → `backend/internal/sharedkernel/ports` (giữ `package ports`)
- Modify: import trong ~175 + ~157 package; `backend/sqlc.yaml` (`go_type.import`); generated `gen/`.
- Create: `backend/internal/sharedkernel/doc.go` — chú thích một đoạn: shared kernel tạm thời; type chỉ rời đi theo quy tắc alias §5.2.3; không thêm type mới vào đây.

- [ ] **Step 1:** `npx gitnexus impact` cho 2 package → dán vào PR.
- [ ] **Step 2:** `git mv` hai thư mục; sửa import bằng `perl -pi` (`/internal/domain"` → `/internal/sharedkernel/domain"`, tương tự `ports`, khớp cả sub-package nếu có); `npm run sqlc`.
- [ ] **Step 3:** gate + `check-import-only-diff` exit 0 (`doc.go` là file mới duy nhất ngoài import — ghi ở mục "Out-of-plan files" của PR hoặc tách thành commit riêng sau khi PR import-only merge; chọn tách).
- [ ] **Step 4: Commit + PR** (label `import-only`) `refactor: move domain and ports into internal/sharedkernel`.

### Task 5: `storage/sqlite` → `platform/persistence/sqlite`

**Files:**
- Move: `backend/internal/storage/sqlite` → `backend/platform/persistence/sqlite` (kèm `migrations/`, `queries/`, `gen/`, `store/`; giữ tên package)
- Modify: `backend/sqlc.yaml` (`schema`, `queries`, `out`), `.github/workflows/go.yml:50,71,140,141`, `scripts/create-migration.mjs:5` + `scripts/create-migration.test.mjs`, `scripts/ci-sharding.test.mjs:58,126`, `.github/scripts/contributor-project/data/path-areas.json`, `AGENTS.md` (mục migration/command nếu nhắc path cũ), `docs/fork/README.md` (hotspot migration path).

- [ ] **Step 1:** Đếm trước: `ls backend/internal/storage/sqlite/migrations/*.sql | wc -l` → ghi số (kỳ vọng 269).
- [ ] **Step 2:** `git mv`; sửa import + chuỗi đường dẫn ở các file trên; `npm run sqlc`.
- [ ] **Step 3:** Cùng số migration ở vị trí mới; `go test ./platform/persistence/sqlite/... -run 'Migrat|Burned'` PASS; `node --test scripts/create-migration.test.mjs scripts/ci-sharding.test.mjs` PASS; `grep -rn 'internal/storage/sqlite' .github scripts frontend/scripts package.json AGENTS.md` rỗng.
- [ ] **Step 4:** gate.
- [ ] **Step 5: Commit + PR** `refactor: move sqlite storage to platform/persistence`. (Có sửa chuỗi trong `.mjs`/`.json`/`.yml` nên không gắn `import-only`; reviewer kiểm tay các file không phải `.go`.)

### Task 6: `cdc` → `platform/eventbus/cdc`, `backend/main.go` → `cmd/server`

**Files:**
- Move: `backend/internal/cdc` → `backend/platform/eventbus/cdc` (giữ `package cdc`; thư mục con `cdc` để tên import khớp tên package)
- Move: `backend/main.go` → `backend/cmd/server/main.go` (nội dung giữ nguyên, vẫn gọi `daemon.Run("")`)
- Không dời: `internal/daemon` — `internal/cli` import nó cho lệnh `ao daemon`, và binary đóng gói build từ `./cmd/ao`. `cmd/server` chỉ là entrypoint daemon riêng thay `go run .`. (Quyết định của người viết plan; ghi vào bảng §6 [16] ở PR này.)
- Modify: mọi chỗ dùng `go run .` trong `backend/` (xem Review Focus).

- [ ] **Step 1:** `npx gitnexus impact` cho `cdc`.
- [ ] **Step 2:** `git mv` + sửa import; sửa `go run .` → `go run ./cmd/server`.
- [ ] **Step 3:** `cd backend && go build ./cmd/server && go build ./cmd/ao`; gate.
- [ ] **Step 4: Commit + PR** `refactor: move cdc to platform/eventbus and daemon entry to cmd/server`.

### Task 7: Test kiến trúc

**Files:**
- Create: `backend/internal/archtest/rules.go` — `package archtest`
- Test: `backend/internal/archtest/rules_test.go`, `backend/internal/archtest/repo_test.go`

**Interfaces:**
- Produces:
  - `type Pkg struct { Path string; Imports []string }`
  - `func Violations(module string, pkgs []Pkg) []string` — mỗi phần tử dạng `"<importer> -> <imported>: <rule>"`.
  - Hằng `NewContexts = []string{"domainmodel", "knowledge", "context", "workflow", "budget"}` (theo §5.1 "mới, 4 tầng"; `budget` được bổ sung khi BC đó có code mới).
- Luật (prefix tính từ `<module>/`):
  - **R1** `internal/<new>/**` chỉ được import: chính `internal/<new>/**`, `platform/**`, `integrations/**`, stdlib, module ngoài. Riêng `internal/<new>/infrastructure/acl/**` được import thêm mọi `internal/**` và `pkg/**` của AO.
  - **R2** `platform/**` và `integrations/**` không import `internal/<new>/**`.
  - **R3** không package nào ngoài `internal/<new>/**` import `internal/<new>/**/infrastructure/acl/**`.
  - Import giữa hai context mới bị cấm ở v1 (giao tiếp qua ID/DTO/event sẽ định ở P2) — người viết plan quyết, ghi vào `docs/fork/README.md`.

- [ ] **Step 1: Viết test thất bại** (`rules_test.go`, dữ liệu giả, module `m`):
  - `m/internal/workflow/application` → `m/internal/sharedkernel/domain` ⇒ 1 vi phạm R1.
  - `m/internal/workflow/infrastructure/acl` → `m/internal/service/session` ⇒ 0.
  - `m/internal/workflow/domain` → `m/internal/knowledge/domain` ⇒ 1 vi phạm R1.
  - `m/platform/persistence/sqlite` → `m/internal/knowledge/domain` ⇒ 1 vi phạm R2.
  - `m/internal/service/session` → `m/internal/workflow/infrastructure/acl` ⇒ 1 vi phạm R3.
  - `m/platform/persistence/sqlite` → `m/internal/sharedkernel/domain` ⇒ 0 (AO cũ trong platform tạm được import AO).
- [ ] **Step 2:** `go test ./internal/archtest -run TestViolations` → FAIL.
- [ ] **Step 3: Implement `Violations`.**
- [ ] **Step 4:** `repo_test.go`: `TestRepoHasNoViolations` chạy `go list -json ./...` từ thư mục `backend/`, dựng `[]Pkg`, assert `Violations` rỗng (hiện chưa có context mới nên rỗng; test là hàng rào cho P4+). Chạy trong `go test ./...` nên CI có sẵn.
- [ ] **Step 5:** gate. **Commit + PR** `test: add architecture import rules for bounded contexts`.

### Task 8: Đóng phase

- [ ] **Step 1:** Cập nhật `docs/fork/README.md` mục Trạng thái (P3a xong, đường dẫn mới của hotspot: `backend/platform/persistence/sqlite/migrations/*`, `cmd/server`), bảng §6 trong `docs/fork/ddd-spec/16-assessment-and-build-plan.md` đánh dấu dòng đã dời.
- [ ] **Step 2:** Bước PR thủ công một lần: chạy app dev (`npm run dev` trong `frontend/`, data dir riêng `AO_DATA_DIR=~/.ao/fork-test` để không đụng AO đã cài; bản build fork-test chỉ có trong `git stash` / `../archive/2026-11-27/main-worktree-fork-test-build.patch`, chưa merge), mở project → session → worktree → mở PR thật; ghi kết quả vào PR đóng phase.
- [ ] **Step 3:** `npx gitnexus analyze --index-only` từ main checkout.
- [ ] **Step 4: Commit + PR** `docs(fork): mark P3a done`.
