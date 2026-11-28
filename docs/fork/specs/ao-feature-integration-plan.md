# Plan đắp năng lực 1DevTool đã chọn vào AI Orchestra

**Baseline:** AO `10028ef170` (26/11/2026), working tree sạch lúc rà soát. Danh mục đầu vào là [16 nhóm và các hành vi nhỏ đã bóc tách](./1devtool-capability-register.md). Plan này là backlog/kiến trúc triển khai, **chưa sửa code AO**. Mục tiêu đầu tiên: một người dựng flow dev, chọn Role + Skill + Project Knowledge, bấm Run và đi hết DDD → branch → test → review/delivery trong Mission Control. Cùng engine mở rộng được PO/BA/SA/Dev/Test sau đó.

**Repo triển khai:** repo này (`https://github.com/hainguyen97dev/ai-orchestrator`), commit import `bb18b82` có cùng tree với source `10028ef170`. Repo nguồn `ai-orchestra` (upstream, checkout ngoài repo) vẫn trỏ tới remote cũ; mọi nhánh/PR mới của plan này phải bắt đầu từ checkout/repo mới.

## 1. Quyết định sản phẩm và ranh giới

| Quyết định | Cách áp dụng |
|---|---|
| Actor | Một participant có thể mang nhiều role ở các node; preset đầu tiên là Developer. Role công việc không phải quyền duyệt. |
| Execution | `manual`, `agent`, `assisted`; một branch/worktree mặc định. Fan-out nhiều worker chỉ khi người dùng chọn và phạm vi độc lập. |
| Knowledge | Project Knowledge và Skill có version; Run ghim source ref/hash, role/skill versions, base commit và flow version. |
| Flow | Definition graph có dependency/gate, không hardcode thứ tự PO→BA→SA→Dev→Test. Form editor trước, canvas sau. |
| Runtime | Go daemon sở hữu scheduler, decisions, persistence và recovery. AO Session Manager sở hữu agent/worktree; frontend chỉ render/send action. |
| Delivery | Test pass không tự approve. Participant chọn PR hoặc merge theo policy; kết quả provider phải được xác nhận. |

**Tái dùng AO hiện có:** project + ProjectConfig, session/worker/worktree, Chat/TUI agent adapters, diff/PR/CI/review, usage, notification, CDC/SSE, Settings shell và Board. `ProjectConfig.Worker/Orchestrator/Reviewers` hiện là **harness/model override**, không phải PO/BA/SA/Dev/Test. Chat Skills API hiện **liệt kê skill live từ provider theo session**, không phải thư viện skill có version cho flow. Project Cues là quick action, Automation là lịch chạy prompt/session; không dùng chúng làm FlowRun trá hình. Bằng chứng: `backend/internal/domain/{projectconfig,cue,automation}.go`, `backend/internal/service/chat/skills.go`, `backend/internal/service/session/delegation.go`, `frontend/src/renderer/components/{ProjectSettingsForm,SessionsBoard,AutomationsView}.tsx`.

## 2. Các lát triển khai

| ID | Mức | Lát dọc và đầu ra người dùng | Phụ thuộc | Tiêu chí hoàn tất |
|---|---|---|---|---|
| A0 | P0 | Baseline + contract: chốt use case dev, trạng thái nguồn DDD, terminology, API/event/state machine, smoke AO hiện tại | — | Có baseline commit và smoke project→session→worktree→PR; contract được review, không trùng `RoleOverride`/Chat skill API |
| A1 | P0 | **Settings Roles + Skills:** tạo/sửa/version RoleProfile, SkillDefinition; xem skill live từ provider và biết nguồn của nó | A0 | Một participant gán nhiều role; sửa bản mới không đổi run cũ; skill bị thiếu/không hỗ trợ được báo rõ |
| A2 | P0 | **Project Knowledge:** local repo/docs/ADR, DDD profile, source priority, preview/snapshot | A0 | Source có ref/hash và committed/draft; conflict/thiếu nguồn chặn hoặc yêu cầu quyết định; không âm thầm đổi snapshot trong run |
| A3 | P0 | **Flow Builder:** blank/template/AI draft, `work/gate/test/join`, role/skill/knowledge binding, manual/agent/assisted, validate + preview, save version | A1+A2 | Graph hợp lệ; test command có thật; node sau nhận đúng artifact contract; Preview không tạo worker; chỉ người dùng bấm Run |
| A4 | P0 | **Run engine + checkpoint:** FlowRun/NodeRun/Artifact/GateDecision bền, manual/assisted path và retry cap | A3 | Node phụ thuộc không chạy sớm; assisted chờ người nhận output; restart/replay không nhân đôi transition/action; pause/resume/cancel đúng |
| A5 | P0 | **Preset dev DDD:** knowledge → DomainPlan → code trên một AO worktree → domain/architecture/affected contract tests → self-review → PR-ready | A4 | Chạy thử trên repo mẫu bằng scratch data; test đỏ quay lại code; DomainPlan/source refs xem được; PR chỉ tạo khi người dùng chọn |
| A6 | P0 | **Mission Control V1:** một run có stage map, role/skill/knowledge snapshot, worker/branch, test, PR/CI, Needs you và recovery | A4+A5 | Click attention mở đúng artifact/log/diff; restart/project switch không sai state; action có audit và lỗi rõ |
| A7 | P1 | Preset PO→BA→SA→Dev→Test; cùng participant đổi role; PlanRevision và task fan-out có kiểm soát | A6 | Role thay đổi không đổi identity; branch song song không trùng file/contract; revision có diff và checkpoint khi đổi boundary |
| A8 | P2 | Nâng cấp chọn lọc: account pool, quota freshness, Agent Changes collision, canvas, remote Mission Control | Dữ liệu dùng thực tế + runtime research | Mỗi mục có problem/acceptance riêng trước khi triển khai; không đưa IDE/HTTP/DB/Docker vào đường găng |

