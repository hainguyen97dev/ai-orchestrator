import { describe, expect, it } from "vitest";
import { projectNavigateTarget, sessionNavigateTarget } from "./navigate-to-session";

describe("local session navigation", () => {
 it("routes standalone and project sessions locally", () => {
  expect(sessionNavigateTarget(undefined, "s1")).toEqual({ to: "/sessions/$sessionId", params: { sessionId: "s1" } });
  expect(sessionNavigateTarget("p1", "s1")).toEqual({ to: "/projects/$projectId/sessions/$sessionId", params: { projectId: "p1", sessionId: "s1" } });
 });
 it("routes project roots locally", () => { expect(projectNavigateTarget("p1")).toEqual({ to: "/projects/$projectId", params: { projectId: "p1" } }); });
});
