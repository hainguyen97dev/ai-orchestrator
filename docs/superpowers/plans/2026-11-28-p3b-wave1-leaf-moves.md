# P3b đợt 1 — dời 4 cụm lá (F-08, F-09, F-06, F-10) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dời code AO của bốn cụm lá đầu tiên trong §5 của [17-feature-code-map](../../fork/ddd-spec/17-feature-code-map.md) vào package context của chúng (04). Mỗi cụm một commit, chỉ dời, không đổi logic.

**Architecture:** Dùng `git mv` cả thư mục, rồi sửa import path bằng một script thay chuỗi, rồi `gofmt`. Thư mục cuối giữ nguyên tên package, nên không phải đổi identifier nào. Mỗi commit phải qua `scripts/check-import-only-diff.mjs`, build, test của package dời và package import nó, cộng `internal/archtest`. Cuối đợt chạy `go test ./...` đầy đủ và smoke.

**Tech Stack:** Go, `git mv`, `gofmt`, Node (checker), GitNexus CLI.

**Spec:** `docs/superpowers/specs/2026-11-27-ddd-platform-restructure-design.md` §5.2 (quy tắc dời), §5.5 hàng P3b ("Mỗi cụm một PR dời (§6 [16])… Mỗi PR smoke pass"); thứ tự ở 17 §5; danh sách context ở 04.

## Global Constraints

- "PR dời chỉ dời: `git mv` + sửa import, không đổi logic. Kiểm: `go build ./... && go test ./...`, frontend typecheck, smoke (project → session → worktree → PR)." (spec §5.2.1)
- Trước khi dời: chạy GitNexus `impact` upstream (CLAUDE.md) và kê importer bằng `go list`. Kết quả ghi vào commit body.
- Thư mục đích nằm dưới `backend/internal/<package của context ở 04>`. Thư mục cuối = tên package hiện có.
- Không đổi tên package, identifier, route HTTP hay bảng DB.
- Nhánh `feat/p3b-wave1`, worktree `../aio-p3b`. Push/merge theo quy ước đã có: merge local, kiểm, rồi push `main`.

## Bảng dời

| Cụm | Từ (dưới `backend/`) | Đến | Importer (`go list`) |
|---|---|---|---|
| F-08 | `internal/skillassets` | `internal/skill/skillassets` | 6: `adapters/agent/{hookutil,mimocode,opencode}`, `cli`, `daemon`, `session_manager` |
| F-09 | `internal/artifactversions` | `internal/artifact/artifactversions` | 3 |
| F-09 | `internal/sessionartifacts` | `internal/artifact/sessionartifacts` | 7 |
| F-09 | `internal/attachmentstore` | `internal/artifact/attachmentstore` | 6 |
| F-09 | `internal/observe/artifacts` | `internal/artifact/observe/artifacts` | 1: `daemon` |
| F-06 | `internal/service/project` | `internal/identity/project` | 5: `cli`, `daemon`, `httpd`, `httpd/apispec/specgen`, `httpd/controllers` |
| F-10 | `internal/service/notification` | `internal/notification` | 2: `daemon`, `httpd/controllers` |
| F-10 | `internal/notify` | `internal/notification/notify` | 1: `daemon` |
| F-10 | `internal/push` | `internal/notification/push` | 1: `daemon` |

Ngoài file `.go`, những file sau có nhắc tới các đường dẫn này và được sửa trong cùng commit, chỉ đổi đường dẫn: `docs/backend-code-structure.md`, `docs/documentation-map.md`, `docs/cli/README.md`, `docs/onboarding-recovery-testing.md`, `.github/scripts/contributor-project/data/path-areas.json`, `scripts/feature-map/clusters.json`. Các file lịch sử thì không sửa: `docs/pr-evidence/**`, `docs/superpowers/plans/2026-0*`, `.ao-rescue/**`.

## Review Focus

