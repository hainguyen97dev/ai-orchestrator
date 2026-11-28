package continueagent

import (
	"context"

	"github.com/hainguyen97dev/ai-orchestrator/backend/internal/sharedkernel/ports"
)

var _ ports.AgentAuthChecker = (*Plugin)(nil)

// AuthStatus returns the plugin's local authentication status.
func (p *Plugin) AuthStatus(ctx context.Context) (ports.AgentAuthStatus, error) {
	if _, err := p.ResolveBinary(ctx); err != nil {
		return ports.AgentAuthStatusUnknown, err
	}
	// Continue has no documented non-interactive status command. Treat an
	// installed binary as sufficient local readiness evidence and let launch
	// remain authoritative.
	return ports.AgentAuthStatusAuthorized, nil
}
