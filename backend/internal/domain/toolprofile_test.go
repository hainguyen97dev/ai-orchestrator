package domain

import (
	"errors"
	"strings"
	"testing"
)

func TestValidateMCPServer(t *testing.T) {
	valid := MCPServer{ID: "gitnexus", Name: "gitnexus", Transport: MCPTransportStdio, Command: "gitnexus", Args: []string{"mcp"}}
	if err := ValidateMCPServer(valid); err != nil {
		t.Fatalf("valid stdio server: %v", err)
	}
	for _, tc := range []struct {
		name   string
		server MCPServer
		want   error
	}{
		{"missing ID", MCPServer{Name: "gitnexus", Transport: MCPTransportStdio, Command: "gitnexus"}, nil},
		{"missing name", MCPServer{ID: "gitnexus", Transport: MCPTransportStdio, Command: "gitnexus"}, nil},
		{"oversized name", MCPServer{ID: "gitnexus", Name: strings.Repeat("a", 101), Transport: MCPTransportStdio, Command: "gitnexus"}, nil},
		{"missing command", MCPServer{ID: "gitnexus", Name: "gitnexus", Transport: MCPTransportStdio}, nil},
		{"unknown transport", MCPServer{ID: "gitnexus", Name: "gitnexus", Transport: "tcp"}, nil},
		{"missing URL", MCPServer{ID: "pm", Name: "pm", Transport: MCPTransportHTTP}, nil},
		{"invalid URL scheme", MCPServer{ID: "pm", Name: "pm", Transport: MCPTransportHTTP, URL: "ftp://example.com"}, nil},
		{"plaintext header", MCPServer{ID: "pm", Name: "pm", Transport: MCPTransportHTTP, URL: "https://example.com", Headers: map[string]string{"Authorization": "Bearer abc"}}, ErrMCPPlaintextSecret},
		{"plaintext env", MCPServer{ID: "pm", Name: "pm", Transport: MCPTransportHTTP, URL: "https://example.com", Env: map[string]string{"API_KEY": "abc"}}, ErrMCPPlaintextSecret},
	} {
		t.Run(tc.name, func(t *testing.T) {
			err := ValidateMCPServer(tc.server)
			if err == nil || (tc.want != nil && !errors.Is(err, tc.want)) {
				t.Fatalf("got %v, want error %v", err, tc.want)
			}
		})
	}
	ref := MCPServer{ID: "pm", Name: "pm", Transport: MCPTransportHTTP, URL: "https://example.com", Headers: map[string]string{"Authorization": "secret://postman-token"}, Env: map[string]string{"API_KEY": "secret://api-key"}}
	if err := ValidateMCPServer(ref); err != nil {
		t.Fatalf("secret references: %v", err)
	}
}

func TestValidateToolProfile(t *testing.T) {
	valid := ToolProfile{ID: "tp_1", Version: 1, Name: "backend-dev", ShellAllow: []string{"go test *"}, MCP: []MCPGrant{{Server: "gitnexus", Tools: []string{"*"}}}}
	if err := ValidateToolProfile(valid); err != nil {
		t.Fatalf("valid profile: %v", err)
	}
	for _, tc := range []struct {
		name string
		edit func(*ToolProfile)
	}{
		{"missing ID", func(p *ToolProfile) { p.ID = "" }},
		{"zero version", func(p *ToolProfile) { p.Version = 0 }},
		{"missing name", func(p *ToolProfile) { p.Name = " " }},
		{"oversized name", func(p *ToolProfile) { p.Name = strings.Repeat("a", 101) }},
		{"duplicate server", func(p *ToolProfile) { p.MCP = append(p.MCP, MCPGrant{Server: "gitnexus", Tools: []string{"query"}}) }},
		{"empty tools", func(p *ToolProfile) { p.MCP = []MCPGrant{{Server: "gitnexus"}} }},
		{"mid-pattern wildcard", func(p *ToolProfile) { p.ShellAllow = []string{"git * push"} }},
		// Review PR #8 item 4: "*" only means "all tools" when it stands alone.
		{"wildcard mixed with tool", func(p *ToolProfile) { p.MCP = []MCPGrant{{Server: "s", Tools: []string{"*", "query"}}} }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			p := valid
			tc.edit(&p)
			if err := ValidateToolProfile(p); err == nil {
				t.Fatal("expected validation error")
			}
		})
	}
}

