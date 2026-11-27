---
status: draft
version: 0.1
---

# Development Roadmap

| Phase | Deliverables | Exit criteria |
|---|---|---|
| 0 | Audit source AI Orchestrator và license; feature inventory 1DevTool | Gap matrix có evidence |
| 1 | Strategic DDD, glossary, context map, event storming | Domain boundaries được review |
| 2 | Obsidian ingestion, schema, revision, proposal | Index tái tạo được, conflict không ghi đè |
| 3 | Context compiler và retrieval evaluation | Context có provenance, ACL, budget |
| 4 | Agent runtime và workspace isolation | Run/cancel/recovery, không leak secret |
| 5 | Workflow engine và visual studio | Branch/join/approval/checkpoint test pass |
| 6 | Provider control plane, budget, failover | Hết quota không mất tiến độ hoặc vượt policy |
| 7 | Knowledge feedback, quality analytics | Proposal được review, rule traceability |

Không xây hết phase theo waterfall: thực hiện vertical slice sớm gồm một domain, một vault, một workflow, một agent và một provider. Định nghĩa provider port, security và budget tối thiểu từ đầu.

## Test vertical slice
CR mua hộ roaming (ví dụ giả định): import rules → phân tích impact → duyệt → sửa code trong worktree → test → review → tạo knowledge proposal. Simulate crash, quota exhausted, stale rule, malicious instruction, duplicate event, rejected approval.

## Metrics
Workflow success rate, cost/completed task, context evidence coverage, retrieval recall, failover success, human intervention, recovery time, knowledge freshness. Chưa đặt target định lượng khi chưa có baseline.

## Open decisions
Repository/stack/license chưa xác minh; chưa audit source, chưa benchmark model, chưa kiểm tra điều khoản API/CLI. Không coi tài liệu này là kết quả reverse engineering hoặc implementation hoàn chỉnh.
