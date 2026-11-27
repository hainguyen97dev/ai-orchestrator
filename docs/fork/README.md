# Hướng fork `hainguyen97dev/ai-orchestrator`

Fork này biến Agent Orchestrator thành workspace cho một người đi hết vòng tri thức dự án → DDD → code trên branch → test → review → giao kết quả. Mỗi bước chọn được agent, model, tool (builtin/MCP/shell) và theo dõi được trong Mission Control. Đọc file này trước khi làm task tính năng; plan thực thi nằm ở [`docs/superpowers/plans/`](../superpowers/plans/), bắt đầu từ [roadmap](../superpowers/plans/2026-11-26-00-roadmap.md).

## Quyết định đã chốt

Bản sao từ [roadmap §1](../superpowers/plans/2026-11-26-00-roadmap.md#1-quyết-định-đã-chốt-mặc-định-đổi-được). Roadmap là nguồn chuẩn; khi hai bản lệch nhau thì theo roadmap.

| ID | Quyết định | Giá trị |
|---|---|---|
| D1 | Mức tự động khi giao kết quả | 3 mức: `manual` / `auto-pr` / `auto-merge-when-gates-pass`. Dogfood dùng `auto-merge-when-gates-pass` cho PR rủi ro thấp (roadmap §7). |
| D2 | Pipeline | Tuyến tính trước, dựa trên `backend/internal/domain/pipeline.go` (commit `a7a41a1`). Graph/join làm ở A3b, chỉ thêm, không thay. |
| D3 | Cắt tính năng | Cloud/sharing: ẨN. Device: ẨN. Importer: chỉ Claude + Codex. Mobile: giữ, ngoài đường găng. Automation: GIỮ. Telemetry/Sentry: TẮT. Chỉ xoá code sau khi phân tích phụ thuộc (đợt P). |
| D4 | Tool | Gồm builtin, MCP và shell. Thứ tự: node → role → project; tầng dưới chỉ được thu hẹp. Adapter phải báo đúng mức `enforced` / `best-effort` / `none`. |
| D5 | Scope cleanup | Xong task phải dọn file ngoài kế hoạch hoặc lệch mục tiêu (roadmap §6). Về sau thành node `scope-check` trong Flow. |
| D6 | Agent | Mỗi task/node chọn harness, model, effort, permissions, account. Account hiện có: Claude `pro` (`device-claude`), Codex `plus` (`device-codex`). |
| D7 | Tracking + sign-in của nhà phát hành | Tắt rồi xoá: PostHog, Sentry, telemetry gửi ra ngoài, Cloud sign-in (WorkOS còn sót, control plane). Telemetry **local** (usage, metrics trong SQLite) giữ lại vì Mission Control/A9 cần. Làm ở đợt DV; quy tắc thường trực ở roadmap §6a, ghi nhận vào [devendor-log.md](./devendor-log.md). |

## Specs

Bản sao trong repo của workspace `feature-surgery/`. Worker trong worktree chỉ đọc bản này.

- [Danh mục và đánh giá tính năng](./specs/feature-inventory.md)
- [Danh mục 16 nhóm 1DevTool và quyết định cho AO](./specs/1devtool-capability-register.md)
- [Plan tích hợp theo lát A0–A8](./specs/ao-feature-integration-plan.md)
- [Các phương án cắt và phạm vi ảnh hưởng](./specs/pruning-decisions.md)
- [Workflow/Pipeline và Mission Control](./specs/workflow-mission-control.md)
- [Workflow tri thức dự án → DDD → code → testing](./specs/project-knowledge-ddd-workflow.md)
- [Bản vẽ phương án workflow và Mission Control](./specs/workflow-blueprint.md)
- [Flow Builder: dựng flow, gán role và tri thức, rồi Run](./specs/flow-builder.md)
- [State machine ví dụ: CMS Permission Review](./specs/cms-permission-flow-state-machine.md)
- [Mô hình role, skill, năng lực và tri thức dự án](./specs/role-skill-knowledge-model.md)
- [Settings cho Role, Skill và Project Knowledge](./specs/settings-role-skill-project-knowledge.md)

Link sang vault nghiên cứu 1DevTool được giữ dạng text `(workspace: 1devtool-research/...)` vì vault nằm ngoài repo.

## Plans

- [00 Roadmap](../superpowers/plans/2026-11-26-00-roadmap.md): lane, giới hạn worker, hotspot (§4), quy trình task (§5), Scope cleanup (§6), de-vendor (§6a), policy merge (§7).
- [01 A0 Foundation](../superpowers/plans/2026-11-26-01-a0-foundation.md)
- [02 T1 ToolProfile + MCP backend](../superpowers/plans/2026-11-26-02-t1-tool-profiles.md)
- [03 UI-S Skill UI](../superpowers/plans/2026-11-26-03-ui-skill.md)
- [04 Chạy bằng ai-orchestra](../superpowers/plans/2026-11-26-04-run-with-ai-orchestra.md)

## Ngoài phạm vi

Không thiết kế hay code cho các mục sau, kể cả khi tài liệu cũ ở workspace (ví dụ `docs/02-architecture` về multi-tenancy/RBAC) có nhắc tới:

- Multi-tenancy.
- RBAC tổ chức.
- Cloud (sharing, control plane, sign-in).
- Device.
- IDE client, HTTP client, DB client, Docker client tích hợp sẵn.
