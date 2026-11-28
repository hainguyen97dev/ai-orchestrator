---
status: draft
version: 0.2
---

# Aggregate Design

## Aggregate

| Context | Aggregate root | Invariant chính |
|---|---|---|
| Domain Modeling | BusinessDomain | Rule ID duy nhất trong project |
| Knowledge | KnowledgeDocument | Revision đã publish bất biến |
| Knowledge | KnowledgeProposal | Không publish nếu thiếu review |
| Workflow | WorkflowDefinition | Published version bất biến |
| Workflow | WorkflowRun | Transition hợp lệ, pin definition version |
| Agent | AgentDefinition | Permission và capability có version |
| Execution | AgentRun | Một lease active cho mỗi attempt; tham chiếu AO Session qua ACL (16 §S4), không viết runtime mới |
| Provider | ProviderProfile | Credential chỉ là reference; bọc `agent_account` của AO |
| Budget | BudgetAccount | Atomic reserve trước dispatch |
| Workspace | Workspace | Worktree isolation và ownership |
| Quality | QualityGate | Kết quả gắn artifact revision |
| Artifact | Artifact | Revision bất biến, gắn Node Execution tạo ra nó |
| Task | Task | Một task kích hoạt tối đa một WorkflowRun active |

Không để aggregate WorkflowRun chứa toàn bộ log hay token streaming. NodeExecution và các attempt lưu thành record riêng, có ràng buộc nhất quán, dùng optimistic version (`aggregate_version` trong event v1, xem 05) và lease fencing. Invariant nào cũng cần test concurrency.
