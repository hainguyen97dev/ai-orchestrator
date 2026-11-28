---
status: draft
version: 0.1
date: 2026-11-27
---

# Đánh giá đặc tả + AO và kế hoạch xây dựng

Mục đích: đánh giá bộ đặc tả `00–15` so với source AO thực tế, map tính năng AO → bounded context, so sánh các cách xây và đề xuất phase cụ thể. Chưa có quyết định nào ở đây là đã chốt.

Nguồn đo: `ai-orchestra` @ `10028ef170` (cùng tree với `ai-orchestrator` commit import `bb18b82`), `go list -deps`, đếm dòng (không tính test), GitNexus index (180k node, 818k edge, 1.329 flow), `feature-surgery/*`, roadmap fork `docs/superpowers/plans/2026-11-26-00-roadmap.md`.

## 1. Đánh giá bộ đặc tả

**Điểm mạnh — giữ nguyên:**
- Nguyên tắc đúng hướng: domain trung tâm, AI suy luận ≠ rule đã duyệt, vault đọc độc lập bằng Obsidian, DB/index là projection tái tạo được.
- Invariant (07) cụ thể, test được: approval pin artifact hash, không retry side effect chưa reconcile, budget reserve atomic.
- Roadmap (15) đã tự khuyên làm **một lát dọc** (CR mua hộ roaming) thay vì 8 phase waterfall.

**Chỗ lệch với thực tế AO — cần sửa trước khi code:**

| # | Đặc tả nói | Thực tế | Đề xuất |
|---|---|---|---|
| S1 | Go + React + **PostgreSQL**, pgvector, PG FTS (14) | AO là app desktop Electron + daemon Go + **SQLite** (sqlc, 269 migration) | Giữ SQLite. FTS5 thay PG FTS; embedding để sau (10 đã nói MVP không cần). Local-first một người dùng không cần Postgres. |
| S2 | Layout greenfield `internal/domainmodel, knowledge, …` (14) | AO đã có kiến trúc hexagonal: `domain/ ports/ adapters/ service/ storage/ httpd/` | Context mới đặt theo layout DDD của spec; AO cũ coi là một khối (xem §4). |
| S3 | `WorkflowDefinition/WorkflowRun` (01) | Fork đã dùng `Flow/FlowRun/Gate/RoleProfile/KnowledgeSnapshot` (`CONTEXT.md`), có code `domain/pipeline.go` | Chọn **một** bộ thuật ngữ, cập nhật 01 và CONTEXT.md cùng lúc. |
| S4 | `AgentRun`, `ProviderProfile`, `Workspace` là aggregate mới (06) | AO đã có `Session` (agent+worktree+harness), `agent_account`, `usage_limit` | `AgentRun` = tham chiếu tới AO Session qua anti-corruption layer, không viết runtime mới. `ProviderProfile` bọc `agent_account`. |
| S5 | Task Board, Agent Office, Terminals là UI mới (14) | AO đã có board, session view, TUI/Chat, terminal | Tái dùng, chỉ gắn vào điều hướng mới. |
| S6 | "Chưa audit repo" (README) | Nay đã đo (§2) | Cập nhật 02 bằng bảng §3 của file này. |

**Thiếu trong đặc tả:**
- Không nói phần nào **port**, phần nào **xây mới**. §3 lấp chỗ này.
- Chưa có thứ tự ưu tiên khi nguồn mâu thuẫn (requirement vs code vs vault) — 02 để mở. Cần chốt trước Knowledge phase.
- Chưa nói cách dùng code index: GitNexus đã chạy được, có thể làm luôn "Source Code Index" của Context Engineering thay vì tự viết.

## 2. Thực tế AO (số đo)

| Chỉ số | Giá trị |
|---|---|
| Backend `internal/` | 424k dòng, 255 package, 269 migration SQLite |
| Frontend `src/` | 317k dòng, 397 component, 17 route |
| `daemon` (composition root) | import 248/255 package |
| Bao đóng phụ thuộc `service/session` | 75 package, **177k dòng (42% backend)** |
| Bao đóng `session_manager` | 55 package, 87k dòng |
| Bao đóng `service/chat` | 26 package, 95k dòng |
| Bao đóng `review` | 57 package, 93k dòng |
| Bao đóng `service/usage` | 7 package, 24k dòng |

