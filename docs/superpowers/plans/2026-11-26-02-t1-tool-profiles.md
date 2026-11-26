# T1 ToolProfile + MCP Registry (backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Daemon lưu được MCP server dùng chung và ToolProfile có version (builtin/MCP/shell), resolve được policy theo các lớp thu hẹp, có HTTP API. Chưa áp policy vào agent (đó là T2).

**Architecture:** Thêm theo pattern Cue: `domain/` (kiểu + luật thuần) → `storage/sqlite` (migration, query, store) → `service/toolprofile` (validate, version, conflict) → `httpd/controllers` + `specgen` → wiring ở `daemon.go`/`api.go`. Version bất biến: sửa profile = insert version mới.

**Tech Stack:** Go, SQLite + goose + sqlc, chi, code-first OpenAPI.

**Spec:** [roadmap](./2026-11-26-00-roadmap.md) D4; `docs/fork/specs/settings-role-skill-project-knowledge.md` §3 (thứ tự ưu tiên, chỉ thu hẹp).

## Global Constraints

- Migration tạo bằng `npm run migration:create -- tool_profiles_and_mcp_servers`; thêm ID + filename vào `shippedMigrations` trong `backend/internal/storage/sqlite/migrate_burned_versions_test.go`.
- Không sửa tay `storage/sqlite/gen/*`; chạy `npm run sqlc`.
- Sau khi đổi DTO/specgen: `npm run api`, commit `openapi.yaml` + `frontend/src/api/schema.ts`.
- Giá trị env/header có key khớp `(?i)(token|secret|key|password|auth)` phải là `secret://<name>`; không lưu secret dạng text thường.
- Thứ tự resolve: project profile → role → node; lớp sau chỉ được thu hẹp.
- Hotspot (migration, specgen, daemon.go, api.go): PR này nằm trong contract queue (roadmap §4).

## Review Focus

- Lệnh shell nối chuỗi lách allowlist: `go test ./... && git push` với allow `go test *` → phải **bị chặn** (Task 2 test `TestAllowsShellRejectsChaining`).
- Deny và allow cùng khớp: `git push origin main` với allow `git *`, deny `git push *` → deny thắng (Task 2).
- Node override thêm server MCP không có trong base → lỗi `ErrToolPolicyWidening`, không âm thầm bỏ qua (Task 2).
- Xoá MCP server đang được ToolProfile (bản mới nhất) dùng → 409 `MCP_SERVER_IN_USE` (Task 4).
- Hai người sửa cùng profile từ cùng version → người sau nhận 409 `TOOL_PROFILE_VERSION_CONFLICT`, không ghi đè (Task 4).

---

### Task 1: Domain types + validation

**Files:**
- Create: `backend/internal/domain/toolprofile.go`, `backend/internal/domain/toolprofile_test.go`

**Interfaces:**
- Produces:
  - `type MCPServerID string`; `type MCPTransport string` với `MCPTransportStdio = "stdio"`, `MCPTransportHTTP = "http"`
  - `type MCPServer struct { ID MCPServerID; Name string; Transport MCPTransport; Command string; Args []string; URL string; Env map[string]string; Headers map[string]string; CreatedAt, UpdatedAt time.Time }`
  - `type ToolProfileID string`
  - `type MCPGrant struct { Server MCPServerID; Tools []string }` (`"*"` = mọi tool của server)
  - `type ToolProfile struct { ID ToolProfileID; Version int64; Name string; BuiltinAllow, BuiltinDeny, ShellAllow, ShellDeny []string; MCP []MCPGrant; CreatedAt time.Time }`
  - `func ValidateMCPServer(s MCPServer) error`, `func ValidateToolProfile(p ToolProfile) error`
  - `var ErrMCPPlaintextSecret, ErrToolPolicyWidening = errors.New(...)`

- [ ] **Step 1: Viết test lỗi**

