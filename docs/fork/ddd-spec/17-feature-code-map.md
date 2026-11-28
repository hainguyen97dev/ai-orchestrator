---
status: draft
version: 0.1
date: 2026-11-27
---

# Bản đồ tính năng AO ↔ code ↔ bounded context (P1)

Deliverable của [[02-domain-discovery]] (feature gap matrix) và phase P1 trong thiết kế `docs/superpowers/specs/2026-11-27-ddd-platform-restructure-design.md`. Hành động lấy từ [[16-assessment-and-build-plan]] §3 và K5; tài liệu này thêm bằng chứng đo được và cổng nhận.

**Nguồn đo:** `node scripts/feature-map/feature-map.mjs` (chỉ đọc; chạy lại được) trên commit `9ae5ded1b4` (= `main` `85bbbfaab5` + plan). Tổng: 265 package / 427k dòng Go (không tính test), 328 route HTTP, 79 bảng SQLite đang sống, 17 route UI. Đo lại sau khi merge P3a (2026-11-28): 268 package (thêm `cmd/server`, `internal/sharedkernel`, `internal/archtest`), các số khác không đổi; bảng dưới giữ số đo gốc. Importer ngoài cụm đếm bằng `go list`; GitNexus `impact --summary-only` trên constructor đầu vào của từng cụm cắt/bọc.

Quy ước cột **Nguồn**: `observed` = package đã có trong `go list` và được đếm; `—` = cụm chưa có code. Cột **Bao đóng** = số package / dòng trong module mà cụm kéo theo (tính cả chính nó, không đếm trùng). **Test** = số file `_test.go` trong package của cụm.

## 1. Cổng nhận

Một tính năng AO **được nhận** vào sản phẩm khi đủ cả ba:

1. **BC đích**: có bounded context trong layout §5.1 của thiết kế (cột *BC đích*).
2. **Mục UI đích**: thuộc một trong 11 mục điều hướng (Overview, Projects, Domains, Knowledge, Workflows, Agents, Tasks, Terminals, Skills, Providers, Analytics), hoặc ghi rõ **không UI**.
3. **Smoke**: `cd backend && go test ./e2e -run TestSmokeProjectSessionWorktreeDiff` pass sau PR chạm vào nó (smoke P3a, nhánh `feat/p3a-frame-move`).

Thiếu (1) hoặc (2) → **Ẩn→Xoá**. Cụm "Ẩn (chờ quyết)" không được nhận cho tới khi có quyết định.

## 2. Bảng chính

