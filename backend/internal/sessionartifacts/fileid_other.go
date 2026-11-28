//go:build !linux && !darwin

package sessionartifacts

import (
	"io/fs"

	"github.com/hainguyen97dev/ai-orchestrator/backend/internal/sharedkernel/domain"
)

// quickIdentity reports nothing on this platform, so a rename here is seen
// as a delete and a new file.
func quickIdentity(fs.FileInfo) domain.FileIdentity { return domain.FileIdentity{} }

func fullIdentity(_ string, info fs.FileInfo) domain.FileIdentity { return quickIdentity(info) }
