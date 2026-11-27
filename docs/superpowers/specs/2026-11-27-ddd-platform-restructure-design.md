---
status: approved 2026-11-27
date: 2026-11-27
---

# Thiết kế: tái cấu trúc fork AO thành Domain-Driven AI Engineering Platform

Đặc tả nguồn: `docs/fork/ddd-spec/00–15` (bản v0.1, chép từ workspace `specification/`). Đánh giá chi tiết, số đo và bảng map: `docs/fork/ddd-spec/16-assessment-and-build-plan.md` (gọi tắt **[16]**). Tài liệu này chốt hướng; [16] giữ dữ liệu.

## 1. Mục đích và lý do

Hệ thống nghiệp vụ sâu (ví dụ MyVNPT) không phát triển được bằng agent chỉ đọc repo. Sản phẩm lấy **business domain làm trung tâm**: tri thức nghiệp vụ nằm trong Obsidian vault, có nguồn và phiên bản; context engineering chọn đúng tri thức cho từng agent; workflow điều phối có trạng thái và phục hồi được; agent chỉ thực thi trong phạm vi được giao; provider là tài nguyên thay thế được. Giá trị lâu dài nằm ở Knowledge và Context, không ở model hay runtime.

Lý do làm lại kế hoạch: đợt trước chạy nhiều session agent song song (wave/autoscale) trên fork, code sinh nhanh hơn khả năng kiểm soát, và hướng (Flow + Mission Control) chưa bám bộ đặc tả DDD.

## 2. Mục tiêu, không làm, phản mục tiêu

**Mục tiêu**
- `ai-orchestrator` có layout theo bounded context (§4) và chạy được suốt quá trình chuyển.
- Lát dọc đầu tiên: **CR "mua hộ roaming không cần đăng nhập"** đi hết: import rule từ vault → phân tích phạm vi domain → context package có nguồn → BA → SA → human approval → dev trong worktree → test → quality gate → knowledge proposal.
- Mọi tính năng AO còn lại đều có bounded context đích và mục điều hướng; tính năng không có chỗ thì ẩn rồi xoá.
- `ai-orchestra` bị bỏ sau P1.

**Không làm (giai đoạn này)**
- Không đổi sang web app; sản phẩm là **desktop Electron** như AO.
- Không PostgreSQL, pgvector, Neo4j, Kafka, microservice.
- Không marketplace, multi-tenant, tự deploy production.
- Không viết lại agent runtime/session/terminal của AO.

**Phản mục tiêu (làm xong vẫn coi là hỏng nếu)**
- Phần mới (domain/knowledge/context/workflow) viết lẫn vào `domain/`, `service/` kiểu AO, không có ranh giới.
- Một PR đụng hàng trăm package hoặc trộn dời code với đổi logic.
- Chạy lại kiểu wave song song nhiều agent không ai review kịp.
- Agent âm thầm sửa business rule đã duyệt, hoặc AI suy luận được coi là rule.
- App không chạy được trong lúc chuyển.

## 3. Ràng buộc

- AO: backend Go 424k dòng / 255 package, frontend Electron 317k dòng, SQLite + sqlc, 269 migration, OpenAPI code-gen (`npm run sqlc`, `npm run api`).
- `internal/domain` bị 175/255 package import; `internal/ports` bị 157/255 → shared kernel thực tế.
- Bao đóng `service/session` = 75 package, ~177k dòng → runtime không port nhỏ được.
- GitNexus đã index `ai-orchestra`; không nối TS↔Go, flow không đầy đủ → map UI↔backend qua route HTTP/OpenAPI.
- Account thật: Claude `pro`, Codex `plus`; quota giới hạn → tối đa 1–2 session agent đồng thời.
- Không sửa migration đã merge; chỉ thêm migration mới.
- Invariant trong `docs/fork/ddd-spec/07-business-invariants.md` là bắt buộc (approval pin hash, không retry side effect chưa reconcile, không secret trong prompt/log/vault).

## 4. Phương án đã cân nhắc

| Phương án | Tóm tắt | Đánh đổi | Kết luận |
|---|---|---|---|
| A. Lõi trống, port từng tính năng | Reset fork, copy từng cụm từ `ai-orchestra` | Sạch, nhưng lần port đầu (session) đã ~42% backend + gộp migration + gần hết UI shell; rủi ro hỏng session/restore | Loại |
| B. Cắt tại chỗ | Giữ snapshot, sửa trong layout AO | Nhanh, nhưng phần mới lẫn vào code AO, không có ranh giới "đã nhận" | Loại |
| **C. Hai tầng + dời dần vào layout đích** | AO là substrate; dời cơ học từng cụm vào thư mục bounded context; tách shared kernel dần bằng type alias; context mới xây sạch theo 4 tầng DDD | Hai phong cách code tồn tại một thời gian; ACL tốn công | **Chọn** (chủ sản phẩm duyệt 2026-11-27) |

