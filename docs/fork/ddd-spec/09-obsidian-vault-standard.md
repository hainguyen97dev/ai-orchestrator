---
status: draft
version: 0.1
---

# Obsidian Vault Standard

```text
vault/
  00-Project/
  01-Domains/
  02-Business-Rules/
  03-Business-Processes/
  04-Architecture/ADR/
  05-Technical-Knowledge/APIs/
  06-Requirements/
  07-Workflows/
  08-Quality/
  09-Lessons-Learned/
  10-Glossary/
  _templates/
```

Ví dụ frontmatter:
```yaml
id: BR-PAYMENT-001
type: business-rule
domain: payment
bounded_context: payment-processing
version: 1
status: draft
owner: payment-team
source_type: requirement
related: [DOM-ORDER, API-PAYMENT-003]
```

Body: Description, Business Invariants, Exceptions, Evidence, Related Knowledge, Review History. Evidence gồm source path/URL, commit hoặc document version, section/line, observed_at. Không ghi dữ liệu cá nhân hoặc credential vào vault.

Dùng wikilink cho điều hướng, ID ổn định cho machine reference. Đồng bộ Git theo proposal branch; phát hiện conflict với revision gốc, không ghi đè file người dùng. Xem [[08-knowledge-architecture]] và [[10-context-engineering]].
