# DV De-vendor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chặn mọi request tự động tới dịch vụ nhà phát hành AO, rồi xoá Sentry, PostHog/telemetry remote và Cloud sign-in theo bốn PR độc lập, giữ telemetry usage cục bộ.

**Architecture:** DV-1 đặt kill switch tại từng điểm tạo transport ở Go daemon, Electron main/renderer và mobile, với test HTTP/fetch/WebSocket fake chứng minh 0 outbound. DV-2 đến DV-4 gỡ theo lát dọc UI → API → service → adapter → build/CI → docs/tests; mỗi PR duy trì invariant DV-1 và không xoá dữ liệu SQLite usage.

**Tech Stack:** Go, SQLite, Electron/React/TypeScript, Expo/React Native, Vitest, Go `httptest` và fake transport, GitHub Actions.

**Spec:** [roadmap](./2026-11-26-00-roadmap.md) D3/D7, §3, §6, §6a; [inventory](../../fork/devendor-inventory.md).

## Global Constraints

- Chỉ chạy một DV PR tại một thời điểm theo thứ tự DV-1 → DV-2 → DV-3 → DV-4. DV-1 bắt đầu sau A0 trên nhánh nền đã merge; PR tiếp theo bắt đầu từ HEAD đã merge của PR trước. Không merge hộ người dùng. Không gộp bốn bước thành một PR.
- Mỗi lần sửa code: dùng `superpowers:test-driven-development` (test đỏ đúng nguyên nhân → code tối thiểu → test xanh). Nếu fail bất ngờ, dùng `superpowers:systematic-debugging` và tìm root cause trước khi sửa. Trước commit, PR và báo xong: `superpowers:verification-before-completion` với output mới.
- Không đặt/sửa `AO_DATA_DIR`, `AO_RUN_FILE`, `AO_PORT` của session. Test dùng `t.TempDir`, injected fake client/transport và temp storage, không khởi động daemon thật bằng env của session.
- “Không còn request ra ngoài” trong DV-1 nghĩa là **không có request do AO tự tạo tới PostHog, Sentry, AO Cloud/control plane, website/share host hoặc release/install endpoint upstream**, kể cả env override và consent on. Kết nối GitHub/GitLab của project, nhà cung cấp agent, LAN/loopback, mobile pairing do người dùng chọn không nằm trong kill switch này. Không viết global HTTP blocker phá chúng.
- Giữ local event/usage trong `backend/internal/adapters/telemetry/localsqlite.go`, `backend/internal/storage/sqlite/store/usage_telemetry_store.go` và schema usage; không sửa migrations đã merge. DV-3 phải chuyển quyền ghi usage khỏi điều kiện remote exporter trước khi xoá remote flusher.
- Sau thay đổi DTO/specgen, chạy `npm run api` và commit cả `backend/internal/httpd/apispec/openapi.yaml`, `frontend/src/api/schema.ts`. Nếu thay query/migration mới, chạy `npm run sqlc`, không sửa `gen/*` bằng tay. Không sửa hotspot song song (§4).
- Mỗi PR theo `.agents/skills/pr-description/SKILL.md`, có `Out-of-plan files`, `De-vendor`, số dòng so với **base thực**, Before / After, Testing. Scope cleanup theo roadmap §6; mọi file mới phát hiện ngoài scope phải được phân loại và ghi lý do. Dùng `[skip ci]` ở commit cuối cho đến khi A0 Task 3 merge; sau đó bỏ quy tắc này. CI skip không thay thế kiểm chứng local.
- Mỗi DV kết thúc bằng `rg` lại các symbol/URL trong inventory. Cập nhật `docs/fork/devendor-inventory.md` với trạng thái và `docs/fork/devendor-log.md` cho phát hiện ngoài phạm vi. Không xoá file untracked do task khác tạo.

## Review Focus

