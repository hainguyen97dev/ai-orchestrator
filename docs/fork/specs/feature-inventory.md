# Danh mục tính năng AO tại `070b255ce2`

**Lưu ý mốc:** bảng này là snapshot sau pull ở commit cũ. Để triển khai trên AO `10028ef170`, dùng [danh mục đối chiếu 1DevTool](./1devtool-capability-register.md) và [plan A0–A8](./ao-feature-integration-plan.md).

**Nhãn:** `Shipped` = tài liệu STATUS và code có mặt; `Preview` = code có gate/giới hạn; `Conditional` = cần build/entitlement/server; `New` = có commit `feat` sau tag stable `v0.15.6`. Đây chưa phải kết quả acceptance test. “Giữ/Cân nhắc” là khuyến nghị sơ bộ theo mục tiêu AO làm trung tâm điều phối agent, chưa phải lệnh xóa.

| Cụm | Trạng thái và bằng chứng | Mức gắn với AO | Khuyến nghị sơ bộ |
|---|---|---|---|
| Project, worker, worktree, session lifecycle | Shipped: `docs/STATUS.md`; `service/session`, `service/project`, `session_manager` | Lõi | **Giữ** |
| Agent adapters, TUI/Chat, native restore/handoff | Shipped: `ports/agent.go`, `adapters/agent`, `adapters/chatdriver`, `session_manager/interface_transition.go` | Lõi | **Giữ**, giới hạn provider theo nhu cầu |
| Orchestrator, delegation, board, PR/CI/review loop | Shipped: `docs/STATUS.md`; `observe/scm`, `service/pr`, frontend board/inspector | Lõi | **Giữ** |
| Workflow/Pipeline nhiều stage | 1DevTool documented; AO có delegation và automation nhưng chưa thấy definition/run/stage contract tương đương | Mục tiêu mới | **Phát triển** theo [đặc tả engine/UI](./workflow-mission-control.md) và [use case DDD → branch → test](./project-knowledge-ddd-workflow.md) |
| Mission Control theo mission/run | 1DevTool documented; AO có Board nhưng chưa có view participant/stage/attention/recovery tương đương | Mục tiêu mới | **Phát triển** theo [đặc tả](./workflow-mission-control.md) |
| Claude/Codex accounts và chuyển session | Shipped: `service/agentaccounts`, `domain/agent_account.go`, `SessionAccountSummary.tsx`; STATUS dòng 138–146 | Gần lõi | **Giữ**, không lập lại P0 cũ |
| Token usage, quota windows, Usage page | Shipped: `domain/usage.go`, `domain/usage_limit_history.go`, `service/usage`, `UsageView.tsx`, API usage; Usage page thành public ở `a4b6e0abe6` | Gần lõi | **Giữ**, cải thiện UX/độ chính xác |
| Recurring automations, scheduler, Project Cues | Shipped: STATUS dòng 150–153; `service/automation`, `AutomationsView.tsx` | Mở rộng workflow | **Giữ hoặc ẩn**, tùy mục tiêu sản phẩm |
| Browser preview/control và profiles | Shipped, acceptance đóng gói còn theo STATUS; `frontend/src/main/browser-*` | Hỗ trợ kiểm thử worker | **Giữ** bản preview/control; cân nhắc độ rộng profile/import |
| Mobile và remote hosts | Shipped mobile/LAN, remote host management; STATUS dòng 232–258, `mobilebridge`, `Sidebar.tsx` | Hỗ trợ giám sát | **Cân nhắc** theo thị trường/độ phức tạp |
| Cloud Agents, team/workspace artifact sharing | Conditional theo STATUS dòng 261–263; Cloud routes/client và artifact UI | Ngoài local core | **Ứng viên tách** nếu sản phẩm chỉ chạy local/nội bộ |
| Import session từ nhiều agent | Shipped code; **New** `8361029f9f` thêm 11 nguồn import, `service/sessionimport/*` | Migration/onboarding | **Cân nhắc giảm phạm vi** theo agent thực dùng |
| Simulator/emulator Device tab/phone control | **New**, 3 commit `716af8d46c`, `27b8352531`, `657cf5e800`; Developer mode preview trong `devices/service.go:137` và `devices-enabled.ts` | Chuyên biệt mobile dev | **Đã cắt (L1, 2026-11-28)** |
| PR card/review inspector cải tiến | **New** `4fff577f7f`, `2fe8d90dfb`, `b21c8ea6bb` | Lõi review | **Giữ** |
| Background task side panel, chat UX | **New** `feac004ab9`, `20b0d6a522`, file drop `1e7c6281cc` | Lõi Chat | **Giữ**, gom UX cho dễ hiểu |
| Orchestrator commit/PR attribution | **New**, beta local `56c30f82e8`; `internal/attribution/*` | Quan sát phối hợp | **Thử nghiệm**, đánh giá trước khi mở rộng |
| Telemetry chi tiết, Sentry | **New** nhiều commit, `packages/shared/telemetry`, frontend event IDs | Vận hành sản phẩm | **Cân nhắc** theo chính sách dữ liệu/triển khai |

## Những gì thực sự mới sau stable `v0.15.6`

`git log v0.15.6..HEAD --grep='^feat'` trả **24 feature commit**. Các nhóm nổi bật: device control (3 commit), import session thêm 11 nguồn, Usage page ra khỏi Developer Mode, attribution beta, PR/review UI, background task panel, remote host version/update, chat/mobile UX và telemetry. Đây là chênh lệch theo tag stable; không chứng minh người dùng vừa pull từ đúng tag đó.

## Cập nhật lại so sánh với 1DevTool

Đánh giá trước đây coi account/quota là khoảng trống AO. **Điều đó đã lỗi thời với HEAD hiện tại.** AO đã có account Claude/Codex, giới hạn usage và đổi account của session qua restart/native resume. 1DevTool vẫn là tham chiếu để đánh giá: account pool tự chọn trước launch, nhiều provider hơn, freshness/reset UX, task plan/done gates, file collision/history và công cụ dev. Cần xác minh từng chỗ bằng bản 1DevTool chạy thật trước khi đề xuất sao phỏng hành vi. Xem lộ trình nghiên cứu trước (workspace: 1devtool-research/14-Product-Roadmap/Comparison-and-Priorities.md).

## Phần chưa xác minh

- Không có commit gốc trước khi người dùng pull, nên không thể nói mọi mục ở bảng là “vừa pull” theo nghĩa chính xác.
- STATUS có tính năng `Shipped` nhưng phiên này chưa chạy smoke/e2e trên máy.
- Cloud khả dụng phụ thuộc build, entitlement và control plane; Device bị Developer Mode gate.
- Mức độ dùng thật của từng agent/importer/tool chưa có telemetry người dùng hoặc yêu cầu sản phẩm.
