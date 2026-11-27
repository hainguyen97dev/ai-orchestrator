//go:build !windows

package e2e

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// TestFakeSmokeACP is launched by the disposable opencode shim in
// TestSmokeProjectSessionWorktreeDiff. On the worker's prompt it writes
// SMOKE.md into the session cwd so the workspace has a diff to show.
func TestFakeSmokeACP(t *testing.T) {
	if os.Getenv("AO_E2E_FAKE_SMOKE_ACP") != "1" {
		return
	}
	cwd, background := "", false
	scanner := bufio.NewScanner(os.Stdin)
	for scanner.Scan() {
		var frame struct {
			ID     json.RawMessage `json:"id"`
			Method string          `json:"method"`
			Params struct {
				Cwd string `json:"cwd"`
			} `json:"params"`
		}
		if json.Unmarshal(scanner.Bytes(), &frame) != nil {
			continue
		}
		switch frame.Method {
		case "initialize":
			_, _ = fmt.Fprintf(os.Stdout, `{"jsonrpc":"2.0","id":%s,"result":{"protocolVersion":1,"agentCapabilities":{"sessionCapabilities":{"resume":{}}},"authMethods":[]}}`+"\n", frame.ID)
		case "session/new", "session/load", "session/resume":
			cwd = frame.Params.Cwd
			background = strings.Contains(filepath.ToSlash(cwd), "/background-tasks/")
			_, _ = fmt.Fprintf(os.Stdout, `{"jsonrpc":"2.0","id":%s,"result":{"sessionId":"fake-smoke-session"}}`+"\n", frame.ID)
		case "session/prompt":
			text := "done"
			if background {
				text = `{\"title\":\"Smoke\",\"slug\":\"smoke\"}`
			} else if cwd == "" || os.WriteFile(filepath.Join(cwd, "SMOKE.md"), []byte("smoke\n"), 0o644) != nil {
				os.Exit(3)
			}
			_, _ = fmt.Fprintf(os.Stdout, `{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"fake-smoke-session","update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"%s"}}}}`+"\n", text)
			_, _ = fmt.Fprintf(os.Stdout, `{"jsonrpc":"2.0","id":%s,"result":{"stopReason":"end_turn"}}`+"\n", frame.ID)
		default:
			if len(frame.ID) > 0 {
				_, _ = fmt.Fprintf(os.Stdout, `{"jsonrpc":"2.0","id":%s,"result":{}}`+"\n", frame.ID)
			}
		}
	}
	os.Exit(0)
}

// TestSmokeProjectSessionWorktreeDiff is the fork's "smoke P3a": the
// project → session → worktree → diff path must survive every move PR.
// It needs no real agent account: the harness is a shimmed opencode.
func TestSmokeProjectSessionWorktreeDiff(t *testing.T) {
	binDir := t.TempDir()
	testBinary, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	shim := "#!/bin/sh\ncase \"$1\" in\n  acp) exec \"$AO_E2E_TEST_BINARY\" -test.run='^TestFakeSmokeACP$' ;;\n  auth) printf '0 credentials\\n' ;;\n  --version) printf '1.0.0\\n' ;;\n  *) exit 2 ;;\nesac\n"
	if err := os.WriteFile(filepath.Join(binDir, "opencode"), []byte(shim), 0o700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", binDir+string(os.PathListSeparator)+os.Getenv("PATH"))
	t.Setenv("OPENCODE_DATA_DIR", t.TempDir())
	t.Setenv("OPENCODE_CONFIG_CONTENT", "")
	t.Setenv("AO_E2E_TEST_BINARY", testBinary)
	t.Setenv("AO_E2E_FAKE_SMOKE_ACP", "1")

	d := startDaemon(t, t.TempDir())
	project := seedProject(t, d, "smoke")
	setPermissions(t, d, project, "default")
	session := spawn(t, d, map[string]any{
		"projectId": project, "kind": "worker", "harness": "opencode", "mode": "chat",
		"prompt": "write SMOKE.md",
	}).Session.ID
	d.awaitConversation(session, 60*time.Second, "smoke turn to complete", func(s snapshot) bool {
		return len(s.Turns) >= 1 && s.Turns[0].State == "completed"
	})

	var project_ struct {
		Project struct {
			Path string `json:"path"`
		} `json:"project"`
	}
	d.mustCall("GET", "/projects/"+project, http.StatusOK, nil, &project_)
	var ws struct {
		WorkspacePath string `json:"workspacePath"`
	}
	d.mustCall("GET", "/desktop/sessions/"+session+"/workspace", http.StatusOK, nil, &ws)
	repo, _ := filepath.EvalSymlinks(project_.Project.Path)
	wt, _ := filepath.EvalSymlinks(ws.WorkspacePath)
	if wt == "" || wt == repo {
		t.Fatalf("session workspace %q is not a separate worktree of %q", ws.WorkspacePath, project_.Project.Path)
	}
	out, err := exec.Command("git", "-C", wt, "rev-parse", "--path-format=absolute", "--git-common-dir").Output()
	if err != nil {
		t.Fatalf("git rev-parse in workspace: %v", err)
	}
	common, _ := filepath.EvalSymlinks(strings.TrimSpace(string(out)))
	if common != filepath.Join(repo, ".git") {
		t.Fatalf("workspace git common dir = %q, want %q", common, filepath.Join(repo, ".git"))
	}

	var diffs struct {
		Groups []struct {
			IncludedPaths []string `json:"includedPaths"`
			Patch         string   `json:"patch"`
		} `json:"groups"`
	}
	d.mustCall("POST", "/sessions/"+session+"/workspace/diffs", http.StatusOK, map[string]any{
		"scope": "combined", "paths": []string{"SMOKE.md"}, "contextLines": 3, "ignoreWhitespace": false,
	}, &diffs)
	found := false
	for _, g := range diffs.Groups {
		for _, p := range g.IncludedPaths {
			found = found || (p == "SMOKE.md" && strings.Contains(g.Patch, "+smoke"))
		}
	}
	if !found {
		t.Fatalf("workspace diff does not include SMOKE.md: %+v", diffs)
	}
	d.mustCall("POST", "/sessions/"+session+"/kill", http.StatusOK, nil, nil)
}
