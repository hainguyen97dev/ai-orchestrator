---
status: draft
version: 0.2
---

# Event Storming

## Sự kiện

| Command | Domain Event | Policy / hậu quả | Context sở hữu |
|---|---|---|---|
| SubmitChangeRequest | ChangeRequestSubmitted | Khởi tạo phân tích | Task |
| ResolveDomain | DomainScopeResolved | Truy xuất knowledge | Domain Modeling |
| CompileContext | ContextPrepared | Gắn revision và token budget | Context Engineering |
| ApproveSolution | SolutionApproved | Cho phép implementation | Workflow |
| StartWorkflow | WorkflowStarted | Scheduler dispatch node | Workflow |
| ReserveBudget | BudgetReserved | Cho phép provider call | Budget |
| RunAgent | AgentRunStarted | Thực thi trong sandbox | Execution |
| RecordCheckpoint | CheckpointCreated | Có thể recovery | Workflow |
| DetectQuotaFailure | ProviderQuotaExhausted | Pause hoặc fallback | Provider |
| ValidateOutput | QualityGatePassed/Failed | Tiếp tục hoặc bounded retry | Quality |
| ProposeKnowledge | KnowledgeProposed | Review bắt buộc | Knowledge |
| PublishKnowledge | KnowledgePublished | Reindex revision | Knowledge |

`AgentRunStarted` do Execution phát. Ở v1, Execution là code AO, nên event này thực chất là `session_created` từ `change_log`, được ACL của Workflow dịch sang (xem dưới).

## Event v1

Áp cho mọi context loại "mới" ở [[04-bounded-context-map]].

- **Envelope** gồm:
  - `event_id`: ULID.
  - `type`: dạng `<package>.<EventName>`, ví dụ `workflow.WorkflowStarted`.
  - `schema_version`: bắt đầu từ 1.
  - Các trường còn lại: `aggregate_id`, `aggregate_version`, `occurred_at` (UTC, RFC 3339), `correlation_id`, `causation_id`, `payload` (JSON).
- **Đổi schema:** thêm field tuỳ chọn thì giữ version. Đổi phá vỡ thì tăng `schema_version`, và consumer phải đọc được cả version cũ lẫn mới trong ít nhất một release.
- **Ghi:** context ghi event vào bảng `domain_outbox` trong cùng transaction SQLite với aggregate. Không có đường phát event nào khác.
- **Phát:** dispatcher poll `domain_outbox` theo thứ tự `seq`, giao ít nhất một lần (at-least-once). Mỗi lần giao lỗi thì tăng `attempts`. Lỗi tới lần thứ 5 thì ghi `dead_at` (dead-letter) và dừng giao event đó.
- **Nhận:** consumer ghi `consumed_events(consumer, event_id)` trong cùng transaction với tác dụng của nó. Nếu đã có `event_id` đó thì bỏ qua (idempotent).
- **Không** đưa secret, token hay credential vào `payload`.

`domain_outbox`:

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `seq` | INTEGER PK AUTOINCREMENT | Thứ tự phát |
| `event_id` | TEXT UNIQUE | ULID |
| `type` | TEXT | `<package>.<EventName>` |
| `schema_version` | INTEGER | ≥ 1 |
| `aggregate_id` | TEXT | |
| `aggregate_version` | INTEGER | Optimistic version sau thay đổi |
| `occurred_at` | TEXT | UTC |
| `correlation_id` | TEXT | |
| `causation_id` | TEXT | NULL nếu là gốc |
| `payload` | TEXT | `json_valid` |
| `dispatched_at` | TEXT | NULL tới khi giao xong |
| `attempts` | INTEGER | Mặc định 0 |
| `last_error` | TEXT | |
| `dead_at` | TEXT | Dead-letter |

`consumed_events`: `consumer TEXT`, `event_id TEXT`, `consumed_at TEXT`, khoá chính `(consumer, event_id)`.

## AO change_log

AO dùng bảng `change_log`, do trigger SQLite ghi cùng lúc với `sessions`, `pr` và `pr_checks` (`event_type`: `session_created`, `session_updated`, `pr_created`, `pr_updated`, `pr_check_recorded`). `platform/eventbus/cdc` poll bảng này rồi phát lại trong tiến trình. Đây là event nội bộ của AO Substrate, không phải event v1.

Context mới chỉ đọc `change_log` qua bộ dịch trong `infrastructure/acl` của chính nó. Bộ dịch chuyển mỗi dòng thành event v1 của context đó, với `causation_id` = `change_log:<seq>`. Luật R4 trong `internal/archtest` cấm import `platform/eventbus/cdc` từ ngoài `acl`.

## Hotspots

Conflicting evidence, side effect chưa xác nhận, quota không quan sát được, vault conflict, approval timeout.
