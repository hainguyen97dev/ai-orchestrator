import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AwakeState } from "../hooks/useAwake";
import { AwakeControl } from "./AwakeControl";
import { TooltipProvider } from "./ui/tooltip";

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), mac: true }));
vi.mock("../lib/platform", () => ({ isMacPlatform: () => mocks.mac }));
vi.mock("../lib/telemetry", () => ({ captureRendererEvent: vi.fn() }));
vi.mock("../lib/api-client", () => ({ apiClient: { GET: mocks.get, POST: mocks.post } }));
let state: AwakeState;
let client: QueryClient;
const snapshot = () => structuredClone(state);
function renderControl() { return render(<TooltipProvider delayDuration={0}><QueryClientProvider client={client}><AwakeControl /></QueryClientProvider></TooltipProvider>); }
function awakeSession(id: string, overrides: Partial<AwakeState["sessions"][number]> = {}) { return { id, scope: "ao" as const, sessionId: "", mode: "indefinite" as const, boundId: "", boundIdentity: "", createdAt: "2026-11-01T00:00:00Z", endReason: "", label: "For AO", lidClosed: false, ...overrides }; }
beforeEach(() => {
 mocks.mac = true; client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
 state = { settings: { lidClosed: true }, sessions: [], rules: [], activeRules: [], active: false, paused: false, capabilities: [{ id: "idle", available: true }] } as unknown as AwakeState;
 mocks.get.mockReset().mockImplementation(async () => ({ data: snapshot() }));
 mocks.post.mockReset().mockImplementation(async (path: string, options: { body?: Record<string, unknown> } = {}) => {
  if (path === "/api/v1/awake/sessions") { state.sessions.push(awakeSession("new", options.body as Partial<AwakeState["sessions"][number]>)); state.active = true; }
  if (path === "/api/v1/awake/stop") { state.sessions = state.sessions.map((session) => ({ ...session, endedAt: "now" })); state.active = false; state.paused = true; }
  return { data: snapshot() };
 });
});
describe("desktop Stay Awake", () => {
 it("starts and stops an Awake lease through the desktop API", async () => {
  renderControl(); const button = await screen.findByRole("button", { name: "Stay Awake" }); await waitFor(() => expect(button).toBeEnabled());
  await userEvent.click(button); await waitFor(() => expect(mocks.post).toHaveBeenCalledWith("/api/v1/awake/sessions", expect.objectContaining({ body: expect.objectContaining({ scope: "ao", lidClosed: false }) })));
  await userEvent.click(button); await waitFor(() => expect(mocks.post).toHaveBeenCalledWith("/api/v1/awake/stop"));
 });
 it("keeps the closed-lid option on the desktop Awake lease", async () => { renderControl(); const button = await screen.findByRole("button", { name: "Stay Awake" }); await waitFor(() => expect(button).toBeEnabled()); await userEvent.click(button); await waitFor(() => expect(mocks.post).toHaveBeenCalledWith("/api/v1/awake/sessions", expect.objectContaining({ body: expect.objectContaining({ lidClosed: false }) }))); });
 it("keeps paused desktop wake visible", async () => { state.paused = true; state.reason = "low_battery"; renderControl(); await expect(screen.findByRole("button", { name: "Stay Awake" })).resolves.toHaveAttribute("aria-pressed", "false"); });
});