```go
func TestValidateMCPServer(t *testing.T) {
	ok := domain.MCPServer{ID: "gitnexus", Name: "gitnexus", Transport: domain.MCPTransportStdio, Command: "gitnexus", Args: []string{"mcp"}}
	require.NoError(t, domain.ValidateMCPServer(ok))
	noCmd := ok; noCmd.Command = ""
	require.Error(t, domain.ValidateMCPServer(noCmd))
	httpNoURL := domain.MCPServer{ID: "pm", Name: "pm", Transport: domain.MCPTransportHTTP}
	require.Error(t, domain.ValidateMCPServer(httpNoURL))
	leak := domain.MCPServer{ID: "pm", Name: "pm", Transport: domain.MCPTransportHTTP, URL: "https://x", Headers: map[string]string{"Authorization": "Bearer abc"}}
	require.ErrorIs(t, domain.ValidateMCPServer(leak), domain.ErrMCPPlaintextSecret)
	ref := leak; ref.Headers = map[string]string{"Authorization": "secret://postman-token"}
	require.NoError(t, domain.ValidateMCPServer(ref))
}

func TestValidateToolProfile(t *testing.T) {
	p := domain.ToolProfile{ID: "tp_1", Version: 1, Name: "backend-dev", ShellAllow: []string{"go test *"}, MCP: []domain.MCPGrant{{Server: "gitnexus", Tools: []string{"*"}}}}
	require.NoError(t, domain.ValidateToolProfile(p))
	bad := p; bad.Version = 0
	require.Error(t, domain.ValidateToolProfile(bad))
	dupe := p; dupe.MCP = append(dupe.MCP, domain.MCPGrant{Server: "gitnexus", Tools: []string{"query"}})
	require.Error(t, domain.ValidateToolProfile(dupe))
	midStar := p; midStar.ShellAllow = []string{"git * push"}
	require.Error(t, domain.ValidateToolProfile(midStar)) // "*" chỉ được ở token cuối
	noTools := p; noTools.MCP = []domain.MCPGrant{{Server: "gitnexus"}}
	require.Error(t, domain.ValidateToolProfile(noTools))
}
```

Nếu package `domain` chưa dùng `require`, viết theo kiểu `if err != nil { t.Fatal }` như `pipeline_test.go`.

- [ ] **Step 2:** `cd backend && go test ./internal/domain/ -run 'TestValidate(MCPServer|ToolProfile)'` → FAIL (undefined).
- [ ] **Step 3:** Viết kiểu và hai hàm validate trong `toolprofile.go`. Name bắt buộc, tối đa 100 byte. Stdio cần `Command`; HTTP cần URL có scheme `http`/`https`.
- [ ] **Step 4:** Chạy lại → PASS.
- [ ] **Step 5:** `git commit -m "feat(domain): add tool profile and MCP server types"`

### Task 2: Resolve policy + luật khớp shell

**Files:**
- Modify: `backend/internal/domain/toolprofile.go`, `backend/internal/domain/toolprofile_test.go`

**Interfaces:**
- Consumes: Task 1
- Produces:
  - `type ToolNarrowing struct { BuiltinAllow, BuiltinDeny, ShellAllow, ShellDeny []string; MCP []MCPGrant }` (allow `nil` = kế thừa)
  - `type ResolvedToolPolicy struct { ProfileID ToolProfileID; ProfileVersion int64; BuiltinAllow, BuiltinDeny, ShellAllow, ShellDeny []string; MCP []MCPGrant }`
  - `func ResolveToolPolicy(base ToolProfile, layers ...ToolNarrowing) (ResolvedToolPolicy, error)`
  - `func (p ResolvedToolPolicy) AllowsShell(command string) bool`

Luật: allow = giao (layer không được thêm phần tử không có trong lớp trước, nếu có → `ErrToolPolicyWidening`); deny = hợp; MCP = giao theo server rồi giao theo tool (`"*"` ở lớp trước chấp nhận mọi tool ở lớp sau). Shell pattern: khớp đúng nguyên văn, hoặc pattern kết thúc bằng `" *"` thì khớp mọi lệnh bắt đầu bằng phần trước dấu `*` cộng khoảng trắng hoặc bằng đúng phần đó. Lệnh chứa một trong `; & | $ \` > < ( ) \n` → `false`, trừ khi khớp nguyên văn một mục allow. Deny thắng allow.

- [ ] **Step 1: Viết test lỗi**

