# Phương án “đại phẫu” AO

> Quyết định cắt tính năng đã chốt: xem K5 trong [docs/fork/README.md](../README.md).

## Ranh giới sản phẩm đề xuất

**Giả định đang dùng để đánh giá:** AO là desktop workspace điều phối nhiều coding agent qua project → worker/worktree → Chat/TUI → diff/PR/CI/review → merge. Những tính năng phục vụ trực tiếp chu trình này là core. Đây là giả định cần người sở hữu sản phẩm chọn hoặc sửa trước khi xóa code.

## Bộ quyết định cần chốt

| Cụm | Đề xuất | Lý do | Phạm vi ảnh hưởng nếu bỏ |
|---|---|---|---|
| Core project/session/agent/worktree/PR/CI/review | **Giữ** | Đây là lời hứa chính của AO | Rất cao: API, DB, lifecycle, UI, CLI, mobile |
| Workflow/Pipeline nhiều stage | **Giữ và phát triển** | Người dùng chọn làm năng lực sản phẩm; dùng worker/session AO làm stage | Cao: domain/storage/API/orchestrator/UI |
| Mission Control | **Giữ và phát triển** | Người dùng chọn màn điều hành workflow; gộp trạng thái worker, attention, usage và recovery | Trung bình/cao: read model, API, UI, notification |
| Account Claude/Codex, token/quota | **Giữ** | Đã triển khai; tăng khả năng vận hành worker và là điểm học từ 1DevTool | Cao: session launch/restore/handoff, UI, storage |
| Browser preview/control | **Giữ bản lõi** | Hỗ trợ agent kiểm tra ứng dụng và review UI | Cao: bridge daemon↔Electron, CLI, session inspector |
| Automation và Project Cues | **Tùy chọn sản phẩm** | Phù hợp workflow lặp; tăng scheduler/state | Trung bình: service, DB migrations, API, CLI, route UI |
| Mobile + remote host | **Tùy chọn sản phẩm** | Giá trị lớn khi giám sát từ xa, nhưng tăng auth/network và bề mặt vận hành | Cao: LAN API, pairing, Expo, remote host routing |
| Cloud Agents + sharing | **Ứng viên tách thành edition/package** | Có điều kiện entitlement/control plane, nằm ngoài local workflow | Rất cao: routes, sidebar, auth, artifact, billing/server contracts |
| Device simulator/emulator | **Ứng viên bỏ khỏi bản gọn** | Preview Developer Mode, chỉ phục vụ mobile UI workflow | Trung bình/cao: daemon device service/adapter/CLI/API, desktop panel, mobile control |
| Import 11+ nguồn session | **Ứng viên thu hẹp** | Onboarding có giá trị nhưng số adapter tăng gánh bảo trì | Trung bình: `service/sessionimport`, agent adapters, settings UI/tests; giữ framework import nếu còn Claude/Codex |
| Orchestrator attribution beta | **Thử nghiệm trước khi giữ** | Bổ sung khả năng truy vết, nhưng logic hook/SCM phức tạp | Trung bình: hooks, session manager, observer, settings |
| Telemetry/Sentry mở rộng | **Chọn theo policy** | Hữu ích cho sản phẩm phát hành; có chi phí privacy/ops | Trung bình: shared telemetry, frontend/main events, backend diagnostics |
| Editor/HTTP/DB/Docker từ 1DevTool | **Chưa đưa vào AO** | Dễ làm AO thành IDE đa dụng, tốn bảo trì và lệch workflow | Chưa có dependency AO vì chưa triển khai |

**Đây là đề xuất scope, không phải kết luận tính năng “không cần thiết”.** Chưa có dữ liệu người dùng hoặc quyết định về local-only/cloud/mobile. Không xóa các module trên chỉ vì ít xuất hiện trong README.

## Ma trận chọn phạm vi

Người sở hữu sản phẩm có thể gắn mỗi cụm một quyết định `GIỮ / ẨN / TÁCH / BỎ`. `ẨN` giữ backend/API để thử sản phẩm; `TÁCH` giữ module nhưng đưa sang build/edition riêng; `BỎ` là xóa code sau khi đã phân tích phụ thuộc và migration. `BỎ` không áp dụng cho dữ liệu người dùng đang lưu nếu chưa có kế hoạch nâng cấp.

| Cụm | Quyết định | Câu hỏi sản phẩm quyết định |
|---|---|---|
| Mobile/remote | Chưa chốt | Người dùng có cần điều khiển agent ngoài máy chính không? |
| Cloud/sharing | Chưa chốt | AO là local tool hay nền tảng cộng tác có server? |
| Device | Chưa chốt | Mobile app development là use case chính không? |
| Automation | Chưa chốt | Có cần task định kỳ không người giám sát không? |
| Importers rộng | Chưa chốt | Những agent nào được hỗ trợ chính thức? |
| Telemetry | Chưa chốt | Phân phối public hay nội bộ; chính sách dữ liệu thế nào? |

## Cách cắt an toàn theo thứ tự

1. **Khóa sản phẩm và phiên bản:** chọn use case, nền tảng OS, danh sách agent, local/cloud/mobile. Ghi commit baseline và kết quả smoke hiện tại.
2. **Ẩn bề mặt trước:** route/menu/setting theo feature flag, đo tác động tới core worker loop. Không sửa storage hay lifecycle ở bước đầu.
3. **Tách service:** di chuyển wiring theo module/edition, giữ API contract tương thích trong một chu kỳ nếu có người dùng hiện tại. Với backend, CLI phải tiếp tục gọi daemon HTTP.
4. **Xóa theo lát cắt dọc:** UI → API controller/spec/generated TS → service/ports/adapter → DB/observability → docs/tests. Mỗi lát cắt chạy Go tests, frontend typecheck/build và smoke project → worker → PR.
5. **Migration dữ liệu:** chỉ thêm migration mới; không sửa migration đã merge. Dữ liệu cũ cần đường xuất hoặc chiến lược đọc tương thích trước khi ngừng hỗ trợ.

## Rủi ro theo ứng viên

- **Device** (đã cắt ở L1, 2026-11-28; các đường dẫn bên dưới là lịch sử, phần mobile bỏ theo F-13): 3 commit mới thêm backend service/adapter, CLI, API, desktop và mobile. UI đang gate qua Developer Mode (`frontend/src/renderer/lib/devices-enabled.ts`, `backend/internal/devices/service.go:137`). Có thể ẩn khỏi bản gọn trước, nhưng xóa đòi cập nhật API/spec và mobile.
- **Cloud/sharing**: xuyên qua Sidebar, route, auth, artifacts và control plane. Tách edition có vẻ an toàn hơn xóa một lần; STATUS ghi Cloud availability là Conditional.
- **Importers**: commit `8361029f9f` thay 216 file và thêm 11 nguồn. Có thể cắt theo provider, giữ interface/importer core. Cần bảo toàn session đã import.
- **Account/quota**: không cắt, vì hiện đã dính launch, Chat continuation, usage limit, UI và session state; đây là nền cho tích hợp 1DevTool.

## Bước nghiên cứu 1DevTool còn thiếu

Chạy bản 1DevTool trong môi trường thử để kiểm tra account pool, task gates, Agent Changes và quota freshness. Dùng kết quả đó quyết định feature nào đem vào AO, sau khi đã biết AO hiện có tương đương đến đâu. Không sao chép mã nguồn.
