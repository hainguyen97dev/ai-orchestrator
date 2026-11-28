package skillassets

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
)

func TestInstallWritesBugTriageBesideUsingAO(t *testing.T) {
	dataDir := t.TempDir()
	stale := filepath.Join(BugTriageDir(dataDir), "stale.md")
	if err := os.MkdirAll(filepath.Dir(stale), 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(stale, []byte("old"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := Install(dataDir); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(filepath.Join(dataDir, "skills", "bug-triage", "SKILL.md"))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, BugTriageSkill()) {
		t.Fatal("installed bug-triage skill differs from the embedded one")
	}
	if _, err := os.Stat(stale); !os.IsNotExist(err) {
		t.Fatalf("stale file survived install: %v", err)
	}
	if _, err := os.Stat(filepath.Join(Dir(dataDir), "SKILL.md")); err != nil {
		t.Fatalf("using-ao missing: %v", err)
	}
}

func TestBugTriageEmbeddedCopyMatchesCanonicalToPreventDrift(t *testing.T) {
	canonical, err := os.ReadFile(filepath.Join(repoRoot(t), ".agents", "skills", "bug-triage", "SKILL.md"))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(canonical, BugTriageSkill()) {
		t.Fatal("embedded bug-triage skill differs from canonical skill")
	}
}

// repoRoot walks up from the package directory to the checkout root, so the
// test keeps working when the package moves to another depth.
func repoRoot(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, ".agents", "skills")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			t.Fatal("no .agents/skills above the package directory")
		}
		dir = parent
	}
}