`Mission Control V0` có thể làm sớm, độc lập với A1–A4: tổng hợp Board/session/PR/CI/usage hiện có để thử UX. Nó không được hiển thị một `FlowRun` giả khi chưa có runtime.

## 3. Contract và nơi sửa AO

| Vùng AO | Công việc dự kiến | Ranh giới cần giữ |
|---|---|---|
| `backend/internal/domain/` | RoleProfile, SkillDefinition/SkillRef, KnowledgeSource/Snapshot, FlowDefinition/Run/NodeRun, GateDecision, ArtifactRef | Không tái nghĩa `ProjectConfig.RoleOverride`; không lưu display status như nguồn sự thật |
| `backend/internal/service/` | Settings services, snapshot resolver, graph validator, run scheduler/reconciler, artifact handoff, test policy | Dùng Session Manager hiện có để tạo/resume worker, không thêm controller agent thứ hai |
| `backend/platform/persistence/sqlite/` | Migrations/queries/store cho definition version, run facts, decisions, artifacts, source refs, idempotency keys | Chỉ thêm migration mới; dùng trigger `change_log`/CDC theo AO; regenerate `sqlc` |
| `backend/internal/httpd/controllers/` + `apispec` | API code-first cho settings, flow definitions, preview, runs, decisions, actions và Mission read | Regenerate OpenAPI + TS schema cùng thay đổi; giữ envelope/error/request ID |
| `frontend/src/renderer/components/` | Settings Roles/Skills, Project Knowledge, Flow Builder, Mission Control, attention drill-down | Frontend không điều phối graph hoặc suy ra run completion từ UI state |
| `backend/internal/cli/` | Thin HTTP commands khi cần cho automation/agent thao tác flow | Không mở SQLite/spawn trực tiếp từ CLI |

**Durable minimum:** `FlowDefinitionVersion`, `FlowRun`, `NodeRun`, `ArtifactRef`, `GateDecision`, `KnowledgeSnapshot`, `PlanRevision` (khi A7); settings version riêng. Node state thay đổi bằng command có `expected_version` và idempotency key. Read model tổng hợp trạng thái node với session/PR/CI/usage facts, không sao chép những display status có sẵn.

**Skill boundary:** AO tiếp tục đọc provider skills live qua Chat Skills API. Flow Settings lưu skill reference/version của skill AO quản lý; với provider skill không có immutable version/content, preflight ghi identity/source/hash nếu đọc được hoặc báo giới hạn tái lập, không giả vờ đã ghim nội dung.

**Knowledge boundary:** bản đầu dùng local repo/files. `ddd-eda-lab` có spec CMS untracked tại lần rà soát, nên preview phải cho thấy `working-tree draft` và snapshot hash; committed ref và working-tree snapshot là hai lựa chọn rõ. BookStack/Jira/Qdrant thuộc phase mở rộng, không là điều kiện chạy A5.

## 4. Kiểm chứng theo cổng

| Cổng | Ca kiểm chứng có ý nghĩa |
|---|---|
| Settings | Một người giữ PO+BA+Dev; Role v2/Skill v2 không thay Run v1; skill provider biến mất thì preflight fail có hướng sửa. |
| Knowledge | File spec đổi sau khi Run không thay source refs; draft và conflict hiển thị; sai project scope không lọt vào node. |
| Builder | Dependency thiếu/cycle ngoài retry cap bị từ chối; manual node không cần agent; assisted cần người chấp nhận; graph preview không có side effect. |
| Runtime | Daemon restart ở giữa spawn/approval/test/PR không tạo worker, branch, decision hoặc PR trùng; stale click/webhook không lùi state. |
| DDD dev flow | Domain invariant và architecture test chạy theo profile; test fail chặn delivery; reviewer đổi code thì kiểm lại test/head; một branch mặc định. |
| Mission Control | Needs you mở đúng checkpoint; run/role/skill/knowledge version nhìn thấy; status sau restart và desktop/mobile (nếu bật) nhất quán. |

Theo [AGENTS.md](../../../AGENTS.md), khi triển khai phải đọc [CONTRIBUTING.md](../../../CONTRIBUTING.md), tạo migration bằng `npm run migration:create`, không sửa migration đã merge, chạy `npm run sqlc` và `npm run api` cho contract, rồi kiểm tra Go/frontend/CI tương ứng. UI chạy thử trên scratch `AO_DATA_DIR`, không dùng dữ liệu AO thật của người dùng. Plan chưa bao gồm publish/deploy.

## 5. Thứ tự giao việc cụ thể

1. **Làm A0 trước:** cập nhật baseline/acceptance theo HEAD mới, khóa vocabulary và state machine một-dev-flow.
2. **A1 + A2:** Settings Role/Skill và Knowledge có API/UI đọc/ghi, version/preview; có thể phát triển tách PR nhưng contract dùng chung được chốt ở A0.
3. **A3 + A4:** Builder tạo definition version và Run engine chạy manual/assisted flow trước; sau đó nối agent node qua Session Manager.
4. **A5 + A6:** chạy preset DDD thật trên repo mẫu trong scratch workspace và dựng Mission Control trên facts đã lưu.
5. **A7/A8:** chỉ mở khi lát dev đầu tiên qua acceptance và các hành vi 1DevTool chưa chắc đã được runtime verify hoặc có bằng chứng nhu cầu.

Không xóa/ẩn tính năng AO hiện có trong cùng PR với A1–A6. Quyết định “đại phẫu” từng cụm được theo dõi riêng ở [pruning decisions](./pruning-decisions.md) sau phân tích phụ thuộc và dữ liệu đang lưu.
