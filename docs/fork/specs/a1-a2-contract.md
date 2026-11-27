# Contract A1 (Role + Skill có version) và A2 (Project Knowledge + snapshot)

**Trạng thái:** contract cho đợt A1/A2, chốt qua superpowers:brainstorming (tự trả lời từ spec trong repo và code `main` tại `05bcab2e`). Câu chưa tự trả lời được nằm ở §10.2 Open questions, kèm giá trị mặc định plan đang dùng; câu đã đóng (gồm các điểm từ review PR #10) ở §10.1.
**Plan thực thi:** [`docs/superpowers/plans/2026-11-27-a1-a2.md`](../../superpowers/plans/2026-11-27-a1-a2.md).
**Nguồn:** [Settings Role/Skill/Knowledge](./settings-role-skill-project-knowledge.md), [mô hình role/skill/knowledge](./role-skill-knowledge-model.md), [workflow tri thức → DDD](./project-knowledge-ddd-workflow.md) §1–§3, roadmap D2/D4/D6, `CONTEXT.md` mục "Flow and tooling (fork)".

## 1. Mục đích

Cấu hình một lần, dùng lại ở nhiều flow (A3a). A1 lưu `RoleProfile` và `SkillDefinition` dạng version bất biến. A2 lưu `KnowledgePack` theo project, preview nguồn local và tạo `KnowledgeSnapshot` ghim ref/hash/nội dung. A3a/A4 chỉ **đọc** các đối tượng này theo `(id, version)` và gọi tạo snapshot lúc Run.

Thành công khi: (1) sửa role/skill/pack luôn ra version mới, version cũ vẫn đọc được; (2) hai người sửa cùng version thì người sau nhận 409, không ghi đè; (3) snapshot của một pack cho biết chính xác file nào, ở commit nào, hash gì, draft hay committed, và đọc lại được nội dung kể cả khi repo đã đổi; (4) không đường nào đọc được file ngoài project root, hay file thuộc danh sách loại trừ (kể cả qua symlink nằm trong project); snapshot `committed` không phụ thuộc trạng thái working tree.

**Anti-goal:** gộp role/skill/knowledge thành một prompt dài; role ngầm cấp quyền duyệt; gọi tài liệu untracked là "chuẩn đã phát hành"; AO đoán lệnh test.

## 2. Không trùng với cái đã có

| Đã có trong code | Là gì | A1/A2 xử lý |
|---|---|---|
| `domain.RoleOverride` (`ProjectConfig.Worker`, `.Orchestrator`), `ProjectConfig.Reviewers` | Override harness + `AgentConfig` theo **loại session** (worker/orchestrator/reviewer) | `RoleProfile` **không** chứa `Harness`, `AgentConfig`, model hay effort, không nhúng hay tái dùng `RoleOverride`. Chọn agent là việc của node (D6, A3a). Không đọc/ghi `ProjectConfig`. Tên Go dùng `RoleProfile*`, không dùng `Role`/`RoleOverride*`. |
| Chat Skills API: `GET /api/v1/sessions/{sessionId}/conversation/skills`, `ports.ChatSkill`, DTO `ConversationSkill(s)Response` | Slash-command/skill do **provider** của một chat session báo về; runtime, không version, không do AO sở hữu | `SkillDefinition` do AO sở hữu, có version, lưu SQLite, route riêng `/api/v1/skill-definitions`. Không thêm field vào `ChatSkill`/DTO conversation, không dùng tên schema `Skill`/`SkillResponse`. DTO đặt tên `SkillDefinition*`. |
| `internal/skillassets` | Skill `using-ao`/`bug-triage` nhúng trong binary, cài vào data dir | Không đụng. `SkillDefinition` không ghi file ra đĩa. |
| `/api/v1/settings/*` | Setting toàn cục key/value | Không thêm route dưới `/settings`. Resource mới ở top-level giống T1 (`/api/v1/tool-profiles`). |
| `domain.PipelineStageMode` (`manual/agent/assisted`) | Mode của stage pipeline (D2) | `RoleProfile.SuggestedMode` dùng lại đúng kiểu này, không định nghĩa enum mới. |
| T1 `ToolProfile`/`ToolNarrowing` (PR #8, chưa merge) | Policy tool project → role → node | A1-a/A1-b không phụ thuộc T1. `SkillDefinition.ToolRequirements` chỉ là chuỗi khai báo; A3a đối chiếu với `ResolvedToolPolicy`. `RoleProfile.Tools` (lớp role theo D4) dùng đúng kiểu `ToolNarrowing` của T1 và được thêm ở plan Task 11 sau khi T1 domain merge (§4.4, §10.1). |

## 3. Approaches đã cân nhắc

| Phương án | Đánh đổi | Chọn? |
|---|---|---|
| **A. Bảng version bất biến + bảng head** (`*_versions(id, version, body_json)` + `*_heads(id, latest_version, name, archived_at)`), theo pattern T1 | Thêm field = sửa `body_json`, không cần migration; head giữ unique name (partial index khi chưa archive) và archive; optimistic concurrency bằng PK `(id, version)` | **Chọn** |
| B. Cột phẳng mỗi field + bảng con cho list | Query SQL theo field dễ, nhưng mỗi field mới là một migration (hotspot) và schema version phức tạp | Không |
| C. Lưu file YAML trong repo project (`.ao/roles/*.yaml`) | Review được qua git, nhưng role/skill là toàn cục chứ không theo repo, và CLAUDE.md cấm ghi state AO ngoài `~/.ao`; ghi vào repo người dùng là tác dụng phụ | Không (import từ file: §10.2 Q3) |

Snapshot nội dung: **lưu blob nội dung (sha256, dedupe) trong SQLite cho mọi file đã đọc** thay vì chỉ lưu `(commit, path)` rồi đọc lại bằng git. Lý do: file draft/untracked không đọc lại được từ git; repo có thể bị xoá hoặc rewrite; A4 cần đọc nội dung không phụ thuộc trạng thái repo. Đổi lại tốn dung lượng, nên có giới hạn ở §5.4.

## 4. A1: SkillDefinition và RoleProfile

### 4.1 Quy tắc chung cho đối tượng có version (áp dụng cả `KnowledgePack`)

- `Version` bắt đầu ở 1, mỗi lần sửa tăng 1. Version đã ghi là **bất biến**, không có update/delete theo version.
- Sửa phải gửi `expectedVersion`. Khác bản mới nhất → 409 `<KIND>_VERSION_CONFLICT`, details `{latestVersion}`.
- `Name` unique không phân biệt hoa thường trong các bản **chưa archive** (role/skill: toàn cục; pack: trong project). Trùng → 409 `<KIND>_NAME_EXISTS`.
- **Archive** là cờ ở head, không xoá: ẩn khỏi list mặc định (`?includeArchived=true` để xem), mọi version vẫn `Get` được (run đã ghim). Revise bản archive → 409 `<KIND>_ARCHIVED`. Restore khi tên đã bị bản khác lấy → 409 `<KIND>_NAME_EXISTS`. Không có API xoá cứng.
- ID do daemon sinh: `skill_<uuid>`, `role_<uuid>`, `kp_<uuid>`, `ks_<uuid>`.
- Chuỗi danh sách: trim, bỏ phần tử rỗng, giữ thứ tự, trùng lặp → invalid.

### 4.2 Kiểu dùng chung

```go
// ArtifactContractRef names an artifact schema, e.g. "DomainPlan/v1".
// Format ^[A-Z][A-Za-z0-9]{0,63}/v[1-9][0-9]{0,3}$. No registry in A1/A2 (§10.2 Q4).
type ArtifactContractRef string

type SkillRef struct {
	ID      SkillDefinitionID `json:"id"`
	Version int64             `json:"version"` // >= 1; exact pin, never "latest"
}
```

### 4.3 SkillDefinition

```go
type SkillDefinitionID string

type SkillInputKind string // "brief" | "artifact" | "knowledge"

type SkillInput struct {
	Kind SkillInputKind `json:"kind"`
	Ref  string         `json:"ref,omitempty"` // artifact: ArtifactContractRef; knowledge: tag; brief: empty
}

type SkillDefinition struct {
	ID               SkillDefinitionID     `json:"id"`
	Version          int64                 `json:"version"`
	Name             string                `json:"name"`             // 1..100 bytes
	Description      string                `json:"description"`      // <= 500 bytes
	Instructions     string                `json:"instructions"`     // Markdown, 1..64 KiB, required
	Inputs           []SkillInput          `json:"inputs"`           // <= 20
	Outputs          []ArtifactContractRef `json:"outputs"`          // <= 20
	ToolRequirements []string              `json:"toolRequirements"` // <= 50, see below
	Checklist        []string              `json:"checklist"`        // <= 50 items, each <= 500 bytes
	Tags             []string              `json:"tags"`             // "phạm vi áp dụng"; <= 20, slug ^[a-z0-9][a-z0-9-]{0,39}$
	CreatedAt        time.Time             `json:"createdAt"`        // of this version
}
```

`ToolRequirements` cú pháp: `builtin:<Name>` (`builtin:Read`), `mcp:<serverId>` hoặc `mcp:<serverId>/<tool>`, `shell:<pattern>` (cùng luật pattern T1: `*` chỉ ở token cuối). A1 chỉ kiểm cú pháp; không kiểm server MCP tồn tại (T1 chưa merge). A3a validate báo thiếu khi policy đã resolve không cho phép.

`Instructions` là nội dung, không phải đường dẫn: skill không ghi ra đĩa và không tự đồng bộ với `SKILL.md` nào.

### 4.4 RoleProfile

```go
type RoleProfileID string

type RoleProfile struct {
	ID               RoleProfileID         `json:"id"`
	Version          int64                 `json:"version"`
	Name             string                `json:"name"`             // 1..64 bytes, e.g. "SA"
	Goal             string                `json:"goal"`             // <= 1000 bytes ("mục tiêu")
	Responsibilities []string              `json:"responsibilities"` // <= 20, each <= 500 bytes
	Outputs          []ArtifactContractRef `json:"outputs"`          // <= 20 ("artifact đầu ra")
	DefaultSkills    []SkillRef            `json:"defaultSkills"`    // <= 20, one entry per skill ID
	KnowledgeTags    []string              `json:"knowledgeTags"`    // <= 20 slugs ("knowledge gợi ý")
	SuggestedMode    PipelineStageMode     `json:"suggestedMode,omitempty"` // "" | manual | agent | assisted
	Tools            *ToolNarrowing        `json:"tools,omitempty"`         // role layer of D4; nil = inherit project profile. Added by plan Task 11 (after T1 domain merges)
	CreatedAt        time.Time             `json:"createdAt"`
}
```

- Role là **toàn cục** (Settings/Roles), không theo project. Vì vậy role không trỏ tới `KnowledgePackID` (pack theo project) mà gợi ý tri thức bằng **tag**; A3a dùng `SuggestKnowledgeSources(pack, role.KnowledgeTags)` (§5.5) để tự điền.
- Service kiểm mỗi `DefaultSkills[i]` tồn tại đúng `(id, version)` → nếu không: 400 `UNKNOWN_SKILL_VERSION` details `{skillId, version}`; skill đã archive → 400 `SKILL_DEFINITION_ARCHIVED`.
- Archive skill khi bản mới nhất của một role **chưa archive** đang trỏ tới bất kỳ version nào của skill → 409 `SKILL_DEFINITION_IN_USE` details `{roleProfileIds}`. Version cũ của role trỏ tới thì vẫn archive được.
- Revise skill không tự nâng `DefaultSkills` của role. Bản đọc role trả kèm `latestVersion` của từng skill được trỏ (field `skillUpdates` trong DTO) để UI báo "có bản mới"; người dùng revise role nếu muốn.
- `Tools` là lớp **role** trong thứ tự tool của D4 (project → role → node, lớp sau chỉ thu hẹp). Role toàn cục nên A1 chỉ kiểm cú pháp của `ToolNarrowing`; kiểm "không nới rộng" so với ToolProfile của project là việc của A3a khi gọi `ResolveToolPolicy(projectProfile, *role.Tools, nodeLayer)`. Đây không phải `RoleOverride`: không chọn harness/model.
- Role không có field quyền, approver hay gate. Không seed PO/BA/SA/Dev/Test trong A1 (preset là A5; §10.1).

## 5. A2: KnowledgePack và KnowledgeSnapshot

### 5.1 KnowledgePack

```go
type KnowledgePackID string

type KnowledgeRefPolicy string // "committed" | "working-tree"
type KnowledgeConflictPolicy string // "stop" (default) | "warn"
type KnowledgeSourceKind string // "repo" | "spec" | "adr" | "backlog" | "api" | "ddd-profile" | "other"

type KnowledgeSource struct {
	ID       string              `json:"id"`       // slug ^[a-z0-9][a-z0-9-]{0,39}$, unique in pack, stable across versions
	Kind     KnowledgeSourceKind `json:"kind"`     // display/category only; no kind-specific parsing in A2
	Path     string              `json:"path"`     // project-relative file or directory, "/"-separated
	Include  []string            `json:"include"`  // path.Match globs (stdlib, no new dependency) relative to Path; a pattern without "/" matches the base name at any depth; only when Path is a dir; empty = all files
	Required bool                `json:"required"`
	Priority int                 `json:"priority"` // 0..100, higher wins on same topic
	Topic    string              `json:"topic,omitempty"` // slug; sources sharing a topic compete by Priority
	Tags     []string            `json:"tags"`     // slugs, matched against RoleProfile.KnowledgeTags
}

type KnowledgePack struct {
	ID             KnowledgePackID         `json:"id"`
	ProjectID      ProjectID               `json:"projectId"`
	Version        int64                   `json:"version"`
	Name           string                  `json:"name"`        // 1..100 bytes, unique per project
	Description    string                  `json:"description"` // <= 500 bytes
	RefPolicy      KnowledgeRefPolicy      `json:"refPolicy"`
	Ref            string                  `json:"ref,omitempty"` // committed only; git rev, default "HEAD"
	ConflictPolicy KnowledgeConflictPolicy `json:"conflictPolicy"`
	Sources        []KnowledgeSource       `json:"sources"` // 1..100
	CreatedAt      time.Time               `json:"createdAt"`
}
```

- Một project có **nhiều pack có tên** (ví dụ `architecture-and-cms-specs`), khớp ví dụ ở mô hình role/skill §3.
- `DDD profile` là một source `kind: ddd-profile` trỏ tới file; A2 không parse nó (A5 làm).
- Chỉ nguồn local trong project root. Không `git fetch`, không gọi mạng; "Sync" trong UI = preview lại. BookStack/Jira/Qdrant để sau.

### 5.2 An toàn đường dẫn (bất biến, có test riêng)

1. `Path` phải tương đối, không rỗng (dùng `.` cho cả project), không chứa đoạn `..`, không bắt đầu bằng `/` hay ký tự ổ đĩa, không có `\`. Vi phạm → 400 `INVALID_KNOWLEDGE_PACK`.
2. **Không bao giờ đi theo symlink, ở cả hai ref policy.** Chỉ project root được canonical hoá một lần (`EvalSymlinks(ProjectRecord.Path)`, vì root có thể nằm dưới thư mục symlink như `/tmp` trên macOS). Từ root trở xuống, mọi đường dẫn được đọc là `root + đường dẫn tương đối sạch` đi qua thư mục thật. Vì vậy file được đọc luôn nằm trong root, và danh sách loại trừ (bước 3) luôn kiểm đúng đường dẫn thật sự được đọc. Symlink trỏ tới `.env`, `*.pem` hay `node_modules` bên trong project, hoặc tới chỗ ngoài project, đều không được đọc.
   - `working-tree`: mỗi thành phần của `Path` tính từ root được `os.Lstat`. Gặp symlink → một entry `state: symlink` cho source, không đọc gì bên dưới. Duyệt bằng `filepath.WalkDir` (không follow). Entry có `fs.ModeSymlink` → `symlink`, không đọc. Chỉ đọc file thường: `Lstat` → mở → `f.Stat()` → `os.SameFile` với kết quả `Lstat`. Khác nhau (file bị tráo giữa hai bước) → `symlink`, không dùng nội dung.
   - `committed`: không đọc nội dung từ đĩa (§5.3). Entry mode `120000` trong tree của commit → `symlink`, không đọc blob. Entry `160000` (submodule) → `excluded`.
3. Luôn bỏ qua (state `excluded`, không đọc): mọi đường dẫn có thành phần `.git` hoặc `node_modules`; file có base name khớp `.env`, `.env.*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `id_rsa*`, `id_ed25519*`, `*.keystore`. Áp cho đường dẫn project-relative của entry ở cả hai mode. Đây là lựa chọn của contract (tri thức đi vào prompt agent), danh sách chỉnh được ở §10.2 Q6.
4. Snapshot của pack thuộc project khác với `{projectId}` trên route → 404 `KNOWLEDGE_PACK_NOT_FOUND`. Narrowing không thêm source (§5.5).

### 5.3 Resolve và trạng thái từng file (hai thuật toán tách riêng)

**Repo của một source:** lấy thư mục tổ tiên gần nhất của `Path` (tính cả `Path` nếu là thư mục) còn tồn tại và là thư mục thật trên đĩa (mọi thành phần đã `Lstat`, không symlink), rồi chạy `git -C <dir> rev-parse --show-toplevel`. Project kiểu workspace có nhiều repo con, mỗi repo resolve riêng. Repo root có thể nằm trên project root (project là thư mục con của repo); đường dẫn trong repo khi đó = `rel(toplevel, root)/Path`. Bước này chỉ để tìm repo, không quyết định file nào được đọc.

**`committed`** (không phụ thuộc working tree):
1. `commit = git rev-parse --verify <Ref>^{commit}` cho mỗi repo, chạy một lần. Lỗi → issue `ref-unresolved`, không đọc file nào của repo đó.
2. Liệt kê bằng `git ls-tree -r -z -l --full-tree <commit> -- <repo-relative Path>`. Danh sách file, mode, object id và kích thước **chỉ** lấy từ tree. File đã xoá hoặc đổi thành symlink trên đĩa sau commit vẫn được liệt kê và đọc theo commit. Nếu tree không có entry nào dưới `Path`, kiểm từng tiền tố của `Path` bằng `git ls-tree -z <commit> -- <prefix>`. Gặp mode `120000` → một entry `symlink` cho source, thay vì `missing`.
3. Đọc nội dung bằng `git cat-file blob <oid>` theo object id lấy ở bước 2, không theo đường dẫn trên đĩa. Kích thước lấy từ `ls-tree -l` trước khi đọc.
4. `state`: `committed`. Source không có entry nào trong tree → `missing`. Nếu `Path` tồn tại trên đĩa (chỉ `Lstat`, không đọc), thêm hint `untracked-in-ref` vào message.

**`working-tree`:**
1. Duyệt đĩa theo §5.2 bước 2. Danh sách file và nội dung lấy từ đĩa.
2. `state`: `committed` nếu tracked và sạch so với `HEAD`. `draft` nếu modified, added hoặc untracked (`git status --porcelain=v1 -z -- <path>`), hoặc file ngoài git. `KnowledgeRepoState.Commit = HEAD`.

**Cả hai mode:** `missing` (không có file nào khớp source), `too-large`, `binary`, `excluded`, `symlink`. **`binary`** = có byte NUL trong 8 KiB đầu **hoặc** nội dung không phải UTF-8 hợp lệ (`utf8.Valid`). Nhờ vậy mọi nội dung được lưu đều là UTF-8 hợp lệ, và content endpoint (§7) trả về đúng byte đã hash. Chỉ entry `committed`/`draft` có nội dung và `sha256`.

Một file khớp nhiều source: giữ **một** entry cho source có `Priority` cao nhất (bằng nhau thì source đứng trước trong pack), các source còn lại ghi trong `alsoMatchedBy`.

### 5.4 Giới hạn

Mỗi snapshot tối đa 2 000 entry, mỗi file tối đa 1 MiB (lớn hơn → `too-large`), tổng nội dung đọc tối đa 32 MiB. Vượt số entry hoặc tổng → dừng đọc, issue `limit-exceeded`. Hằng số đặt trong `domain` để test và chỉnh.

### 5.5 Thu hẹp và gợi ý (hàm thuần cho A3a)

```go
// KnowledgeNarrowing is a node-level override. nil SourceIDs = all sources;
// non-nil must be a subset of the pack's source IDs; empty = no knowledge.
type KnowledgeNarrowing struct {
	SourceIDs []string `json:"sourceIds"`
}

func NarrowKnowledgePack(p KnowledgePack, n *KnowledgeNarrowing) (KnowledgePack, error) // ErrKnowledgeWidening
func SuggestKnowledgeSources(p KnowledgePack, tags []string) []string                  // source IDs, pack order
```

Thứ tự ưu tiên của spec (node override → role default → project default) áp cho tri thức như sau: project default = toàn bộ pack; role = gợi ý theo tag (không chặn); node = `KnowledgeNarrowing`, chỉ được thu hẹp.

### 5.6 Xung đột và trạng thái snapshot

- **Xung đột kiểm được bằng máy (A2):** `ambiguous-precedence`: hai source cùng `Topic` có `Priority` bằng nhau và cả hai có ít nhất một entry đọc được. Sửa bằng cách đặt priority khác nhau. Mâu thuẫn **nội dung** giữa các tài liệu không được tự phát hiện (§10.2 Q5).
- Issue: `{code, sourceId, path, message}` với `code ∈ missing-required | ambiguous-precedence | ref-unresolved | limit-exceeded | too-large | binary | excluded | symlink | draft-source | missing-optional`.
- `missing-required`: source `Required` mà sau dedupe không có entry nào `committed`/`draft` (gồm cả khi chỉ còn entry `symlink`, `excluded`, `binary`, `too-large`).
- `status = needs-attention` khi có `missing-required`, `ref-unresolved`, `limit-exceeded`, hoặc `ambiguous-precedence` với `ConflictPolicy = stop`. Ngược lại `ok`. `draft-source`, `symlink`, `excluded`, `binary`, `too-large`, `missing-optional` chỉ là cảnh báo. Spec yêu cầu ghi rõ draft, không yêu cầu chặn.
- Snapshot `needs-attention` **vẫn được lưu** (để Mission Control hiển thị); A4 quyết định chặn node.

### 5.7 KnowledgeSnapshot

```go
type KnowledgeSnapshotID string
type KnowledgeSnapshotPurpose string // "trial" (Settings "Tạo snapshot thử") | "run" (A4 only)
type KnowledgeSnapshotStatus string  // "ok" | "needs-attention"

type KnowledgeRepoState struct {
	Root   string `json:"root"`   // project-relative repo root ("." for single repo)
	Commit string `json:"commit"` // resolved Ref (committed) or HEAD (working-tree)
	Dirty  bool   `json:"dirty"`  // any entry in this repo is draft
}

type KnowledgeSnapshotEntry struct {
	SourceID      string   `json:"sourceId"`
	AlsoMatchedBy []string `json:"alsoMatchedBy,omitempty"`
	Path          string   `json:"path"` // project-relative
	RepoRoot      string   `json:"repoRoot,omitempty"`
	State         KnowledgeEntryState `json:"state"` // committed|draft|missing|too-large|binary|excluded|symlink
	SHA256        string   `json:"sha256,omitempty"` // hex of content; blob stored when set
	Bytes         int64    `json:"bytes"`
	Priority      int      `json:"priority"`
	Topic         string   `json:"topic,omitempty"`
}

type KnowledgeSnapshot struct {
	ID          KnowledgeSnapshotID      `json:"id"`
	ProjectID   ProjectID                `json:"projectId"`
	PackID      KnowledgePackID          `json:"packId"`
	PackVersion int64                    `json:"packVersion"`
	RefPolicy   KnowledgeRefPolicy       `json:"refPolicy"`
	Narrowing   *KnowledgeNarrowing      `json:"narrowing,omitempty"`
	Purpose     KnowledgeSnapshotPurpose `json:"purpose"`
	Status      KnowledgeSnapshotStatus  `json:"status"`
	Issues      []KnowledgeIssue         `json:"issues"`
	Repos       []KnowledgeRepoState     `json:"repos"`
	Entries     []KnowledgeSnapshotEntry `json:"entries"` // sorted by Path
	CreatedAt   time.Time                `json:"createdAt"`
}
```

- Snapshot bất biến. Nội dung lưu ở `knowledge_blobs(sha256)` dedupe giữa các snapshot.
- Xoá chỉ cho `purpose = trial` (blob không còn ai trỏ thì xoá cùng transaction). `run` → 409 `KNOWLEDGE_SNAPSHOT_PINNED`. API chỉ tạo `trial`; `run` chỉ tạo qua service (A4).
- **Stale** là so sánh lúc hỏi, không lưu: `CheckFreshness` chạy lại resolve (committed: resolve lại `Ref`, nên ref nhánh đã tiến cũng tính là stale khi blob đổi) với cùng pack version/narrowing và trả `{stale, changed: [{path, before, after}]}` (`after` có thể là `missing`). Dùng cho cảnh báo "stale" và cho "refresh knowledge" của A4.

## 6. Lưu trữ (SQLite, 2 migration, mỗi migration một PR)

```sql
-- A1: <ID>_role_profiles_and_skill_definitions.sql
CREATE TABLE skill_definition_heads (id TEXT PRIMARY KEY, name TEXT NOT NULL, latest_version INTEGER NOT NULL CHECK (latest_version >= 1), archived_at TIMESTAMP, updated_at TIMESTAMP NOT NULL);
CREATE UNIQUE INDEX skill_definition_heads_active_name ON skill_definition_heads(name COLLATE NOCASE) WHERE archived_at IS NULL;
CREATE TABLE skill_definition_versions (id TEXT NOT NULL REFERENCES skill_definition_heads(id), version INTEGER NOT NULL CHECK (version >= 1), body_json TEXT NOT NULL, created_at TIMESTAMP NOT NULL, PRIMARY KEY (id, version));
-- role_profile_heads / role_profile_versions: cùng hình dạng
CREATE TABLE role_profile_skill_refs (role_id TEXT NOT NULL, role_version INTEGER NOT NULL, skill_id TEXT NOT NULL, skill_version INTEGER NOT NULL, PRIMARY KEY (role_id, role_version, skill_id), FOREIGN KEY (role_id, role_version) REFERENCES role_profile_versions(id, version), FOREIGN KEY (skill_id, skill_version) REFERENCES skill_definition_versions(id, version));

-- A2: <ID>_knowledge_packs_and_snapshots.sql
CREATE TABLE knowledge_pack_heads (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, name TEXT NOT NULL, latest_version INTEGER NOT NULL, archived_at TIMESTAMP, updated_at TIMESTAMP NOT NULL);
CREATE UNIQUE INDEX knowledge_pack_heads_active_name ON knowledge_pack_heads(project_id, name COLLATE NOCASE) WHERE archived_at IS NULL;
CREATE TABLE knowledge_pack_versions (id TEXT NOT NULL REFERENCES knowledge_pack_heads(id) ON DELETE CASCADE, version INTEGER NOT NULL, body_json TEXT NOT NULL, created_at TIMESTAMP NOT NULL, PRIMARY KEY (id, version));
CREATE TABLE knowledge_snapshots (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, pack_id TEXT NOT NULL, pack_version INTEGER NOT NULL, purpose TEXT NOT NULL CHECK (purpose IN ('trial','run')), status TEXT NOT NULL CHECK (status IN ('ok','needs-attention')), body_json TEXT NOT NULL, created_at TIMESTAMP NOT NULL, FOREIGN KEY (pack_id, pack_version) REFERENCES knowledge_pack_versions(id, version) ON DELETE CASCADE);
CREATE INDEX knowledge_snapshots_pack ON knowledge_snapshots(project_id, pack_id, created_at);
CREATE TABLE knowledge_snapshot_blobs (snapshot_id TEXT NOT NULL REFERENCES knowledge_snapshots(id) ON DELETE CASCADE, sha256 TEXT NOT NULL, PRIMARY KEY (snapshot_id, sha256));
CREATE TABLE knowledge_blobs (sha256 TEXT PRIMARY KEY, bytes INTEGER NOT NULL, content BLOB NOT NULL);
```

`role_profile_skill_refs` tồn tại để kiểm `SKILL_DEFINITION_IN_USE` bằng SQL và để FK chặn trỏ tới version không tồn tại. Không thêm trigger `change_log` (đọc theo yêu cầu, như T1). Cascade theo mẫu `cues`; hiện store không xoá cứng project (chỉ archive) nên cascade chỉ là lưới an toàn.

## 7. HTTP API

Tag `roles`, `skills`, `knowledge`. Envelope và lỗi theo `apierr` như Cue/T1. `?version=` thiếu hoặc `0` = mới nhất; không phải số nguyên ≥ 0 → 400.

| Method + path | operationId | Ghi chú |
|---|---|---|
| `GET /api/v1/skill-definitions` | `listSkillDefinitions` | bản mới nhất; `?includeArchived=true` |
| `POST /api/v1/skill-definitions` | `createSkillDefinition` | 201, version 1 |
| `GET /api/v1/skill-definitions/{skillId}` | `getSkillDefinition` | `?version=` |
| `GET /api/v1/skill-definitions/{skillId}/versions` | `listSkillDefinitionVersions` | tăng dần |
| `POST /api/v1/skill-definitions/{skillId}/versions` | `reviseSkillDefinition` | body có `expectedVersion`; 201 |
| `POST /api/v1/skill-definitions/{skillId}/archive` · `/restore` | `archiveSkillDefinition` · `restoreSkillDefinition` | |
| `GET`/`POST /api/v1/role-profiles`, `GET /api/v1/role-profiles/{roleId}`, `.../versions` (GET/POST), `.../archive`, `.../restore` | `listRoleProfiles`, `createRoleProfile`, `getRoleProfile`, `listRoleProfileVersions`, `reviseRoleProfile`, `archiveRoleProfile`, `restoreRoleProfile` | DTO đọc có `skillUpdates: [{id, pinnedVersion, latestVersion}]` |
| `GET`/`POST /api/v1/projects/{projectId}/knowledge-packs`, `GET .../knowledge-packs/{packId}`, `.../versions` (GET/POST), `.../archive`, `.../restore` | `listKnowledgePacks`, `createKnowledgePack`, `getKnowledgePack`, `listKnowledgePackVersions`, `reviseKnowledgePack`, `archiveKnowledgePack`, `restoreKnowledgePack` | |
| `POST /api/v1/projects/{projectId}/knowledge-packs/preview` | `previewKnowledgePack` | body = pack input chưa lưu (hoặc `{packId, version}`); trả entries + issues + status, **không** nội dung, không ghi gì |
| `POST /api/v1/projects/{projectId}/knowledge-packs/{packId}/snapshots` | `createKnowledgeSnapshot` | body `{version?, narrowing?}`; luôn `purpose: trial`; 201 |
| `GET /api/v1/projects/{projectId}/knowledge-snapshots` | `listKnowledgeSnapshots` | `?packId=`; chỉ metadata (không entries) |
| `GET /api/v1/knowledge-snapshots/{snapshotId}` | `getKnowledgeSnapshot` | đủ entries + issues |
| `GET /api/v1/knowledge-snapshots/{snapshotId}/content?path=` | `getKnowledgeSnapshotContent` | `{path, sha256, bytes, content}`. `content` là chuỗi UTF-8 hợp lệ (§5.3), bảo đảm `sha256(utf8 bytes của content) == sha256` và `len == bytes` |
| `GET /api/v1/knowledge-snapshots/{snapshotId}/freshness` | `getKnowledgeSnapshotFreshness` | `{stale, changed}` |
| `DELETE /api/v1/knowledge-snapshots/{snapshotId}` | `deleteKnowledgeSnapshot` | chỉ `trial` |

Mã lỗi:

| Code | HTTP | Khi |
|---|---|---|
| `INVALID_SKILL_DEFINITION`, `INVALID_ROLE_PROFILE`, `INVALID_KNOWLEDGE_PACK` | 400 | validate domain fail; details `{field}` |
| `UNKNOWN_SKILL_VERSION` | 400 | role trỏ `(skillId, version)` không tồn tại |
| `SKILL_DEFINITION_NOT_FOUND`, `ROLE_PROFILE_NOT_FOUND`, `KNOWLEDGE_PACK_NOT_FOUND`, `KNOWLEDGE_SNAPSHOT_NOT_FOUND`, `PROJECT_NOT_FOUND` | 404 | |
| `<KIND>_VERSION_CONFLICT` | 409 | details `{latestVersion}` |
| `<KIND>_NAME_EXISTS` | 409 | |
| `<KIND>_ARCHIVED` | 409 (revise) / 400 (tham chiếu khi tạo role) | |
| `SKILL_DEFINITION_IN_USE` | 409 | details `{roleProfileIds}` |
| `KNOWLEDGE_NARROWING_WIDENS` | 400 | `sourceIds` chứa ID không có trong pack |
| `KNOWLEDGE_SNAPSHOT_PINNED` | 409 | xoá snapshot `run` |
| `KNOWLEDGE_CONTENT_NOT_FOUND` | 404 | `path` không có entry có nội dung |

`<KIND>` ∈ `SKILL_DEFINITION`, `ROLE_PROFILE`, `KNOWLEDGE_PACK`.

## 8. Interface cho đợt sau (A3a/A4 chỉ dùng những hàm này)

```go
// service/roleskill
func (s *Service) GetSkill(ctx, id domain.SkillDefinitionID, version int64) (domain.SkillDefinition, error)
func (s *Service) GetRole(ctx, id domain.RoleProfileID, version int64) (domain.RoleProfile, error)
func (s *Service) ResolveSkillRefs(ctx, refs []domain.SkillRef) ([]domain.SkillDefinition, error) // UNKNOWN_SKILL_VERSION on first miss; archived allowed (pinned runs)

// service/knowledge
func (s *Service) GetPack(ctx, projectID domain.ProjectID, id domain.KnowledgePackID, version int64) (domain.KnowledgePack, error)
func (s *Service) CreateSnapshot(ctx, in CreateSnapshotInput) (domain.KnowledgeSnapshot, error) // in.Purpose = run from A4
func (s *Service) SnapshotContent(ctx, id domain.KnowledgeSnapshotID, path string) ([]byte, domain.KnowledgeSnapshotEntry, error)
func (s *Service) CheckFreshness(ctx, id domain.KnowledgeSnapshotID) (Freshness, error)

// domain (pure)
func NarrowKnowledgePack(domain.KnowledgePack, *domain.KnowledgeNarrowing) (domain.KnowledgePack, error)
func SuggestKnowledgeSources(domain.KnowledgePack, []string) []string
```

A3a lưu trong mỗi node của `FlowDefinition`: `{roleId, roleVersion}`, `skills []SkillRef`, `knowledge {packId, packVersion, narrowing}`. A3a định nghĩa struct đó; A1/A2 không tạo bảng nào cho node.

## 9. Ngoài phạm vi A1/A2

UI Settings (plan riêng A1-UI/A2-UI sau UI-S, theo `.agents/skills/ao-workflow-ui`); CLI `ao role|skill|knowledge`; `Participant` và `Capability`; artifact registry; parse DDD profile (A5); nguồn remote (BookStack/Jira/HTTP), tìm kiếm ngữ nghĩa/embedding; tự phát hiện mâu thuẫn nội dung; seed preset role/skill (A5); kiểm nới rộng tool của role so với project (A3a); GC snapshot `run`; multi-tenancy/RBAC (docs/fork/README "Ngoài phạm vi").

## 10. Quyết định và câu hỏi mở

### 10.1 Decisions (đã đóng)

| # | Quyết định | Căn cứ |
|---|---|---|
| Q1 (phần "có hay không") | **Có** lớp tool của role. `RoleProfile.Tools *ToolNarrowing` (§4.4). Thêm ở plan Task 11, sau khi T1 domain (PR #8) merge và **trước** khi A3a resolve policy. Shape cụ thể còn mở ở Q1 bên dưới | Roadmap D4 (`node → role → project`, tầng dưới chỉ thu hẹp); `CONTEXT.md` "ToolProfile … resolved node → role → project"; PR #8 có `ToolNarrowing`, `ResolveToolPolicy(base, layers...)` |
| Q2 | Không seed PO/BA/SA/Dev/Test (và skill mẫu) trong A1. Preset tạo ở A5 qua service | Roadmap §2/§3 (`A5 Preset DDD`, plan viết khi A4 merge); `role-skill-knowledge-model.md` §2 ("default artifact mapping để dựng preset") và §4 bước 1–2 (preset PO → BA → SA → Dev → Test là bước mở rộng) |
| Q9 | Dùng bản spec trong repo `docs/fork/specs/`, không dùng đường dẫn workspace ngoài repo | Roadmap dòng **Spec** ("Worker chạy trong worktree chỉ thấy repo, nên đọc bản trong repo"); `docs/fork/README.md` mục Specs ("Worker trong worktree chỉ đọc bản này") |
| R1 (review PR #10) | Không follow symlink ở cả hai mode; danh sách loại trừ áp trên đường dẫn thật được đọc | §5.2 |
| R2 (review PR #10) | `committed` chỉ liệt kê và đọc từ tree/blob của commit; `EvalSymlinks`/duyệt đĩa chỉ dùng cho `working-tree` | §5.3 |
| R4 (review PR #10) | UTF-8 không hợp lệ → `binary`, không lưu; content endpoint trả đúng byte đã hash | §5.3, §7 |

### 10.2 Open questions (plan chạy với mặc định; đổi thì sửa contract trước khi code task liên quan)

| # | Câu hỏi | Vì sao chưa tự trả lời được | Mặc định trong plan |
|---|---|---|---|
| Q1 (phần còn lại) | Shape lớp tool của role: dùng nguyên `ToolNarrowing` của T1 hay thêm `ToolProfileRef`? Xoá MCP server khi role còn grant tới nó có bị chặn (`MCP_SERVER_IN_USE`) không? | T1 chưa merge nên shape có thể đổi; T1 Task 4 chỉ kiểm ToolProfile khi xoá server | Dùng nguyên `ToolNarrowing` theo bản T1 đã merge. Không mở rộng kiểm xoá server; A3a validate báo lỗi widening khi role grant server không còn trong base |
| Q3 | `SkillDefinition` có import/đồng bộ từ `SKILL.md` (`.agents/skills/*`, superpowers) không? | Spec chỉ nói "hướng dẫn thực hiện", không nói nguồn file | Không. `Instructions` nhập tay hoặc dán. Import một chiều là tính năng sau |
| Q4 | Có registry cho `ArtifactContractRef` (schema `DomainPlan/v1`…) không, và A1 có chặn tên chưa đăng ký? | Schema artifact thuộc A4 handoff | Chỉ kiểm định dạng chuỗi |
| Q5 | "Conflict" trong Project Knowledge có gồm mâu thuẫn nội dung giữa tài liệu không? | `project-knowledge-ddd-workflow.md` §1–§2 chỉ chốt "áp thứ tự ưu tiên nguồn" và "xung đột chưa giải quyết → needs-attention", không nói cách phát hiện mâu thuẫn nội dung | Chỉ `ambiguous-precedence` theo `Topic` + `Priority` |
| Q6 | Danh sách file luôn loại trừ (§5.2 bước 3) có đủ/quá chặt không, có cho project tự chỉnh không? | Chính sách bảo mật của người dùng | Danh sách cố định trong `domain`, không cấu hình được |
| Q7 | Giới hạn 2 000 file / 1 MiB / 32 MiB mỗi snapshot có hợp với repo thật (ví dụ `ddd-eda-lab`) không? | Chưa đo repo thật | Giữ số này, là hằng số dễ đổi |
| Q8 | Snapshot `trial` có tự hết hạn không? | Chưa có dữ liệu sử dụng | Không tự xoá; người dùng xoá tay |