## 5. Thiết kế đã chốt

### 5.1 Layout đích (bên trong `backend/`)

```text
backend/
├── cmd/server        # daemon (main.go + daemon)
├── cmd/ao            # CLI, gọi daemon qua HTTP
├── internal/
│   ├── sharedkernel/ # tạm: internal/domain + internal/ports của AO
│   ├── domainmodel/ knowledge/ context/ workflow/      # mới, 4 tầng
│   ├── execution/ agent/ task/ provider/ budget/
│   ├── workspace/ skill/ quality/ artifact/ identity/
├── platform/  persistence/ eventbus/ filesystem/ sandbox/ secrets/ observability/
└── integrations/ obsidian/ git/ claude/ codex/ gemini/
frontend/   # Electron — "web/" trong sơ đồ gốc chỉ là mô tả
```

Map package AO → thư mục: bảng §6 trong [16]. Context mới theo layout 4 tầng:
`domain/{aggregate,entity,valueobject,event,repository,service}`, `application/{command,query,handler}`, `infrastructure/{persistence,messaging}`, `interfaces/http`. Context đơn giản (artifact, identity) để phẳng.

### 5.2 Quy tắc dời code AO

1. **PR dời chỉ dời**: `git mv` + sửa import, không đổi logic. Kiểm: `go build ./... && go test ./...`, frontend typecheck, smoke (project → session → worktree → PR).
2. `internal/domain` + `internal/ports` → `internal/sharedkernel/` ở bước dời đầu tiên.
3. Tách type khỏi sharedkernel chỉ khi context đó có việc thật: chuyển type sang `internal/<bc>/domain`, để `type X = bc.X` ở chỗ cũ; xoá alias khi hết người dùng.
4. Context mới **không import** package AO trực tiếp; đi qua anti-corruption layer `internal/<bc>/infrastructure/acl` (ví dụ workflow → execution qua `acl.SessionGateway`).
5. Hướng phụ thuộc: `internal/<bc>` → `platform/*`, `integrations/*` qua interface; không có import ngược từ `platform`/`integrations` vào `internal/<bc>`.

### 5.3 Quyết định sản phẩm

| Mục | Quyết định | Ai quyết |
|---|---|---|
| Lưu trữ | SQLite + FTS5; embedding sau khi có bộ câu hỏi đánh giá retrieval | Chủ sản phẩm duyệt đề xuất |
| Process | `cmd/server` (daemon) + `cmd/ao` (CLI); `cmd/worker` chỉ khi cần | Chủ sản phẩm duyệt đề xuất |
| Desktop | Electron, giữ `frontend/` | Chủ sản phẩm |
| Thuật ngữ | Dùng bộ của spec: `WorkflowDefinition`, `WorkflowRun`, `NodeExecution`, `AgentRun`… `Flow*` trong CONTEXT.md và `domain/pipeline.go` đổi theo ở P2 | Chủ sản phẩm (2026-11-27) |
| Mobile/LAN | Không dùng → đưa vào danh sách cắt P3b (`mobilebridge`, LAN listener, pairing, `packages/mobile`) | Chủ sản phẩm (2026-11-27) |
| Vault | Định dạng vault của app Obsidian (Markdown + frontmatter + wikilink = graph nhúng). Dữ liệu thật/fixture roaming làm sau, ở P4 | Chủ sản phẩm (2026-11-27) |
| Knowledge lifecycle | Discover → Structure → Validate → Publish → Consume → Learn (quay lại Discover). Trạng thái tài liệu: DRAFT, IN_REVIEW, APPROVED, DEPRECATED, STALE. P4 làm Discover/Structure/Validate/Publish; P5 làm Consume; P9 làm Learn | Chủ sản phẩm |
| Code index | GitNexus làm adapter Source Code Index (`integrations/gitnexus` hoặc trong `context/infrastructure`) | Đề xuất của Claude |
| Cách làm việc | Một phase một lúc; ≤ 2 session agent; chủ sản phẩm code/duyệt từng phase; không autoscale | Chủ sản phẩm |

### 5.4 Quyết định kỹ thuật bổ sung (đề xuất của Claude sau builder check)

