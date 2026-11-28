# Hướng fork `hainguyen97dev/ai-orchestrator`

Fork này biến Agent Orchestrator (AO) thành **Domain-Driven AI Engineering Platform**: business domain là trung tâm, tri thức nghiệp vụ nằm trong Obsidian vault có nguồn và phiên bản, context engineering chọn đúng tri thức cho từng agent, workflow điều phối có trạng thái và phục hồi được, agent chỉ thực thi trong phạm vi được giao, provider là tài nguyên thay thế được. Sản phẩm là **app desktop Electron** chạy local.

Đọc file này trước mọi task. Thứ tự đọc tiếp:

1. [Thiết kế đã duyệt](../superpowers/specs/2026-11-27-ddd-platform-restructure-design.md) — hướng, layout đích, quy tắc dời code, lane, phase P0–P9. **Nguồn chuẩn**; khi tài liệu khác lệch thì theo file này.
2. [Đánh giá + bảng map AO → bounded context](./ddd-spec/16-assessment-and-build-plan.md) — số đo, map package AO → thư mục đích.
3. [Bộ đặc tả DDD v0.1](./ddd-spec/README.md) — vision, glossary, context map, event storming, aggregate, invariant, knowledge, context engineering, workflow, agent, provider, kiến trúc.
4. [`CONTEXT.md`](../../CONTEXT.md) — glossary rút gọn.

## Trạng thái (2026-11-28)

- P0 xong: chỉ còn `main`, không worktree phụ, không session/script chạy nền.
- Plan viết trong `docs/superpowers/plans/`, **chỉ cho phase sắp chạy**, dựa trên code đã merge. Plan đã chạy xong: `2026-11-27-p1-feature-code-map.md`, `2026-11-27-p3a-frame-move.md`, `2026-11-28-p2-strategic-ddd.md`.
- P3a (đã merge, push 2026-11-28): module path `github.com/hainguyen97dev/ai-orchestrator/backend`; `internal/sharedkernel/{domain,ports}`; `platform/persistence/sqlite` (migrations ở `backend/platform/persistence/sqlite/migrations`); `platform/eventbus/cdc`; `cmd/server`; test kiến trúc `internal/archtest`; smoke `TestSmokeProjectSessionWorktreeDiff`; job CI `import-only` theo label.
- P1 (đã merge, push 2026-11-28): `docs/fork/ddd-spec/17-feature-code-map.md`. Còn Task 4: chuyển `../ai-orchestra` vào `../archive/2026-11-27/` — hoãn vì một `ao-chat-host` bản dev vẫn chạy từ binary trong thư mục đó.
- P2 Strategic DDD: 01/04/05/06/14 v0.2 + CONTEXT.md một bộ thuật ngữ; 16 context (04 là nguồn duy nhất); event v1 (`domain_outbox`, `consumed_events`, 05); luật R4 phủ cả `platform/eventbus/cdc`; script `scripts/ddd-spec/check-consistency.mjs` chạy ở lane CI config. Thứ tự ưu tiên nguồn (04) đã duyệt 2026-11-28.
- P3b đợt 1 (2026-11-28): F-08 → `internal/skill/skillassets`, F-09 → `internal/artifact/{artifactversions,sessionartifacts,attachmentstore,observe/artifacts}`, F-06 → `internal/identity/project`, F-10 → `internal/notification{,/notify,/push}`. Công cụ `scripts/move-go-package.mjs`.
- P3b đợt 2 (2026-11-28): F-07 → `internal/task/{tracker,observe/trackerintake}`, F-18 → `internal/quality/{browser,computeruse,browserchrome,browserruntime,browserstream,cuadriver,preview,previewserver}`, F-03 → `internal/provider/{agentaccounts,agentauth,providerkeys,agentaccount}`. F-04 không dời (Budget là context mới; bọc ở P8). `pkg/agentcreds` giữ ở `pkg/`.
- Phase kế tiếp: P3b đợt 3 (F-19 systeminstall, F-05 quality; rồi F-01 + F-02 execution/workspace).

## Quyết định đã chốt

