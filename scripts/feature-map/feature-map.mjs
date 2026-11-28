#!/usr/bin/env node
// Read-only raw numbers for docs/fork/ddd-spec/17-feature-code-map.md: per
// feature cluster (clusters.json) the Go packages and their line counts, the
// dependency closure inside the module, HTTP routes, UI routes, live SQLite
// tables and test file counts. Everything a cluster does not claim is listed
// under "unassigned" instead of being dropped.
// Usage: node scripts/feature-map/feature-map.mjs > raw.json
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const longestMatch = (value, cluster, prefixes) =>
  prefixes.reduce((best, p) => ((value === p || value.startsWith(p + '/')) && p.length > best ? p.length : best), -1);

export function assignRoutes(routes, clusters) {
  const byCluster = new Map(clusters.map((c) => [c.id, []]));
  const unassigned = [];
  for (const route of routes) {
    let owner = null;
    let best = -1;
    for (const c of clusters) {
      const len = longestMatch(route, c, c.httpPrefixes ?? []);
      if (len > best) [owner, best] = [c.id, len];
    }
    if (owner) byCluster.get(owner).push(route);
    else unassigned.push(route);
  }
  return { byCluster, unassigned };
}

const matchesPackage = (pkg, pattern) =>
  pattern.endsWith('/...') ? pkg === pattern.slice(0, -4) || pkg.startsWith(pattern.slice(0, -3)) : pkg === pattern;

export function assignPackages(pkgs, clusters) {
  const byCluster = new Map(clusters.map((c) => [c.id, []]));
  const unassigned = [];
  for (const pkg of pkgs) {
    const owner = clusters.find((c) => (c.packages ?? []).some((p) => matchesPackage(pkg, p)));
    if (owner) byCluster.get(owner.id).push(pkg);
    else unassigned.push(pkg);
  }
  return { byCluster, unassigned };
}

export function closureLoc(roots, deps, loc) {
  const seen = new Set();
  const stack = [...roots];
  while (stack.length) {
    const p = stack.pop();
    if (seen.has(p)) continue;
    seen.add(p);
    for (const d of deps.get(p) ?? []) if (deps.has(d)) stack.push(d);
  }
  let total = 0;
  for (const p of seen) total += loc.get(p) ?? 0;
  return { packages: seen.size, loc: total };
}

export function parseRoutes(yaml) {
  const routes = [];
  let inPaths = false;
  for (const line of yaml.split('\n')) {
    if (/^\S/.test(line)) inPaths = line.startsWith('paths:');
    const m = inPaths && line.match(/^  (\/[^:]+):\s*$/);
    if (m) routes.push(m[1]);
  }
  return routes;
}

export const upSection = (sql) => sql.split(/^-- \+goose Down.*$/m)[0];

export function liveTables(sql) {
  const live = new Set();
  const name = '"?([A-Za-z_0-9]+)"?';
  const re = new RegExp(
    `CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${name}|DROP\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?${name}|ALTER\\s+TABLE\\s+${name}\\s+RENAME\\s+TO\\s+${name}`,
    'gi',
  );
  for (const m of sql.matchAll(re)) {
    if (m[1]) live.add(m[1]);
    else if (m[2]) live.delete(m[2]);
    else {
      live.delete(m[3]);
      live.add(m[4]);
    }
  }
  return [...live].sort();
}

const globToRegExp = (glob) => new RegExp('^' + glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
const countLines = (file) => readFileSync(file, 'utf8').split('\n').length;

function main() {
  const repo = fileURLToPath(new URL('../../', import.meta.url));
  const backend = join(repo, 'backend');
  const clusters = JSON.parse(readFileSync(new URL('./clusters.json', import.meta.url), 'utf8'));
  const module = readFileSync(join(backend, 'go.mod'), 'utf8').match(/^module\s+(\S+)/m)[1];

  const listed = execFileSync(
    'go',
    ['list', '-deps', '-test=false', '-f', '{{.ImportPath}}|{{.Dir}}|{{join .Imports " "}}|{{join .GoFiles " "}}|{{len .TestGoFiles}}|{{len .XTestGoFiles}}', './...'],
    { cwd: backend, encoding: 'utf8', maxBuffer: 1 << 28 },
  );
  const deps = new Map();
  const loc = new Map();
  const goTests = new Map();
  const rel = (p) => p.slice(module.length + 1);
  for (const line of listed.trim().split('\n')) {
    const [path, dir, imports, files, t, xt] = line.split('|');
    if (!path.startsWith(module + '/')) continue;
    const r = rel(path);
    deps.set(r, imports.split(' ').filter((i) => i.startsWith(module + '/')).map(rel));
    loc.set(r, files ? files.split(' ').reduce((n, f) => n + countLines(join(dir, f)), 0) : 0);
    goTests.set(r, Number(t) + Number(xt));
  }

  const routes = parseRoutes(readFileSync(join(backend, 'internal/httpd/apispec/openapi.yaml'), 'utf8'));
  const migrationsDir = ['platform/persistence/sqlite/migrations', 'internal/storage/sqlite/migrations']
    .map((d) => join(backend, d))
    .find(existsSync);
  const sql = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort().map((f) => upSection(readFileSync(join(migrationsDir, f), "utf8"))).join('\n');
  const tables = liveTables(sql);
  const uiDir = join(repo, 'frontend/src/renderer/routes');
  const uiRoutes = readdirSync(uiDir).filter((f) => f.endsWith('.tsx'));

  const pkgAssign = assignPackages([...deps.keys()].sort(), clusters);
  const routeAssign = assignRoutes(routes, clusters);
  const claimedTables = new Set(clusters.flatMap((c) => c.tables ?? []));
  const claimedUi = new Set();

  const out = clusters.map((c) => {
    const pkgs = pkgAssign.byCluster.get(c.id);
    const ui = uiRoutes.filter((r) => (c.uiRoutes ?? []).some((g) => globToRegExp(g).test(r)));
    ui.forEach((r) => claimedUi.add(r));
    return {
      id: c.id,
      name: c.name,
      action: c.action,
      bc: c.bc,
      ui: c.ui,
      missingPackagePatterns: (c.packages ?? []).filter((p) => !pkgs.some((k) => matchesPackage(k, p))),
      packages: pkgs.map((p) => ({ path: p, loc: loc.get(p) })),
      loc: pkgs.reduce((n, p) => n + loc.get(p), 0),
      closure: closureLoc(pkgs, deps, loc),
      httpRoutes: routeAssign.byCluster.get(c.id),
      uiRoutes: ui,
      tables: (c.tables ?? []).filter((t) => tables.includes(t)),
      missingTables: (c.tables ?? []).filter((t) => !tables.includes(t)),
      tests: { go: pkgs.reduce((n, p) => n + goTests.get(p), 0) },
    };
  });

  const result = {
    module,
    generatedFrom: execFileSync('git', ['rev-parse', '--short=10', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
    totals: { packages: deps.size, loc: [...loc.values()].reduce((a, b) => a + b, 0), httpRoutes: routes.length, tables: tables.length },
    clusters: out,
    unassigned: {
      httpRoutes: routeAssign.unassigned,
      packages: pkgAssign.unassigned.map((p) => ({ path: p, loc: loc.get(p) })),
      tables: tables.filter((t) => !claimedTables.has(t)),
      uiRoutes: uiRoutes.filter((r) => !claimedUi.has(r)),
    },
  };
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
