---
status: draft
version: 0.1
---

# Product Vision

## Mục tiêu
Xây dựng Domain-Driven AI Engineering Platform trên nền AI Orchestrator hiện có, tham chiếu tính năng workflow của 1DevTool, tích hợp Obsidian làm kho tri thức nghiệp vụ và đa provider làm nguồn năng lực AI liên tục.

## Nguyên tắc
- Domain là trung tâm; knowledge là bằng chứng; workflow là quy trình; agent là đơn vị thực thi; provider là tài nguyên.
- Local-first, human-in-the-loop, least privilege, portable knowledge.
- Không tự động coi suy luận AI là quy tắc nghiệp vụ đã xác nhận.
- Không sao chép mã nguồn hoặc tài sản độc quyền từ sản phẩm tham chiếu; kiểm tra giấy phép repository trước khi tái sử dụng.

## Phạm vi MVP
Một project, một vault, một repository, một workflow thay đổi tính năng xuyên suốt từ phân tích đến review và đề xuất cập nhật knowledge. Một provider hoạt động, một adapter dự phòng trong thử nghiệm.

## Ngoài phạm vi MVP
Marketplace, multi-tenant quy mô lớn, microservices, tự động deploy production, tự huấn luyện model.

## Tiêu chí thành công
Workflow có thể phục hồi sau restart; mọi quyết định nghiệp vụ có nguồn; chi phí và quyền hạn được kiểm soát; vault đọc được độc lập bằng Obsidian.
