---
status: draft
version: 0.1
---

# Event Storming

| Command | Domain Event | Policy / hậu quả |
|---|---|---|
| SubmitChangeRequest | ChangeRequestSubmitted | Khởi tạo phân tích |
| ResolveDomain | DomainScopeResolved | Truy xuất knowledge |
| CompileContext | ContextPrepared | Gắn revision và token budget |
| ApproveSolution | SolutionApproved | Cho phép implementation |
| StartWorkflow | WorkflowStarted | Scheduler dispatch node |
| ReserveBudget | BudgetReserved | Cho phép provider call |
| RunAgent | AgentRunStarted | Thực thi trong sandbox |
| RecordCheckpoint | CheckpointCreated | Có thể recovery |
| DetectQuotaFailure | ProviderQuotaExhausted | Pause hoặc fallback |
| ValidateOutput | QualityGatePassed/Failed | Tiếp tục hoặc bounded retry |
| ProposeKnowledge | KnowledgeProposed | Review bắt buộc |
| PublishKnowledge | KnowledgePublished | Reindex revision |

Event envelope: event_id, type, schema_version, aggregate_id, aggregate_version, occurred_at, correlation_id, causation_id, payload. Transactional outbox, idempotent consumer, retry và dead-letter. Không đưa secrets vào event.

Hotspots: conflicting evidence, side effect chưa xác nhận, quota không quan sát được, vault conflict, approval timeout.
