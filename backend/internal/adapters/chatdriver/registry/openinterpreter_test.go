package registry

import (
	"errors"
	"testing"

	"github.com/hainguyen97dev/ai-orchestrator/backend/internal/sharedkernel/domain"
	"github.com/hainguyen97dev/ai-orchestrator/backend/internal/sharedkernel/ports"
)

func TestOpenInterpreterChatIsUnsupported(t *testing.T) {
	registry := Build(nil, nil)
	if registry.SupportsChat(domain.HarnessOpenInterpreter) {
		t.Fatal("Open Interpreter exposed in Chat before its ACP mode is qualified")
	}
	_, err := registry.Driver(domain.HarnessOpenInterpreter)
	if !errors.Is(err, ports.ErrChatUnsupported) {
		t.Fatalf("Open Interpreter Chat admission = %v", err)
	}
}
