# P3b đợt 3: dời F-05, F-01 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dời code AO của F-05 (PR, CI, review) vào `internal/quality` và F-01 (session, worktree, lifecycle) vào `internal/workspace` + `internal/execution` ([04](../../fork/ddd-spec/04-bounded-context-map.md)). Chỉ dời, không đổi logic.

**Architecture:** Giống đợt 1 và 2 ([wave1](2026-11-28-p3b-wave1-leaf-moves.md), [wave2](2026-11-28-p3b-wave2-moves.md)). Dời bằng `scripts/move-go-package.mjs`. Mỗi commit dời phải qua `scripts/check-import-only-diff.mjs`.

**Tech Stack:** Go, Node, GitNexus CLI.

**Spec:** `docs/superpowers/specs/2026-11-27-ddd-platform-restructure-design.md` §5.2, §5.5 hàng P3b; thứ tự ở 17 §5; danh sách package của từng cụm ở `scripts/feature-map/clusters.json`.

## Global Constraints

Như đợt 1:
- Thư mục cuối giữ tên package.
- Không đổi identifier, route hay bảng.
- Chạy GitNexus `impact` trước khi dời.
- Không commit `go.work.sum`.

Làm trên nhánh `feat/p3b-wave3`, worktree `../aio-p3b3`.

## Quyết định của đợt này

- **F-19 systeminstall không dời.** `clusters.json` và 17 §2 ghi BC đích là "—": không có context nào trong 04 nhận nó. Nó ở lại AO Substrate ("giữ tối thiểu cho harness install"). Ghi vào 17 §5.
- **F-02 sang đợt 4, sau L1.** 17 §3 ghi rằng harness ngoài Claude/Codex/Gemini bị xoá ở L1, phần còn lại dời vào `integrations/*`. Dời 99 package trước rồi xoá phần lớn sau là làm hai lần. Đợt này F-01 dời một mình; `agentlaunch`, `service/agent`, `service/chat`, `terminal` vẫn nằm ở Substrate.
- **Tên trùng `review`:** `internal/review` và `internal/service/review` đều là package `review`. Xử lý: `internal/review` → `internal/quality/review`, `internal/service/review` → `internal/quality/service/review`. Vẫn giữ quy ước tên thư mục cuối trùng tên package.
- **`session_manager`** (package `sessionmanager`) giữ nguyên tên thư mục `session_manager`, vì dời không được đổi tên.

## Bảng dời (thứ tự chạy)

| Cụm | Từ (dưới `backend/`) | Đến |
|---|---|---|
| F-05 | `internal/service/pr`, `internal/service/prpreview`, `internal/service/githubpat` | `internal/quality/{pr,prpreview,githubpat}` |
| F-05 | `internal/review` | `internal/quality/review` |
| F-05 | `internal/service/review` | `internal/quality/service/review` |
| F-05 | `internal/autoreview`, `internal/reviewgateway` | `internal/quality/{autoreview,reviewgateway}` |
| F-05 | `internal/observe/scm` | `internal/quality/observe/scm` |
| F-05 | `internal/adapters/scm` (`github`, `gitlab`, `multi`) | `internal/quality/scm` |
| F-05 | `internal/adapters/reviewer` (24 package) | `internal/quality/reviewer` |
| F-01 ws | `internal/adapters/workspace` (`forkseed`, `gitworktree`, `router`, `scratch`) | `internal/workspace/{forkseed,gitworktree,router,scratch}` |
| F-01 ws | `internal/workspacewatch`, `internal/gitdefault`, `internal/filesnapshot` | `internal/workspace/{workspacewatch,gitdefault,filesnapshot}` |
| F-01 ex | `internal/service/session`, `internal/service/sessionfork`, `internal/service/sessionsearch` | `internal/execution/{session,sessionfork,sessionsearch}` |
| F-01 ex | `internal/session_manager`, `internal/lifecycle`, `internal/sessionguard`, `internal/sessionid` | `internal/execution/{session_manager,lifecycle,sessionguard,sessionid}` |

## Review Focus

1. **Đường dẫn tương đối theo độ sâu thư mục.**
   - Đã quét: chỉ `session_manager/start_session_mode_test.go:15` đọc `../../../contracts/…`. Dời xuống sâu thêm một cấp thì đường dẫn này vỡ. Task 0 sửa nó.
   - `reviewer/pi` có `//go:embed assets/…`, là đường dẫn cùng thư mục, nên vẫn chạy được sau khi dời.
2. **Package con:** `go list ./internal/quality/reviewer/... | wc -l` phải bằng 24. Với `quality/scm/...` là 3, `workspace/...` là 7.
3. **Thư mục đích chưa tồn tại:** trước khi dời, `internal/execution`, `internal/workspace`, `internal/quality/{pr,review,service,scm,reviewer,observe}` phải chưa có.
4. **Đường session nằm trên smoke:** F-01 chạm mọi luồng session. Sau mỗi commit F-01, chạy `TestSmokeProjectSessionWorktreeDiff` và test của `internal/daemon`, `internal/httpd/...`.
5. **Codegen:** `specgen` import `service/pr` và `service/review`. Sau F-05 và sau F-01, chạy `npm run api`. `frontend/src/api/schema.ts` và `openapi.yaml` không được đổi.

## Task 0: Chuẩn bị đường dẫn test

**Files:** Modify `backend/internal/session_manager/start_session_mode_test.go`.

- [ ] Thay `os.ReadFile("../../../contracts/session-start-interface.json")` bằng một hàm tìm file đi ngược lên từ thư mục hiện tại tới khi gặp `contracts/session-start-interface.json`, giống `repoRoot(t)` của `bug_triage_test.go` ở đợt 1.
- [ ] Chạy `go test -count=1 -run StartSessionMode ./internal/session_manager/`. Expected: PASS.
- [ ] Commit `test(session_manager): find contracts/ by walking up, not by fixed depth`.

## Task 1–3: mỗi cụm một commit (F-05 → F-01 ws → F-01 ex)

Mỗi cụm lặp lại Step 1–6 của "Task 2–5" ở plan đợt 1, với cặp `<from> <to>` lấy từ bảng trên. Constructor để chạy `impact`:
- F-05: `review.NewLauncher`.
- F-01 ws: `gitworktree.New`, hoặc constructor export có thật.
- F-01 ex: `session.NewService`, hoặc constructor export có thật.

Commit message theo mẫu: `refactor(<context>): move … into internal/<context> (import-only)`.

## Task 4: Đóng đợt

Như Task 6 của đợt 1:
- chạy full test, smoke, typecheck, `check_areas` và feature-map;
- chạy GitNexus `detect-changes`;
- chạy mọi test của `scripts/` (`node --test scripts/*.test.mjs scripts/**/*.test.mjs`);
- sửa 17 §5: đánh dấu 9 (F-19: không dời), 10 (F-05) và F-01 là đã dời; ghi F-02 sang đợt 4 sau L1;
- cập nhật trạng thái trong `docs/fork/README.md`.
