// Package sharedkernel holds AO's former internal/domain and internal/ports
// packages while the fork moves to bounded contexts. It is temporary: a type
// leaves only when its bounded context has real work, by moving to
// internal/<bc>/domain and leaving `type X = bc.X` here until no caller uses
// the alias (docs/superpowers/specs/2026-11-27-ddd-platform-restructure-design.md
// §5.2). Do not add new types here.
package sharedkernel
