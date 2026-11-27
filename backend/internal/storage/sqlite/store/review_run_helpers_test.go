package store_test

import (
	"context"

	"github.com/hainguyen97dev/ai-orchestrator/backend/internal/sharedkernel/domain"
	"github.com/hainguyen97dev/ai-orchestrator/backend/internal/storage/sqlite"
)

// finishReviewRun moves an active run to a final state with the fields a
// submit or failure records, for tests that only need the end state.
func finishReviewRun(ctx context.Context, s *sqlite.Store, id string, status domain.ReviewRunStatus, verdict domain.ReviewVerdict, body, githubReviewID string, autoInject bool) (bool, error) {
	return s.TransitionReviewRun(ctx, id, domain.ActiveReviewRunStatuses, status, domain.ReviewRunPatch{
		Verdict:          verdict,
		Body:             &body,
		GithubReviewID:   &githubReviewID,
		AutoInjectReview: &autoInject,
	})
}
