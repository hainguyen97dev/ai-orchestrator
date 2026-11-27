package domain

import (
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"
)

// MCPServerID identifies a registered MCP server.
type MCPServerID string

// MCPTransport identifies how an MCP server is reached.
type MCPTransport string

// Supported MCP transports.
const (
	MCPTransportStdio MCPTransport = "stdio"
	MCPTransportHTTP  MCPTransport = "http"
)

// MCPServer describes a reusable MCP server connection.
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

// ToolProfileID identifies a versioned tool profile.
type ToolProfileID string

// MCPGrant allows specific tools on one MCP server.
type MCPGrant struct {
	Server MCPServerID
	Tools  []string
}

// ToolProfile is a versioned base policy for builtin, shell, and MCP tools.
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
	// ErrMCPPlaintextSecret reports a sensitive env or header value without a secret reference.
	ErrMCPPlaintextSecret = errors.New("MCP server contains a plaintext secret")
	// ErrToolPolicyWidening reports a layer that grants more than its predecessor.
	ErrToolPolicyWidening = errors.New("tool policy widening is not allowed")
)

func validToolName(name string) bool {
	return strings.TrimSpace(name) != "" && len(name) <= 100
}

// ValidateMCPServer checks identity, transport configuration, and secret references.
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

// ValidateToolProfile checks the profile identity and its tool grants.
func ValidateToolProfile(p ToolProfile) error {
	if strings.TrimSpace(string(p.ID)) == "" || p.Version < 1 || !validToolName(p.Name) {
		return errors.New("tool profile requires an ID, positive version, and name of at most 100 bytes")
	}
	if err := validateBuiltinNames(p.BuiltinAllow, p.BuiltinDeny); err != nil {
		return err
	}
	if err := validateShellPatterns(p.ShellAllow, p.ShellDeny); err != nil {
		return err
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
		if err := validateGrantTools(grant); err != nil {
			return err
		}
	}
	return nil
}

// validateShellPatterns accepts literals and patterns with one trailing " *"
// after a non-blank command base.
func validateShellPatterns(lists ...[]string) error {
	for _, patterns := range lists {
		for _, pattern := range patterns {
			wildcard := strings.Contains(pattern, "*")
			if strings.TrimSpace(pattern) == "" || (wildcard && (!strings.HasSuffix(pattern, " *") || strings.Count(pattern, "*") != 1 ||
				strings.TrimSpace(strings.TrimSuffix(pattern, " *")) == "")) {
				return fmt.Errorf("invalid shell pattern %q", pattern)
			}
		}
	}
	return nil
}

func validateBuiltinNames(lists ...[]string) error {
	for _, names := range lists {
		for _, name := range names {
			if strings.TrimSpace(name) == "" {
				return errors.New("builtin tool name must not be empty")
			}
		}
	}
	return nil
}

// validateGrantTools rejects blank and duplicate tool names in one MCP grant.
func validateGrantTools(grant MCPGrant) error {
	seen := make(map[string]bool, len(grant.Tools))
	for _, tool := range grant.Tools {
		if strings.TrimSpace(tool) == "" {
			return fmt.Errorf("MCP server %q has an empty tool", grant.Server)
		}
		if seen[tool] {
			return fmt.Errorf("MCP server %q has duplicate tool %q", grant.Server, tool)
		}
		if tool == "*" && len(grant.Tools) != 1 {
			return fmt.Errorf("MCP server %q cannot mix \"*\" with other tools", grant.Server)
		}
		seen[tool] = true
	}
	return nil
}

// ToolNarrowing is one policy layer. Nil allow slices inherit the prior layer;
// non-nil empty slices remove all grants in that category.
type ToolNarrowing struct {
	BuiltinAllow []string
	BuiltinDeny  []string
	ShellAllow   []string
	ShellDeny    []string
	MCP          []MCPGrant
}

// ResolvedToolPolicy is the effective policy after applying all narrowing layers.
type ResolvedToolPolicy struct {
	ProfileID      ToolProfileID
	ProfileVersion int64
	BuiltinAllow   []string
	BuiltinDeny    []string
	ShellAllow     []string
	ShellDeny      []string
	MCP            []MCPGrant
}