func TestResolveToolPolicyNarrowsOnly(t *testing.T) {
	base := ToolProfile{ID: "tp_1", Version: 3, Name: "dev",
		BuiltinAllow: []string{"Read", "Write"}, ShellAllow: []string{"go test *", "git *"}, ShellDeny: []string{"git push *"},
		MCP: []MCPGrant{{Server: "gitnexus", Tools: []string{"*"}}, {Server: "postman", Tools: []string{"get", "list"}}}}
	got, err := ResolveToolPolicy(base,
		ToolNarrowing{BuiltinAllow: []string{"Read"}, ShellAllow: []string{"go test *"}, MCP: []MCPGrant{{Server: "gitnexus", Tools: []string{"query"}}, {Server: "postman", Tools: []string{"list"}}}},
		ToolNarrowing{ShellDeny: []string{"go test ./private *"}, MCP: []MCPGrant{{Server: "gitnexus", Tools: []string{"query"}}}})
	if err != nil {
		t.Fatalf("narrowing policy: %v", err)
	}
	if got.ProfileID != "tp_1" || got.ProfileVersion != 3 {
		t.Fatalf("lost profile identity: %+v", got)
	}
	if !equalStrings(got.BuiltinAllow, []string{"Read"}) || !equalStrings(got.ShellAllow, []string{"go test *"}) || !equalStrings(got.ShellDeny, []string{"git push *", "go test ./private *"}) {
		t.Fatalf("unexpected resolved lists: %+v", got)
	}
	if len(got.MCP) != 1 || got.MCP[0].Server != "gitnexus" || !equalStrings(got.MCP[0].Tools, []string{"query"}) {
		t.Fatalf("unexpected MCP grants: %+v", got.MCP)
	}
	if !equalStrings(base.ShellAllow, []string{"go test *", "git *"}) || len(base.MCP[0].Tools) != 1 {
		t.Fatal("resolve mutated base profile")
	}
	for _, tc := range []struct {
		name  string
		layer ToolNarrowing
	}{
		{"new builtin", ToolNarrowing{BuiltinAllow: []string{"Execute"}}},
		{"new shell", ToolNarrowing{ShellAllow: []string{"rm *"}}},
		{"new server", ToolNarrowing{MCP: []MCPGrant{{Server: "other", Tools: []string{"*"}}}}},
		{"new tool", ToolNarrowing{MCP: []MCPGrant{{Server: "postman", Tools: []string{"create"}}}}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, err := ResolveToolPolicy(base, tc.layer)
			if !errors.Is(err, ErrToolPolicyWidening) {
				t.Fatalf("got %v, want ErrToolPolicyWidening", err)
			}
		})
	}
}

func TestResolveToolPolicyInheritsNilAndPreservesOrder(t *testing.T) {
	base := ToolProfile{ID: "tp", Version: 1, Name: "dev", ShellAllow: []string{"z", "a"}, MCP: []MCPGrant{{Server: "s", Tools: []string{"z", "a"}}}}
	got, err := ResolveToolPolicy(base, ToolNarrowing{ShellAllow: []string{"a", "z"}, MCP: []MCPGrant{{Server: "s", Tools: []string{"a", "z"}}}}, ToolNarrowing{ShellDeny: []string{"z"}})
	if err != nil {
		t.Fatal(err)
	}
	if !equalStrings(got.ShellAllow, []string{"z", "a"}) || !equalStrings(got.MCP[0].Tools, []string{"z", "a"}) {
		t.Fatalf("order changed: %+v", got)
	}
	got, err = ResolveToolPolicy(base, ToolNarrowing{ShellAllow: []string{}, MCP: []MCPGrant{}})
	if err != nil || len(got.ShellAllow) != 0 || len(got.MCP) != 0 {
		t.Fatalf("explicit empty allow should clear: %+v, %v", got, err)
	}
}

// Review PR #8 item 2: a layer pattern the base would reject must not be
// accepted silently (it would only match its literal text and fail open).
func TestResolveToolPolicyRejectsInvalidLayerShellPatterns(t *testing.T) {
	base := ToolProfile{ID: "tp", Version: 1, Name: "dev", ShellAllow: []string{"go test *", "go *"}}
	for _, tc := range []struct {
		name  string
		layer ToolNarrowing
	}{
		{"deny", ToolNarrowing{ShellDeny: []string{"go test private/*"}}},
		{"mid-wildcard deny", ToolNarrowing{ShellDeny: []string{"go * private"}}},
		{"allow", ToolNarrowing{ShellAllow: []string{"go test private/*"}}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got, err := ResolveToolPolicy(base, tc.layer); err == nil {
				t.Fatalf("invalid layer pattern accepted: deny=%q allow=%q", got.ShellDeny, got.ShellAllow)
			}
		})
	}
}

// Review PR #8 item 3: narrowing a "*" grant must apply the same tool checks as
// the base profile.
func TestResolveToolPolicyRejectsEmptyOrDuplicateToolsUnderWildcard(t *testing.T) {
	base := ToolProfile{ID: "tp", Version: 1, Name: "dev", MCP: []MCPGrant{{Server: "s", Tools: []string{"*"}}}}
	for _, tools := range [][]string{{"", "a", "a"}, {"a", "a"}, {" "}} {
		if got, err := ResolveToolPolicy(base, ToolNarrowing{MCP: []MCPGrant{{Server: "s", Tools: tools}}}); err == nil {
			t.Errorf("narrow %q accepted: mcp=%+v", tools, got.MCP)
		}
	}
}