**Hệ quả:** "lõi tối thiểu chạy được" (daemon + session + một harness) đã là ~180k dòng backend cộng phần lớn UI shell. Không có cách "port nhỏ" cho tầng runtime: lần port đầu tiên đã là gần nửa backend.

**GitNexus — dùng được đến đâu:**
- Cluster đặt tên theo thư mục (`Chat`, `Session`, `Controllers`…), không theo tính năng → không dùng làm danh sách tính năng.
- Không nối TypeScript ↔ Go (2.730 site bị từ chối) → map UI→backend phải đi qua route HTTP/OpenAPI.
- Flow chỉ phủ ~200/23.800 entry point → vắng flow ≠ code chết.
- Dùng tốt cho: `context`/`impact` trên từng symbol khi cắt hoặc bọc một tính năng; và làm code index cho Context Compiler.

## 3. Bản đồ tính năng AO → bounded context

Hành động: **Giữ** (thành substrate, không sửa sâu) · **Bọc** (giữ code, thêm ACL/domain mới phía trên) · **Ẩn→Xoá** · **Mới** (không có code AO).

| Cụm AO | Package chính (dòng) | Bounded context đích | Mục UI đích | Hành động |
|---|---|---|---|---|
| Session, worker, worktree, lifecycle | `service/session` 15.6k, `session_manager` 21.4k, `lifecycle` 4.3k | Agent Execution + Workspace | Agents / Terminals | **Giữ** làm substrate |
| Agent adapters, TUI/Chat | `adapters/agent/*`, `service/chat` 22.8k, `terminal`, `service/shellterm` | Agent Execution | Terminals | **Giữ**; thu hẹp harness về Claude + Codex (+Gemini) |
| Account, auth, provider keys | `service/agentaccounts` 2.2k, `agentauth` 4.8k, `providerkeys` 1k | Provider | Providers | **Bọc** → ProviderProfile |
| Usage, quota, pricing | `service/usage` 5.4k, `pricing` 1.6k | Budget | Providers / Analytics | **Bọc**; thêm reservation/settlement **mới** |
| PR, CI, review | `service/pr` 2.3k, `review` 5k, `observe/scm`, `service/review` | Quality | Tasks | **Bọc** → QualityGate |
| Project, project config | `service/project` 2.5k, `domain/projectconfig` | Project (identity) | Projects | **Giữ** |
| Board, delegation | `service/session/delegation.go`, frontend board | Task | Tasks | **Giữ**, sau nối với WorkflowRun |
| Skill discovery, skill assets | `service/chat/skills.go`, `skillassets` | Skill | Skills | **Bọc**; SkillDefinition có version là **mới** |
| Artifact | `artifactversions`, `sessionartifacts` | Artifact | — | **Giữ** |
| Notification, push | `notify`, `push` | Notification (generic) | — | **Giữ** |
| Automation, Cues | `service/automation` 0.9k, `domain/cue` | Scheduling | — | **Ẩn** (chờ quyết) |
| Pipeline (fork) | `domain/pipeline.go` (a7a41a1) | Workflow | Workflows | Gộp vào Workflow **mới** |
| Mobile, LAN, remote host | `mobilebridge` 4.2k, `packages/mobile` | — | — | Chưa chốt (D3 đang: giữ ngoài đường găng) |
| Cloud, sharing, WorkOS | `packages/cloud-client`, routes cloud | — | — | **Ẩn→Xoá** |
| Device simulator | `devices` 1.7k | — | — | **Ẩn→Xoá** |
| Import 11+ nguồn | `service/sessionimport` 6.9k | — | — | Thu hẹp về Claude + Codex |
| Telemetry, Sentry, PostHog | `adapters/telemetry` 3k, `telemetrymeta` | Audit (local) | — | Xoá remote (đợt DV đang làm), giữ local |
| Browser, computer use | `browser*`, `service/computeruse` 1.8k | Quality (UI test) | — | **Giữ** bản lõi, ngoài đường găng |
| System install, host update | `service/systeminstall` 8.4k, `hostupdate` | — | — | Giữ tối thiểu cho harness install |
| **Domain Modeling** | — | Domain | Domains | **Mới** |
| **Knowledge (vault, registry, graph, proposal)** | — | Knowledge | Knowledge | **Mới** |
| **Context Engineering** | — (GitNexus làm code index) | Context | — | **Mới** |
| **Workflow Engine + Studio + Mission Control** | — | Workflow | Workflows | **Mới** |
| **Budget reservation, routing, failover** | — | Provider/Budget | Providers | **Mới** trên nền Bọc |

