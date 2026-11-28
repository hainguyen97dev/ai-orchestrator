# P3b đợt 2: dời F-07, F-18, F-03 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dời code AO của ba cụm tiếp theo trong §5 của [17-feature-code-map](../../fork/ddd-spec/17-feature-code-map.md) vào package context của chúng ([04](../../fork/ddd-spec/04-bounded-context-map.md)). Mỗi cụm một commit, chỉ dời, không đổi logic.

**Architecture:** Giống đợt 1 ([2026-11-28-p3b-wave1-leaf-moves.md](2026-11-28-p3b-wave1-leaf-moves.md)): dời bằng `scripts/move-go-package.mjs`, mỗi commit phải qua `scripts/check-import-only-diff.mjs`, chạy test của package dời, các package import nó và `internal/archtest`. Cuối đợt chạy `go test ./...`, smoke và frontend typecheck.

**Tech Stack:** Go, Node, GitNexus CLI.

**Spec:** `docs/superpowers/specs/2026-11-27-ddd-platform-restructure-design.md` §5.2, §5.5 hàng P3b; thứ tự ở 17 §5; danh sách context ở 04.

## Global Constraints

Như đợt 1 (thư mục cuối giữ tên package, không đổi identifier/route/bảng, GitNexus `impact` trước khi dời, không commit `go.work.sum`). Nhánh `feat/p3b-wave2`, worktree `../aio-p3b2`.

## Quyết định của đợt này

- **F-04 budget không dời.**
  - `internal/budget` nằm trong `archtest.NewContexts`. Code AO đặt dưới đó sẽ vi phạm R1. Đặt dưới `infrastructure/acl` thì vi phạm R3, vì `daemon` và `httpd/controllers` import trực tiếp các package đó.
  - 04 xếp Budget là "mới, bọc AO": code AO (`service/usage`, `pricing`, `observe/usage`) giữ nguyên chỗ cũ; P8 viết port và ACL để bọc nó.
  - Ghi vào 17 §5.
- **`pkg/agentcreds` không dời.** `pkg/` là bề mặt API công khai của module. Chuyển nó vào `internal/` là đổi khả năng nhìn thấy package, không phải "chỉ dời".
- **F-18 vào Quality**, theo bảng §Context của 04 (Quality = F-05, F-18).

## Bảng dời (thứ tự chạy)

| Cụm | Từ (dưới `backend/`) | Đến |
|---|---|---|
| F-07 | `internal/adapters/tracker` (gồm `github`, `gitlab`, `httpkit`, `multi`) | `internal/task/tracker` |
| F-07 | `internal/observe/trackerintake` | `internal/task/observe/trackerintake` |
| F-18 | `internal/service/browser` | `internal/quality/browser` |
| F-18 | `internal/service/computeruse` | `internal/quality/computeruse` |
| F-18 | `internal/browserchrome`, `internal/browserruntime`, `internal/browserstream` | `internal/quality/{browserchrome,browserruntime,browserstream}` |
| F-18 | `internal/adapters/cuadriver` | `internal/quality/cuadriver` |
| F-18 | `internal/preview`, `internal/previewserver` | `internal/quality/{preview,previewserver}` |
| F-03 | `internal/service/agentaccounts`, `internal/service/agentauth` | `internal/provider/{agentaccounts,agentauth}` |
| F-03 | `internal/providerkeys` | `internal/provider/providerkeys` |
| F-03 | `internal/adapters/agentaccount` | `internal/provider/agentaccount` |

## Review Focus

1. **Đường dẫn tương đối theo độ sâu thư mục** (`../../..`) trong test hoặc `//go:embed` của package dời. Kiểm trước bằng `grep -rn '"\.\./\.\.'`. Nếu có thì tách thành commit chuẩn bị, giống `bug_triage_test.go` ở đợt 1.
2. **Package dời là package con** (`tracker/*`, `cuadriver/...`): `go list ./internal/<đích>/...` phải ra đủ số package như trước khi dời.
3. **Tên thư mục trùng nhau sau khi dời:** `internal/quality/browser` (package `browser`) không được đụng thư mục nào đã có sẵn. Trước khi dời: `ls backend/internal/quality` phải không tồn tại.
4. **F-03 nằm trên đường xác thực:** GitNexus báo `agentaccounts.New` HIGH. Ngoài test của package, phải chạy thêm `./internal/adapters/agent/claudecode/ ./internal/review/ ./internal/service/agent/` và `TestSmoke…`.
5. **Codegen:** `service/agentauth` được `specgen` import. Sau F-03 chạy `npm run api`; `frontend/src/api/schema.ts` và `openapi.yaml` không được đổi.

## Task 1–3: mỗi cụm một commit (F-07 → F-18 → F-03)

Mỗi cụm lặp lại Step 1–6 của "Task 2–5" ở plan đợt 1, với cặp `<from> <to>` lấy từ bảng trên.

## Task 4: Đóng đợt

Như Task 6 của đợt 1:
- chạy full test, smoke, typecheck, `check_areas` và feature-map;
- chạy GitNexus `detect-changes`;
- sửa 17 §5: đánh dấu F-07, F-18, F-03 là đã dời, và ghi lý do F-04 không dời;
- cập nhật trạng thái trong `docs/fork/README.md`.
