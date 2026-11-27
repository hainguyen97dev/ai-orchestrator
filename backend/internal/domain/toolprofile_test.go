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
		ToolNarrowing{ShellDeny: []string{"go test private/*"}, MCP: []MCPGrant{{Server: "gitnexus", Tools: []string{"query"}}}})
	if err != nil {
		t.Fatalf("narrowing policy: %v", err)
	}
	if got.ProfileID != "tp_1" || got.ProfileVersion != 3 {
		t.Fatalf("lost profile identity: %+v", got)
	}
	if !equalStrings(got.BuiltinAllow, []string{"Read"}) || !equalStrings(got.ShellAllow, []string{"go test *"}) || !equalStrings(got.ShellDeny, []string{"git push *", "go test private/*"}) {
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
