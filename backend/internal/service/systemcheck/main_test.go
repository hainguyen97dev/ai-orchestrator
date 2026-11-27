package systemcheck

import (
	"os"
	"testing"

	"github.com/hainguyen97dev/ai-orchestrator/backend/internal/testenv"
)

func TestMain(m *testing.M) {
	testenv.ClearSession()
	os.Exit(m.Run())
}