**Kết luận bản đồ:** nửa dưới sơ đồ (Agent Orchestration, Terminals, một phần Provider, Task Board) đã có trong AO và gắn chặt với nhau. Nửa trên (Domain, Knowledge, Context, Workflow) — phần có giá trị lâu dài — **không có gì để copy**, phải xây mới.

## 4. Ba cách xây

### A. Lõi trống, port từng tính năng từ `ai-orchestra`
Reset `ai-orchestrator` về khung DDD rỗng, copy từng cụm sang.
- **Được:** cấu trúc sạch từ đầu, biết chính xác cái gì đã vào.
- **Mất:** lần port đầu (session) đã là 177k dòng + gộp 269 migration + UI shell ~phần lớn 317k dòng. "Từng phần" chỉ đúng với phần nhỏ (usage, review…), sai với runtime. Rủi ro cao làm hỏng session/restore/handoff vốn là phần AO đã ổn. Bỏ công các nhánh fork đã làm.
- **Đánh giá:** không khả thi cho tầng runtime; chỉ hợp cho context mới.

### B. Giữ snapshot, cắt và sửa tại chỗ
Hướng roadmap fork đang đi.
- **Được:** nhanh, không mất gì, app chạy được suốt.
- **Mất:** context mới viết lẫn vào `domain/ service/` của AO, khó giữ ranh giới DDD; code không dùng vẫn nằm đó; dễ lặp lại cảm giác "đi quá nhanh" vì không có ranh giới "đã nhận / chưa nhận".

### C. Hai tầng: AO làm substrate, context mới xây sạch phía trên — **đề xuất**
- `ai-orchestrator` giữ nguyên tree AO (đã bằng `ai-orchestra`, nên **không cần copy**; `ai-orchestra` bỏ được ngay khi xác nhận tree trùng).
- Cắt theo danh sách §3 (Ẩn→Xoá) bằng lát dọc có test — đây là "đưa từng phần": tính năng AO chỉ **được nhận** khi qua cổng nhận (§5, P1).
- Context mới (`domain`, `knowledge`, `context`, `workflow`, `budget`) đặt ở thư mục riêng, ví dụ `backend/internal/bc/<context>/{domain,application,infrastructure,interfaces}`, theo layout DDD của spec.
- Context mới chỉ gọi AO qua **anti-corruption layer** (`bc/execution/acl` → `service/session`, `agentaccounts`, `usage`, `review`). Không import ngược.
- UI: dựng điều hướng mới (Overview, Projects, Domains, Knowledge, Workflows, Agents, Tasks, Terminals, Skills, Providers, Analytics); màn AO hiện có gắn vào đúng mục; màn không có mục → ẩn.
- **Được:** ranh giới DDD rõ cho phần mới, runtime AO không bị đụng sâu, có danh sách "đã nhận" kiểm soát được.
- **Mất:** tồn tại hai phong cách code trong một repo; ACL tốn công viết; phần AO giữ lại vẫn to.

## 5. Kế hoạch theo phase (theo C)

Mỗi phase đẩy lát dọc **CR mua hộ roaming** đi thêm một bước. Một phase một lúc; tối đa 1–2 session agent song song; không chạy wave/autoscale.