// ResolveToolPolicy applies role and node layers after the project profile.
// Allow grants can only shrink; deny lists accumulate across layers.
func ResolveToolPolicy(base ToolProfile, layers ...ToolNarrowing) (ResolvedToolPolicy, error) {
	if err := ValidateToolProfile(base); err != nil {
		return ResolvedToolPolicy{}, err
	}
	policy := ResolvedToolPolicy{
		ProfileID: base.ID, ProfileVersion: base.Version,
		BuiltinAllow: append([]string(nil), base.BuiltinAllow...),
		BuiltinDeny:  append([]string(nil), base.BuiltinDeny...),
		ShellAllow:   append([]string(nil), base.ShellAllow...),
		ShellDeny:    append([]string(nil), base.ShellDeny...),
		MCP:          cloneMCPGrants(base.MCP),
	}
	for _, layer := range layers {
		if err := validateBuiltinNames(layer.BuiltinAllow, layer.BuiltinDeny); err != nil {
			return ResolvedToolPolicy{}, err
		}
		if err := validateShellPatterns(layer.ShellAllow, layer.ShellDeny); err != nil {
			return ResolvedToolPolicy{}, err
		}
		var err error
		if policy.BuiltinAllow, err = narrowAllow(policy.BuiltinAllow, layer.BuiltinAllow); err != nil {
			return ResolvedToolPolicy{}, fmt.Errorf("builtin allow: %w", err)
		}
		if policy.ShellAllow, err = narrowAllow(policy.ShellAllow, layer.ShellAllow); err != nil {
			return ResolvedToolPolicy{}, fmt.Errorf("shell allow: %w", err)
		}
		if policy.MCP, err = narrowMCP(policy.MCP, layer.MCP); err != nil {
			return ResolvedToolPolicy{}, err
		}
		policy.BuiltinDeny = unionDeny(policy.BuiltinDeny, layer.BuiltinDeny)
		policy.ShellDeny = unionDeny(policy.ShellDeny, layer.ShellDeny)
	}
	return policy, nil
}

func narrowAllow(previous, requested []string) ([]string, error) {
	if requested == nil {
		return previous, nil
	}
	allowed := make(map[string]bool, len(previous))
	for _, item := range previous {
		allowed[item] = true
	}
	wanted := make(map[string]bool, len(requested))
	for _, item := range requested {
		if !allowed[item] {
			return nil, ErrToolPolicyWidening
		}
		wanted[item] = true
	}
	result := make([]string, 0, len(wanted))
	for _, item := range previous {
		if wanted[item] {
			result = append(result, item)
			delete(wanted, item)
		}
	}
	return result, nil
}

func unionDeny(previous, extra []string) []string {
	result := previous
	seen := make(map[string]bool, len(previous))
	for _, item := range previous {
		seen[item] = true
	}
	for _, item := range extra {
		if !seen[item] {
			result = append(result, item)
			seen[item] = true
		}
	}
	return result
}

func cloneMCPGrants(grants []MCPGrant) []MCPGrant {
	result := make([]MCPGrant, len(grants))
	for i, grant := range grants {
		result[i] = MCPGrant{Server: grant.Server, Tools: append([]string(nil), grant.Tools...)}
	}
	return result
}

func narrowMCP(previous, requested []MCPGrant) ([]MCPGrant, error) {
	if requested == nil {
		return previous, nil
	}
	byServer := make(map[MCPServerID]MCPGrant, len(previous))
	for _, grant := range previous {
		byServer[grant.Server] = grant
	}
	wanted := make(map[MCPServerID][]string, len(requested))
	for _, grant := range requested {
		prior, ok := byServer[grant.Server]
		if !ok {
			return nil, fmt.Errorf("MCP server %q: %w", grant.Server, ErrToolPolicyWidening)
		}
		if len(grant.Tools) == 0 {
			return nil, fmt.Errorf("MCP server %q requires tools; omit the server to remove it", grant.Server)
		}
		if err := validateGrantTools(grant); err != nil {
			return nil, err
		}
		if _, duplicate := wanted[grant.Server]; duplicate {
			return nil, fmt.Errorf("duplicate MCP server %q: %w", grant.Server, ErrToolPolicyWidening)
		}
		if len(prior.Tools) == 1 && prior.Tools[0] == "*" {
			wanted[grant.Server] = append([]string(nil), grant.Tools...)
			continue
		}
		tools, err := narrowAllow(prior.Tools, grant.Tools)
		if err != nil {
			return nil, fmt.Errorf("MCP server %q: %w", grant.Server, err)
		}
		wanted[grant.Server] = tools
	}
	result := make([]MCPGrant, 0, len(wanted))
	for _, grant := range previous {
		if tools, ok := wanted[grant.Server]; ok {
			result = append(result, MCPGrant{Server: grant.Server, Tools: tools})
		}
	}
	return result, nil
}

// shellUnsafeChars lets the shell run a command other than the literal text:
// chaining, substitution, redirection, quoting, escapes, brace and glob
// expansion, and non-space whitespace. Such commands only pass an exact allow.
const shellUnsafeChars = ";&|$`><()\n'\"\\\t\r\v\f{}*?[]"

// AllowsShell checks literal or trailing-wildcard patterns. An exact allow may
// contain shell metacharacters; wildcard allows cannot authorize them.
func (p ResolvedToolPolicy) AllowsShell(command string) bool {
	for _, pattern := range p.ShellDeny {
		if shellPatternMatches(pattern, command) {
			return false
		}
	}
	if strings.ContainsAny(command, shellUnsafeChars) || strings.Contains(command, "  ") {
		for _, pattern := range p.ShellAllow {
			if pattern == command {
				return true
			}
		}
		return false
	}
	for _, pattern := range p.ShellAllow {
		if shellPatternMatches(pattern, command) {
			return true
		}
	}
	return false
}

func shellPatternMatches(pattern, command string) bool {
	if pattern == command {
		return true
	}
	if !strings.HasSuffix(pattern, " *") {
		return false
	}
	base := strings.TrimSuffix(pattern, " *")
	return command == base || strings.HasPrefix(command, base+" ")
}
