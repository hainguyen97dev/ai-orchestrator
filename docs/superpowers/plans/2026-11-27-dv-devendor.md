# DV De-vendor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chặn mọi request AO tự gửi tới nhà phát hành (PostHog, Sentry, AO Cloud, release/installer upstream), rồi xoá Sentry, PostHog/telemetry remote và Cloud sign-in qua bốn PR nối tiếp. Telemetry usage cục bộ trong SQLite vẫn giữ.

**Architecture:** DV-1 không dùng một chốt mạng chung. Nó tắt từng sender tại đúng chỗ sender được tạo, và ưu tiên những công tắc code đã có sẵn: `buildTelemetryBootstrap` trả `null` thì renderer không tạo PostHog; `CloudControlPlaneURL` rỗng thì desktop/daemon/CLI từ chối mọi request Cloud; `MOBILE_TELEMETRY_DISABLED` thì mobile không tạo PostHog. Test fake transport chứng minh 0 request. DV-2 → DV-4 gỡ code theo lát dọc (UI → API → service → adapter → build/CI → docs/tests). Mỗi PR giữ nguyên các test 0-request của DV-1 và không làm mất dữ liệu usage local.

**Tech Stack:** Go (`httptest`, `sqlitetest`), SQLite, Electron/TypeScript (Vitest, config `vite.renderer.config.ts`), Expo/React Native (Vitest, `packages/mobile/vitest.config.mts`), GitHub Actions.

**Spec:** [roadmap](./2026-11-26-00-roadmap.md) D3, D7, §3, §4, §6, §6a; [inventory](../../fork/devendor-inventory.md) (kiểm trên `origin/main` @ `9959aa6b`, 27/11/2026). Mọi `file:line` dưới đây lấy từ inventory. Trước khi viết test, kiểm lại `file:line` trên HEAD mới.

## Global Constraints