- **Module path mới:** `github.com/hainguyen97dev/ai-orchestrator/backend` (khớp repo fork). Đổi trong **một** PR thuần cơ học ở P3a.
- **Ngoại lệ "PR lớn":** PR đổi module path và PR dời `domain`/`ports` → `sharedkernel` được phép đụng nhiều package, với điều kiện diff **chỉ gồm dòng import/package path** (thêm script CI kiểm: mọi hunk ngoài file generated chỉ là import). Mọi PR khác theo quy tắc cụm nhỏ.
- **Migration:** `storage/sqlite` dùng `//go:embed migrations/*.sql` tương đối theo package, nên dời cả thư mục `storage/sqlite` (kèm `migrations/`) sang `platform/persistence/sqlite` giữ nguyên tên file → thứ tự và checksum migration không đổi. Không gom migration ra gốc. Cập nhật `sqlc.yaml` cùng PR.
- **Giữ ranh giới bằng test:** P3a thêm test kiến trúc (`go list` import graph) chặn: `internal/<bc mới>` import package AO trực tiếp ngoài ACL; `platform/*`, `integrations/*` import `internal/<bc>`. Chạy trong CI.
- **Smoke tự động:** dựng trên harness stub có sẵn ở `backend/e2e` (ví dụ `chat_approval_restart_stub_test.go`), không cần account thật: project → session → worktree → diff. Bước PR làm thủ công một lần mỗi phase.
- **`ai-orchestra`** giữ làm bản đối chiếu đến hết P1, sau đó bỏ.

### 5.5 Phase

| Phase | Việc chính | Xong khi |
|---|---|---|
| P0 Dừng + ổn định | Dừng autoscale; kê và quyết các nhánh đang mở (`pipeline-durable-run`, `mission-control-v0`, `dv-1-kill-switch`, `t1-store`, `plan-a1-a2`, `plan-dv*`, `ai-orchestrator-test-build` có thay đổi chưa commit); smoke baseline | `main` sạch, smoke pass, không session nền |
| P1 Bản đồ + cổng nhận | Index GitNexus cho `ai-orchestrator`; bảng tính năng ↔ route HTTP ↔ route UI ↔ package ↔ bảng DB ↔ test; xác nhận tree trùng `ai-orchestra` | Mọi cụm có quyết định; `ai-orchestra` bỏ |
| P2 Strategic DDD | Thống nhất thuật ngữ; context map có substrate + ACL; event v1; thứ tự ưu tiên nguồn (requirement vs code vs vault) | Spec 01/04/05/06/14 + CONTEXT.md khớp nhau |
| P3a Dời khung | Đổi module path; tạo `cmd/`, `platform/`, `integrations/`; dời sharedkernel, persistence, eventbus | Build/test/smoke pass |
| P3b Dời theo cụm + cắt | Mỗi cụm một PR dời (§6 [16]); song song cắt cloud/device/importer/telemetry remote | Mỗi PR smoke pass |
| P4 Knowledge | Vault standard + template, parser/validator, registry SQLite + FTS5, typed link, revision/hash, proposal qua git branch | Import rule roaming; sửa file → reindex; lỗi parse → quarantine |
| P5 Context | Metadata + lexical + link expansion, GitNexus adapter, ContextPackage có manifest/citation/token estimate | Package cho CR roaming có rule + API + code kèm nguồn |
| P6 Workflow engine | Definition/version, run, node execution, approval pin hash, checkpoint, lease, idempotency; ACL tới execution; provider port + bảo mật tối thiểu | BA→SA→approval→dev→test chạy; crash giữa chừng resume đúng |
| P7 UI | Điều hướng 11 mục; Workflow Studio (form trước); Mission Control V1 | Chạy roaming từ UI |
| P8 Provider/Budget | Routing, reserve/settle, WAITING_CAPACITY, failover từ checkpoint | Hết quota giả lập không mất tiến độ |
| P9 Knowledge feedback | Proposal sau run, review, STALE, conflict không ghi đè | Proposal được duyệt → revision mới |

## 6. Chạy song song: lane theo bounded context

Mục tiêu: nhiều worktree chạy cùng lúc mà không đụng file nhau, và mỗi session ở yên một lane (không phải đổi session qua lại).

**Quy tắc**
- Một lane = một nhóm thư mục bounded context + một worktree + một session sống lâu. Session chỉ sửa file trong thư mục của lane.
- Mỗi lane gắn cố định một harness/account (Go dài → Codex; docs/UI/review → Claude) để ít phải đổi account khi hết quota.
- **Hotspot dùng chung** — mỗi lúc chỉ 1 PR mở đụng tới: `platform/persistence/sqlite/migrations/*`, `httpd/apispec/openapi.yaml` + `frontend/src/api/schema.ts`, wiring trong `cmd/server` (daemon). Lane gom thay đổi hotspot vào **một PR cuối** của lane, xếp hàng merge.
- Tối đa 2 lane code + 1 lane docs/review cùng lúc.

