package opencodev2

import "github.com/hainguyen97dev/ai-orchestrator/backend/internal/sharedkernel/domain"

// DeriveActivityState maps normalized events emitted by the managed OpenCode 2
// plugin onto AO activity states.
func DeriveActivityState(event string, _ []byte) (domain.ActivityState, bool) {
	switch event {
	case "session-start", "active", "permission-resolved":
		return domain.ActivityActive, true
	case "permission-blocked":
		return domain.ActivityBlocked, true
	case "stop":
		return domain.ActivityIdle, true
	default:
		return "", false
	}
}