// Review PR #8 item 4: a layer cannot mix "*" with named tools either.
func TestResolveToolPolicyRejectsMixedWildcardInLayer(t *testing.T) {
	base := ToolProfile{ID: "tp", Version: 1, Name: "dev", MCP: []MCPGrant{{Server: "s", Tools: []string{"*"}}}}
	if got, err := ResolveToolPolicy(base, ToolNarrowing{MCP: []MCPGrant{{Server: "s", Tools: []string{"*", "query"}}}}); err == nil {
		t.Fatalf("layer mixing wildcard accepted: mcp=%+v", got.MCP)
	}
}

// Review PR #8 nit 6: " *" has an empty command base and would allow any
// command that starts with a space.
func TestShellPatternRejectsEmptyWildcardBase(t *testing.T) {
	if err := ValidateToolProfile(ToolProfile{ID: "tp", Version: 1, Name: "dev", ShellAllow: []string{" *"}}); err == nil {
		t.Error("base accepted shell pattern \" *\"")
	}
	base := ToolProfile{ID: "tp", Version: 1, Name: "dev", ShellAllow: []string{"go test *"}}
	if _, err := ResolveToolPolicy(base, ToolNarrowing{ShellDeny: []string{"  *"}}); err == nil {
		t.Error("layer accepted shell pattern \"  *\"")
	}
}

// Review PR #8 nit 7: a layer grant without tools is invalid input, not widening.
func TestResolveToolPolicyEmptyLayerToolsIsInvalidNotWidening(t *testing.T) {
	base := ToolProfile{ID: "tp", Version: 1, Name: "dev", MCP: []MCPGrant{{Server: "s", Tools: []string{"*"}}}}
	_, err := ResolveToolPolicy(base, ToolNarrowing{MCP: []MCPGrant{{Server: "s"}}})
	if err == nil || errors.Is(err, ErrToolPolicyWidening) {
		t.Fatalf("got %v, want a non-widening validation error", err)
	}
}

// Review PR #8 nit 8: builtin names follow the same non-empty rule as shell and MCP.
func TestToolPolicyRejectsEmptyBuiltinNames(t *testing.T) {
	for _, p := range []ToolProfile{
		{ID: "tp", Version: 1, Name: "dev", BuiltinAllow: []string{"Read", ""}},
		{ID: "tp", Version: 1, Name: "dev", BuiltinDeny: []string{" "}},
	} {
		if err := ValidateToolProfile(p); err == nil {
			t.Errorf("base accepted empty builtin name: allow=%q deny=%q", p.BuiltinAllow, p.BuiltinDeny)
		}
	}
	base := ToolProfile{ID: "tp", Version: 1, Name: "dev", BuiltinAllow: []string{"Read"}}
	if _, err := ResolveToolPolicy(base, ToolNarrowing{BuiltinDeny: []string{""}}); err == nil {
		t.Error("layer accepted empty builtin deny")
	}
}

func TestAllowsShell(t *testing.T) {
	p := ResolvedToolPolicy{ShellAllow: []string{"go test *", "git *", "npm run sqlc"}, ShellDeny: []string{"git push *"}}
	for command, want := range map[string]bool{
		"go test ./...": true, "go test": true, "go testx": false,
		"git status": true, "git push origin main": false,
		"npm run sqlc": true, "npm run api": false,
	} {
		if got := p.AllowsShell(command); got != want {
			t.Errorf("AllowsShell(%q) = %v, want %v", command, got, want)
		}
	}
}

func TestAllowsShellRejectsChaining(t *testing.T) {
	p := ResolvedToolPolicy{ShellAllow: []string{"go test *"}}
	for _, command := range []string{"go test ./... && git push", "go test ./...; rm -rf /", "go test $(curl x)", "go test ./... | sh", "go test > /etc/x", "go test `curl x`", "go test ./...\nrm -rf /"} {
		if p.AllowsShell(command) {
			t.Errorf("accepted shell metacharacters in %q", command)
		}
	}
	p.ShellAllow = []string{"go test ./... && git push"}
	if !p.AllowsShell("go test ./... && git push") {
		t.Fatal("explicit exact allow did not match")
	}
	p.ShellDeny = []string{"go test ./... && git push"}
	if p.AllowsShell("go test ./... && git push") {
		t.Fatal("exact deny did not override allow")
	}
}

// Review PR #8 item 1: shell treats each of these as `git push origin main`,
// so deny `git push *` must still win.
func TestAllowsShellDenyResistsQuotingEscapesAndWhitespace(t *testing.T) {
	p := ResolvedToolPolicy{ShellAllow: []string{"git *"}, ShellDeny: []string{"git push *"}}
	for _, command := range []string{
		"git  push origin main",
		"git 'push' origin main",
		"git \"push\" origin main",
		"git p\\ush origin main",
		"git\tpush origin main",
		"git push\torigin main",
		"git\rpush origin main",
		"git {push,} origin main",
		"git pus? origin main",
		"git pus[h] origin main",
	} {
		if p.AllowsShell(command) {
			t.Errorf("deny bypassed by %q", command)
		}
	}
	if !p.AllowsShell("git status --short") {
		t.Fatal("plain allowed command rejected")
	}
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
