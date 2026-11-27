package domain

import (
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"
)

type MCPServerID string
type MCPTransport string

const (
	MCPTransportStdio MCPTransport = "stdio"
	MCPTransportHTTP  MCPTransport = "http"
)

type MCPServer struct {
	ID        MCPServerID
	Name      string
	Transport MCPTransport
	Command   string
	Args      []string
	URL       string
	Env       map[string]string
	Headers   map[string]string
	CreatedAt time.Time
	UpdatedAt time.Time
}

type ToolProfileID string

type MCPGrant struct {
	Server MCPServerID
	Tools  []string
}

type ToolProfile struct {
	ID           ToolProfileID
	Version      int64
	Name         string
	BuiltinAllow []string
	BuiltinDeny  []string
	ShellAllow   []string
	ShellDeny    []string
	MCP          []MCPGrant
	CreatedAt    time.Time
}

var (
	ErrMCPPlaintextSecret = errors.New("MCP server contains a plaintext secret")
	ErrToolPolicyWidening = errors.New("tool policy widening is not allowed")
)

func validToolName(name string) bool {
	return strings.TrimSpace(name) != "" && len(name) <= 100
}

func ValidateMCPServer(s MCPServer) error {
	if strings.TrimSpace(string(s.ID)) == "" || !validToolName(s.Name) {
		return errors.New("MCP server requires an ID and a name of at most 100 bytes")
	}
	switch s.Transport {
	case MCPTransportStdio:
		if strings.TrimSpace(s.Command) == "" {
			return errors.New("stdio MCP server requires a command")
		}
	case MCPTransportHTTP:
		u, err := url.Parse(s.URL)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
			return errors.New("HTTP MCP server requires an http or https URL")
		}
	default:
		return fmt.Errorf("unsupported MCP transport %q", s.Transport)
	}
	for _, entries := range []map[string]string{s.Env, s.Headers} {
		for key, value := range entries {
			lower := strings.ToLower(key)
			if strings.Contains(lower, "token") || strings.Contains(lower, "secret") || strings.Contains(lower, "key") || strings.Contains(lower, "password") || strings.Contains(lower, "auth") {
				if !strings.HasPrefix(value, "secret://") || len(value) == len("secret://") {
					return fmt.Errorf("%w: %s", ErrMCPPlaintextSecret, key)
				}
			}
		}
	}
	return nil
}

func ValidateToolProfile(p ToolProfile) error {
	if strings.TrimSpace(string(p.ID)) == "" || p.Version < 1 || !validToolName(p.Name) {
		return errors.New("tool profile requires an ID, positive version, and name of at most 100 bytes")
	}
	for _, patterns := range [][]string{p.ShellAllow, p.ShellDeny} {
		for _, pattern := range patterns {
			if strings.TrimSpace(pattern) == "" || (strings.Contains(pattern, "*") && (!strings.HasSuffix(pattern, " *") || strings.Count(pattern, "*") != 1)) {
				return fmt.Errorf("invalid shell pattern %q", pattern)
			}
		}
	}
	seen := make(map[MCPServerID]struct{}, len(p.MCP))
	for _, grant := range p.MCP {
		if strings.TrimSpace(string(grant.Server)) == "" || len(grant.Tools) == 0 {
			return errors.New("MCP grant requires a server and tools")
		}
		if _, ok := seen[grant.Server]; ok {
			return fmt.Errorf("duplicate MCP server %q", grant.Server)
		}
		seen[grant.Server] = struct{}{}
		for _, tool := range grant.Tools {
			if strings.TrimSpace(tool) == "" {
				return fmt.Errorf("MCP server %q has an empty tool", grant.Server)
			}
		}
	}
	return nil
}