1. **Lệnh dời mặc định đặt thư mục sai chỗ:** `git mv internal/service/notification internal/notification` chỉ đúng khi `internal/notification` chưa tồn tại. Phải dời `service/notification` **trước**, rồi mới tới `notify` và `push`. Kiểm bằng `ls backend/internal/notification/*.go` có file của package `notification`, cộng hai thư mục con.
2. **Thay chuỗi trùng một phần:** thay `internal/push` có thể dính vào `internal/pushsomething`. Script phải khớp theo ranh giới, tức là ký tự ngay sau là `"` hoặc `/`. Kiểm: `git grep -n 'internal/\(push\|notify\|skillassets\|artifactversions\|sessionartifacts\|attachmentstore\|service/project\|service/notification\|observe/artifacts\)\b' -- backend` sau mỗi commit chỉ được ra đường dẫn mới.
3. **Embed và testdata:** package có `//go:embed` (`skillassets`) hay `testdata/` phải đi cùng thư mục, `git mv` cả thư mục là đủ. Kiểm: test của package đó pass.
4. **Đường dẫn dạng chuỗi trong code:** test hay log có thể tự dựng đường dẫn file nguồn từ chuỗi (ví dụ `runtime.Caller` hoặc `filepath.Join("internal","push")`). `git grep -n '"internal", *"\(push\|notify\|service\)"'` phải trống. Nếu không trống thì sửa chuỗi đó trong cùng commit và ghi Ruling.
5. **Lane CI và feature-map:** `path-areas.json` và `clusters.json` phải trỏ đường dẫn mới. Kiểm: `python3 .github/scripts/contributor-project/scripts/check_areas.py --repo . --ref HEAD` không được có thêm glob chết nào ngoài 8 glob chết đã biết từ trước. `node --test scripts/feature-map/feature-map.test.mjs` phải pass, và `feature-map.mjs` không đưa các package này vào `unassigned`.

---

### Task 1: Công cụ dời `scripts/move-go-package.mjs`

**Files:** Create `scripts/move-go-package.mjs`, `scripts/move-go-package.test.mjs`. Modify `.github/workflows/ci.yml` (thêm test vào dòng `node --test` của job config).

