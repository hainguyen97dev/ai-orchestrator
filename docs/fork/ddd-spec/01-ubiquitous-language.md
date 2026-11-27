---
status: draft
version: 0.1
---

# Ubiquitous Language

| Thuật ngữ | Định nghĩa |
|---|---|
| Business Domain | Phạm vi nghiệp vụ của hệ thống được phát triển |
| Bounded Context | Biên áp dụng một mô hình và ngôn ngữ thống nhất |
| Platform Domain | Nghiệp vụ nội tại của nền tảng orchestration |
| Business Rule | Quy tắc có nguồn gốc và trạng thái phê duyệt |
| Knowledge Document | Tài liệu Markdown có định danh và phiên bản |
| Evidence | Bằng chứng từ requirement, code, test, log hoặc chuyên gia |
| Context Package | Tập tri thức có phiên bản dành cho một lần thực thi |
| Workflow Definition | Đồ thị node và transition bất biến sau publish |
| Workflow Run | Một lần thực thi phiên bản workflow |
| Agent Definition | Vai trò, năng lực, instruction, permission |
| Agent Run | Một lần thực thi agent |
| Checkpoint | Trạng thái có thể phục hồi, không đồng nghĩa native session |
| Provider Profile | Cấu hình xác thực và quota của một nguồn AI |
| Knowledge Proposal | Đề xuất thay đổi tri thức chưa được phê duyệt |

Không dùng Task, NodeExecution và AgentRun thay thế cho nhau: một task có thể kích hoạt workflow, một node có thể tạo nhiều lần thử agent.