| Phase | Việc | Đầu ra | Điều kiện xong (bước roaming) |
|---|---|---|---|
| **P0 Dừng và ổn định** | Dừng autoscale/wave. Kê các nhánh đang mở (`pipeline-durable-run`, `mission-control-v0`, `dv-1-kill-switch`, `t1-store` wip, `plan-a1-a2`, `plan-dv*`), quyết merge/park/bỏ từng nhánh. Smoke baseline project→session→worktree→PR. | Bảng nhánh + kết quả smoke | `main` sạch, smoke pass, không còn session nền |
| **P1 Bản đồ + cổng nhận** | Index GitNexus cho `ai-orchestrator`. Với mỗi dòng §3: route HTTP, route UI, package, bảng DB, bao đóng phụ thuộc, test hiện có. Định nghĩa "cổng nhận": có BC đích, có mục UI, smoke pass. | `17-feature-code-map.md` (feature gap matrix theo 02) | Mọi cụm có quyết định; xác nhận tree trùng → bỏ `ai-orchestra` |
| **P2 Chốt Strategic DDD** | Thống nhất thuật ngữ (S3), context map có substrate + ACL, danh sách event v1, quyết lưu trữ (S1), thứ tự ưu tiên nguồn. | Sửa 01, 04, 05, 06, 14; CONTEXT.md | Review xong; không mâu thuẫn spec ↔ CONTEXT.md |
| **P3 Cắt** | Ẩn→Xoá theo §3 (cloud, device, importer, telemetry remote; mobile theo quyết định). Mỗi cụm một PR lát dọc, dùng GitNexus `impact` trước khi xoá. | PR cắt | Smoke P0 vẫn pass sau mỗi PR |
| **P4 Knowledge Foundation** | Vault standard (09) + template; parser/validator frontmatter; registry SQLite + FTS5; typed link; revision/hash; vault read-only, proposal qua branch git. | `bc/knowledge` + Knowledge UI tối thiểu | Import rule roaming từ vault mẫu; sửa file → reindex; lỗi parse → quarantine |
| **P5 Context Compiler** | Metadata + lexical + link expansion; GitNexus làm code index adapter; ContextPackage có manifest, citation, token estimate; dừng khi thiếu rule bắt buộc. | `bc/context` | Cho CR roaming ra package có rule + API + code liên quan, có nguồn |
| **P6 Workflow Engine** | Definition/version, Run, NodeExecution, approval pin hash, checkpoint, lease, idempotency; gộp `pipeline.go`; node Agent → AO session qua ACL; provider port + security tối thiểu ở đây. | `bc/workflow` + `bc/execution/acl` | Chạy BA → SA → Approval → Dev trong worktree → test; crash giữa chừng resume đúng |
| **P7 Studio + điều hướng mới** | Shell mới với 11 mục; Workflow Studio (form trước, canvas sau); Mission Control V1 trên facts đã lưu. | UI | Chạy roaming từ UI, thấy stage, approval, diff, test |
| **P8 Provider control plane** | Bọc account/usage: routing, budget reserve/settle, WAITING_CAPACITY, failover từ checkpoint. | `bc/provider`, `bc/budget` | Giả lập hết quota giữa node → chờ hoặc chuyển provider, không mất tiến độ |
| **P9 Knowledge feedback** | KnowledgeProposal sau run, review, STALE khi code đổi, conflict không ghi đè. | Proposal UI | Run roaming tạo proposal; duyệt → publish revision mới |

Domain Studio (Domains) đi kèm P4–P5 ở mức tối thiểu (domain list + rule theo domain); bản đầy đủ sau P9.

## 6. Đưa AO vào layout đích (`cmd/ internal/<bc> platform/ integrations/`)

Layout đích theo đề xuất của chủ sản phẩm (§9 bản ChatGPT). Phát hiện chặn đường:

| Package AO | Bị import bởi | Ý nghĩa |
|---|---|---|
| `internal/domain` (9.5k dòng, gồm Session, Project, AgentAccount, PR, Automation, Usage…) | **175/255** package | Một shared kernel cho mọi thứ, không thuộc riêng BC nào |
| `internal/ports` (Agent, Chat, SCM, Session, Notifications…) | **157/255** package | Như trên, cho interface |

Tách `domain`/`ports` thành domain riêng từng BC trong một lần = sửa 175 package một lúc. Cách làm từng bước:

1. **Di chuyển cơ học (không đổi logic):** đổi module path về repo fork, `git mv` các package AO vào thư mục đích theo bảng dưới, sửa import bằng công cụ. Kiểm bằng `go build ./... && go test ./...` + smoke. `domain` và `ports` tạm thành `internal/sharedkernel/` (DDD gọi là Shared Kernel).
2. **Tách dần theo BC khi BC đó có việc thật:** chuyển type từ `sharedkernel` sang `internal/<bc>/domain`, để lại `type X = <bc>.X` (Go type alias) ở chỗ cũ cho code cũ vẫn biên dịch; xoá alias khi không còn ai dùng. Không có lần nào phải sửa 175 package cùng lúc.
3. **Layout 4 tầng** (`domain/application/infrastructure/interfaces`) áp dụng đầy đủ cho BC mới (domainmodel, knowledge, context, workflow, budget). Code AO được dời vào ở dạng hiện có; chỉ chia 4 tầng khi BC đó được viết lại. BC đơn giản (artifact, identity) để phẳng, như spec đã nói.

| Thư mục đích | Package AO dời vào | Ghi chú |
|---|---|---|
| `cmd/server` | `main.go` (**đã dời, P3a**); `daemon` giữ ở `internal/daemon` vì `internal/cli` import cho `ao daemon` | Daemon hiện là một process; `cmd/worker` chỉ tách khi cần |
| `cmd/ao` | `cli` | CLI gọi daemon qua HTTP như hiện tại |
| `internal/execution` | `service/session`, `session_manager`, `lifecycle`, `sessionguard`, `sessionid`, `service/chat`, `service/shellterm`, `terminal` | Lớn nhất (~180k dòng bao đóng); dời nguyên khối |
| `internal/agent` | `agentlaunch`, `service/agent`, `harness*` trong domain | AgentDefinition/Role mới viết ở đây |
| `internal/workspace` | `adapters/workspace`, `workspacewatch`, `gitdefault`, `filesnapshot` | |
| `internal/provider` | `service/agentaccounts`, `service/agentauth`, `providerkeys`, `adapters/agentaccount` | |
| `internal/budget` | `service/usage`, `pricing`, `observe/usage` | Reservation/settlement mới |
| `internal/quality` | `review`, `service/review`, `service/pr`, `observe/scm`, `autoreview`, `reviewgateway` | |
| `internal/task` | board/delegation (`service/session/delegation.go`), `adapters/tracker` | Tách khỏi execution ở bước 2 |
| `internal/skill` | `skillassets`, `service/chat/skills.go` | |
| `internal/artifact` | `artifactversions`, `sessionartifacts`, `attachmentstore` | |
| `internal/identity` | `service/project`, `projectconfig` | Project nằm ở đây hoặc BC `project` riêng — chốt ở P2 |
| `internal/{domainmodel,knowledge,context,workflow}` | — (`domain/pipeline.go` vào `workflow`) | Mới, layout 4 tầng đầy đủ |
| `platform/persistence` | `storage/sqlite` + migrations, sqlc (**đã dời, P3a**) | `migrations/` ở gốc chỉ khi sqlc config đổi theo |
| `platform/eventbus` | `cdc` → `platform/eventbus/cdc` (**đã dời, P3a**) | |
| `platform/observability` | `adapters/telemetry` (bản local), `lifecyclelog`, `reqid` | Phần gửi ra ngoài đã xoá ở đợt DV |
| `platform/sandbox` | `adapters/runtime`, `adapters/container`, `adapters/systemexec`, `process*` | |
| `platform/secrets` | phần credential trong `agentauth`/`providerkeys` | Tách ở P8 |
| `integrations/{claude,codex,gemini}` | `adapters/agent/<harness>` | Harness khác: xoá theo P3 |
| `integrations/git` | `adapters/scm` | |
| `integrations/obsidian` | — | Mới (P4) |
| `web/` | `frontend/`, `packages/product-ui` | Xem câu hỏi 6 |

## 7. Câu hỏi cần người sở hữu chốt

1. **A, B hay C?** (đề xuất C)
2. Thuật ngữ: `Workflow*` (spec) hay `Flow*` (fork)?
3. Mobile/LAN: giữ hay cắt?
4. Lưu trữ: xác nhận SQLite + FTS5 thay PostgreSQL?
5. Các nhánh fork đang mở: có muốn giữ nhánh nào nguyên trạng không?
6. `web/`: sản phẩm vẫn là app desktop Electron như AO, hay chuyển sang web app chạy trên browser?