| ID | Cụm | Nguồn | Package (dòng) | Bao đóng | Route HTTP (số, ví dụ) | Route UI | Bảng DB | Test | BC đích | Mục UI | Hành động |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F-01 | Session, worker, worktree, lifecycle | observed | 14 pkg / 51k | 85 pkg / 193k | 128 (`/api/v1/desktop/sessions/{sessionId}/artifacts`) | `_shell.new.tsx`, `_shell.projects.$projectId_.sessions.$sessionId.tsx`, `_shell.sessions.$sessionId.tsx`, `_shell.sessions.index.tsx`, `_shell.sessions.tsx` | 12 | 232 | execution + workspace | Agents / Terminals | Giữ |
| F-02 | Agent adapters, TUI/Chat, terminal | observed | 99 pkg / 138k | 132 pkg / 210k | 11 (`/api/v1/conversations/{conversationId}/find`) | — | 13 | 607 | execution | Terminals | Giữ (thu hẹp harness về Claude + Codex (+Gemini)) |
| F-03 | Account, auth, provider keys | observed | 5 pkg / 10k | 39 pkg / 55k | 53 (`/api/v1/agents`) | — | 12 | 41 | provider | Providers | Bọc → ProviderProfile |
| F-04 | Usage, quota, pricing | observed | 3 pkg / 12k | 10 pkg / 30k | 7 (`/api/v1/usage/limit-history`) | `_shell.usage.tsx` | 10 | 45 | budget | Providers / Analytics | Bọc; reservation/settlement mới |
| F-05 | PR, CI, review | observed | 35 pkg / 23k | 113 pkg / 131k | 26 (`/api/v1/github/pat`) | — | 10 | 77 | quality | Tasks | Bọc → QualityGate |
| F-06 | Project, project config | observed | 1 pkg / 2k | 10 pkg / 21k | 12 (`/api/v1/projects`) | `_shell.index.tsx`, `_shell.projects.$projectId.tsx`, `_shell.projects.$projectId_.settings.tsx` | 1 | 10 | identity (project) | Projects | Giữ |
| F-07 | Board, delegation, tracker | observed | 5 pkg / 1k | 15 pkg / 24k | 0 | — | 0 | 6 | task | Tasks | Giữ, sau nối với WorkflowRun |
| F-08 | Skill discovery, skill assets | observed | 1 pkg / 0k | 1 pkg / 0k | 0 | — | 0 | 2 | skill | Skills | Bọc; SkillDefinition có version là mới |
| F-09 | Artifact | observed | 4 pkg / 2k | 9 pkg / 15k | 2 (`/api/v1/attachment-uploads`) | `_shell.artifacts.tsx` | 4 | 13 | artifact | Agents (artifacts của session) | Giữ |
| F-10 | Notification, push | observed | 3 pkg / 1k | 10 pkg / 23k | 7 (`/api/v1/notifications`) | — | 1 | 5 | notification | không UI | Giữ |
| F-11 | Automation, Cues | observed | 3 pkg / 1k | 15 pkg / 24k | 5 (`/api/v1/automations`) | `_shell.automations.tsx` | 3 | 5 | scheduling | — (ẩn) | Ẩn (chờ quyết) |
| F-12 | Pipeline (fork) | — | 0 pkg / 0k | 0 pkg / 0k | 0 | — | 0 | 0 | workflow | Workflows | Gộp vào Workflow mới |
| F-13 | Mobile, LAN, remote host, awake | observed | 3 pkg / 6k | 7 pkg / 17k | 33 (`/api/v1/awake`) | `_shell.host.$hostId.project.$projectId.tsx`, `_shell.host.$hostId.project.$projectId_.session.$sessionId.tsx`, `_shell.host.$hostId.session.$sessionId.tsx` | 1 | 20 | — | — (cắt) | Ẩn→Xoá (K5) |
| F-14 | Cloud, sharing, WorkOS | — | 0 pkg / 0k | 0 pkg / 0k | 1 (`/api/v1/identity`) | — | 0 | 0 | — | — (cắt) | Ẩn→Xoá (K5) |
| F-15 | Device simulator | observed | 2 pkg / 3k | 8 pkg / 21k | 3 (`/api/v1/devices`) | — | 0 | 8 | — | — (cắt) | Ẩn→Xoá (K5) |
| F-16 | Import 11+ nguồn | observed | 5 pkg / 8k | 46 pkg / 61k | 6 (`/api/v1/import`) | — | 1 | 40 | execution | không UI | Thu hẹp về Claude + Codex (K5) |
| F-17 | Telemetry, Sentry, PostHog | observed | 5 pkg / 4k | 22 pkg / 71k | 1 (`/api/v1/telemetry/identity`) | — | 3 | 21 | audit (local) | không UI | Xoá remote, giữ local (K5) |
| F-18 | Browser, computer use | observed | 8 pkg / 6k | 18 pkg / 26k | 15 (`/api/v1/browser/chrome`) | — | 0 | 20 | quality (UI test) | không UI | Giữ bản lõi, ngoài đường găng |
| F-19 | System install, host update | observed | 3 pkg / 9k | 88 pkg / 114k | 4 (`/api/v1/system/github-auth`) | — | 0 | 38 | — | không UI | Giữ tối thiểu cho harness install |
| F-20 | Domain Modeling | — | 0 pkg / 0k | 0 pkg / 0k | 0 | — | 0 | 0 | domainmodel | Domains | Mới |
| F-21 | Knowledge (vault, registry, graph, proposal) | — | 0 pkg / 0k | 0 pkg / 0k | 0 | — | 0 | 0 | knowledge | Knowledge | Mới |
| F-22 | Context Engineering | — | 0 pkg / 0k | 0 pkg / 0k | 0 | — | 0 | 0 | context | không UI | Mới (GitNexus làm code index) |
| F-23 | Workflow Engine + Studio + Mission Control; Budget reservation/routing/failover | — | 0 pkg / 0k | 0 pkg / 0k | 0 | — | 0 | 0 | workflow, provider/budget | Workflows / Providers | Mới |

