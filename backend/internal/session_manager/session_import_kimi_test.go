package sessionmanager

import (
	"testing"

	"github.com/hainguyen97dev/ai-orchestrator/backend/internal/sharedkernel/domain"
)

func TestKimiImportsUseCurrentConfigHomeHook(t *testing.T) {
	if importedHarnesses[domain.HarnessKimi].configEnvKey != "KIMI_CODE_HOME" {
		t.Fatal("prepared Kimi home is not restored through the native import hook")
	}
}
