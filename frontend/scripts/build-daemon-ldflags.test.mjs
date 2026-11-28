// @vitest-environment node
// `-ldflags -X <package>.Var=value` names Go packages as plain strings. If the
// module path changes and these strings do not, the build stays green but the
// packaged `ao version` silently reports "dev".
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const module = readFileSync(join(repoRoot, "backend/go.mod"), "utf8").match(/^module\s+(\S+)/m)[1];
const read = (path) => readFileSync(join(repoRoot, path), "utf8");

describe("ldflags package paths follow backend/go.mod", () => {
	it("build-daemon.mjs stamps cli and mcpserver under the module path", () => {
		const script = read("frontend/scripts/build-daemon.mjs");
		expect(script).toContain(`"${module}/internal/cli"`);
		expect(script).toContain(`-X ${module}/internal/mcpserver.Version=`);
	});

	it("CLI fresh-install Dockerfile stamps cli under the module path", () => {
		expect(read("test/cli/Dockerfile")).toContain(`-X ${module}/internal/cli.releaseRepo=`);
	});
});