- DV-1 không chỉ đổi default: explicit `AO_TELEMETRY_REMOTE=posthog`, `AO_SENTRY_DSN`, `AO_ELECTRON_SENTRY_DSN`, `EXPO_PUBLIC_POSTHOG_*`, mobile consent và Cloud URL override vẫn phải không phát request vendor.
- Sender độc lập: renderer `sendBeacon`, Go `/capture/`, Electron main Sentry, mobile Sentry/PostHog, Cloud HTTP/WS, Git push folder, remote host publisher, version floor, installer/updater. Fake transport phải quan sát đủ các nhánh.
- Local usage counts tăng khi remote off; không `DrainUsageMessages`/`DiscardUsageMessages` chỉ vì exporter biến mất. Không đổi mobile pairing identity hoặc provider auth của Claude/Codex/GitHub.
- Không coi WorkOS/AuthKit đã gỡ là bằng chứng Cloud auth đã gỡ: `cloud-auth.bin`, token, UI sign-in, CP proxy, mobile CloudProvider và `cloud-client` còn sống.

---

### Task DV-1: Kill switch + chứng minh 0 vendor outbound — PR 1

**Files:**
- Modify: `backend/internal/config/config.go`, `backend/internal/daemon/telemetry_wiring.go`, `backend/internal/daemon/daemon.go`, `backend/internal/mobilebridge/named_tunnel.go`, `backend/internal/daemon/remote_host_directory.go`, `backend/internal/cli/start.go`, `backend/internal/hostupdate/hostupdate.go`
- Modify: `frontend/src/main.ts`, `frontend/src/main/desktop-telemetry-controller.ts`, `frontend/src/main/desktop-version-floor.ts`, `frontend/src/main/cloud-cp-proxy.ts`, `frontend/src/main/cloud-agent-proxy.ts`, `frontend/src/main/cloud-folder-push.ts`, `frontend/src/renderer/lib/telemetry.ts`, `frontend/src/renderer/lib/cloud-cp/renderer-client.ts`, `frontend/src/main/auto-updater.ts`
- Modify: `packages/mobile/lib/telemetry/runtime.ts`, `packages/mobile/lib/sentry.ts`, `packages/mobile/lib/cloud/client.ts`, `packages/mobile/lib/accountHosts.ts`
- Test: `backend/internal/daemon/telemetry_wiring_test.go`, `backend/internal/daemon/remote_host_directory_test.go`, `backend/internal/adapters/telemetry/posthog_test.go`, `frontend/src/main/desktop-telemetry-controller.test.ts`, `frontend/src/main/cloud-cp-proxy.test.ts`, `frontend/src/main/cloud-agent-proxy.test.ts`, `frontend/src/renderer/lib/telemetry.test.ts`, `packages/mobile/lib/sentry.test.ts`, `packages/mobile/lib/telemetry/runtime.test.ts` (create if absent), `packages/mobile/lib/cloud/client.test.ts` (create if absent)
- Modify: `docs/fork/devendor-inventory.md`, `docs/fork/devendor-log.md` (create if absent)

**Interface:** Add one fork-owned, default-on deny decision for vendor outbound at the existing transport creation boundaries. It must be independent of legacy analytics opt-out and release version; local usage and provider/SCM HTTP remain available. Do not create a user-facing “turn it back on” switch in this fork.