```go
func TestResolveToolPolicyNarrowsOnly(t *testing.T) {
	base := domain.ToolProfile{ID: "tp_1", Version: 3, Name: "dev",
		ShellAllow: []string{"go test *", "git *"}, ShellDeny: []string{"git push *"},
		MCP: []domain.MCPGrant{{Server: "gitnexus", Tools: []string{"*"}}}}
	got, err := domain.ResolveToolPolicy(base, domain.ToolNarrowing{ShellAllow: []string{"go test *"}, MCP: []domain.MCPGrant{{Server: "gitnexus", Tools: []string{"query"}}}})
	require.NoError(t, err)
	require.Equal(t, []string{"go test *"}, got.ShellAllow)
	require.Equal(t, []string{"git push *"}, got.ShellDeny)
	require.Equal(t, []domain.MCPGrant{{Server: "gitnexus", Tools: []string{"query"}}}, got.MCP)
	require.Equal(t, int64(3), got.ProfileVersion)
	_, err = domain.ResolveToolPolicy(base, domain.ToolNarrowing{MCP: []domain.MCPGrant{{Server: "postman", Tools: []string{"*"}}}})
	require.ErrorIs(t, err, domain.ErrToolPolicyWidening)
	_, err = domain.ResolveToolPolicy(base, domain.ToolNarrowing{ShellAllow: []string{"rm *"}})
	require.ErrorIs(t, err, domain.ErrToolPolicyWidening)
}

func TestAllowsShell(t *testing.T) {
	p := domain.ResolvedToolPolicy{ShellAllow: []string{"go test *", "git *", "npm run sqlc"}, ShellDeny: []string{"git push *"}}
	for cmd, want := range map[string]bool{
		"go test ./...": true, "go test": true, "go testx": false,
		"git status": true, "git push origin main": false,
		"npm run sqlc": true, "npm run api": false,
	} {
		require.Equal(t, want, p.AllowsShell(cmd), cmd)
	}
}

func TestAllowsShellRejectsChaining(t *testing.T) {
	p := domain.ResolvedToolPolicy{ShellAllow: []string{"go test *"}}
	for _, cmd := range []string{"go test ./... && git push", "go test ./...; rm -rf /", "go test $(curl x)", "go test ./... | sh", "go test > /etc/x"} {
		require.False(t, p.AllowsShell(cmd), cmd)
	}
}
```

- [ ] **Step 2:** `go test ./internal/domain/ -run 'TestResolveToolPolicy|TestAllowsShell'` → FAIL.
- [ ] **Step 3:** Viết `ResolveToolPolicy` và `AllowsShell`. Giữ thứ tự phần tử theo lớp gốc để output ổn định.
- [ ] **Step 4:** Chạy lại → PASS; chạy toàn package `go test ./internal/domain/` → PASS.
- [ ] **Step 5:** `git commit -m "feat(domain): resolve narrowing tool policies and match shell rules"`

### Task 3: Migration, query, store

**Files:**
- Create: `backend/internal/storage/sqlite/migrations/<ID>_tool_profiles_and_mcp_servers.sql` (từ `npm run migration:create`), `backend/internal/storage/sqlite/queries/tool_profiles.sql`, `backend/internal/storage/sqlite/store/tool_profile_store.go`, `backend/internal/storage/sqlite/store/tool_profile_store_test.go`
- Modify: `backend/internal/storage/sqlite/migrate_burned_versions_test.go` (`shippedMigrations`), `backend/internal/domain/toolprofile.go` (thêm `ErrMCPServerNameExists`, `ErrToolProfileVersionExists`)
- Generated: `backend/internal/storage/sqlite/gen/*`

**Interfaces:**
- Consumes: Task 1
- Produces (methods trên `*sqlite.Store`):
  - `InsertMCPServer(ctx, domain.MCPServer) error` (trùng name → `domain.ErrMCPServerNameExists`)
  - `UpdateMCPServer(ctx, domain.MCPServer) (bool, error)`, `DeleteMCPServer(ctx, domain.MCPServerID) (bool, error)`
  - `SelectMCPServer(ctx, domain.MCPServerID) (domain.MCPServer, bool, error)`, `SelectMCPServers(ctx) ([]domain.MCPServer, error)` (sắp theo name)
  - `InsertToolProfileVersion(ctx, domain.ToolProfile) error` (trùng `(id, version)` → `domain.ErrToolProfileVersionExists`)
  - `SelectToolProfile(ctx, domain.ToolProfileID, version int64) (domain.ToolProfile, bool, error)` (`version == 0` = mới nhất)
  - `SelectLatestToolProfiles(ctx) ([]domain.ToolProfile, error)`, `SelectToolProfileVersions(ctx, domain.ToolProfileID) ([]domain.ToolProfile, error)`

