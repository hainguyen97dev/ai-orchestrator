# Chạy plan bằng ai-orchestra (Claude + Codex song song)

> Hướng dẫn vận hành, không phải plan code. Đọc cùng [roadmap](./2026-11-26-00-roadmap.md) §4–§7.

**Mô hình:** app **Agent Orchestrator đã cài** (`/Applications/Agent Orchestrator.app`) là **runner**, dùng dữ liệu thật `~/.ao`. Nó tạo session worker trên project `ai-orchestrator`; mỗi session có worktree và branch riêng, mở PR lên `hainguyen97dev/ai-orchestrator`. Checkout `ai-orchestra/` chỉ để đọc đối chiếu upstream, không chạy làm runner (nó đang ở branch dev).

## 1. Chuẩn bị một lần

1. **App:** bản cài `0.15.3` được build từ commit `070b255ce211`, chính là baseline của fork, nên dùng được ngay. Có bản `0.15.6`; chỉ cập nhật giữa hai đợt, không cập nhật khi worker đang chạy.
2. **Đưa `ao` lên PATH:** Settings → CLI link (bật), hoặc `ln -s "/Applications/Agent Orchestrator.app/Contents/Resources/daemon/ao" /usr/local/bin/ao`. Kiểm tra: `ao version`.
3. **Account:** `ao account ls` → `device-claude` (Claude `pro`) và `device-codex` (Codex `plus`). Bên dưới gọi là `$CLAUDE_ACC` và `$CODEX_ACC`.
4. **Project:**
   ```bash
   ao project add --path /Users/steven/Documents/work/ai-workflow/ai-orchestrator \
     --id aio --name ai-orchestrator --worker-agent codex --orchestrator-agent claude-code --default-branch main
   ```
   Trong app: Settings → project `aio` → Scripts → Setup: `cd frontend && (npm run dev:warm || echo "dev:warm failed; run npm ci in frontend/")`. Permissions của worker: `accept-edits`.
5. **Superpowers cho Codex:** spawn thử `ao spawn --project aio --harness codex --name skills-check --output artifact --prompt "Liệt kê các skill bạn đọc được, ghi vào artifact."`. Nếu không thấy `test-driven-development`, prompt các task Codex phải dẫn đường dẫn trực tiếp: `~/.claude/plugins/cache/claude-plugins-official/superpowers/7.0.2/skills/<tên>/SKILL.md`.

## 2. Mẫu prompt cho một task

```text
Repo này là fork ai-orchestrator. Đọc AGENTS.md → "Fork direction" trước.
Thực hiện {TASKS} trong docs/superpowers/plans/{PLAN}.md. Chỉ sửa file thuộc mục Files của các task đó.
Quy trình bắt buộc (superpowers): test-driven-development cho từng step; systematic-debugging khi test fail bất ngờ;
verification-before-completion trước khi báo xong; Scope cleanup theo roadmap §6 trước khi mở PR.
Không đặt hay sửa AO_DATA_DIR/AO_RUN_FILE/AO_PORT của session; muốn chạy daemon của fork thì dùng lệnh `env -u ...` trong plan.
Mở PR vào {BASE} theo .agents/skills/pr-description/SKILL.md, ghi mục "Out-of-plan files" (trống nếu không có).
```

Chạy:

```bash
ao spawn --project aio --harness {codex|claude-code} --account {$CODEX_ACC|$CLAUDE_ACC} \
  --effort high --name "{tên ngắn}" --branch {branch} [--base {branch PR trước}] --prompt "$(cat prompt.txt)"
```

`--base` dùng để **xếp chồng** PR khi task sau cần code của task trước mà chưa merge. Sau khi PR dưới merge, worker của PR trên rebase lên `main`.

## 3. Lịch chạy theo đợt

Mặc định **2 worker** cùng lúc, tối đa 3 (roadmap §4; Claude `pro` + Codex `plus`). Cột "Song song" là các session chạy cùng lúc trong đợt.

### Đợt 0: nền (khoảng nửa ngày)

| Session | Agent | Nội dung | Branch / base | Song song |
|---|---|---|---|---|
| w0-docs | Claude | A0 Task 1 + 2 | `docs/a0-fork-direction` / `main` | ✓ |
| w0-ci | Claude | A0 Task 3 | `chore/a0-ci` / `main` | ✓ |
| — | Mày | A0 Task 4 (cài đặt GitHub) sau khi `w0-ci` merge | — | |
| w0-pipe | Codex | A0 Task 5 (PR `feat/pipeline-foundation`) | có sẵn / `main` | ✓ |

**Merge:** cả 3 PR đều là "Cần người" (đụng `.github`, `AGENTS.md`). Mày duyệt rồi merge. Từ đây policy Auto ở roadmap §7 bắt đầu áp dụng.

### Đợt 1: song song 3 lane