- [ ] **Step 1: Write failing Go tests.** Extend `telemetry_wiring_test.go`: set `Telemetry.Events=true`, `Remote=posthog`, injected PostHog host to `httptest.Server`, emit an event, assert zero requests and one local SQLite event. Extend remote-host tests with a linked host and counting fake HTTP client, assert zero Cloud registration/address requests. Assert Sentry transport is never initialized even with nonempty DSN and consent true. Test `ao start`/host updater rejects upstream release/script URL without dialing, preserving explicit fork URL behavior.
- [ ] **Step 2: Verify red.** Run `cd backend && go test ./internal/daemon ./internal/mobilebridge ./internal/cli ./internal/hostupdate -run 'Vendor|Telemetry|RemoteHost' -count=1`; expect tests to fail because current remote branch sends or accepts vendor target. If a test fails to compile, correct the test and rerun until failure is behavioral.
- [ ] **Step 3: Write failing desktop/mobile tests.** Fake `fetch`, `sendBeacon`, Sentry transport, `WebSocket`, Electron updater feed and git push executor. Exercise packaged version, all env overrides, opted-in after opt-out, cached Cloud session, Cloud HTTP/WS, share/folder push, version floor, mobile PostHog/Sentry and Cloud host directory. Assert zero vendor requests and unchanged local daemon IPC/paired-host requests.
- [ ] **Step 4: Verify red.** Run focused `npx vitest run` with the test files named above from `frontend/` and `packages/mobile/` using each package's configured script; capture the expected outbound call in failure output. Check `package.json` before choosing the package command.
- [ ] **Step 5: Implement minimal fail-closed decision at each existing sender.** Skip PostHog/Sentry initialization, skip remote Go sink, return a typed unavailable result from Cloud CP proxy/client, do not start Cloud WS/agent proxy or git folder push, skip host publisher/fixed tunnel, skip upstream version floor and release/install downloads. Keep local event sink and usage recording active. Do not add a blanket network hook.
- [ ] **Step 6: Verify green and scope.** Run the focused tests, then `cd backend && go test ./...`, `cd frontend && npm run typecheck && npm run build && npm test -- --run`, and the mobile package test/typecheck commands defined in `packages/mobile/package.json`. Run the current `.github/workflows` jobs applicable to touched files. Re-scan `rg -n 'NewPostHogSink|initMainSentry|initMobileSentry|new PostHog|cloudCp:request|api.aoagents.dev|desktop-version-floor.json' backend frontend packages` and explain every remaining reachable site. Run roadmap §6 scope cleanup against actual PR base, rerun affected tests, commit `fix: block vendor outbound by default [skip ci]` while A0 Task 3 is unmerged, then open PR 1.

### Task DV-2: Xoá Sentry — PR 2

**Files:**
- Modify/Delete: `backend/internal/observe/sentryobs/{sentryobs,background,faultcodes}.go` and their tests; `backend/internal/daemon/daemon.go`, `backend/internal/daemon/supervisor/supervisor.go`, `backend/internal/httpd/{router,recover,log}.go`, `backend/internal/observe/{scm,reaper,trackerintake}/*.go`, `backend/internal/service/chat/sentry.go`, `backend/internal/session_manager/sentry.go`, `backend/internal/config/config.go`, `backend/go.mod`, `backend/go.sum`
- Modify/Delete: `frontend/src/main/sentry-main.ts`, `frontend/src/main/desktop-telemetry-controller.ts`, `frontend/src/renderer/lib/sentry.ts`, `frontend/src/shared/sentry-config.ts`, `frontend/src/main.ts`, `frontend/src/renderer/lib/telemetry.ts`, `frontend/vite.sentry.ts`, `frontend/vite.renderer.config.ts`, `frontend/vite.main.config.ts`, `frontend/forge.config.ts`, `frontend/package.json`, `frontend/package-lock.json`
- Modify/Delete: `packages/mobile/lib/sentry.ts`, `packages/mobile/lib/sentry-config.ts`, `packages/mobile/lib/TelemetryManager.tsx`, `packages/mobile/lib/observability.ts`, `packages/mobile/app.json`, `packages/mobile/package.json`, `packages/mobile/package-lock.json`, `packages/shared/telemetry/{ao-error,sentry-message}.ts` only if no non-Sentry consumer
- Modify: `.github/workflows/build-artifacts.yml`, Sentry tests in matching locations, `docs/fork/devendor-inventory.md`