Schema: `mcp_servers(id TEXT PK, name TEXT NOT NULL UNIQUE, transport TEXT NOT NULL CHECK (transport IN ('stdio','http')), command TEXT NOT NULL DEFAULT '', args_json TEXT NOT NULL DEFAULT '[]', url TEXT NOT NULL DEFAULT '', env_json TEXT NOT NULL DEFAULT '{}', headers_json TEXT NOT NULL DEFAULT '{}', created_at TIMESTAMP NOT NULL, updated_at TIMESTAMP NOT NULL)`; `tool_profiles(id TEXT NOT NULL, version INTEGER NOT NULL CHECK (version >= 1), name TEXT NOT NULL, body_json TEXT NOT NULL, created_at TIMESTAMP NOT NULL, PRIMARY KEY (id, version))`. Hai error sentinel thêm vào `domain/toolprofile.go`. Không thêm trigger `change_log` (settings đọc theo yêu cầu).

- [ ] **Step 1:** `npm run migration:create -- tool_profiles_and_mcp_servers`, viết Up/Down theo mẫu `0168_cues.sql`, thêm vào `shippedMigrations`.
- [ ] **Step 2: Viết test lỗi** trong `tool_profile_store_test.go`, dùng `newTestStore(t)`:
  - `TestMCPServerRoundTripAndUniqueName`: insert → select bằng nhau (gồm Args/Env/Headers); insert trùng name → `ErrMCPServerNameExists`.
  - `TestToolProfileVersions`: insert v1, v2 → `SelectToolProfile(id, 0)` trả v2; `(id, 1)` trả v1; `SelectToolProfileVersions` trả `[v1, v2]`; insert lại v2 → `ErrToolProfileVersionExists`; `SelectLatestToolProfiles` có đúng 1 phần tử cho id đó.
- [ ] **Step 3:** `go test ./internal/storage/sqlite/store/ -run 'TestMCPServer|TestToolProfile'` → FAIL.
- [ ] **Step 4:** Viết query (`-- name: ... :one/:many/:exec`), `npm run sqlc`, viết store. `body_json` chứa các danh sách và MCP grant của profile.
- [ ] **Step 5:** Chạy lại → PASS; `go test ./internal/storage/sqlite/...` → PASS (gồm test burned versions).
- [ ] **Step 6:** `git commit -m "feat(storage): persist MCP servers and versioned tool profiles"`

### Task 4: Service `toolprofile`

**Files:**
- Create: `backend/internal/service/toolprofile/{service.go,store.go,types.go,service_test.go}`

**Interfaces:**
- Consumes: Task 1–3
- Produces:
  - `type Deps struct { Store Store; NewID func() string; Now func() time.Time }`; `func New(Deps) *Service` (ID mặc định `"tp_"+uuid`, server ID do người dùng đặt dạng slug)
  - `type ProfileInput struct { Name string; BuiltinAllow, BuiltinDeny, ShellAllow, ShellDeny []string; MCP []domain.MCPGrant }`
  - `Create(ctx, ProfileInput) (domain.ToolProfile, error)` → version 1
  - `Revise(ctx, id domain.ToolProfileID, expectedVersion int64, in ProfileInput) (domain.ToolProfile, error)` → version+1
  - `Get(ctx, id, version int64)`, `List(ctx)`, `Versions(ctx, id)`
  - `CreateMCPServer`, `UpdateMCPServer`, `DeleteMCPServer`, `ListMCPServers`, `GetMCPServer`

Lỗi API (dùng `apierr`): `INVALID_TOOL_PROFILE` / `INVALID_MCP_SERVER` (Invalid), `MCP_SECRET_NOT_REFERENCE` (Invalid), `TOOL_PROFILE_NOT_FOUND` / `MCP_SERVER_NOT_FOUND` (NotFound), `TOOL_PROFILE_VERSION_CONFLICT` (Conflict, details `{latestVersion}`), `MCP_SERVER_IN_USE` (Conflict, details `{profileIds}`), `UNKNOWN_MCP_SERVER` (Invalid: grant trỏ tới server không tồn tại), `MCP_SERVER_NAME_EXISTS` (Conflict).

