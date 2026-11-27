---
status: draft
version: 0.1
---

# Business Invariants

- Không chạy node khi dependency chưa đạt điều kiện hoặc input schema không hợp lệ.
- Không sửa phiên bản workflow đã publish; run pin version và knowledge snapshot.
- Không cấp secret trực tiếp cho agent hoặc ghi secret vào vault, prompt, log.
- Không cho agent vượt policy quyền hạn dù tài liệu yêu cầu.
- Không thực hiện side effect nhạy cảm khi chưa có approval tương ứng với artifact hash.
- Không retry side effect chưa xác định kết quả; reconcile trước.
- Không chuyển provider nếu capability, data policy hoặc budget không phù hợp.
- Không publish rule do AI suy luận mà chưa được kiểm chứng.
- Không coi code hiện tại là bằng chứng duy nhất cho nghiệp vụ mong muốn.
- Budget reservation atomic; nếu usage không rõ, giữ reservation đến reconcile hoặc expiry có chính sách.

Acceptance: test invalid transition, concurrent reservation, stale approval, secret redaction, prompt injection, duplicate event, crash recovery.