- [ ] **Step 1: Write failing tests** asserting daemon panic/5xx/background failures still appear in local log/API error envelope, desktop/mobile failures remain locally observable, and no Sentry SDK transport is constructed or source-map upload artifact produced. Keep at least one behavioral test per process boundary, not snapshots of imports alone.
- [ ] **Step 2: Verify red** with `cd backend && go test ./internal/observe/... ./internal/httpd/... ./internal/daemon/... -count=1` plus focused Vitest for `sentry-main`, renderer error handling and mobile Sentry; expected failure is existing Sentry capture/transport.
- [ ] **Step 3: Remove Sentry slice** from UI/intake through Go observer, main, mobile, Vite/Forge, workflow and dependencies. Replace necessary local fault logging with existing logger and keep API envelopes/request IDs. Run Go module tidy and package lock update only after imports are gone. Remove shared helpers only when `rg` shows no remaining caller.
- [ ] **Step 4: Verify green** with focused tests, full Go/frontend/mobile suites and builds, `rg -n -i 'sentry|AO_SENTRY_DSN|AO_ELECTRON_SENTRY_DSN|@sentry' backend frontend packages .github`; classify residual docs/history. Scope cleanup (§6), commit `chore: remove Sentry integration [skip ci]` if needed, open PR 2 on merged DV-1 base.

### Task DV-3: Xoá PostHog và telemetry remote, giữ usage local — PR 3

**Files:**
- Modify/Delete: `backend/internal/adapters/telemetry/posthog.go` and `posthog*_test.go`, remote-only `aggregate.go`, `ratelimit.go`, `cohort.go`, `environment.go`, `tenure.go` only after checking consumers; `backend/internal/daemon/telemetry_wiring.go`, `backend/internal/daemon/usage_telemetry.go`, `backend/internal/config/config.go`
- Modify/keep: `backend/internal/adapters/telemetry/localsqlite.go`, `backend/internal/storage/sqlite/store/usage_telemetry_store.go`, `backend/internal/ports/telemetry.go`, `backend/internal/service/usage/*`, `backend/internal/httpd/controllers/telemetry_identity.go` only where local usage contract needs adjustment
- Modify/Delete: `frontend/src/renderer/lib/telemetry.ts`, `frontend/src/shared/{posthog-config,telemetry}.ts`, `frontend/src/main/telemetry-identity.ts`, `frontend/src/main.ts`, `frontend/vite.renderer.config.ts`, `frontend/package.json`, `frontend/package-lock.json`, `packages/mobile/lib/telemetry/{config,runtime,telemetry,events}.ts`, `packages/mobile/lib/TelemetryManager.tsx`, `packages/mobile/package.json`, `packages/mobile/package-lock.json`, associated tests, `docs/fork/devendor-inventory.md`

- [ ] **Step 1: Write failing tests**: with `AO_TELEMETRY_REMOTE` equivalent enabled in an injected config, local `EventSink` stores every accepted event; message/PR usage counters remain queryable after flush/restart, without PostHog client, identity alias or `sendBeacon`. Paired mobile still obtains host identity for pairing but creates no analytics client.
- [ ] **Step 2: Verify red** using `cd backend && go test ./internal/daemon ./internal/adapters/telemetry ./internal/storage/sqlite/store -run 'Telemetry|Usage' -count=1` and focused renderer/mobile Vitest; failures should pinpoint remote-coupled usage or SDK construction.
- [ ] **Step 3: Remove remote branch** from Go, renderer and mobile, delete PostHog-only identity/aggregation/rate-limit code, env parser/key/host and CSP origins. Preserve SQLite local sink, usage tables/queries and UI needed by Mission Control/A9. Rework `configureUsageRecording` and `startUsageTelemetry` so local counts are never gated by `Remote=posthog`; do not drain/delete facts when no exporter exists.
- [ ] **Step 4: Verify green** with focused tests, full Go/frontend/mobile suites and builds. `rg -n -i 'posthog|AO_TELEMETRY_REMOTE|AO_TELEMETRY_POSTHOG|VITE_AO_POSTHOG|EXPO_PUBLIC_POSTHOG|sendBeacon' backend frontend packages .github` must leave no runtime sender. Scope cleanup (§6), commit `chore: remove PostHog remote telemetry [skip ci]` if needed, open PR 3 on merged DV-2 base.

