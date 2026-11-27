// Command server starts the Agent Orchestrator daemon (`go run ./cmd/server`).
// The user-facing CLI lives at cmd/ao; the packaged app runs `ao daemon`.
package main

import (
	"fmt"
	"os"

	"github.com/hainguyen97dev/ai-orchestrator/backend/internal/daemon"
)

func main() {
	if err := daemon.Run(""); err != nil {
		fmt.Fprintln(os.Stderr, "ao backend daemon: "+err.Error())
		os.Exit(1)
	}
}
