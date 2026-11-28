package archtest

import (
	"reflect"
	"testing"
)

func TestViolations(t *testing.T) {
	cases := []struct {
		name     string
		importer string
		imported string
		want     int
	}{
		{"new context importing AO shared kernel", "m/internal/workflow/application", "m/internal/sharedkernel/domain", 1},
		{"acl may import AO", "m/internal/workflow/infrastructure/acl", "m/internal/execution/session", 0},
		{"acl subpackage may import AO", "m/internal/workflow/infrastructure/acl/session", "m/pkg/agentruntime", 0},
		{"new context importing another new context", "m/internal/workflow/domain", "m/internal/knowledge/domain", 1},
		{"new context importing platform", "m/internal/knowledge/infrastructure/persistence", "m/platform/observability", 0},
		{"new context importing AO change_log CDC", "m/internal/workflow/application", "m/platform/eventbus/cdc", 1},
		{"acl may import AO change_log CDC", "m/internal/workflow/infrastructure/acl/events", "m/platform/eventbus/cdc", 0},
		{"new context importing a CDC subpackage", "m/internal/workflow/application", "m/platform/eventbus/cdc/consumer", 1},
		{"new context importing an AO store subpackage", "m/internal/budget/application", "m/platform/persistence/sqlite/store/usage", 1},
		{"new context importing a generic sqlite helper", "m/internal/knowledge/infrastructure/persistence", "m/platform/persistence/sqlite/timestamps", 0},
		{"new context importing the AO sqlite store", "m/internal/knowledge/infrastructure/persistence", "m/platform/persistence/sqlite/store", 1},
		{"new context importing AO sqlc queries", "m/internal/budget/application", "m/platform/persistence/sqlite/gen", 1},
		{"new context importing the sqlite opener", "m/internal/workflow/infrastructure", "m/platform/persistence/sqlite", 1},
		{"acl may import the AO sqlite store", "m/internal/knowledge/infrastructure/acl/sessions", "m/platform/persistence/sqlite/store", 0},
		{"new context importing integrations", "m/internal/knowledge/infrastructure/vault", "m/integrations/obsidian", 0},
		{"new context importing itself", "m/internal/workflow/application", "m/internal/workflow/domain", 0},
		{"new context importing stdlib and third party", "m/internal/context/domain", "golang.org/x/sync/errgroup", 0},
		{"platform importing new context", "m/platform/persistence/sqlite", "m/internal/knowledge/domain", 1},
		{"integrations importing new context", "m/integrations/obsidian", "m/internal/knowledge/domain", 1},
		{"AO importing an acl", "m/internal/execution/session", "m/internal/workflow/infrastructure/acl", 1},
		{"platform importing AO shared kernel", "m/platform/persistence/sqlite", "m/internal/sharedkernel/domain", 0},
		{"AO importing AO", "m/internal/execution/session", "m/internal/sharedkernel/ports", 0},
		{"prefix lookalike is not a new context", "m/internal/contextx/foo", "m/internal/sharedkernel/domain", 0},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := Violations("m", []Pkg{{Path: tc.importer, Imports: []string{tc.imported}}})
			if len(got) != tc.want {
				t.Fatalf("Violations = %v, want %d violation(s)", got, tc.want)
			}
		})
	}
}

func TestAOStoreViolationIsR4(t *testing.T) {
	got := Violations("m", []Pkg{{Path: "m/internal/workflow/domain", Imports: []string{"m/platform/persistence/sqlite/store"}}})
	want := []string{"m/internal/workflow/domain -> m/platform/persistence/sqlite/store: R4"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("Violations = %v, want %v", got, want)
	}
}

func TestViolationMessageNamesBothEndsAndRule(t *testing.T) {
	got := Violations("m", []Pkg{{Path: "m/platform/eventbus/cdc", Imports: []string{"m/internal/workflow/domain"}}})
	want := []string{"m/platform/eventbus/cdc -> m/internal/workflow/domain: R2"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("Violations = %v, want %v", got, want)
	}
}
