---
status: draft
version: 0.1
---

# Provider Domain Model

Provider ≠ Model ≠ Profile ≠ Runtime. Profile giữ credential reference, auth mode, allowed models, capability, health, quota status, data policy. Pool chọn từ profile hợp lệ, không dùng nhiều tài khoản để né giới hạn.

Routing: filter capability → policy → health/quota → reserve budget → rank cost/quality/latency → acquire lease → execute → settle usage. Quota có thể UNKNOWN; không hiển thị phần trăm giả. Retry 429 theo reset/retry-after, exponential backoff có jitter; circuit breaker cho lỗi hệ thống.

Authentication: official CLI/OAuth nếu được phép, direct API, custom endpoint, local model. Không lấy session token web. API keys trong Keychain/vault; CLI credential cô lập và chỉ cấp cho adapter cần thiết. Không truyền secrets qua command line/log.

Failover: classify error → checkpoint → reconcile side effects → select eligible fallback → reconstruct context → resume từ safe boundary. Nếu không còn nguồn, WAITING_CAPACITY; không tự động vượt budget.

Budget: organization/project/workflow/run, atomic reservation theo estimated maximum cost, settlement theo usage thực tế. Giá và điều khoản provider phải kiểm tra trước triển khai; chưa có bảng giá xác minh trong đặc tả này.

MVP: một primary + một fallback adapter, test quota exhaustion giả lập, timeout, invalid auth, partial stream, unknown usage.
