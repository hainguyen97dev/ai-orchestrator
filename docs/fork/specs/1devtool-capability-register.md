# Danh mục năng lực 1DevTool để đối chiếu AI Orchestra

**Mốc rà soát:** 1DevTool macOS ARM64 v1.87.2 và AO `10028ef170` (26/11/2026). “Hết” ở đây là **toàn bộ 16 nhóm F01–F16 đã có bằng chứng trong vault nghiên cứu**, kèm các hành vi chi tiết đã bóc tách. Website vendor tự nêu 349 feature; nghiên cứu hiện tại chưa xác nhận đủ 349 mục. Không gọi `Documented + packaged` là đã quan sát runtime. Nguồn chính: Feature Matrix (workspace: 1devtool-research/04-Feature-Catalog/Feature-Matrix.md), Evidence Register (workspace: 1devtool-research/15-Evidence/Evidence-Register.md), Comparison (workspace: 1devtool-research/14-Product-Roadmap/Comparison-and-Priorities.md).

**Nhãn:** `D+P` = vendor docs + module trong bundle; `A` = AO đã có code/STATUS; `Gap` = chưa thấy contract tương đương trong source AO; `?` = cần runtime hoặc kiểm chứng hành vi. Quyết định là định hướng tích hợp, không phải lệnh xóa mã.

| ID | Nhóm 1DevTool (bằng chứng) | AO hiện tại và khoảng trống | Quyết định |
|---|---|---|---|
| F01 | Workspace đa dự án, lưu state (`D+P`) | AO có project, settings, session/worktree (`A`); chưa có Project Knowledge Pack có snapshot | **Tái dùng project; thêm knowledge settings** |
| F02 | Terminal nhiều agent, pane, resume (`D+P`) | AO có TUI/Chat, mux, resume/handoff (`A`) | **Tái dùng**, không làm terminal mới |
| F03 | Nhiều account, switching/pool (`D+P`) | AO có Claude/Codex accounts và session switch (`A`); auto-pick/pool policy chưa xác nhận (`?`) | **Giữ; nghiên cứu pool sau** |
| F04 | Token usage, quota/reset/freshness (`D+P`) | AO có usage, quota windows, Usage view (`A`); so sánh freshness/độ chính xác chưa làm (`?`) | **Giữ; cải thiện sau** |
| F05 | Task board, dispatch, approval (`D+P`) | AO có Board, delegation, Chat approvals, PR review (`A`); task plan/done gate theo flow chưa thấy (`Gap`) | **Thêm gate/handoff của flow** |
| F06 | Agent team, hierarchy, pipeline (`D+P`) | AO có orchestrator/worker nhưng chưa thấy versioned flow graph/run/node/gate (`Gap`) | **Năng lực tích hợp chính** |
| F07 | Git, worktree, Repo panel (`D+P`) | AO có worktree, diff, PR/CI/review (`A`); file collision/history sâu chưa xác nhận (`?`) | **Tái dùng; xem collision sau** |
| F08 | Editor, explorer, LSP (`D+P`) | AO có file/inspector, không là IDE đầy đủ | **Chưa đưa vào scope flow** |
| F09 | Browser preview/automation (`D+P`) | AO có Browser panel/`ao browser` (`A`) | **Tái dùng cho test/review khi cần** |
| F10 | HTTP client (`D+P`) | Không cần để chạy flow dev bản đầu | **Để ngoài plan** |
| F11 | Database client (`D+P`) | Không cần để chạy flow dev bản đầu | **Để ngoài plan** |
| F12 | Docker/environment/ports (`D+P`) | AO có một số script/workspace và container lifecycle; không có lý do sao chép client Docker | **Để ngoài plan** |
| F13 | Skills, MCP, hooks (`D+P`) | AO có Chat skill discovery theo provider, skill assets, MCP/Chat; chưa có Role Profile + Skill Library versioned cho flow (`Gap`) | **Tái dùng skill discovery; thêm Settings/binding** |
| F14 | Remote phone control (`D+P`) | AO có mobile/LAN/remote host (`A`) | **Giữ ngoài đường găng** |
| F15 | Voice và mobile simulator (`D+P`) | AO có voice dictation và Device preview ở Developer Mode (`A`) | **Giữ ngoài đường găng** |
| F16 | Updates, themes, licensing (`D+P`) | AO desktop đã có update/settings; không liên quan trực tiếp flow | **Không ưu tiên bổ sung** |

