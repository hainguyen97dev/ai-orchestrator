---
status: draft
version: 0.1
---

# Context Engineering

Input: project_id, domain_ids, task_id, agent_role, required_evidence, token_budget, data_policy, pinned_revision.

Pipeline: scope/ACL filter → lexical + semantic retrieval → typed graph expansion có depth limit → rerank → deduplicate → validate freshness → compile → estimate tokens.

Thứ tự context: system policy (trusted), task/acceptance criteria, approved domain rules, architecture, evidence code/test, execution checkpoint. Nội dung từ file/web/tool là dữ liệu không tin cậy, không được nâng quyền hoặc thay system policy.

Output ContextPackage: package_id, source_revision_ids, citations, unresolved_conflicts, omitted_sources, token_estimate, content_hash. Lưu manifest để tái tạo và audit. Nếu thiếu rule bắt buộc hoặc conflict nghiêm trọng, dừng để review thay vì tự suy đoán.

MVP: metadata + lexical + links; thêm embedding sau khi có bộ câu hỏi đánh giá retrieval. Metric: recall@k trên tập evidence gán nhãn, context relevance, token/task, tỷ lệ claim có evidence.