Bảng DB đếm bảng còn sống sau migration (phần `-- +goose Up`); bảng đã bị drop không tính. Số liệu chi tiết từng package/route: chạy lại script.

## 3. Điều kiện xong, rủi ro, bằng chứng phụ thuộc

"Ngoài cụm" = package không thuộc cụm nhưng import package của cụm (không tính test). GitNexus = `impact <constructor> --summary-only` (upstream, depth 3); caller rỗng hoặc risk thấp **không** chứng minh code chết.

| ID | Điều kiện xong | Ngoài cụm (`go list`) | GitNexus | Rủi ro |
|---|---|---|---|---|
| F-01 | Dời nguyên khối vào `internal/execution` + `internal/workspace` (P3b, cuối cùng); smoke pass | phần lớn backend | — | Bao đóng 193k dòng; mọi lỗi dời đều chạm smoke |
| F-02 | Harness ngoài Claude/Codex/Gemini (+`opencode` cho smoke) bị xoá ở L1; adapter còn lại dời vào `integrations/{claude,codex,gemini}` | phần lớn backend | — | 99 package; xoá harness phải giữ `opencode` cho tới khi smoke chuyển sang fake Codex |
| F-03 | `internal/provider` bọc `agentaccounts`/`agentauth`/`providerkeys`; ProviderProfile chỉ giữ credential reference | 9: `adapters/agent/claudecode`, `adapters/agent/modelcatalog`, `chatdriver/claudeacp`, `daemon`, `specgen`, `httpd/controllers`, `review`, `service/agent`, `session_manager` | `agentaccounts.New`: HIGH, 4 impacted | Bị execution và review import trực tiếp → ACL phải đứng trước khi đổi logic |
| F-04 | `internal/budget` bọc usage/pricing; reserve/settle mới ở P8 | 4: `cli`, `daemon`, `httpd/controllers`, `pricing/catalogsync` | `usage.NewCollector`: LOW, 4 | `pricing/catalogsync` chưa gán cụm (thuộc F-04) |
| F-05 | `internal/quality` bọc pr/review/scm; QualityGate gắn artifact revision | 5: `adapters/tracker/gitlab`, `daemon`, `httpd`, `specgen`, `httpd/controllers` | `review.NewLauncher`: HIGH, 4 | Bao đóng 131k vì kéo session; dời sau F-03 |
| F-06 | `internal/identity` (hoặc BC `project` — chốt ở P2) | — | — | `projectconfig` là file trong `internal/sharedkernel/domain`, không phải package riêng |
| F-07 | `internal/task`; nối WorkflowRun ở P6 | — | — | Delegation nằm trong file `service/session/delegation.go` → tách ở bước 2 (alias) |
| F-08 | `internal/skill`; SkillDefinition có version ở P6 | 6: `adapters/agent/{hookutil,mimocode,opencode}`, `cli`, `daemon`, `session_manager` | — | Skill discovery chính nằm trong file `service/chat/skills.go` (F-02) |
| F-09 | `internal/artifact` (phẳng) | — | — | — |
| F-10 | Giữ generic | — | — | `push` phụ thuộc mobile (F-13) → cắt F-13 phải giữ push desktop |
| F-11 | Chờ quyết định: giữ thành Scheduling hay xoá | 2: `daemon`, `httpd/controllers` | — | Ẩn route UI `_shell.automations.tsx` trước khi quyết |
| F-12 | `domain/pipeline.go` (file trong sharedkernel) chuyển vào `internal/workflow` ở P6 | — | — | Thuật ngữ Flow cũ (K4) |
| F-13 | Xoá `mobilebridge`, `service/awake`, `presence`, LAN listener, route `/mobile` `/awake` `/remote-host` `/endpoints`, route UI `_shell.host.*`, `packages/mobile` | 5: `daemon`, `httpd`, `httpd/controllers`, `push`, `service/systeminstall` | `mobilebridge.NewKeepAwake`: **HIGH**, 5 impacted | `push` và `systeminstall` import mobile → cắt kèm sửa 2 package này; ADR 0001/0004/0005 thành lịch sử |
| F-14 | Xoá `frontend/src/renderer/lib/cloud-cp`, `CloudProjectSettingsForm`, `packages/cloud-client`, `cli/remote_host_link.go`, control-plane URL trong `config`, route `/identity` | 0 package backend | — | WorkOS đã gỡ ở `10028ef170`; phần còn lại nằm ở frontend + CLI |
| F-15 | Xoá `devices`, `adapters/device` | 2: `daemon`, `httpd/controllers` | `devices.New`: LOW, 4 | — |
| F-16 | Giữ importer Claude + Codex, xoá phần còn lại | 5: `cli`, `daemon`, `specgen`, `httpd/controllers`, `session_manager` | `sessionimport.New`: LOW, 4 | `session_manager` có file `session_import_*` cho từng nguồn → cắt cả ở đó |
| F-17 | Xoá PostHog/Sentry, giữ sink local (`platform/observability`) | 18 (gồm `cli`, `daemon`, `httpd`, `lifecycle`, `observe/*`, `service/chat`, `service/pr`…) | `telemetry.NewAggregatingSink`: LOW, 4 | Rộng nhất trong nhóm cắt: thay bằng no-op giữ API trước, xoá sau |
| F-18 | Giữ lõi, ngoài đường găng | — | — | — |
| F-19 | Giữ tối thiểu cho cài harness | — | — | Bao đóng 114k (kéo session) dù chỉ 9k dòng riêng |
| F-20…F-23 | Xây mới theo P4–P8 | — | — | Không có code AO để nhận |

