# CLAUDE.md

Read and follow [`AGENTS.md`](AGENTS.md) for repository layout, commands, coding conventions, and hard rules.

## App state lives under `~/.ao` only

All app state, the daemon's data dir, `running.json`, worktrees, and the Electron
supervisor's `userData` (Chromium cache, cookies, local/session storage, crash
dumps), must resolve under `~/.ao` (overridable via `AO_DATA_DIR`/`AO_RUN_FILE`).
Never write AO state to `~/Library/Application Support` or any other OS-default
app-data location. The read exceptions are an explicit user-initiated import
from a validated Chrome, Firefox, or Safari profile: read known source files
without modifying them and keep snapshots and results under `~/.ao`; and chat
import reading Conductor's `com.conductor.app/conductor.db` with SQLite
`mode=ro`, never writing or checkpointing it. The sole
write exception is Chrome mode's native-messaging host manifest, which Chrome
only reads from its own `NativeMessagingHosts` directory: written only by an
explicit `ao browser chrome setup`, removed by `remove`, pointing at a wrapper
under `~/.ao` and holding no AO state.
`frontend/src/main.ts` pins Electron's `userData` to
`~/.ao/electron`; do not remove that override. See the hard rule in `AGENTS.md`.

## Design system

Always read [`DESIGN.md`](DESIGN.md) before making any visual or UI decision.
`DESIGN.md` is the current design standard and review guide. Use the approved,
repo-local reference files listed in its "Reference implementation map". Do not
infer a visual rule from another screen just because that screen exists today.
When current code conflicts with the guide, preserve functional behavior and
move the surface toward the guide in the smallest safe change. Build new UI
from shadcn primitives (`components/ui/*`) where a component fits, and log a
targeted migration when an existing mismatch needs broader work.

When showing or demoing frontend changes, run `ao preview [url]` from inside the
session so the change renders in the desktop browser panel (the inspector rail's
Browser tab); do not just describe it. A new `ao preview` target, `ao browser open`,
or `ao browser tab new` reveals Browser for the session being viewed. Revealing
opens the inspector and selects Browser without changing the routed session,
project, or OS window focus. Passive browser activity (`snapshot`, `click`,
`fill`, `errors`, etc.) only badges a hidden Browser tab as unseen. Mention
"check the Browser tab" when passive activity is the only update.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

The repo is indexed by GitNexus under the name **ai-orchestrator**. The index lives only in the main checkout (`.gitnexus/`, gitignored), so from a lane worktree always pass `--repo ai-orchestrator`:

```bash
npx gitnexus impact <Symbol> --direction upstream --repo ai-orchestrator   # who depends on it
npx gitnexus context <Symbol> --repo ai-orchestrator                       # callers, callees, flows
npx gitnexus query "<concept>" --repo ai-orchestrator                      # find code for a feature
npx gitnexus detect-changes --scope compare --base-ref main --repo ai-orchestrator
```

## When it is required

- **Before moving, cutting, or deleting a package or symbol** (phases P3a/P3b, lane L1): run `impact` upstream and list the dependents in the PR.
- **Before opening a move or cut PR**: run `detect-changes --scope compare --base-ref main` and confirm the affected flows match the task.
- For ordinary edits inside your lane, use it when you are unsure who calls the code; it is not mandatory.

## Reading results

- The index does not link TypeScript to Go: frontend ↔ daemon goes through HTTP routes and `openapi.yaml`, so check those by hand.
- An empty caller set or `risk: UNKNOWN` is **not** proof that code is unused (dynamic dispatch, cross-language calls). Confirm with a text search before deleting.
- Do not ignore a HIGH or CRITICAL `risk`; mention it in the PR.
- Rename symbols with `gopls`/`gitnexus rename`, not find-and-replace.

## Keeping the index fresh

Refresh from the main checkout after merges that move code: `npx gitnexus analyze --index-only` (`--index-only` keeps this block from being rewritten). Skill guides: `.claude/skills/gitnexus-*/SKILL.md`.
<!-- gitnexus:end -->