| Lane | Thư mục sở hữu | Phase | Chạy song song với |
|---|---|---|---|
| **L-doc** Spec/DDD | `docs/`, `docs/fork/ddd-spec/`, CONTEXT.md | P1, P2 | Mọi lane |
| **L0** Khung | toàn repo (chỉ dời + import) | P3a | Chỉ L-doc — **độc quyền**, không lane code nào khác chạy |
| **L1** Cắt | `mobilebridge`, `devices`, cloud, `sessionimport`, telemetry remote, `packages/mobile`, `packages/cloud-client` | P3b | L2 |
| **L2** Knowledge + Context | `internal/knowledge`, `internal/context`, `internal/domainmodel`, `integrations/obsidian`, `integrations/gitnexus` | P4, P5 | L1, rồi L3 |
| **L3** Workflow | `internal/workflow`, `internal/execution/acl` (chỉ ACL, không sửa execution) | P6 | L2 |
| **L4** Provider/Budget | `internal/provider`, `internal/budget`, `platform/secrets` | P8 | L2/L3 |
| **L5** UI | `frontend/src/renderer/**` | P7 | L4 |

P3b dời cụm AO (execution, quality…) là việc của L0 làm tiếp sau P3a, tuần tự, vì đụng import rộng.

## 7. P0 — xử lý nhánh (trạng thái sau fetch 2026-11-27, `main` = `8a59bb7`)

| Nhánh / worktree | Tình trạng | Xử lý |
|---|---|---|
| `chore/a0-ci`, `docs/a0-fork-direction`, `chore/native-automerge`, `fix/pipeline-lint`, `fix/automerge-permissions`, `feat/pipeline-foundation`, `chore/agent-automerge` | Đã merge (#1–#6, #9) | Xoá nhánh local + remote |
| `feat/dv-1-kill-switch`, `ao/pipeline-durable-run`, 10 nhánh `orchestrator/*` | 0 commit riêng | Xoá nhánh + gỡ worktree AO tương ứng |
| PR #8 `feat/t1-domain`, `feat/t1-store` (wip) | ToolProfile viết vào `domain/` kiểu AO, lệch layout mới | Tag `archive/t1-*`, đóng PR; ý tưởng dùng lại ở P6 (permission policy của `internal/agent`) |
| PR #10 `docs/plan-a1-a2` | Contract Role/Skill/Knowledge theo hướng Flow | Tag `archive/plan-a1-a2`, đóng PR; nội dung làm đầu vào cho P2 |
| `feat/mission-control-v0` | 1 commit, 5 file UI | Tag `archive/mission-control-v0`; làm lại ở P7 |
| PR #7 `docs/plan-dv-w1`, `docs/plan-dv` | Inventory de-vendor đã kiểm chứng (docs) | **Merge #7** (chỉ docs) làm đầu vào cho L1; xoá `docs/plan-dv` |
| `ai-orchestrator-test-build` + thay đổi chưa commit | Build identity cho bản fork chạy song song AO cài sẵn (`AO_FORK_TEST_BUILD`, userData `~/.ao/fork-test`) | Commit sang nhánh `chore/fork-test-build`, mở PR — cần cho dogfood |
| `runbooks/autoscale.py` | Đã dừng 2026-11-27 | Không chạy lại |

**Kết quả thực hiện (2026-11-27, chủ sản phẩm duyệt):** chủ sản phẩm chọn **xoá** thay vì tag lưu trữ. Đã đóng PR #7, #8, #10; xoá toàn bộ nhánh local trừ `main` và 5 nhánh remote (`docs/plan-a1-a2`, `docs/plan-dv`, `docs/plan-dv-w1`, `feat/pipeline-foundation`, `feat/t1-domain`); gỡ 11 worktree. Repo fork còn `main` = `8a59bb7`. Code chưa commit của `t1-store`, `dv-1-kill-switch` và bản fork-test-build được lưu thành patch ở `../archive/2026-11-27/` (workspace) (ngoài repo); bản fork-test-build còn trong `git stash`. Bản ghi session của AO cho project `aio` vẫn trỏ tới worktree đã gỡ — dọn trong app AO khi chạy lại.

## 8. Để lại cho người làm plan

- Thứ tự dời các cụm trong P3b (gợi ý: lá trước — budget, provider, quality — execution sau cùng).
- Công cụ sửa import (gopls rename, `gofmt -r`, script) và cách cập nhật sqlc/OpenAPI/build scripts sau khi dời.
- Tên chính xác của interface ACL, schema bảng SQLite cho knowledge/workflow.
- Chi tiết UI từng màn hình (sẽ brainstorm riêng ở P7).
- Plan chi tiết chỉ viết cho phase sắp chạy; phase sau viết trên code đã merge.