- [ ] **Step 1: Viết test lỗi** với fake store trong `service_test.go`:
  - `TestCreateThenReviseBumpsVersion`
  - `TestReviseStaleVersionConflicts` (expectedVersion 1 khi latest là 2 → `TOOL_PROFILE_VERSION_CONFLICT`, latestVersion=2)
  - `TestCreateRejectsUnknownMCPServer`
  - `TestDeleteMCPServerInUse` (profile mới nhất dùng server → `MCP_SERVER_IN_USE`; chỉ version cũ dùng thì xoá được)
  - `TestCreateMCPServerRejectsPlaintextSecret`
- [ ] **Step 2:** `go test ./internal/service/toolprofile/` → FAIL.
- [ ] **Step 3:** Viết service theo mẫu `service/cue/service.go`.
- [ ] **Step 4:** Chạy lại → PASS.
- [ ] **Step 5:** `git commit -m "feat(service): tool profile and MCP server service"`

### Task 5: HTTP API + spec + wiring

**Files:**
- Create: `backend/internal/httpd/controllers/tool_profiles.go`, `backend/internal/httpd/controllers/tool_profiles_test.go`
- Modify: `backend/internal/httpd/controllers/dto.go`, `backend/internal/httpd/apispec/specgen/build.go` (`schemaNames` + `toolProfileOperations()` gọi trong danh sách `ops`), `backend/internal/httpd/api.go` (field `ToolProfiles controllers.ToolProfileService` trong deps, controller, `Register`), `backend/internal/daemon/daemon.go` (`toolprofilesvc.New(toolprofilesvc.Deps{Store: store})`)
- Generated: `backend/internal/httpd/apispec/openapi.yaml`, `frontend/src/api/schema.ts`

**Interfaces:**
- Consumes: Task 4
- Produces (route, tag `tools`):
  - `GET /api/v1/mcp-servers` (`listMcpServers`), `POST /api/v1/mcp-servers` (`createMcpServer`), `PATCH /api/v1/mcp-servers/{mcpServerId}` (`updateMcpServer`), `DELETE /api/v1/mcp-servers/{mcpServerId}` (`deleteMcpServer`)
  - `GET /api/v1/tool-profiles` (`listToolProfiles`, bản mới nhất), `POST /api/v1/tool-profiles` (`createToolProfile`), `GET /api/v1/tool-profiles/{toolProfileId}?version=` (`getToolProfile`), `GET /api/v1/tool-profiles/{toolProfileId}/versions` (`listToolProfileVersions`), `POST /api/v1/tool-profiles/{toolProfileId}/versions` (`reviseToolProfile`, body có `expectedVersion`)

- [ ] **Step 1: Viết test lỗi** trong `tool_profiles_test.go` theo mẫu `cues_test.go` (fake service): create 201 + envelope; revise conflict → 409 với `code: TOOL_PROFILE_VERSION_CONFLICT`; `version=abc` → 400; delete in use → 409.
- [ ] **Step 2:** `go test ./internal/httpd/controllers/ -run ToolProfile` → FAIL.
- [ ] **Step 3:** Viết controller + DTO + specgen + wiring.
- [ ] **Step 4:** `npm run api` rồi `cd backend && go test ./internal/httpd/...` → PASS (spec drift + route/spec parity).
- [ ] **Step 5: Kiểm thử thật:** `D=$(mktemp -d); env -u AO_RUN_FILE -u AO_PORT AO_DATA_DIR=$D AO_RUN_FILE=$D/running.json AO_PORT=0 go run ./cmd/ao start` (bỏ biến thừa hưởng từ runner để không đụng daemon của ai-orchestra), rồi `curl -s -XPOST localhost:<port>/api/v1/mcp-servers -d '{"id":"gitnexus","name":"gitnexus","transport":"stdio","command":"gitnexus","args":["mcp"]}'` → 201; `GET /api/v1/mcp-servers` trả server vừa tạo. Port lấy từ `running.json` trong `AO_DATA_DIR`.
- [ ] **Step 6:** Chạy full: `npm run lint && npm run frontend:typecheck` → PASS.
- [ ] **Step 7:** `git add` các file trên + generated; `git commit -m "feat(api): tool profile and MCP server endpoints"`.
