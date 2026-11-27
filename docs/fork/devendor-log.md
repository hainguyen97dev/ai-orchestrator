# De-vendor log

Tracking hoặc sign-in của nhà phát hành gặp trong lúc làm task nhưng nằm ngoài phạm vi task đó (quy tắc De-vendor trong [README](./README.md)). Lane L1 (P3b) xử lý theo bảng này. Mỗi dòng một chỗ; xử lý xong thì ghi PR vào cột đề xuất.

| file:line | cái gì | gửi đi đâu | đề xuất |
|---|---|---|---|
| `backend/e2e/smoke_stub_test.go` | Smoke P3a dùng harness `opencode` (shim + fake ACP), không phải tracking | — | Khi L1 thu hẹp harness về Claude + Codex: giữ `opencode` cho test hoặc chuyển smoke sang fake Codex **trước** khi cắt |
