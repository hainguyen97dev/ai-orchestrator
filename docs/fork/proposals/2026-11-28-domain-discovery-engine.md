---
status: proposal
date: 2026-11-28
base_commit: c3d61b835c
---

# Phương án Domain Discovery Engine

## 1. Mục đích và nguồn quyết định

Domain Discovery Engine trả lời một câu hỏi có phạm vi về **nghiệp vụ của dự án mà người dùng đang phát triển**. Nó tạo ra các nhận định có bằng chứng, mâu thuẫn và câu hỏi mở để người phụ trách xác nhận. Nó không tự công bố business rule chính thức.

Đầu vào ý tưởng: [cuộc brainstorm Domain Intelligence Engine](https://chatgpt.com/c/6b09852b-7d44-83ec-8700-95fa37cd5c32). Ràng buộc sản phẩm và kỹ thuật lấy từ [thiết kế fork đã duyệt](../../superpowers/specs/2026-11-27-ddd-platform-restructure-design.md), [quyết định K1–K15](../README.md), [context map](../ddd-spec/04-bounded-context-map.md), [knowledge architecture](../ddd-spec/08-knowledge-architecture.md) và [context contract](../ddd-spec/10-context-engineering.md). Nếu ý tưởng brainstorm khác quyết định đã duyệt, tài liệu này là đề xuất thay đổi, chưa phải quyết định mới.

**Phân biệt tên gọi:** `ddd-spec/02-domain-discovery.md` hiện là hoạt động khảo sát AO/1DevTool để thiết kế *sản phẩm*. Engine trong tài liệu này khám phá *nghiệp vụ của project người dùng*. Không dùng 02 như đặc tả chức năng của engine.

## 2. Hiện trạng tại base commit

- P0, P1, P2, P3a và P3b đợt 1–3 đã xong. L1 đang cắt device trước các cụm còn lại; F-02 sẽ dời sau L1. `main` chưa có package `internal/{knowledge,domainmodel,context,workflow}`.
- K3 đã chọn SQLite + FTS5 và vault Obsidian local. K15 đã chốt cách phân biệt câu hỏi "phải làm gì" với "đang làm gì" và yêu cầu ghi mâu thuẫn để người duyệt xử lý.
- P4 đã duyệt cho Knowledge Foundation: vault schema, parser, registry, typed link, revision/hash, quarantine và proposal qua Git. P5 mới compile Context Package; P6 mới có Workflow Run. Chưa có phase nào mô tả đầy đủ việc trích xuất nhận định nghiệp vụ từ code, tài liệu, test và trace.
- `ddd-spec/08` và `09` mô tả evidence ở mức tham chiếu, nhưng chưa chốt identity, độ chính xác của locator, loại nhận định, phạm vi hiệu lực, trạng thái kiểm chứng hay thuật toán invalidation.

## 3. Quyết định kiến trúc đề xuất

**Giữ 16 bounded context ở v1.** Triển khai Discovery như một use case của `internal/knowledge`, với các port đọc nguồn. `internal/domainmodel` sở hữu domain ID, glossary và ranh giới nghiệp vụ đã xác nhận. `internal/context` chỉ tiêu thụ tri thức đã được chọn và có provenance. Không thêm `internal/discovery` hay đưa toàn bộ Domain Intelligence vào một package lớn ở MVP.

Lý do: vòng đời discovery và vòng đời publication của Knowledge gắn nhau trong lát dọc đầu; tách context ngay sẽ phải thiết kế hợp đồng sự kiện và consistency khi chưa có ca sử dụng chứng minh ranh giới đó. Đánh giá tách riêng sau khi có nhiều loại discovery job, lịch sử và quyền sở hữu độc lập. Mọi giao tiếp qua DTO/event/API; không phá luật R1–R4 của `archtest`.

### Đối tượng tối thiểu

| Đối tượng | Trách nhiệm |
|---|---|
| `DiscoveryRun` | Câu hỏi, phạm vi, nguồn được phép đọc, revision đã ghim, budget, trạng thái và kết quả. Một run không tự mở rộng phạm vi. |
| `SourceSnapshot` | Manifest của Git commit, document revision/hash, API schema, môi trường và cửa sổ thời gian của runtime evidence. |
| `EvidenceRef` | Loại nguồn, URI, locator chính xác, revision/hash, thời điểm quan sát, phân loại dữ liệu và quyền truy cập. |
| `DomainClaim` | Phát biểu ứng viên, bounded context, applicability, `AS_IS`/`TO_BE`/`UNKNOWN`, evidence ủng hộ và phản bác, trạng thái review. |
| `KnowledgeConflict` | Hai hoặc nhiều claim/evidence không thể đồng thời đúng trong cùng phạm vi; có owner và quyết định xử lý. |
| `OpenQuestion` | Thiếu thông tin nào, vì sao chặn kết luận, ai có thể trả lời. |

`DomainClaim` là kết quả điều tra, **chưa phải** `BusinessRule` APPROVED. Chỉ sau review, nội dung được đề xuất thành `KnowledgeDocument`/`KnowledgeProposal` trong vault. Không dùng một điểm confidence đơn lẻ thay cho tập bằng chứng và trạng thái review.

### Nguồn sự thật và giới hạn kết luận

| Nguồn | Chứng minh được | Không chứng minh được |
|---|---|---|
| Requirement/rule APPROVED | Ý định nghiệp vụ trong phạm vi và thời gian hiệu lực | Implementation đã tuân thủ |
| Code tại commit + test | Hành vi được triển khai và kiểm thử trong phạm vi đã xét | Đó là chính sách nghiệp vụ được duyệt |
| API/schema | Contract và ràng buộc được công bố ở revision đó | Mọi caller và nhánh runtime đều dùng contract ấy |
| Trace/log | Một hành vi quan sát được ở môi trường, thời điểm và sampling cụ thể | Hành vi đó luôn xảy ra hoặc nhánh không thấy là không tồn tại |
| Vault draft / AI inference | Giả thuyết để điều tra | Business rule chính thức |

Source code, tài liệu gốc và trace giữ identity riêng. Vault là nguồn chuẩn cho **tài liệu tri thức đã biên tập**; SQLite lưu run/review và projection có thể tái tạo, không âm thầm sửa file vault. Chỉ lưu tham chiếu trace và metadata tối thiểu; không đưa payload có dữ liệu cá nhân hoặc credential vào vault/LLM context.

## 4. Pipeline của một DiscoveryRun

1. **Scope & snapshot:** nhận CR/câu hỏi, project, domain ứng viên, repo/ref, nguồn tài liệu, môi trường runtime và ngân sách; đóng băng manifest trước khi phân tích.
2. **Deterministic extraction:** parse frontmatter, Markdown link, OpenAPI, AST/call graph, Git diff, schema và test; thu thập locator cùng hash. Không dùng LLM cho phần có parser chính xác.
3. **Anchored traversal:** bắt đầu từ CR, API/command hoặc trace đã chọn; đi theo dependency với depth và giới hạn số node. Có thể mở rộng phạm vi theo đề xuất, nhưng phải ghi và được người dùng chấp nhận.
4. **Candidate extraction:** đề xuất concept, activity, rule, state transition và tích hợp. LLM chỉ nhận các đoạn đã lọc theo policy; kết quả là candidate có evidence span, không thành fact.
5. **Reconciliation:** tách `AS_IS` và `TO_BE`, đối chiếu source khác revision, nhận diện mâu thuẫn, thiếu nhánh ngoại lệ và khái niệm đồng âm khác nghĩa.
6. **Review & publication:** chuyên gia chấp nhận/sửa/bác từng claim; proposal cập nhật vault dùng base revision để phát hiện conflict; publish tạo revision bất biến.
7. **Incremental refresh:** khi source đổi, đi ngược quan hệ evidence → claim → document/Context Package để đánh dấu cần đánh giá lại. Không tái quét toàn repo nếu diff chỉ chạm một phạm vi nhỏ.

Mỗi bước lưu kết quả đủ để resume hoặc báo lỗi có nguyên nhân. Một nguồn lỗi parse đi vào quarantine; không làm run còn lại âm thầm mất nguồn.

## 5. Lát dọc nghiệm thu

Giữ CR đã chốt ở K8: **"mua hộ roaming không cần đăng nhập"**. Đây là đề bài điều tra, không phải bằng chứng rằng các rule minh họa trong brainstorm là thật.

Đầu vào tối thiểu: một yêu cầu có revision, vault mẫu hoặc tài liệu nghiệp vụ được chọn, commit đã ghim của TEL/PACKAGE và phần Groovy liên quan, API contract và test hiện có. Trace OpenTelemetry của luồng TEL → Groovy → PACKAGE → đối tác có thể bổ sung **observational evidence** khi có dữ liệu phù hợp; Discovery không phụ thuộc vào việc staging đã bật tracing.

Đầu ra cho người review:

- Bản đồ luồng kỹ thuật, mỗi cạnh dẫn về code/API/trace cụ thể và ghi độ bao phủ quan sát.
- Danh sách rule/concept/process **ứng viên**, phạm vi áp dụng và bằng chứng hai chiều.
- Phần tách riêng: điều hệ thống đang làm, điều tài liệu yêu cầu, mâu thuẫn và điều chưa biết.
- Câu hỏi về actor, quyền mua hộ, điều kiện roaming, lỗi đối tác, thanh toán/hoàn tác; không tự điền câu trả lời khi thiếu nguồn.
- Proposal cho vault được người phụ trách duyệt. P5 mới đóng gói các revision đã chọn thành `Context Package` cho agent.

## 6. Đặt vào roadmap hiện tại

| Chặng | Việc nên chốt | Điều kiện xong |
|---|---|---|
| L1 + P3b đợt 4 hiện tại | Hoàn tất cắt/dời theo plan đã duyệt; không trộn logic Discovery vào PR dời code | Build, smoke và import-only gate của từng PR pass |
| P4a Knowledge Foundation | Thực hiện đúng phạm vi P4 đã duyệt; thêm contract `SourceSnapshot`/`EvidenceRef` trong thiết kế P4 trước khi chọn schema | Import rule có revision; reindex, rename, quarantine và conflict test pass |
| P4b Discovery slice **đề xuất bổ sung** | Một `DiscoveryRun` có phạm vi, deterministic extraction, claim/evidence, review; LLM extraction chỉ bật khi data egress policy cho phép | CR roaming cho ra report có locator, conflict và unknown; không có claim nào tự APPROVED |
| P5 Context | Compile từ tri thức đã review với manifest, citation, ACL, token estimate | Context Package tái tạo được từ revision đã ghim |
| P6–P9 | Workflow tiêu thụ Context Package; sau run tạo Knowledge Proposal, refresh evidence và đo chất lượng | Run/restart/review không làm thay đổi tri thức đã duyệt ngầm |

Theo quy tắc của fork, **plan triển khai chi tiết chỉ viết cho phase sắp chạy** trên code đã merge. Bảng trên là phương án sản phẩm; không thay plan L1 đang chạy. Khi tới P4, plan phải tách file/PR/migration/API hotspot cụ thể.

## 7. Kiểm chứng và quyết định còn mở

**Kiểm chứng bắt buộc:** mỗi approved claim có source revision và reviewer; thay đổi source làm claim liên quan stale mà không sửa nội dung approved; trace thiếu không bị diễn giải thành "không có nhánh"; rename note giữ stable ID; hai nguồn xung đột vẫn hiện cả hai; project ACL chặn truy vấn xuyên project; malicious instruction trong tài liệu không trở thành lệnh agent; không có secret/PII trong evidence export.

Lập golden set từ một phần nhỏ của CR roaming do domain expert gán nhãn. Đo rule extraction precision/recall, unsupported-claim rate, conflict detection, reviewer time và cost/run. Chưa đặt mục tiêu phần trăm khi chưa có baseline; hard gate là **0 claim tự động được APPROVED**.

**Cần chốt trước P4b:** (1) Ai được duyệt từng loại claim/rule? (2) Nguồn requirement/rule APPROVED được quản trị ở đâu và xác định thời gian hiệu lực thế nào? (3) Phạm vi dữ liệu nào được gửi tới provider nào? (4) Có trace thực tế đủ an toàn để dùng làm evidence hay chỉ dùng fixture local? (5) Khi vault và source cùng đổi, ai xử lý conflict?
