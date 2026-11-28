package sessionmanager

import (
	"github.com/hainguyen97dev/ai-orchestrator/backend/internal/sharedkernel/domain"
	"github.com/hainguyen97dev/ai-orchestrator/backend/internal/sharedkernel/ports"
)

// workspaceRestoreContext is the native identity a restored launch continues,
// with the imported state root when that identity is the import's.
type workspaceRestoreContext struct {
	nativeID, configDir string
}

func restoredWorkspaceContext(rec domain.SessionRecord, fresh bool) workspaceRestoreContext {
	if fresh || rec.Metadata.AgentSessionID == "" {
		return workspaceRestoreContext{}
	}
	context := workspaceRestoreContext{nativeID: rec.Metadata.AgentSessionID}
	if source := rec.Metadata.ImportSource; source != nil {
		if ref := importedNativeRef(source); context.nativeID == ref.NativeSessionID {
			context.configDir = ref.ConfigDir
		}
	}
	return context
}

func (r workspaceRestoreContext) apply(cfg *ports.WorkspaceHookConfig) {
	cfg.NativeSessionID, cfg.ImportConfigDir = r.nativeID, r.configDir
}
