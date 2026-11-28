---
status: draft
version: 0.2
---

# Ubiquitous Language

Bộ thuật ngữ chuẩn của fork (spec thiết kế §5.3: "Dùng bộ của spec"). Tên trong code dùng cùng từ, bỏ khoảng trắng (`WorkflowRun`). `CONTEXT.md` là bản rút gọn tiếng Anh và chỉ được dùng từ có ở đây. Script `scripts/ddd-spec/check-consistency.mjs` kiểm cả hai.

## Thuật ngữ

| Thuật ngữ | Định nghĩa |
|---|---|
| Business Domain | Phạm vi nghiệp vụ của hệ thống được phát triển (ví dụ Payment) |
| Platform Domain | Nghiệp vụ nội tại của nền tảng orchestration (ví dụ Workflow Execution) |
| Bounded Context | Biên áp dụng một mô hình và ngôn ngữ thống nhất; danh sách ở 04 |
| AO Substrate | Phần code Agent Orchestrator chưa dời vào context nào; chạy chung tiến trình |
| Anti-corruption Layer | Lớp dịch trong `internal/<context>/infrastructure/acl` giữa một context mới và AO Substrate |
| Business Rule | Knowledge Document loại `business-rule`, có nguồn và trạng thái phê duyệt; suy luận AI không bao giờ là rule đã duyệt |
| Knowledge Document | Tài liệu Markdown có frontmatter, ID ổn định và phiên bản trong vault; trạng thái DRAFT, IN_REVIEW, APPROVED, DEPRECATED, STALE |
| Knowledge Proposal | Đề xuất thay đổi tri thức, phải review trước khi publish |
| Evidence | Bằng chứng từ requirement, code, test, log hoặc chuyên gia |
| Context Package | Tập tri thức có phiên bản, kèm citation và token estimate, compile cho một Agent Run; pin revision của nguồn |
| Workflow Definition | Đồ thị node và transition, bất biến sau publish |
| Workflow Run | Một lần thực thi một phiên bản Workflow Definition; pin definition version và revision của Context Package |
| Node | Một bước của Workflow Definition (Trigger, Knowledge Retrieval, Agent, Approval, Quality Gate, Checkpoint, Knowledge Proposal…) |
| Node Execution | Bản ghi một node trong một Workflow Run; một node có thể tạo nhiều lần thử Agent Run |
| Approval | Quyết định của người, pin vào hash của input/artifact được duyệt |
| Quality Gate | Node kiểm output (rule, security, contract, test): pass, fail hoặc retry có giới hạn |
| Agent Definition | Vai trò (PO, BA, SA, Dev, QA…), instruction version, skill, knowledge, capability, permission policy và cấu hình agent mặc định; có version |
| SkillDefinition | Bộ instruction có version, dùng lại được, mà agent hoặc node tham chiếu |
| ToolProfile | Chính sách allow/deny có version cho tool builtin, MCP, shell; resolve node → agent → project, tầng dưới chỉ được thu hẹp |
| MCPServer | MCP server đã đăng ký (transport, command hoặc URL, env, header) mà ToolProfile cấp tool từ đó |
| Enforcement level | Mức adapter áp ToolProfile: `enforced`, `best-effort`, `none` |
| Agent Run | Một lần thực thi agent cho một Node Execution; chạy bằng AO Session qua Anti-corruption Layer |
| Checkpoint | Trạng thái phục hồi được của run, không đồng nghĩa native session của agent |
| Provider Profile | Credential reference, model cho phép, capability, quota và health của một nguồn AI |
| Artifact | Output bền của một node: tài liệu, plan, diff, PR, test report |

Không dùng Task, Node Execution và Agent Run thay thế cho nhau: một task có thể kích hoạt workflow, một node có thể tạo nhiều lần thử agent.

## Thuật ngữ bỏ

| Từ bỏ | Dùng |
|---|---|
| Flow | Workflow Definition |
| FlowRun | Workflow Run |
| Stage | Node |
| Gate | Approval / Quality Gate |
| RoleProfile | Agent Definition |
| KnowledgeSnapshot | Context Package |
