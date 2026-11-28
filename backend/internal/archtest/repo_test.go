package archtest

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"os/exec"
	"strings"
	"testing"
)

// TestRepoHasNoViolations checks the real import graph of the backend module,
// including test imports, so a new context cannot reach AO code outside its acl.
func TestRepoHasNoViolations(t *testing.T) {
	modOut, err := exec.Command("go", "list", "-m").Output()
	if err != nil {
		t.Fatalf("go list -m: %v", err)
	}
	module := strings.TrimSpace(string(modOut))

	cmd := exec.Command("go", "list", "-json=ImportPath,Imports,TestImports,XTestImports", module+"/...")
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	if err != nil {
		t.Fatalf("go list: %v\n%s", err, stderr.String())
	}
	var pkgs []Pkg
	dec := json.NewDecoder(bytes.NewReader(out))
	for {
		var p struct {
			ImportPath                         string
			Imports, TestImports, XTestImports []string
		}
		if err := dec.Decode(&p); errors.Is(err, io.EOF) {
			break
		} else if err != nil {
			t.Fatalf("decode go list: %v", err)
		}
		imports := append(append(p.Imports, p.TestImports...), p.XTestImports...)
		pkgs = append(pkgs, Pkg{Path: p.ImportPath, Imports: imports})
	}
	if len(pkgs) < 100 {
		t.Fatalf("go list returned %d packages; expected the whole backend module", len(pkgs))
	}
	if v := Violations(module, pkgs); len(v) > 0 {
		t.Fatalf("bounded-context import rules broken:\n%s", strings.Join(v, "\n"))
	}
}