| Session | Agent | Nội dung | Branch / base |
|---|---|---|---|
| w1-t1-domain | Codex | T1 Task 1 + 2 (domain thuần, PR riêng, rủi ro thấp → Auto) | `feat/t1-domain` / `main` |
| w1-t1-contract | Codex | T1 Task 3 + 4 + 5 (hotspot, contract queue → Cần người) | `feat/t1-contract` / `feat/t1-domain` |
| w1-ui-red | Claude | UI-S Task 1: điều phối baseline (spawn 9 session con `--output artifact`, xem dưới) | `docs/ui-skill` / `main` |
| r1 | Claude | Review chéo PR của Codex | `--claim-pr <n> --review` |
| w1-dv-plan | Claude | Viết plan DV (roadmap §3): inventory PostHog/Sentry/telemetry remote/sign-in, đề xuất DV-1 kill switch + test "không có request ra ngoài" | `docs/plan-dv` / `main` |

Plan DV merge xong → DV-1 (Codex) chạy ngay, rồi DV-2…DV-4 tuần tự (cùng đụng `frontend/src/main`, `packages/shared`, build/CI).

`w1-t1-contract` có thể start ngay nhờ `--base feat/t1-domain`. Nó chỉ cần kiểu dữ liệu từ Task 1.

**Baseline UI (UI-S Task 1):** 3 kịch bản × (2 Claude + 1 Codex) = 9 session ngắn, `--output artifact` (không mở PR, không có skill). Chạy 3 session một lúc để giữ giới hạn. Mỗi session ghi kết quả vào artifact; `w1-ui-red` gom lại vào `docs/fork/skill-tests/ao-workflow-ui/baseline.md`. Sau đó cùng session đó làm Task 2–3 (GREEN/REFACTOR).

### Đợt 2 trở đi

Khi đợt trước merge, spawn **một session lập plan** cho đợt kế tiếp:

```bash
ao spawn --project aio --harness claude-code --account $CLAUDE_ACC --name "plan-{đợt}" --branch docs/plan-{đợt} \
  --prompt "Dùng superpowers:brainstorming (tự trả lời câu hỏi bằng docs/fork/specs và roadmap; câu nào không tự trả lời được thì để vào mục Open questions và dừng), rồi superpowers:writing-plans, viết docs/superpowers/plans/<ngày>-<đợt>.md cho {T1-UI + MC-V0 | A1 + A2 | T2 + T3 + T4 | A3a + A4 …}, dựa trên code đã merge trên main. Theo đúng format của plan 02. Mở PR."
```

Mày đọc và merge plan → spawn worker theo lane như đợt 1. Thứ tự đợt theo roadmap §2: **[T1-UI, MC-V0] → [A1, A2, T2] → [T3, T4, A3a] → [A4] → [A5, A6] → [A9, P]**.

## 4. Review chéo và merge

```bash
ao spawn --project aio --harness claude-code --account $CLAUDE_ACC --claim-pr <số PR> --review --name "review-<số>" \
  --prompt "Review PR theo superpowers:requesting-code-review: đối chiếu plan và Scope cleanup (roadmap §6), chạy lại test của vùng bị đụng. Comment lên PR; approve nếu không còn lỗi chặn."
```

PR của Claude thì review bằng `--harness codex`. Worker gốc sửa theo review bằng superpowers:receiving-code-review (AO tự nhắc worker khi có comment hoặc CI fail).

Merge theo roadmap §7. Mức Auto: worker tự chạy lệnh merge ghi trong A0 Task 4 (3a hoặc 3b) sau khi reviewer approve.

## 5. Theo dõi và quota

- **Board** của project `aio`: trạng thái từng worker, PR, CI. `ao session ls` / `ao session top` cho terminal.
- **Usage** trong app: theo dõi cửa sổ quota của Claude và Codex. Còn dưới 20% thì giảm còn 2 worker.
- Account hết quota giữa chừng: `ao session switch <id> codex` (đổi agent) hoặc `ao account switch <id> <account>` (đổi account cùng agent). AO giữ worktree và ngữ cảnh.
- Mỗi tối: `ao session cleanup` cho các session đã merge.

## 6. Bẫy cần tránh

- **Không** đặt `AO_DATA_DIR` trong env của project. Chạy daemon hay app **của fork** luôn qua `env -u AO_DATA_DIR -u AO_RUN_FILE -u AO_PORT …` hoặc isolated mode của `ao-desktop-dev`.
- Hai PR cùng đụng hotspot (migration, `openapi.yaml`, `schema.ts`, `build.go`, `daemon.go`, `api.go`) không được mở cùng lúc, trừ khi xếp chồng bằng `--base`.
- Không cho worker dùng permission `bypass-permissions`. Sau T2, allowlist chỉ có tác dụng khi không bypass.
- Session baseline của skill (`--output artifact`) không được mở PR hay sửa repo. Nếu thấy diff thì xoá worktree đó.
- Đến **A5**: chuyển sang dùng chính Flow của fork (preset DDD, chạy trên `ddd-eda-lab`) để kiểm chứng. Đó là mốc "fork tự build được chính nó".
