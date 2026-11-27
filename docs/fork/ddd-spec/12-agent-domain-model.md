---
status: draft
version: 0.1
---

# Agent Domain Model

AgentDefinition: id, role, instruction_version, skills, capabilities, permission_policy, context_policy, provider_policy. AgentRun: run_id, node_execution_id, attempt, context_package_id, runtime_ref, checkpoint_ref, result, status.

Runtime adapter contract: start, stream_events, cancel, status, checkpoint, resume (nếu hỗ trợ), capabilities. CLI và HTTP API có semantics khác nhau; không giả định resume xuyên provider.

Workspace: worktree theo task, read-only vault mặc định, allowlist tools, network deny-by-default, giới hạn CPU/RAM/time. Không mount home directory hoặc Docker socket vào sandbox. Tool broker kiểm tra policy ở mỗi call.

Handoff package: task, approved rules, decisions, file diff/commit, test results, pending actions, side-effect ledger, remaining budget. Không chứa credential hoặc hidden reasoning.

Quality: output schema validation, lint/test, business rule traceability, reviewer approval. Agent không được tự duyệt thay đổi nhạy cảm của chính mình.
