package chat_test

import (
	"context"
	"sync/atomic"
	"testing"
	"time"

	chatsvc "github.com/hainguyen97dev/ai-orchestrator/backend/internal/service/chat"
	"github.com/hainguyen97dev/ai-orchestrator/backend/internal/sharedkernel/domain"
	"github.com/hainguyen97dev/ai-orchestrator/backend/internal/sharedkernel/ports"
)

func TestPrewarmChatProbesOnceAndCachesForPreflight(t *testing.T) {
	var probes atomic.Int32
	release := make(chan struct{})
	driver := fakeDriver{probe: func() error {
		probes.Add(1)
		<-release
		return nil
	}}
	service := chatsvc.New(chatsvc.Options{Drivers: fakeRegistry{driver: driver}, NewID: func() string { return "id" }})

	// Repeated picks while a check runs start no second one.
	for range 3 {
		service.PrewarmChat(domain.HarnessCursor)
	}
	deadline := time.Now().Add(5 * time.Second)
	for probes.Load() == 0 && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	close(release)

	if err := service.PreflightChat(context.Background(), domain.HarnessCursor, ports.PermissionModeAuto); err != nil {
		t.Fatalf("PreflightChat: %v", err)
	}
	if got := probes.Load(); got != 1 {
		t.Fatalf("probes = %d, want 1", got)
	}
}