- Thứ tự cứng: DV-1 → DV-2 → DV-3 → DV-4, **mỗi bước một PR**. PR sau tạo branch từ `origin/main` sau khi PR trước đã merge. Không gộp hai bước vào một PR. Không merge hộ người dùng.
- Mỗi lần sửa code: superpowers:test-driven-development (test đỏ đúng lý do → code tối thiểu → test xanh). Fail bất ngờ thì dùng superpowers:systematic-debugging. Trước commit/PR: superpowers:verification-before-completion, kèm output mới chạy.
- Không đặt/sửa `AO_DATA_DIR`, `AO_RUN_FILE`, `AO_PORT` của session. Test dùng `t.TempDir()`, `sqlitetest.Open`, fake client/transport. Không khởi động daemon thật bằng env của session. Test Go cần env thì dùng `t.Setenv`.
- Định nghĩa "vendor outbound" theo mục đầu của inventory. GitHub/GitLab do người dùng chọn, nhà cung cấp model, LAN/loopback, cloudflared quick tunnel, Expo push, bảng giá LiteLLM **không** nằm trong kill switch. Không viết chốt chặn HTTP toàn cục.
- Repo upstream: `Untrivial-ai`, `OrchestratorInc`, `AgentWrapper`, `aoagents` (so khớp không phân biệt hoa thường). Repo khác (fork) vẫn được phép.
- Giữ local: `backend/internal/adapters/telemetry/localsqlite.go`, `backend/internal/storage/sqlite/store/usage_telemetry_store.go`, `store.go:98-106`, các bảng `usage_*`, route `GET /api/v1/telemetry/identity`. Không sửa migration đã merge. Không tự ý đổi ngữ nghĩa opt-out với usage local (Open question Q7).
- Đổi DTO/specgen thì chạy `npm run api` và commit cả `backend/internal/httpd/apispec/openapi.yaml` lẫn `frontend/src/api/schema.ts`. Không sửa `gen/*` bằng tay.
- **Hotspot (§4):** task có nhãn 🔥 vào contract queue. Chỉ một PR chạm hotspot được mở tại một thời điểm. Trước khi push: `git rebase origin/main`, chạy lại `npm run api` nếu có đổi DTO.
- PR theo `.agents/skills/pr-description/SKILL.md`, có thêm hai mục `Out-of-plan files` và `De-vendor`. Scope cleanup theo roadmap §6. Tới 27/11/2026, A0 Task 3 (`chore/a0-ci`) **chưa** merge: lúc đó commit cuối của PR có code dùng `[skip ci]`; A0 Task 3 merge rồi thì bỏ. CI skip không thay được kiểm chứng local.
- Cuối mỗi DV: chạy lại ba lệnh `rg` ở inventory §7, cập nhật cột hướng DV trong `docs/fork/devendor-inventory.md`. Phát hiện ngoài phạm vi thì ghi vào `docs/fork/devendor-log.md` theo §6a (file có trên `main` từ PR #2; tới 27/11/2026 bảng còn trống).

## Review Focus

1. **Tắt remote làm mất usage local.** `configureUsageRecording` (`telemetry_wiring.go:104-109`) và cổng `startUsageTelemetry` (`daemon.go:369`) đều đòi `Remote == posthog`. Người dùng mong bộ đếm usage vẫn tăng sau DV-1. Test: `TestNewTelemetrySink_NeverExportsAndKeepsLocalUsage` (Task 1).
2. **Env override bật lại vendor.** `AO_TELEMETRY_REMOTE=posthog`, `AO_SENTRY_DSN`, `AO_ELECTRON_SENTRY_DSN`, `AO_CLOUD_CONTROL_PLANE_URL`, `EXPO_PUBLIC_POSTHOG_*`, `EXPO_PUBLIC_AO_CLOUD_API_BASE_URL` không được mở lại request nào. Test đặt env/config rõ ràng trong Task 1, 2, 3.
3. **Sentry được bật lại qua consent hoặc version "published".** `publishedSentryDSN` chỉ lọc theo regex phiên bản; consent true không được dẫn tới transport thật. Test: `TestInitRefusesNetworkTransport` (Task 1), `electronMainSentryDsn` (Task 2), `initMobileSentry` (Task 3).
4. **Sender tách riêng bị sót.** `sendBeacon` lúc pagehide, `cloud-artifact-ipc` (không qua resolver CP), feature builds, mac differential v2, host updater chạy script upstream. Mỗi sender có một test riêng trong Task 2 hoặc Task 1.
5. **Đụng nhầm kết nối hợp lệ.** Pairing mobile qua LAN, identity của host đã pair, GitHub/provider auth, loopback daemon IPC vẫn hoạt động. Test: `TestControlPlaneTargetRejectsEmptyBase` chỉ chặn đường CP; test accountHosts khẳng định không có request tới CP nhưng không đổi luồng pairing (Task 3).

---

## DV-1 — Kill switch + chứng minh 0 vendor outbound (PR 1)

Branch `feat/dv-1-kill-switch`. Không chạm hotspot: `daemon.go` giữ nguyên, các chặn nằm trong file được nó gọi. Task 1–3 độc lập với nhau; Task 4 gom lại và mở PR.

### Task 1: Go daemon/CLI — không PostHog, không Sentry transport, không Cloud, không release upstream

**Files:**
- Create: `backend/internal/vendorguard/vendorguard.go`, `backend/internal/vendorguard/vendorguard_test.go`
- Modify: `backend/internal/daemon/telemetry_wiring.go:40-109`, `:136-160`; Test: `backend/internal/daemon/telemetry_wiring_test.go` (sửa `TestNewTelemetrySink_UsesLocalSQLiteWhenEnabled`, `TestNewTelemetrySink_MissingRemoteCredentialsDisablesRemoteUsage`, thay `TestNewTelemetrySink_FanoutIncludesPostHogWhenConfigured`)
- Modify: `backend/internal/observe/sentryobs/sentryobs.go:208-265`; Test: `backend/internal/observe/sentryobs/sentryobs_test.go`
- Modify: `backend/internal/config/config.go:538-549`; Test: `backend/internal/config/config_test.go` (`TestLoadOfferingDefaults`, `TestLoadOfferingOverrides`) và mọi `_test.go` khác đang mong default `https://api.aoagents.dev` từ `config.Load` (tìm bằng `rg -l 'api\.aoagents\.dev' backend -g '*_test.go'`)
- Test: `backend/internal/mobilebridge/named_tunnel_test.go`, `backend/internal/daemon/remote_host_directory_test.go`
- Modify: `backend/internal/cli/start.go:680-682` (và chỗ gọi `:522`); Test: `backend/internal/cli/start_test.go`
- Modify: `backend/internal/hostupdate/hostupdate.go:252-272`; Test: `backend/internal/hostupdate/hostupdate_test.go`

**Interfaces:**
- Produces (Go, package `vendorguard`):
  - `var ErrBlocked = errors.New("request to the AO publisher is blocked in this fork")`
  - `func IsUpstreamRepo(ownerRepo string) bool`: `"Untrivial-ai/agent-orchestrator"` → true; `"hainguyen97dev/ai-orchestrator"` → false; chuỗi rỗng hoặc sai dạng → false.
  - `func IsUpstreamURL(rawURL string) bool`: true khi host là `github.com`, `raw.githubusercontent.com` hoặc `objects.githubusercontent.com` và path segment đầu là owner upstream; cũng true khi host là `api.github.com` và path là `/repos/{owner upstream}/…`. Các trường hợp khác → false.
- Semantics mới của `newTelemetrySink(cfg, store, log) (ports.EventSink, ports.TelemetryIdentityStore, bool)`: giá trị bool thứ ba nghĩa là "usage pipeline chạy", bằng `cfg.Telemetry.Events && identity != nil`. Hàm không bao giờ gọi `NewPostHogSink`. `daemon.go:331` giữ tên biến `remoteTelemetryActive`; DV-3 sẽ đổi tên.
- `configureUsageRecording` bỏ điều kiện `cfg.Telemetry.Remote`.

- [ ] **Step 1: Viết test `vendorguard`** — `TestIsUpstreamRepo` và `TestIsUpstreamURL`, dạng bảng, gồm các ca: `https://github.com/untrivial-ai/agent-orchestrator/releases/latest/download/x.dmg` → true; `https://raw.githubusercontent.com/OrchestratorInc/agent-orchestrator/main/scripts/setup-self-hosted.sh` → true; `https://api.github.com/repos/Untrivial-ai/agent-orchestrator/releases` → true; `https://api.github.com/user` → false; `https://github.com/hainguyen97dev/ai-orchestrator/releases` → false; `https://raw.githubusercontent.com/BerriAI/litellm/main/x.json` → false; `"::"` → false.
- [ ] **Step 2: Viết test telemetry wiring.** Thêm `TestNewTelemetrySink_NeverExportsAndKeepsLocalUsage`: `httptest.Server` đếm request; cfg `Events: true, Remote: TelemetryRemotePostHog, PostHogKey: "phc_test", PostHogHost: srv.URL`, `DataDir: t.TempDir()`. Gọi `newTelemetrySink` rồi `configureUsageRecording`. Tạo project/session/conversation và `AppendUserMessage` theo mẫu `MissingRemoteCredentials…` (`telemetry_wiring_test.go:59-99`). Chạy `startUsageTelemetry(ctx, store, sink, identity, installMilestones(cfg), log).flush(ctx, false)`, rồi `sink.Close`. Assert: bool thứ ba `== true`; `sink` có kiểu `*telemetryadapter.LocalSQLiteSink`; bộ đếm request của server `== 0`; local sink có đúng 1 event `ao.usage.messages_sent` với `count == 1` (đọc qua API đọc event của `LocalSQLiteSink` hoặc query bảng event local, tuỳ cái nào có sẵn). Thay `FanoutIncludesPostHogWhenConfigured` bằng assert kiểu sink là local. Sửa `UsesLocalSQLiteWhenEnabled`: mong `active == true`. Thêm `TestStartGitHubLoginResolver_NeverRuns`: cfg như trên, identity giả; assert `SetGitHubLogin` không được gọi và không có lần nào gọi resolver SCM (chèn resolver giả qua biến package nếu chưa có seam).
- [ ] **Step 3: Viết test Sentry.** `TestInitRefusesNetworkTransport`: `httptest.Server` đếm request; `Init(Config{DSN: "http://public@" + srv.Listener.Addr().String() + "/1", Release: "1.2.3", Environment: "stable"})` với `Transport` nil; `SetPolicyCheck(func(context.Context) bool { return true })`; `CaptureError(...)`; `Flush(time.Second)`. Assert `Enabled() == false` và bộ đếm request `== 0`. Các test hiện có dùng `Transport` giả phải giữ nguyên và vẫn xanh.
- [ ] **Step 4: Viết test config và Cloud.** Sửa `TestLoadOfferingDefaults`: mong `CloudControlPlaneURL == ""`. Sửa `TestLoadOfferingOverrides`: với `t.Setenv("AO_CLOUD_CONTROL_PLANE_URL", " https://cp.example.com/ ")` vẫn mong `""`, và URL sai dạng không còn làm `Load` lỗi. Thêm `TestControlPlaneTargetRejectsEmptyBase` (`named_tunnel_test.go`): `ControlPlaneTarget("", "/api/cloud/v1/remote-hosts/h/tunnel")` trả error. Thêm `TestPublishRemoteHostAddressEmptyBaseSendsNothing` (`remote_host_directory_test.go`): `publishRemoteHostAddress(ctx, client, "", "h", "addr", "hash", t.TempDir()+"/state")` với client đếm request → có error, 0 request. Hai test cuối ghim guard đang có, nên có thể xanh ngay; ghi rõ điều đó trong PR.
- [ ] **Step 5: Viết test release/installer.** `TestDownloadRefusesUpstreamReleaseRepo` (`start_test.go`): giữ `releaseRepo` mặc định, gọi hàm tải ở `:522` với `http.Client` có transport đếm request → nhận `errors.Is(err, vendorguard.ErrBlocked)` và 0 request. `TestDownloadURLUsesReleaseRepo` phải vẫn xanh khi đặt `releaseRepo = "hainguyen97dev/ai-orchestrator"`. `TestStartRefusesUpstreamInstaller` (`hostupdate_test.go`): `Updater{kind: kindSystemd, run: fake.run, …}` theo mẫu `:54`; `Start(ctx, "")` trả lỗi thoả cả `errors.Is(err, vendorguard.ErrBlocked)` lẫn `errors.Is(err, ErrUnsupported)`, và `fake.calls` rỗng. `TestStart` hiện có đặt `installerURL` sang URL fork trong test (lưu và khôi phục bằng `t.Cleanup`).
- [ ] **Step 6: Chạy để thấy đỏ**
  Run: `cd backend && go test ./internal/vendorguard ./internal/daemon ./internal/observe/sentryobs ./internal/config ./internal/mobilebridge ./internal/cli ./internal/hostupdate -run 'Upstream|NeverExports|NeverRuns|UsesLocalSQLite|MissingRemote|RefusesNetworkTransport|LoadOffering|EmptyBase|RefusesUpstream|TestStart$' -count=1`
  Expected: `vendorguard` báo `undefined: IsUpstreamRepo` (build fail); các package còn lại `--- FAIL` ở các test mới hoặc đã sửa, trừ hai test ghim guard ở Step 4. Test fail vì compile do chính test viết sai thì sửa test và chạy lại, tới khi fail đúng về hành vi.
- [ ] **Step 7: Code tối thiểu.** Viết `vendorguard.go` theo Interfaces. Trong `newTelemetrySink`, bỏ nhánh `NewPostHogSink`: Events tắt → `NoopSink{}, standaloneIdentity, false`; Events bật → `NewLocalSQLiteSink(...), identity, identity != nil`. Trong `configureUsageRecording`, bỏ điều kiện `Remote`. `startGitHubLoginResolver` return ngay ở dòng đầu. Trong `sentryobs.Init`, khi `cfg.Transport == nil` thì không gọi `sentry.Init` và để `enabled` là false (thay cho `sentry.NewHTTPSyncTransport()` ở `:241`). Trong `config.Load` (`:538-549`), để `cfg.CloudControlPlaneURL = ""` và không đọc `AO_CLOUD_CONTROL_PLANE_URL`; giữ `parseCloudControlPlaneURL` cho DV-4 xoá. Hàm tải của `start.go` trả `vendorguard.ErrBlocked` khi `vendorguard.IsUpstreamRepo(releaseRepo)`, trước khi tạo request. `Updater.Start` trả `fmt.Errorf("%w: %w", ErrUnsupported, vendorguard.ErrBlocked)` khi `vendorguard.IsUpstreamURL(installerURL)`, trước mọi lệnh `run`. Nhờ đó nhánh `errors.Is(err, hostupdate.ErrUnsupported)` sẵn có ở `backend/internal/httpd/controllers/host_update.go:54` xử lý luôn, không phải sửa controller hay DTO.
- [ ] **Step 8: Chạy lại để thấy xanh**
  Run: lệnh của Step 6.
  Expected: mọi dòng đều `ok`.
  Run: `cd backend && go test ./... -count=1`
  Expected: `ok` cho mọi package, không có `FAIL`. Test cũ còn mong default `api.aoagents.dev` thì sửa trong chính file `_test.go` đó và ghi tên vào PR.
- [ ] **Step 9: Commit**
  ```bash
  git add backend/internal/vendorguard backend/internal/daemon/telemetry_wiring.go backend/internal/daemon/telemetry_wiring_test.go backend/internal/daemon/remote_host_directory_test.go backend/internal/observe/sentryobs backend/internal/config backend/internal/mobilebridge/named_tunnel_test.go backend/internal/cli/start.go backend/internal/cli/start_test.go backend/internal/hostupdate
  git commit -m "fix(daemon): block publisher telemetry, Sentry, Cloud and upstream release requests"
  ```

### Task 2: Electron main/renderer — không PostHog, không Sentry, không release upstream, không Cloud artifact

**Files:**
- Create: `frontend/src/shared/vendor-guard.ts`, `frontend/src/shared/vendor-guard.test.ts`
- Modify: `frontend/src/shared/telemetry.ts:308-330`; Test: `frontend/src/shared/telemetry.test.ts`
- Test: `frontend/src/renderer/lib/telemetry.test.ts`
- Modify: `frontend/src/main/sentry-main.ts:17-19`; Test: `frontend/src/main/sentry-main.test.ts`
- Modify: `frontend/src/main/desktop-version-floor.ts:67-87`; Test: `frontend/src/main/desktop-version-floor.test.ts`
- Modify: `frontend/src/main/auto-updater.ts:179-191`; Test: `frontend/src/main/auto-updater.test.ts`
- Modify: `frontend/src/main/feature-builds.ts:203`; Test: `frontend/src/main/feature-builds.test.ts`
- Modify: `frontend/src/main/mac-differential-v2-protocol.ts:94-98`; Test (create): `frontend/src/main/mac-differential-v2-protocol.test.ts`
- Modify: `frontend/src/main/cloud-artifact-ipc.ts:56`; Test: `frontend/src/main/cloud-artifact-ipc.test.ts`
- Test: `frontend/src/main/cloud-cp-proxy.test.ts`

**Interfaces:**
- Produces (`frontend/src/shared/vendor-guard.ts`):
  - `export const UPSTREAM_OWNERS: readonly string[]` (4 owner, viết thường).
  - `export function isUpstreamRepo(ownerRepo: string): boolean`, `export function isUpstreamUrl(url: string): boolean`: cùng ca và cùng kết quả với Go `vendorguard` ở Task 1.
  - `export class VendorOutboundBlockedError extends Error` (`name = "VendorOutboundBlockedError"`).
- Không đổi IPC channel, preload hay `main.ts` (không có hotspot). `main.ts:1660-1681` vẫn truyền `AO_TELEMETRY_REMOTE=posthog` cho daemon, nhưng sau Task 1 giá trị đó vô hiệu. DV-3 sẽ xoá.

- [ ] **Step 1: Viết test.**
  - `vendor-guard.test.ts`: dùng lại bảng ca ở Task 1 Step 1.
  - `telemetry.test.ts` (shared): `buildTelemetryBootstrap({ AO_TELEMETRY_REMOTE: "posthog", AO_TELEMETRY_EVENTS: "on" }, "1.2.3", "darwin", tmpHome, true, policyEventsEnabled)` resolve thành `null`.
  - `renderer/lib/telemetry.test.ts`: khi bootstrap IPC trả `null` → `vi.mock("posthog-js/dist/module.full.no-external")` chứng minh không có `init`; `navigator.sendBeacon` (spy) có 0 lần gọi sau khi phát `pagehide` và gọi capture cho một onboarding event.
  - `sentry-main.test.ts`: với `process.env.AO_ELECTRON_SENTRY_DSN = "https://k@o1.ingest.us.sentry.io/1"`, `electronMainSentryDsn("1.2.3", false)` trả `""`; `initMainSentry` trả transport no-op (spy trên `@sentry/electron` `init` có 0 lần gọi).
  - `desktop-version-floor.test.ts`: `checkDesktopVersionFloor({})` với `fetch` giả → 0 lần gọi.
  - `auto-updater.test.ts`: `app-update.yml` giả có `owner: Untrivial-ai` → `configureFeed({ channel: "latest", feature: null })` không gọi `autoUpdater.setFeedURL`; với `owner: hainguyen97dev` thì có gọi.
  - `feature-builds.test.ts`: repo mặc định → `listFeatureBuilds()` resolve `[]`, `fetch` có 0 lần gọi.
  - `mac-differential-v2-protocol.test.ts`: `validateMacV2Payload({ protocol: "ao-mac-differential-v2", repository: "Untrivial-ai/agent-orchestrator", channel: "nightly", … })` throw `Ineligible`.
  - `cloud-artifact-ipc.test.ts`: `fetchCloudArtifact(fakeSession, "https://x.orchestratorusercontent.com/…/files/a")` reject với `VendorOutboundBlockedError`; `fakeSession.fetch` có 0 lần gọi.
  - `cloud-cp-proxy.test.ts`: resolver trả `null` → `proxy.request(...)` reject "no Orchestrator Cloud control plane is configured" và `fetchImpl` có 0 lần gọi. Test này ghim guard có sẵn ở `:343-344`.
- [ ] **Step 2: Chạy để thấy đỏ**
  Run: `cd frontend && npx vitest run --config vite.renderer.config.ts src/shared/vendor-guard.test.ts src/shared/telemetry.test.ts src/renderer/lib/telemetry.test.ts src/main/sentry-main.test.ts src/main/desktop-version-floor.test.ts src/main/auto-updater.test.ts src/main/feature-builds.test.ts src/main/mac-differential-v2-protocol.test.ts src/main/cloud-artifact-ipc.test.ts src/main/cloud-cp-proxy.test.ts`
  Expected: `vendor-guard.test.ts` fail vì không resolve được import; các test mới khác fail và in ra lần gọi `fetch`/`setFeedURL`/`init` ngoài ý muốn; test ghim (`cloud-cp-proxy`, `renderer/lib/telemetry` nhánh null) có thể pass.
- [ ] **Step 3: Code tối thiểu.** Viết `vendor-guard.ts`. `buildTelemetryBootstrap` return `null` ngay đầu hàm (comment ở `:317-320` đã giải thích đây là công tắc tổng). `electronMainSentryDsn` return `""`. `checkDesktopVersionFloor` return khi `isUpstreamUrl(FLOOR_URL)`. `configureFeed` bỏ qua `setFeedURL` khi `isUpstreamRepo(owner + "/" + repo)`. `listFeatureBuilds` return `[]` khi repo đang dùng là upstream. `validateMacV2Payload` throw khi `isUpstreamRepo(MAC_V2_REPOSITORY)`. `fetchCloudArtifact` throw `VendorOutboundBlockedError` trước `session.fetch`.
- [ ] **Step 4: Chạy lại để thấy xanh**
  Run: lệnh của Step 2. Expected: `Test Files  10 passed (10)`.
  Run: `cd frontend && npm run typecheck && npm test`
  Expected: `tsgo` exit 0; Vitest `Test Files  N passed (N)`, `0 failed`. Test cũ mong feed/floor upstream hoạt động thì sửa sang repo fork trong chính file test đó và ghi vào PR.
- [ ] **Step 5: Commit**
  ```bash
  git add frontend/src/shared/vendor-guard.ts frontend/src/shared/vendor-guard.test.ts frontend/src/shared/telemetry.ts frontend/src/shared/telemetry.test.ts frontend/src/renderer/lib/telemetry.test.ts frontend/src/main/sentry-main.ts frontend/src/main/sentry-main.test.ts frontend/src/main/desktop-version-floor.ts frontend/src/main/desktop-version-floor.test.ts frontend/src/main/auto-updater.ts frontend/src/main/auto-updater.test.ts frontend/src/main/feature-builds.ts frontend/src/main/feature-builds.test.ts frontend/src/main/mac-differential-v2-protocol.ts frontend/src/main/mac-differential-v2-protocol.test.ts frontend/src/main/cloud-artifact-ipc.ts frontend/src/main/cloud-artifact-ipc.test.ts frontend/src/main/cloud-cp-proxy.test.ts
  git commit -m "fix(desktop): block publisher analytics, Sentry and upstream release requests"
  ```

### Task 3: Mobile — không PostHog, không Sentry, không Cloud CP

**Files:**
- Modify: `packages/mobile/lib/telemetry/config.ts:22-23`; Test (create): `packages/mobile/lib/telemetry/config.test.ts`
- Modify: `packages/mobile/lib/sentry.ts:126-127`; Test: `packages/mobile/lib/sentry.test.ts`
- Modify: `packages/mobile/lib/cloud/errors.ts`, `packages/mobile/lib/cloud/client.ts:132-134`; Test: `packages/mobile/lib/cloud/client.test.ts`
- Modify: `packages/mobile/lib/accountHosts.ts:100`; Test: `packages/mobile/lib/accountHosts.test.ts`

**Interfaces:**
- Produces: `export class VendorOutboundBlockedError extends CloudError` trong `packages/mobile/lib/cloud/errors.ts`. Mọi method của `createCloudClient(...)` reject với lỗi này và không gọi `options.fetch`/`fetch` toàn cục. Chữ ký của `createCloudClient` giữ nguyên.
- `MOBILE_TELEMETRY_DISABLED` thành hằng `true`; cổng `runtime.ts:77` giữ nguyên.

- [ ] **Step 1: Viết test.**
  - `config.test.ts`: `vi.stubEnv("EXPO_PUBLIC_AO_TELEMETRY_DISABLED", "")`, `vi.resetModules()`, import lại → `MOBILE_TELEMETRY_DISABLED === true`.
  - `sentry.test.ts`: `setMobileSentryConsent(true)` rồi `await initMobileSentry()` → `sdk.init` (mock `@sentry/react-native`) có 0 lần gọi.
  - `client.test.ts`: `createCloudClient({ baseUrl: "https://api.aoagents.dev", fetch: spy, … })`; gọi hai method đại diện (một GET danh sách, một stream/SSE) → cả hai reject `VendorOutboundBlockedError`, `spy` có 0 lần gọi.
  - `accountHosts.test.ts`: `syncAccountHosts(account)` với `fetch` giả → không có lần gọi nào tới URL bắt đầu bằng `https://api.aoagents.dev`; host đã pair trong storage vẫn còn nguyên.
- [ ] **Step 2: Chạy để thấy đỏ**
  Run: `cd packages/mobile && npx vitest run lib/telemetry/config.test.ts lib/sentry.test.ts lib/cloud/client.test.ts lib/accountHosts.test.ts`
  Expected: 4 file `failed`; output có lần gọi `sdk.init` hoặc fetch tới `api.aoagents.dev`.
- [ ] **Step 3: Code tối thiểu.** `MOBILE_TELEMETRY_DISABLED = true`. `initMobileSentry` return `Promise.resolve()` ngay đầu hàm. Trong `createCloudClient`, `doFetch` luôn reject `new VendorOutboundBlockedError(...)`; `WebSocket`/SSE helper trong client cũng reject trước khi mở kết nối. `syncAccountHosts` bỏ qua bước directory ở `:100`.
- [ ] **Step 4: Chạy lại để thấy xanh**
  Run: lệnh của Step 2. Expected: `Test Files  4 passed (4)`.
  Run: `cd packages/mobile && npm run typecheck && npm test`
  Expected: `tsgo` exit 0; `0 failed`. Test Cloud cũ mong request thật thì đổi assertion sang `VendorOutboundBlockedError` và ghi vào PR.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/mobile/lib/telemetry/config.ts packages/mobile/lib/telemetry/config.test.ts packages/mobile/lib/sentry.ts packages/mobile/lib/sentry.test.ts packages/mobile/lib/cloud/errors.ts packages/mobile/lib/cloud/client.ts packages/mobile/lib/cloud/client.test.ts packages/mobile/lib/accountHosts.ts packages/mobile/lib/accountHosts.test.ts
  git commit -m "fix(mobile): block publisher analytics, Sentry and Cloud requests"
  ```

### Task 4: Kiểm chứng tổng, cập nhật inventory, mở PR 1

**Files:**
- Modify: `docs/fork/devendor-inventory.md` (cột hướng DV: đánh dấu "DV-1 ✅ chặn" cho từng dòng đã chặn, kèm tên test)
- Modify nếu có phát hiện: `docs/fork/devendor-log.md`

- [ ] **Step 1: Rà lại.** Chạy ba lệnh ở inventory §7. Expected: mọi sender **auto** trong inventory §1–§4 đều có test ở Task 1–3 hoặc nằm trong Open questions. Kết quả mới chưa phân loại thì thêm vào test cùng PR (nếu là vendor auto) hoặc ghi `devendor-log.md`.
- [ ] **Step 2: Chạy toàn bộ.**
  Run: `cd backend && go test ./... -count=1` → không có `FAIL`.
  Run: `cd frontend && npm run typecheck && npm test` → `0 failed`.
  Run: `cd packages/mobile && npm run typecheck && npm test` → `0 failed`.
  Run: `node --test scripts/ci-lanes.test.mjs` → `# fail 0`.
- [ ] **Step 3: Scope cleanup (§6).** `git diff --name-status origin/main...HEAD` chỉ được chứa file trong Files của Task 1–4, cộng các `_test.go`/`.test.ts` đã ghi lý do. Phải không có `daemon.go`, `api.go`, `openapi.yaml`, `schema.ts`, migration.
- [ ] **Step 4: Commit + PR.** Commit docs (`docs(fork): mark DV-1 kill switch in inventory`, thêm `[skip ci]` nếu A0 Task 3 chưa merge). Mở PR `fix: block vendor outbound by default` vào `main`. Mục `De-vendor` liệt kê từng sender và test chứng minh. Before/After ghi số request fake quan sát được (trước > 0, sau = 0) và số event `ao.usage.messages_sent` trong local sink (trước = 0 khi remote off, sau = 1).

---

## DV-2 — Xoá Sentry (PR 2) 🔥

Hotspot: `backend/internal/daemon/daemon.go` (`:145-152`, `:323-350` và khoảng 20 chỗ `sentryobs.RecoverBackground()`). Branch `chore/dv-2-remove-sentry` từ `origin/main` sau khi DV-1 merge.

### Task 5: Daemon bỏ `sentryobs`, giữ lỗi trong log local 🔥

**Files:**
- Delete: `backend/internal/observe/sentryobs/` (cả package và test)
- Modify: `backend/internal/daemon/daemon.go` 🔥, `backend/internal/daemon/supervisor/supervisor.go`, `backend/internal/httpd/router.go`, `backend/internal/httpd/recover.go`, `backend/internal/httpd/log.go`, `backend/internal/observe/scm/observer.go`, `backend/internal/observe/reaper/reaper.go`, `backend/internal/observe/trackerintake/observer.go`, `backend/internal/service/chat/sentry.go` (delete nếu chỉ phục vụ Sentry), `backend/internal/session_manager/sentry.go` (tương tự), `backend/internal/config/config.go:99-103`, `:476-477`, `:584`, `backend/go.mod`, `backend/go.sum`
- Test: `backend/internal/httpd/recover_test.go`, `backend/internal/httpd/log_test.go`, `backend/internal/daemon/supervisor/supervisor_test.go`

**Interfaces:** `RecoverBackground()` được thay bằng một hàm `recover` + `log.Error` trong package `daemon`, tên `recoverBackground(log *slog.Logger)`. Panic HTTP vẫn trả envelope lỗi 500 kèm request ID như hiện tại.

- [ ] **Step 1: Viết test.** `TestRecoverMiddlewareLogsPanicWithoutSentry` (`recover_test.go`): handler panic → response 500, body có request ID, logger giả nhận 1 record level Error có `panic` và stack. `TestSupervisorLogsBackgroundPanic`: goroutine được giám sát panic → logger nhận record, process không chết.
- [ ] **Step 2: Chạy để thấy đỏ**
  Run: `cd backend && go test ./internal/httpd/... ./internal/daemon/supervisor/... -run 'WithoutSentry|LogsBackgroundPanic' -count=1`
  Expected: `--- FAIL` vì hiện tại lỗi đi qua `sentryobs` chứ không vào logger.
- [ ] **Step 3: Gỡ.** Xoá call site theo thứ tự httpd → observe → service/session_manager → supervisor → daemon → config (`SentryDSN`, `AO_SENTRY_DSN` trong `telemetryEnvKeys`). Cuối cùng chạy `cd backend && go mod tidy`.
- [ ] **Step 4: Chạy lại để thấy xanh**
  Run: `cd backend && go test ./... -count=1 && go vet ./...` → không có `FAIL`.
  Run: `rg -n -i 'sentry' backend -g '!*.md'` → không còn kết quả.
- [ ] **Step 5: Commit** `chore(daemon): remove Sentry integration`.

### Task 6: Desktop + mobile + build bỏ Sentry

**Files:**
- Delete: `frontend/src/main/sentry-main.ts`, `frontend/src/main/sentry-main.test.ts`, `frontend/src/renderer/lib/sentry.ts`, `frontend/src/shared/sentry-config.ts`, `frontend/vite.sentry.ts`, `packages/mobile/lib/sentry.ts`, `packages/mobile/lib/sentry.test.ts`, `packages/mobile/lib/sentry-config.ts`
- Modify: `frontend/src/main.ts` (`:60`, `:210`, `:1670-1674`, `:4801-4817`), `frontend/src/main/desktop-telemetry-controller.ts`, `frontend/src/renderer/lib/telemetry.ts:21`, `:1704-1726`, `frontend/vite.renderer.config.ts:15`, `:228-296`, `frontend/forge.config.ts:47`, `frontend/package.json`, `frontend/package-lock.json`, `packages/mobile/lib/TelemetryManager.tsx`, `packages/mobile/lib/observability.ts`, `packages/mobile/app.json:76`, `packages/mobile/package.json`, `packages/mobile/package-lock.json`, `.github/workflows/build-artifacts.yml:118-119`, `:237-243`
- Modify/Delete: `packages/shared/telemetry/sentry-message.ts` (delete khi `rg` không còn consumer); `packages/shared/telemetry/ao-error.ts` **giữ** vì `frontend/src/main/remotes-store.ts` còn import.
- Test: `frontend/src/main/desktop-telemetry-controller.test.ts`, `frontend/src/renderer/lib/telemetry.test.ts`

- [ ] **Step 1: Viết test.** `desktop-telemetry-controller.test.ts`: `captureMain(capture)` ghi lỗi vào logger local (`console.error` spy hoặc logger được inject), và controller không còn nhận `transportFactory`. `renderer/lib/telemetry.test.ts`: `captureException(err)` gửi IPC log local, không import `./sentry`.
- [ ] **Step 2: Chạy để thấy đỏ** — `cd frontend && npx vitest run --config vite.renderer.config.ts src/main/desktop-telemetry-controller.test.ts src/renderer/lib/telemetry.test.ts`. Expected: fail vì controller vẫn đòi transport Sentry.
- [ ] **Step 3: Gỡ** theo lát dọc renderer → IPC → main → build (Vite/Forge) → workflow → dependency. Chạy `npm uninstall @sentry/electron @sentry/vite-plugin` trong `frontend/` và `npm uninstall @sentry/react-native @sentry/browser` trong `packages/mobile/`, sau khi import đã hết.
- [ ] **Step 4: Chạy lại để thấy xanh**
  Run: `cd frontend && npm run typecheck && npm test && npm run build` → exit 0.
  Run: `cd packages/mobile && npm run typecheck && npm test` → exit 0.
  Run: `rg -n -i 'sentry|AO_ELECTRON_SENTRY_DSN|@sentry' frontend packages .github -g '!*.md' -g '!**/locales/**'` → không còn kết quả runtime (chuỗi i18n nhắc "error reporting" thì phân loại trong PR).
- [ ] **Step 5: Commit + PR 2.** `chore: remove Sentry integration`. Scope cleanup §6; cập nhật inventory §2 thành "DV-2 ✅ xoá". PR đưa vào contract queue vì có `daemon.go`.

---

## DV-3 — Xoá PostHog và telemetry remote, giữ usage local (PR 3) 🔥

Hotspot: `backend/internal/daemon/daemon.go:331-376`. Branch `chore/dv-3-remove-posthog` từ `origin/main` sau khi DV-2 merge.

### Task 7: Daemon bỏ exporter PostHog, usage local độc lập 🔥

**Files:**
- Delete: `backend/internal/adapters/telemetry/posthog.go`, `posthog_test.go`, `posthog_retry_test.go`, cùng các remote-only helper mà `rg` cho thấy chỉ PostHog dùng (dự kiến `aggregate.go`, `ratelimit.go`, `daily.go`, `denylist.go`, `optout.go`, `cohort.go`, `environment.go`, `tenure.go`, `onboarding.go` và test tương ứng). Mỗi file chỉ xoá sau khi `rg -n '<Symbol>' backend -g '!*_test.go'` không còn consumer ngoài PostHog; file nào còn consumer thì giữ và ghi lý do.
- Modify: `backend/internal/daemon/telemetry_wiring.go`, `backend/internal/daemon/usage_telemetry.go`, `backend/internal/daemon/daemon.go:331-376` 🔥 (đổi `remoteTelemetryActive` → `usageActive`), `backend/internal/config/config.go` (bỏ `TelemetryRemote*`, `PostHogKey/Host`, `DefaultTelemetryPostHogHost`, các key PostHog trong `telemetryEnvKeys`, parser `:457-469`, `:614-623`)
- Keep: `localsqlite.go`, `identity.go` (route identity của điện thoại), `milestones.go` nếu `installMilestones` vẫn dùng
- Test: `backend/internal/daemon/telemetry_wiring_test.go`, `backend/internal/daemon/usage_telemetry_test.go`, `backend/internal/config/config_test.go`

**Interfaces:** `newTelemetrySink(cfg, store, log) (ports.EventSink, ports.TelemetryIdentityStore, bool)` giữ chữ ký từ DV-1. `AO_TELEMETRY_REMOTE` có giá trị thì `config.Load` bỏ qua (không lỗi), để env cũ của Electron không làm daemon fail.

- [ ] **Step 1: Viết test.** `TestLoadIgnoresLegacyRemoteEnv`, dạng bảng với `AO_TELEMETRY_REMOTE` ∈ {`posthog`, `bogus`} và `AO_TELEMETRY_POSTHOG_HOST=not a url` → `Load` không lỗi, `cfg` không còn field remote nào. Giữ `TestNewTelemetrySink_NeverExportsAndKeepsLocalUsage` (DV-1) xanh. Thêm `TestUsageFlushAfterRestartKeepsLocalEvents`: ghi 1 human send, flush, đóng rồi mở lại store bằng cùng `dataDir` → local sink vẫn có event `ao.usage.messages_sent` `count == 1`.
- [ ] **Step 2: Chạy để thấy đỏ** — `cd backend && go test ./internal/config ./internal/daemon -run 'LegacyRemoteEnv|AfterRestart|NeverExports' -count=1`. Expected: `TestLoadIgnoresLegacyRemoteEnv/bogus` FAIL với `invalid AO_TELEMETRY_REMOTE "bogus": must be off|posthog`; `TestUsageFlushAfterRestartKeepsLocalEvents` có thể pass (ghim hành vi DV-1).
- [ ] **Step 3: Gỡ** exporter, chuỗi remote, `ScrubTelemetryEnv` thu về các key còn dùng, đổi tên biến trong `daemon.go`. Flusher giữ đường ghi vào local sink; cờ `*_reported` trong `usage_pr_measurement` giữ (schema đã merge, không sửa migration).
- [ ] **Step 4: Chạy lại để thấy xanh** — `cd backend && go test ./... -count=1` không có `FAIL`; `rg -n -i 'posthog|AO_TELEMETRY_REMOTE|AO_TELEMETRY_POSTHOG' backend -g '!*.md'` → chỉ còn chỗ config bỏ qua env cũ, kèm comment.
- [ ] **Step 5: Commit** `chore(daemon): remove PostHog exporter, keep local usage`.

### Task 8: Renderer + mobile bỏ SDK PostHog

**Files:**
- Delete: `frontend/src/shared/posthog-config.ts`, `packages/mobile/lib/telemetry/{config,runtime,dailyActive,identitySync,rateLimit}.ts` và test của chúng (giữ `sanitize.ts`, `context.ts`, `events.ts` nếu `rg` thấy còn consumer local)
- Modify: `frontend/src/renderer/lib/telemetry.ts` (bỏ `posthog` client, alias/identify `:381-482`, `:1433-1537`, `:1615-1691`; capture chỉ còn gửi IPC tới daemon nếu đã có kênh đó, không thì no-op), `frontend/src/shared/telemetry.ts` (bỏ `buildTelemetryBootstrap`), `frontend/src/main/telemetry-identity.ts`, `frontend/src/main.ts` (`:209`, `:1666-1669`, `:3673-3701`), `frontend/vite.renderer.config.ts:12`, `:24-52`, `frontend/package.json`, `frontend/package-lock.json`, `packages/mobile/lib/TelemetryManager.tsx`, `packages/mobile/lib/telemetry/telemetry.ts`, `packages/mobile/package.json`, `packages/mobile/package-lock.json`
- Test: `frontend/src/renderer/lib/telemetry.test.ts`, `frontend/src/shared/telemetry.test.ts`, `packages/mobile/lib/telemetry/telemetry.test.ts`

- [ ] **Step 1: Viết test.** Renderer: `capture("ao.app.loaded")` không import `posthog-js` (kiểm bằng `vi.mock` factory throw khi bị import). Mobile: `TelemetryManager` render được, không import `posthog-react-native`, và host identity vẫn được đọc cho pairing.
- [ ] **Step 2: Chạy để thấy đỏ** — Vitest frontend cho hai file test, mobile cho `lib/telemetry/telemetry.test.ts`. Expected: fail vì module PostHog vẫn bị import.
- [ ] **Step 3: Gỡ** SDK, env (`VITE_AO_POSTHOG_*`, `EXPO_PUBLIC_POSTHOG_*`), CSP origin PostHog, rồi `npm uninstall posthog-js` / `posthog-react-native`.
- [ ] **Step 4: Chạy lại để thấy xanh** — `cd frontend && npm run typecheck && npm test && npm run build`; `cd packages/mobile && npm run typecheck && npm test`; `rg -n -i 'posthog|VITE_AO_POSTHOG|EXPO_PUBLIC_POSTHOG|sendBeacon' frontend packages .github -g '!*.md'` → không còn sender.
- [ ] **Step 5: Commit + PR 3.** `chore: remove PostHog remote telemetry`. Scope cleanup §6; inventory §1 thành "DV-3 ✅". PR vào contract queue.

---

## DV-4 — Xoá Cloud sign-in/auth còn sót (PR 4) 🔥

Hotspot: `openapi.yaml`, `frontend/src/api/schema.ts`, `specgen/build.go` (field `cloudControlPlaneUrl`), `daemon.go:1258-1262`, `:1496-1498`. Branch `chore/dv-4-remove-cloud` từ `origin/main` sau khi DV-3 merge. Trước khi bắt đầu, người dùng cần trả lời Q2, Q3, Q10.

### Task 9: Backend bỏ control plane, fixed tunnel, remote-host link 🔥

**Files:**
- Modify: `backend/internal/config/config.go` (`:63-66`, `:220-231`, `:538-549`, `:673-686`), `backend/internal/service/settings/service.go:71-94`, `backend/internal/httpd/controllers/dto.go:4544-4546`, `backend/internal/httpd/controllers/settings.go:225`, `backend/internal/httpd/apispec/specgen/build.go` 🔥, `backend/internal/httpd/apispec/openapi.yaml` 🔥 (generated), `frontend/src/api/schema.ts` 🔥 (generated), `backend/internal/daemon/daemon.go:1258-1262`, `:1496-1498` 🔥
- Delete: `backend/internal/daemon/remote_host_directory.go` + test; phần fixed tunnel trong `backend/internal/mobilebridge/named_tunnel.go` + test (giữ quick tunnel); `backend/internal/cli/remote_host_link.go` + test (theo Q3)
- Test (create): `backend/internal/httpd/controllers/settings_cloud_test.go`; Test: `backend/internal/mobilebridge/named_tunnel_test.go` và các `_test.go` khác của `mobilebridge` mà fixed tunnel làm hỏng

- [ ] **Step 1: Viết test.** Settings response không còn key `cloudControlPlaneUrl`. Quick tunnel và LAN listener vẫn khởi tạo được khi không có control plane. `GET /api/v1/identity` giữ đúng hợp đồng không auth hiện tại.
- [ ] **Step 2: Chạy để thấy đỏ** — `cd backend && go test ./internal/httpd/controllers ./internal/mobilebridge -count=1`. Expected: test settings FAIL vì key vẫn còn.
- [ ] **Step 3: Gỡ** config → service → DTO → specgen → daemon wiring; chạy `npm run api`.
- [ ] **Step 4: Chạy lại để thấy xanh** — `cd backend && go test ./... -count=1`; `git diff --stat -- backend/internal/httpd/apispec/openapi.yaml frontend/src/api/schema.ts` chỉ thấy bớt field Cloud.
- [ ] **Step 5: Commit** `chore(daemon): remove AO Cloud control plane wiring`.

### Task 10: Desktop + mobile bỏ Cloud UI/IPC/auth, dọn contract và CI

**Files:**
- Delete: `frontend/src/main/{cloud-auth,cloud-auth-local,pending-cloud-sign-in,cloud-cp-proxy,cloud-agent-proxy,cloud-control-plane-url,cloud-folder-push,cloud-share,cloud-share-ipc,cloud-share-links,cloud-artifact-ipc}.ts` và test; `frontend/src/renderer/lib/cloud-cp/*`; `frontend/src/renderer/hooks/useCloud*.ts` (25 file) và test; `packages/mobile/lib/cloud/*`, `packages/mobile/lib/account.ts`, `packages/mobile/lib/accountHosts.ts` và test; `packages/cloud-client/`, `contracts/cloud/openapi.yaml`, `.github/workflows/cloud-contract-compat.yml` (theo Q10)
- Modify: `frontend/src/main.ts` (`:193-207`, `:240`, `:3835-3837`, `:4407-4500`, `:4649-4650`, `:4797-4799`, `:4922-4930`), `frontend/src/preload.ts`, các component ở inventory §3 (`CreateProjectFlow.tsx`, `SessionView.tsx`, `SessionsBoard.tsx`, `SettingsDialog.tsx`, `Sidebar.tsx`), `frontend/src/shared/{cloud-account,ldap-config,ldap-sign-in}.ts`, `frontend/vite.renderer.config.ts:98-117`, `:151-185`, `.github/workflows/frontend.yml:353-367`, `scripts/ci-lanes.mjs:4`, `:12`, `:20`, `scripts/ci-lanes.test.mjs`, các route Cloud của mobile app
- Test: `frontend/e2e` spec có `@P0` chạm Settings/Sidebar (cập nhật), `scripts/ci-lanes.test.mjs`

- [ ] **Step 1: Viết test.** Renderer: Settings và Sidebar render được, không có nút Cloud sign-in và không có entry Cloud project (Testing Library). `ci-lanes.test.mjs`: không còn lane `cloud`. Mobile: màn hình chính render được khi không có `CloudProvider`.
- [ ] **Step 2: Chạy để thấy đỏ** — Vitest frontend/mobile cho các file trên; `node --test scripts/ci-lanes.test.mjs`. Expected: fail vì UI/lane Cloud còn.
- [ ] **Step 3: Gỡ** theo lát dọc UI → hook → IPC/preload → main → shared → CSP → contract/package → CI. Type Cloud nào còn được pairing local dùng thì chuyển kiểu tối thiểu sang `packages/shared/` trước khi xoá package. Giữ login provider (Claude/Codex/GitHub).
- [ ] **Step 4: Chạy lại để thấy xanh** — `cd frontend && npm run typecheck && npm test && npm run build`; `cd packages/mobile && npm run typecheck && npm test`; `node --test scripts/ci-lanes.test.mjs`; `rg -n -i 'workos|authkit|cloud-client|AO_CLOUD_CONTROL_PLANE_URL|api\.aoagents\.dev|orchestratorusercontent|cloud:signIn' backend frontend packages .github contracts -g '!*.md'` → chỉ còn tham chiếu lịch sử đã ghi lý do.
- [ ] **Step 5: Commit + PR 4.** `chore: remove AO Cloud sign-in and auth`. Scope cleanup §6; inventory §3 thành "DV-4 ✅". PR vào contract queue; cần người duyệt (§7: xoá tính năng, đổi API contract đã merge).

---

## Handoff per PR

Mỗi người thực hiện chạy lại inventory §7 trên HEAD mới trước khi viết test. DV-1 thấy endpoint vendor tự động mới → thêm vào test và chặn trong cùng PR. Endpoint chỉ liên quan bước sau → ghi `docs/fork/devendor-log.md` theo §6a. Báo cáo phải có: lệnh đã chạy, exit code, số request fake quan sát được, số event usage local, trạng thái CI. Không được nói "không còn request" nếu chỉ dựa vào `rg` hoặc vào việc consent mặc định đang tắt.

## Open questions

Những câu dưới đây repo và roadmap không trả lời được. Plan đang chọn hướng fail-closed (chặn) và **không** đoán thêm.

- **Q1 — Repo release của fork.** Fork phát hành desktop/CLI/host installer ở repo nào (`hainguyen97dev/ai-orchestrator`?), và có cần updater, `ao start`, version floor, feature builds, mac differential v2 chạy được không? Chưa có câu trả lời thì DV-1 tắt cả nhóm này, nghĩa là bản fork không tự cập nhật.
- **Q2 — `AO_CLOUD_CONTROL_PLANE_URL`.** Sau này có cần control plane tự host (không phải của nhà phát hành) không? Có thì DV-4 giữ phần plumbing config; không thì xoá hẳn. DV-1 bỏ qua env này hoàn toàn.
- **Q3 — Sign-in loopback/LDAP.** Giữ hay xoá `frontend/src/main/cloud-auth-local.ts` (email/password tới CP Docker loopback), stub LDAP (`AO_LDAP_URL`, `frontend/src/shared/ldap-*.ts`) và lệnh `ao remote-host link`?
- **Q4 — Kiểm tra cập nhật trên store của mobile.** `packages/mobile/lib/inAppUpdates.ts:81` gọi `itunes.apple.com/lookup?bundleId=aoagents.ao` mỗi lần mở app. Có chặn ở DV-1 không? Fork có phát hành app mobile riêng (bundle ID khác) không?
- **Q5 — Đích của bug report, `ao triage`, footer PR.** `report-problem.ts`, `bugReport.ts`, `cli/triage*.go`, `attribution.go:51` đang trỏ repo/website upstream. Đổi sang fork, tắt, hay giữ? Thuộc DV-4 hay đợt distribution?
- **Q6 — Thời gian giữ event local.** Event `ao.usage.*` trong local sink bị xoá theo `AO_TELEMETRY_RETENTION` (mặc định 30 ngày, `config.go:479-489`). Mission Control/A9 có cần giữ lâu hơn, hay A9 đọc từ bảng khác?
- **Q7 — Opt-out analytics và usage local.** Hiện tại opt-out sẽ xoá bộ đếm usage (`usage_telemetry.go:66-73`) và ngừng ghi (`store.go:98-106`). Khi không còn gửi ra ngoài, opt-out có nên tiếp tục chặn usage local không? DV-1 giữ nguyên hành vi hiện tại.
- **Q8 — Bên thứ ba tự động.** Expo push (`backend/internal/push/expo.go`), bảng giá LiteLLM (`backend/internal/pricing/catalogsync/fetch.go:18`), avatar `unavatar.io`: tiếp tục để ngoài DV, hay cần chế độ offline tuyệt đối?
- **Q9 — Báo lỗi sau khi bỏ Sentry.** DV-2 chỉ ghi log local (logger sẵn có). Có cần thêm file crash report local hoặc màn hình xem lỗi không?
- **Q10 — Contract Cloud.** Xoá hẳn `packages/cloud-client`, `contracts/cloud/openapi.yaml`, workflow `cloud-contract-compat.yml` và lane `cloud` ở DV-4, hay giữ lại làm tài liệu tham khảo?