## 4. Chưa gán

Script liệt kê mọi thứ không cụm nào nhận. Quyết định:

| Nhóm | Phần tử | Quyết định |
|---|---|---|
| Khung (theo bảng §6 của [[16-assessment-and-build-plan]]) | `cmd/*`, `internal/{cli,daemon,daemon/supervisor,daemonmeta,config,runfile,datadirlock,caller,clienttz,reqid,lifecyclelog}`, `internal/httpd/**`, `internal/storage/sqlite/**` (nay `platform/persistence/sqlite/**`), `internal/cdc` (nay `platform/eventbus/cdc`), `internal/domain` + `internal/ports` (nay `internal/sharedkernel/{domain,ports}`), `internal/adapters/{runtime/**,container/**,systemexec}`, `internal/{process,processalive,procmem,tmuxbin,termtheme,renderpage}`, `pkg/contract`, `e2e`, `internal/{testenv,integration}` | **Giữ** làm khung/platform; dời ở P3a/P3b theo §6 [16] |
| Observe | `internal/observe`, `observe/{activity,ownership,reaper}` | **Giữ** → `internal/execution` (theo dõi session) |
| Pricing | `internal/pricing/catalogsync` | **Giữ** → F-04 |
| Codex | `internal/codexops` | **Giữ** → F-03 (codex account) |
| MCP | `internal/mcpserver`, `cmd/ao-mcp` | **Giữ** → `internal/agent` (tool cho agent) |
| Handoff | `pkg/handoffnote` | **Giữ** → `internal/execution` (handoff package, spec 12) |
| Settings | `internal/service/settings`, route `/settings/*` (9), bảng `app_settings`, route UI `_shell.settings.tsx` | **Giữ** → `internal/identity`; UI vào khu Settings ngoài 11 mục (không đổi) |
| Reports | `internal/service/report`, route `/reports`, bảng `reports`, `report_outputs`, `report_worker_interrupts` | **Chờ P2**: nghi trùng QualityGate/Artifact; ẩn nếu không có mục |
| Tiện ích chat | `service/{linkpreview,shellagent,hookprocess,fsbrowser}`, route `/link-preview`, `/fs/dirs` | **Giữ** → F-02 |
| Attribution | `internal/attribution`, bảng `session_commit_attribution` | **Giữ** → F-05 |
| Hạ tầng route | `/events` (SSE), `/dev/import-projects` | `/events` giữ (platform/eventbus); `/dev/import-projects` → F-16 |
| Bảng hệ thống | `change_log`, `timestamp_repair_control`, `timestamp_repair_progress` | **Giữ** → `platform/persistence` |
| Nhiễu | bảng `text` | Không phải bảng: regex khớp chữ trong migration — bỏ qua |
| UI khung | `__root.tsx`, `_shell.tsx` | Shell, P7 dựng lại điều hướng |

