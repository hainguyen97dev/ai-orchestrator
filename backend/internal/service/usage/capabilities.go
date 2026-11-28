package usage

import "github.com/hainguyen97dev/ai-orchestrator/backend/internal/sharedkernel/domain"

// SupportedHarness reports whether the harness has a certified usage pipeline: one that names the source its usage is read from.
func SupportedHarness(h domain.AgentHarness) bool {
	_, ok := sourceKindForHarness(h)
	return ok
}
