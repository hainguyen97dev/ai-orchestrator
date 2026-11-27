---
status: draft
version: 0.1
---

# Workflow Domain Model

Phân biệt Business Workflow (mô tả nghiệp vụ), Engineering Workflow (quy trình phát triển) và Agent Workflow (thực thi tự động).

Node types: Trigger, KnowledgeRetrieval, DomainAnalysis, Agent, Skill, Tool, Condition, Parallel, Join, SubWorkflow, Approval, QualityGate, Checkpoint, KnowledgeProposal, Wait. DAG mặc định; vòng lặp chỉ qua node loop có giới hạn rõ.

State: DRAFT → PUBLISHED (definition); QUEUED → RUNNING → WAITING_APPROVAL / WAITING_CAPACITY / PAUSED → RUNNING → SUCCEEDED / FAILED / CANCELLED (run).

Node schema: id, type, input_schema, output_schema, dependencies, timeout, retry, permissions, capability, budget, completion_condition. Validate cycle, missing edge, schema compatibility, unreachable node và loop bound trước publish.

Execution: persisted state, lease + fencing, durable event, checkpoint, idempotency key. Parallel join theo all/any policy rõ ràng. Cancel cooperative và reconcile side effects. Approval pin input/artifact hash.

Ví dụ: CR → Domain Discovery → Knowledge Retrieval → BA → SA → Human Approval → BE/FE + QA preparation → integration test → review → Knowledge Proposal → Complete. BA và SA có thể lặp khi requirement chưa rõ; implementation chỉ bắt đầu khi approval hợp lệ.
