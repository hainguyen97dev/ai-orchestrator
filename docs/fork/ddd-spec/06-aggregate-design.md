---
status: draft
version: 0.1
---

# Aggregate Design

| Context | Aggregate root | Invariant chính |
|---|---|---|
| Domain | BusinessDomain | Rule ID duy nhất trong project |
| Knowledge | KnowledgeDocument | Revision đã publish bất biến |
| Knowledge | KnowledgeProposal | Không publish nếu thiếu review |
| Workflow | WorkflowDefinition | Published version bất biến |
| Workflow | WorkflowRun | Transition hợp lệ, pin definition version |
| Agent | AgentDefinition | Permission và capability có version |
| Execution | AgentRun | Một lease active cho mỗi attempt |
| Provider | ProviderProfile | Credential chỉ là reference |
| Budget | BudgetAccount | Atomic reserve trước dispatch |
| Workspace | Workspace | Worktree isolation và ownership |
| Quality | QualityGate | Kết quả gắn artifact revision |

Tránh aggregate WorkflowRun chứa toàn bộ log/token streaming. Lưu NodeExecution và attempt theo record riêng có ràng buộc nhất quán; dùng optimistic version và lease fencing. Mọi invariant cần test concurrency.