| ID | Quyết định |
|---|---|
| K1 | Phương án C: AO làm substrate; dời dần từng cụm vào layout bounded context; context mới xây sạch theo 4 tầng DDD; không copy từ `ai-orchestra`. |
| K2 | Layout trong `backend/`: `cmd/{server,ao}`, `internal/<bc>`, `internal/sharedkernel` (tạm), `platform/*`, `integrations/*`. Frontend giữ `frontend/` (Electron). |
| K3 | Lưu trữ SQLite + FTS5. Không PostgreSQL/pgvector/Neo4j. Embedding sau khi có bộ đánh giá retrieval. |
| K4 | Thuật ngữ theo spec: Workflow Definition / Workflow Run / Node / Node Execution / Agent Run. "Flow" không dùng nữa. |
| K5 | Cắt: mobile/LAN, device, cloud/sharing/WorkOS, importer ngoài Claude + Codex, telemetry gửi ra ngoài (PostHog, Sentry). Telemetry local giữ. |
| K6 | Vault theo định dạng Obsidian (Markdown + frontmatter + wikilink). Dữ liệu thật/fixture CR roaming làm ở P4. |
| K7 | Module path mới `github.com/hainguyen97dev/ai-orchestrator/backend`, đổi trong một PR thuần cơ học ở P3a. |
| K8 | Lát dọc nghiệm thu: CR "mua hộ roaming không cần đăng nhập". Mỗi phase đẩy lát này đi thêm một bước. |
| K9 | Agent: mỗi task/node chọn harness, model, effort, account. Account hiện có: Claude `pro`, Codex `plus`. |
| K10 | Context mới không đọc store SQLite của AO (`platform/persistence/sqlite`, `/store`, `/gen`) hay CDC `change_log` (`platform/eventbus/cdc`) ngoài `infrastructure/acl/**` (luật R4 trong `internal/archtest`). Context mới nhận `*sql.DB` từ daemon, tự sở hữu bảng của mình (migration vẫn chung thư mục). |
| K11 | Job `import-only` không là required check: PR chỉ dời code thì gắn label `import-only`; job chỉ chạy khi có label. |
| K12 | Thuật ngữ theo spec: RoleProfile gộp vào Agent Definition, KnowledgeSnapshot thành Context Package (01 §Thuật ngữ bỏ). |
| K13 | Danh sách context: bảng §Context của 04 là nguồn duy nhất; 14 và `archtest.NewContexts` phải khớp (script ddd-spec). |
| K14 | Event v1: context mới ghi `domain_outbox` cùng transaction, consumer idempotent qua `consumed_events`, dead-letter sau 5 lần lỗi; `change_log` của AO chỉ vào context mới qua ACL. |
| K15 | Thứ tự ưu tiên nguồn (04): "phải làm gì" — requirement/rule APPROVED > code + test > vault nháp > suy luận AI; "đang làm gì" — code + test trước; mâu thuẫn không tự chọn, ghi `unresolved_conflicts` và đưa người duyệt. |

## Quy tắc thường trực

**Lane và song song** (chi tiết: §6 thiết kế)
- Một lane = một nhóm thư mục bounded context + một worktree + một session sống lâu; session chỉ sửa file trong lane.
- Tối đa 2 lane code + 1 lane docs/review cùng lúc. Lane L0 (dời khung) chạy **một mình**.
- Không chạy wave/autoscale nhiều session tự động.

**Hotspot** — mỗi lúc chỉ 1 PR mở đụng tới; lane gom thay đổi hotspot vào một PR cuối:
- migration SQLite (`backend/platform/persistence/sqlite/migrations/*`) + `shippedMigrations`
- `openapi.yaml`, `frontend/src/api/schema.ts`, `specgen/build.go`
- wiring daemon (`internal/daemon/daemon.go`, `httpd/api.go`; entry `cmd/server`)

PR đụng hotspot: merge PR trước, rebase, chạy lại `npm run sqlc && npm run api`, không sửa tay file generated.

**Dời code** (chi tiết: §5.2, §5.4 thiết kế)
- PR dời chỉ dời: `git mv` + sửa import, không đổi logic.
- PR đụng nhiều package chỉ hợp lệ khi diff toàn là import/package path.
- Context mới không import package AO trực tiếp; đi qua ACL `internal/<bc>/infrastructure/acl`.

**Scope cleanup trước khi mở PR**
1. `git diff --name-status origin/main...HEAD` so với danh sách file của task.
2. File thêm (A) ngoài phạm vi → `git rm`; file sửa (M) ngoài phạm vi → `git checkout origin/main -- <file>`; cần thật → ghi lý do ở mục "Out-of-plan files" của PR.
3. File generated chỉ hợp lệ khi source tương ứng cũng có trong diff.
4. Chạy lại test vùng bị ảnh hưởng.

**De-vendor** — code PostHog, Sentry, `AO_TELEMETRY_*` gửi ra ngoài, `AO_SENTRY_DSN`, `AO_CLOUD_CONTROL_PLANE_URL`, WorkOS/AuthKit, `cloud-client`:
- Nằm trong file task đang sửa và tắt được bằng no-op không đổi API → tắt, ghi mục "De-vendor" trong PR.
- Ngoài phạm vi → ghi một dòng vào [devendor-log.md](./devendor-log.md); lane L1 xử lý.
- Không bao giờ thêm code tracking hoặc sign-in mới.

**Smoke**
- Smoke = `cd backend && go test ./e2e -run TestSmokeProjectSessionWorktreeDiff` (harness stub, không cần account thật; CI chạy sẵn trong `go test ./...`). Phải pass sau mọi PR dời/cắt.
- Bước mở PR thật làm tay một lần mỗi phase.

**Merge**
- Cần chủ sản phẩm duyệt: migration, `httpd/auth*`, xoá tính năng, đổi API contract đã merge, `.github/workflows`, PR dời khung (P3a).
- Còn lại: CI xanh + reviewer chéo approve + scope cleanup sạch.

## Tài liệu tham khảo cũ

[`specs/`](./specs/) là bản chép `feature-surgery/` theo hướng "Flow + Mission Control" trước đây. Giữ làm **đầu vào ý tưởng** cho P6 (workflow engine) và P7 (Workflow Studio, Mission Control); thuật ngữ trong đó đã đổi theo K4 và không còn là quyết định.

## Ngoài phạm vi

- Multi-tenancy, RBAC tổ chức, marketplace, microservice.
- Cloud (sharing, control plane, sign-in), mobile/LAN, device.
- Web app thay Electron.
- IDE client, HTTP client, DB client, Docker client tích hợp sẵn.
- Tự deploy production, tự huấn luyện model.
