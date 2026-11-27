---
status: draft
version: 0.1
---

# Domain Discovery

## Quy trình khảo sát
1. Inventory repository AI Orchestrator: module, runtime, API, persistence, license, security.
2. Inventory tính năng công khai 1DevTool: pipeline, terminal, diff, session, office; ghi rõ observed / inferred / unknown.
3. Event Storming với người dùng: từ ChangeRequestSubmitted đến KnowledgePublished.
4. Xác định pain point, actor, policy, command và external system.
5. Chọn vertical slice và kiểm chứng ranh giới domain bằng use case.

## Actor
Project Owner, Business Expert, Solution Architect, Developer, Reviewer, Operator, AI Agent.

## Câu hỏi mở
Runtime hiện tại hỗ trợ resume không? Vault dùng chung hay theo project? Quy tắc ưu tiên giữa requirement và code? Ai được duyệt thay đổi knowledge? Adapter nào cho phép automation chính thức?

## Deliverable
Feature gap matrix: feature ID, source, observed behavior, existing module, gap, risk, priority, acceptance criteria. Không đánh dấu feature đã có nếu chưa đọc code.
