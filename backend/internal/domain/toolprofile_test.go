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
