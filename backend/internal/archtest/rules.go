// Package archtest enforces the bounded-context import rules of the fork
// (docs/superpowers/specs/2026-11-27-ddd-platform-restructure-design.md §5.2):
//
//   - R1: a new context (internal/<new>/...) imports only itself, platform/...,
//     integrations/..., the standard library and third-party modules. Only its
//     infrastructure/acl/... may reach AO packages (internal/..., pkg/...).
//     Imports between two new contexts are forbidden in v1.
//   - R2: platform/... and integrations/... never import a new context.
//   - R3: nothing outside a new context imports that context's acl.
//   - R4: outside its acl, a new context never imports AO's SQLite store
//     (AOStorePackages). It gets a *sql.DB from the daemon and owns its tables.
package archtest

import (
	"fmt"
	"strings"
)

// NewContexts are the bounded contexts built cleanly in four layers.
var NewContexts = []string{"domainmodel", "knowledge", "context", "workflow", "budget"}

// Pkg is one package and its imports, as reported by `go list`.
type Pkg struct {
	Path    string
	Imports []string
}

// Violations returns one "<importer> -> <imported>: <rule>" entry per broken rule.
func Violations(module string, pkgs []Pkg) []string {
	var out []string
	for _, p := range pkgs {
		from, ok := rel(module, p.Path)
		if !ok {
			continue
		}
		fromCtx := newContext(from)
		for _, imp := range p.Imports {
			to, inModule := rel(module, imp)
			if !inModule {
				continue
			}
			toCtx := newContext(to)
			rule := ""
			switch {
			case fromCtx != "":
				inACL := under(from, "internal/"+fromCtx+"/infrastructure/acl")
				switch {
				case aoStore(to) && !inACL:
					rule = "R4"
				case toCtx == fromCtx, under(to, "platform"), under(to, "integrations"):
				case toCtx != "":
					rule = "R1"
				case !inACL:
					rule = "R1"
				}
			case toCtx != "" && (under(from, "platform") || under(from, "integrations")):
				rule = "R2"
			case toCtx != "" && under(to, "internal/"+toCtx+"/infrastructure/acl"):
				rule = "R3"
			}
			if rule != "" {
				out = append(out, fmt.Sprintf("%s -> %s: %s", p.Path, imp, rule))
			}
		}
	}
	return out
}

func rel(module, path string) (string, bool) {
	if path == module {
		return "", true
	}
	r, ok := strings.CutPrefix(path, module+"/")
	return r, ok
}

func under(path, dir string) bool {
	return path == dir || strings.HasPrefix(path, dir+"/")
}

// AOStorePackages hold AO's own tables and queries; sqlite.Open returns the
// AO store, so the opener counts too. Generic helpers (timestamps, searchtext,
// sqlitetest) stay open to new contexts.
var AOStorePackages = []string{
	"platform/persistence/sqlite",
	"platform/persistence/sqlite/store",
	"platform/persistence/sqlite/gen",
}

func aoStore(path string) bool {
	for _, p := range AOStorePackages {
		if path == p {
			return true
		}
	}
	return false
}

func newContext(path string) string {
	for _, c := range NewContexts {
		if under(path, "internal/"+c) {
			return c
		}
	}
	return ""
}