**Interfaces:**
- Produces: `rewrite(text: string, moves: [from: string, to: string][]): string`. Hàm thay mọi lần xuất hiện của `<from>` mà ký tự ngay sau là `"`, `/`, `` ` ``, khoảng trắng hoặc hết dòng, và ký tự ngay trước không phải `[\w.-]`. `from`/`to` là đường dẫn tương đối dưới `backend/`, ví dụ `internal/push`. Với nhiều cặp: thay cặp có `from` dài hơn trước, và mỗi vị trí chỉ được thay một lần (không thay dây chuyền).
- CLI: `node scripts/move-go-package.mjs <from> <to> [<from> <to>...]`. Lệnh chạy `git mv backend/<from> backend/<to>` theo đúng thứ tự tham số (tạo thư mục cha nếu thiếu), rồi chạy `rewrite` trên mọi file git đang track có đuôi `.go|.md|.json|.yml|.yaml|.mjs|.sql` (trừ các đường dẫn lịch sử ở mục "Bảng dời"), rồi `gofmt -w` các file `.go` đã đổi. In ra số file đã đổi.

- [ ] **Step 1: Test fail** (`node:test`):

```js
test('rewrites import paths on a boundary only', () => {
  assert.equal(rewrite('"m/backend/internal/push"\n"m/backend/internal/pushx"', [['internal/push', 'internal/notification/push']]),
    '"m/backend/internal/notification/push"\n"m/backend/internal/pushx"');
});
test('rewrites subpaths and doc paths', () => {
  assert.equal(rewrite('see backend/internal/push/server.go', [['internal/push', 'internal/notification/push']]),
    'see backend/internal/notification/push/server.go');
});
test('longer source wins and no chained rewrite', () => {
  const moves = [['internal/service/notification', 'internal/notification'], ['internal/notify', 'internal/notification/notify']];
  assert.equal(rewrite('"x/internal/service/notification" "x/internal/notify"', moves),
    '"x/internal/notification" "x/internal/notification/notify"');
});
test('does not touch a lookalike prefix', () => {
  assert.equal(rewrite('"x/internal/observe/artifactsx"', [['internal/observe/artifacts', 'internal/artifact/observe/artifacts']]), '"x/internal/observe/artifactsx"');
});
```

- [ ] **Step 2:** Chạy `node --test scripts/move-go-package.test.mjs`. Expected: FAIL (không tìm thấy module).
- [ ] **Step 3:** Viết `move-go-package.mjs`. Guard phần CLI bằng `realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))`, kết thúc bằng `process.exitCode`.
- [ ] **Step 4:** Chạy lại → PASS. Thêm vào CI. Chạy `node --test scripts/ci-lanes.test.mjs` → PASS.
- [ ] **Step 5: Commit** `chore(scripts): move-go-package helper for P3b moves`.

### Task 2–5: Mỗi cụm một commit

Mỗi task dời một cụm, theo thứ tự **F-08 → F-09 → F-06 → F-10**, các bước giống nhau. Cặp `<from> <to>` lấy từ "Bảng dời", đúng thứ tự trong bảng (F-10: `service/notification` trước).

- [ ] **Step 1: Đo trước.** Chạy `go list` để kê importer, so với bảng. Chạy `npx gitnexus impact <constructor chính> --direction upstream --repo ai-orchestrator --summary-only`. Constructor theo cụm:
  - F-08: `skillassets.Install`, hoặc hàm export đầu tiên nếu không có hàm này.
  - F-09: `sessionartifacts.New`.
  - F-06: `project.NewService`, hoặc constructor export có thật.
  - F-10: `notification.NewService`, hoặc constructor export có thật.

  Ghi risk và số impacted vào ledger. Nếu risk là HIGH/CRITICAL thì vẫn dời (chỉ dời, không đổi logic), nhưng ghi lại để nêu trong commit body.
- [ ] **Step 2: Dời.** Chạy `node scripts/move-go-package.mjs <from> <to>...`.
- [ ] **Step 3: Build.** Chạy `cd backend && go build ./... && go vet ./<to>/... && go test -count=1 ./<to>/... <importer>... ./internal/archtest/`. Expected: PASS.
- [ ] **Step 4: Còn sót.** Chạy lệnh `git grep` ở Review Focus 2 và 4. Expected: không còn đường dẫn cũ, trừ trong các file lịch sử.
- [ ] **Step 5: Commit.** Message `refactor(<context>): move <cụm> into internal/<context> (import-only)`. Body ghi danh sách importer và risk GitNexus.
- [ ] **Step 6: Kiểm import-only.** Chạy `node scripts/check-import-only-diff.mjs HEAD~1 HEAD`. Expected: `import-only: ok`.

### Task 6: Đóng đợt

**Files:** Modify `docs/fork/ddd-spec/17-feature-code-map.md` (§5: đánh dấu 1–4 "đã dời, P3b đợt 1"), `docs/fork/README.md` (trạng thái).

- [ ] **Step 1:** Chạy `cd backend && go test ./... > <workspace>/full.txt 2>&1`. Expected: chỉ fail ở các test đã biết fail từ trước (`modelcatalog`, `tmux`, flake codex khi máy tải nặng). Fail mới nào cũng chặn đóng đợt.
- [ ] **Step 2:** Chạy `cd backend && go test -count=1 -run TestSmokeProjectSessionWorktreeDiff ./e2e/` → PASS. Chạy `cd frontend && npm run typecheck` → PASS.
- [ ] **Step 3:** Chạy `python3 .github/scripts/contributor-project/scripts/check_areas.py --repo . --ref HEAD` và `node scripts/feature-map/feature-map.mjs`. Expected như Review Focus 5.
- [ ] **Step 4:** Chạy `npx gitnexus detect-changes --scope compare --base-ref main --repo ai-orchestrator`. Các flow bị ảnh hưởng chỉ được là import, không có symbol nào đổi.
- [ ] **Step 5:** Sửa doc 17 §5 và README. Chạy `node scripts/ddd-spec/check-consistency.mjs` → ok. Commit `docs(fork): P3b wave 1 moved (F-08, F-09, F-06, F-10)`.