## Hành vi nhỏ đã bóc tách và quyết định

| Năng lực | Bằng chứng | Quyết định cho AO |
|---|---|---|
| Account home riêng; account giữ ổn định suốt terminal | E11, vendor docs; chưa runtime | AO đã quản lý account/session; chỉ kiểm tra isolation và policy chọn account nếu phát sinh nhu cầu |
| Account pool tự chọn trước launch | E11, vendor docs; chưa runtime | P2: nghiên cứu trước khi thêm; không là điều kiện của Flow Builder |
| Quota freshness/reset | E11, vendor docs; chưa runtime | P2: nâng UX usage AO, không xây lại usage pipeline |
| Task `plan`/`done` approvals | E11, vendor docs; chưa runtime | P0/P1: đưa thành Developer checkpoint có quyết định/audit, không nhập nhằng với Chat tool approval |
| Agent Changes: file attribution, collision, version history | E11, vendor docs; chưa runtime | P2: dùng AO diff/worktree; thêm cảnh báo file ownership nếu task song song thật |
| Pipeline: stage có agent/model/brief, output chuyển tiếp | E13, vendor docs; chưa runtime | P1: định nghĩa node graph + artifact refs; AO không bắt buộc flow tuyến tính |
| Quality gate accept/reject và retry cap | E13, vendor docs; chưa runtime | P1: durable decision, bounded retry, escalation về participant |
| Builder/Charts: draft preset, người dùng Start | E13, vendor docs; chưa runtime | P0/P1: blank/template/AI draft, validate/preview, người dùng bấm Run |
| Mission Control: Activity/Map/Runs/Logs, stage strip, attention, participant rail | E13, vendor docs; chưa runtime | P1: read model theo một run, nối AO session/PR/CI/usage |
| Mission recovery: resume/relink/quarantine/prompt chưa gửi | E13, vendor docs; chưa runtime | P1/P2: reconcile state trước retry; chỉ thêm action có nhu cầu runtime AO rõ ràng |
| Hierarchy/teams/swarms | E11/E13, vendor docs; chưa runtime | P2: tùy chọn fan-out; flow dev một branch chạy trước |

## Năng lực do yêu cầu AO bổ sung, không gán nhầm cho 1DevTool

1. **Role Settings** PO/BA/SA/Dev/Test, một participant có thể mang nhiều role.
2. **Skill Library + capability profile** để gắn cách làm và năng lực vào node.
3. **Project Knowledge** có nguồn/ref/hash, DDD profile và source precedence.
4. **Preset DDD**: tri thức → Domain Plan → code trên branch → domain/architecture/contract tests → self-review → PR/merge.

Các mục này là mục tiêu sản phẩm do người dùng xác định và được đặc tả trong [Settings](./settings-role-skill-project-knowledge.md), [Flow Builder](./flow-builder.md) và [DDD workflow](./project-knowledge-ddd-workflow.md).

## Giới hạn bằng chứng

1DevTool chỉ được kiểm chứng download/chữ ký/bundle và đọc tài liệu chính thức; lần chạy cô lập chưa hiển thị cửa sổ. Vì vậy bảng trên **không xác nhận hành vi runtime hoặc free-tier**. AO được đối chiếu source/STATUS ở HEAD nêu trên, chưa chạy acceptance e2e của những tính năng mới trong phiên này.