### Task DV-4: Xoá Cloud sign-in/auth còn sót — PR 4

**Files:**
- Modify/Delete: `frontend/src/main/{cloud-auth,cloud-auth-local,pending-cloud-sign-in,cloud-cp-proxy,cloud-agent-proxy,cloud-control-plane-url,cloud-folder-push,cloud-share-ipc,cloud-artifact-ipc}.ts`, `frontend/src/main.ts`, `frontend/src/preload.ts`, `frontend/src/renderer/hooks/useCloud*.ts`, Cloud UI/components/routes, `frontend/src/renderer/lib/cloud-cp/*`, `frontend/src/shared/{cloud-account,ldap-config,ldap-sign-in}.ts`, Cloud tests
- Modify/Delete: `packages/mobile/lib/{account,accountHosts}.ts`, `packages/mobile/lib/cloud/*`, Cloud app routes, `packages/cloud-client/*`, `contracts/cloud/openapi.yaml` only after no runtime/tooling consumer; `.github/workflows/{frontend,cloud-contract-compat}.yml`, `scripts/ci-lanes.mjs` if package/contract removed
- Modify: `backend/internal/config/config.go`, `backend/internal/service/settings/service.go`, `backend/internal/httpd/controllers/{dto,settings}.go`, `backend/internal/httpd/apispec/specgen/build.go`, `backend/internal/cli/remote_host_link.go`, `backend/internal/mobilebridge/named_tunnel.go`, `backend/internal/daemon/{daemon,remote_host_directory}.go`, Cloud sharing/host tests, generated API artifacts if DTO changes, `docs/fork/devendor-inventory.md`

- [ ] **Step 1: Write failing tests**: desktop/mobile present no Cloud sign-in/Cloud project entrypoint and cannot construct CP HTTP/WS; saved WorkOS session is ignored without migration request; paired LAN/quick tunnel/local sessions, local artifact and Claude/Codex/GitHub account auth still work. CLI `remote-host link` returns a deliberate unavailable result without Cloud request. Test local CP dev path separately only if it remains a supported feature.
- [ ] **Step 2: Verify red** with focused Go tests for config/settings/mobilebridge/CLI and focused desktop/mobile Vitest/e2e UI tests; expected failure is surviving Cloud entrypoints, CP client/proxy or sign-in storage.
- [ ] **Step 3: Remove Cloud slice** from UI to IPC, CP client/auth, backend host directory and contract/build lane. Preserve authenticated mobile LAN listener and exact unauthenticated `GET /api/v1/identity` contract; no new unauthenticated route. If a Cloud-derived type is still used for local pairing, move the minimal local type before deleting package. Keep provider login flows.
- [ ] **Step 4: Regenerate and verify** using `npm run api` when DTO/spec changes, focused tests, full Go/frontend/mobile suites/builds and applicable CI jobs. `rg -n -i 'workos|authkit|cloud-client|AO_CLOUD_CONTROL_PLANE_URL|api.aoagents.dev|useao.dev|orchestratorusercontent|cloud:signIn' backend frontend packages .github contracts/cloud` must have only documented historical references. Scope cleanup (§6), commit `chore: remove AO Cloud sign-in and auth [skip ci]` if needed, open PR 4 on merged DV-3 base.

## Handoff per PR

Mỗi người thực hiện chạy lại inventory trên HEAD mới trước khi viết test. Nếu DV-1 phát hiện endpoint tự động khác, thêm vào test/kill switch và inventory cùng PR; nếu endpoint chỉ liên quan bước sau, ghi vào `docs/fork/devendor-log.md` theo §6a. Báo rõ lệnh thực chạy, exit code, hạn chế runner/credentials, số request fake quan sát, số usage row local và remote CI status. Không tuyên bố “không còn request” chỉ dựa trên `rg` hoặc việc consent mặc định tắt.