## 5. Thứ tự dời P3b

Lá trước, theo bao đóng tăng dần; execution cuối (dời nguyên khối):

1. F-08 skill (0k) → 2. F-09 artifact (15k) → 3. F-06 project/identity (21k) → 4. F-10 notification (23k) **[1–4 đã dời, P3b đợt 1: `internal/{skill,artifact,identity,notification}`]** → 5. F-07 task (24k) → 6. F-18 browser (26k) → 7. F-04 budget (30k) → 8. F-03 provider (55k) **[5, 6, 8 đã dời, P3b đợt 2: `internal/{task,quality,provider}`; 7 không dời — Budget là context "mới" (R1/R3), code AO giữ chỗ cũ tới P8 bọc bằng ACL]** → 9. F-19 systeminstall (114k) → 10. F-05 quality (131k) → 11. F-01 + F-02 execution/workspace (cuối). **[P3b đợt 3: 10 đã dời vào `internal/quality/{pr,prpreview,githubpat,review,service/review,autoreview,reviewgateway,observe/scm,scm,reviewer}`; F-01 đã dời vào `internal/workspace/{forkseed,gitworktree,router,scratch,workspacewatch,gitdefault,filesnapshot}` và `internal/execution/{session,sessionfork,sessionsearch,session_manager,lifecycle,sessionguard,sessionid}`; 9 không dời — F-19 không có BC đích (§2), ở lại AO Substrate; F-02 dời ở đợt 4, sau khi L1 xoá harness thừa (§3)]**

Cắt (L1, song song L2): F-15 device (2 importer) → F-14 cloud (frontend) → F-16 importer → F-13 mobile (sửa `push`, `systeminstall`) → F-17 telemetry remote (18 importer, no-op trước). **[F-15 đã cắt (L1, 2026-11-28): backend `devices`, `adapters/device`, `ports/device.go`, 14 operation API, `ao device`, prompt "AO Device panel", tab Device ở desktop. F-14 phải đo lại trước khi cắt: §3 ghi "0 package backend", nhưng frontend có hơn 40 file `lib/cloud-*` và 131 file dùng `session.cloud`, và nó dính với remote-host/mobile (F-13).]** **[Quyết định 2026-11-28: cắt cả remote host (kể cả desktop↔desktop); Awake giữ cho desktop (`service/awake`, route `/awake`; `keepawake`/`lidawake` dời khỏi `mobilebridge` ở đợt B). Thứ tự: A mobile → B remote host + LAN + push + `hostId` → C cloud (plan `docs/superpowers/plans/2026-11-28-l1-cut-f13-f14.md`). Đợt A đã cắt: `packages/mobile` (1748 file), `packages/shared/devices`. Push chuyển sang B, vì registry push cũng là roster thiết bị dùng cho ghép cặp.]**

## 6. `ai-orchestra`

`git rev-parse bb18b82^{tree}` (commit import của `ai-orchestrator`) = tree `HEAD` của `ai-orchestra` = `433927439a1f…`. `ai-orchestra` chỉ còn thay đổi chưa commit ở `AGENTS.md`, `CLAUDE.md`, `.claude/skills/gitnexus-*` — bản tương đương đã vào `ai-orchestrator` ở #12. **Đã làm (2026-11-28):** `../ai-orchestra` đã chuyển vào `../archive/2026-11-27/ai-orchestra`.
