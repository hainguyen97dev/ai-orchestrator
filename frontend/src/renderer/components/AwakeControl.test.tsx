import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render as renderView, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { awakeQueryKey, type AwakeState } from "../hooks/useAwake";
import { useStayAwake } from "../hooks/useStayAwake";
import { AwakeControl, AwakeMenuItem, awakeNeedsAttention, useFooterStayAwake } from "./AwakeControl";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { TooltipProvider } from "./ui/tooltip";

function render(ui: React.ReactNode) {
	return renderView(<TooltipProvider delayDuration={0}>{ui}</TooltipProvider>);
}

const test = vi.hoisted(() => ({ mac: true, get: vi.fn(), post: vi.fn() }));
vi.mock("../lib/platform", () => ({ isMacPlatform: () => test.mac }));
vi.mock("../lib/telemetry", () => ({ captureRendererEvent: vi.fn() }));
vi.mock("../lib/api-client", () => ({
	apiClient: { GET: test.get, POST: test.post },
	apiErrorMessage: (e: unknown) => String(e),
}));
let client: QueryClient;
let state: AwakeState;
let release: (() => void) | undefined;
let blockStart: boolean;
function snapshot() { return structuredClone(state); }
function awakeSession(overrides: Partial<AwakeState["sessions"][number]>) {
	return { id: "awake", scope: "ao" as const, sessionId: "", mode: "indefinite" as const,
		boundId: "", boundIdentity: "", createdAt: "2026-10-19T00:00:00Z", endReason: "", label: "For AO", lidClosed: false, ...overrides };
}
beforeEach(() => {
	test.mac = true;
	release = undefined;
	blockStart = false;
	client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
	state = { settings: { lidClosed: true }, sessions: [], rules: [], activeRules: [], active: false, paused: false, capabilities: [{ id: "idle", available: true }] } as unknown as AwakeState;
	test.get.mockReset().mockImplementation(async () => ({ data: snapshot() }));
	test.post.mockReset().mockImplementation(async (path, options) => {
		if (path === "/api/v1/awake/sessions") {
			if (blockStart) await new Promise<void>((resolve) => { release = resolve; });
			state.sessions.push(awakeSession({ id: "new", ...options.body }));
			state.active = true;
		} else if (path === "/api/v1/awake/stop") {
			state.sessions = state.sessions.map((s) => ({ ...s, endedAt: "now" }));
			state.paused = true;
			state.active = false;
			state.lidActive = false;
			state.activeRules = [];
		} else if (path === "/api/v1/awake/sessions/{awakeId}/end") {
			state.sessions = state.sessions.map((s) => s.id === options.params.path.awakeId ? { ...s, endedAt: "now" } : s);
		} else if (path === "/api/v1/awake/resume") state.paused = false;
		return { data: snapshot() };
	});
});
function LidControl() {
	const stay = useStayAwake();
	return <>
		<button disabled={stay.busy || !stay.supported} onClick={() => stay.set(!stay.on)} aria-pressed={stay.on}>Wake</button>
		<button disabled={stay.busy || !stay.supported} onClick={() => stay.setLid(!stay.lidOn)} aria-pressed={stay.lidOn}>Lid wake</button>
	</>;
}
async function show() {
	render(<QueryClientProvider client={client}><AwakeControl /><LidControl /></QueryClientProvider>);
	await waitFor(() => expect(coffee()).toBeEnabled());
}
function coffee() { return screen.getByRole("button", { name: "Stay Awake" }); }

describe("shared Stay Awake controls", () => {
	it("renders no coffee button off macOS", () => {
		test.mac = false;
		render(<QueryClientProvider client={client}><AwakeControl /></QueryClientProvider>);
		expect(screen.queryByTestId("awake-button")).toBeNull();
	});


	it.each([-1, 0])("forwards tabIndex %i to the coffee button and respects keyboard navigation", async (tabIndex) => {
		const user = userEvent.setup();
		render(<QueryClientProvider client={client}>
			<button>Before coffee</button><AwakeControl tabIndex={tabIndex} /><button>After coffee</button>
		</QueryClientProvider>);
		await waitFor(() => expect(coffee()).toBeEnabled());
		expect(coffee()).toHaveAttribute("tabindex", String(tabIndex));
		await user.click(screen.getByRole("button", { name: "Before coffee" }));
		await user.tab();
		expect(tabIndex === -1 ? screen.getByRole("button", { name: "After coffee" }) : coffee()).toHaveFocus();
		expect(test.post).not.toHaveBeenCalled();
	});

	it("starts idle-only wake even when the saved desktop lid default is true", async () => {
		await show();
		expect(coffee()).toHaveAccessibleDescription("Stay Awake is off. Click to turn on.");
		fireEvent.click(coffee());
		await waitFor(() => expect(test.post).toHaveBeenCalledWith("/api/v1/awake/sessions", { body: expect.objectContaining({ scope: "ao", mode: "indefinite", lidClosed: false }) }));
		await waitFor(() => expect(coffee()).toHaveAttribute("aria-pressed", "true"));
		expect(screen.getByRole("button", { name: "Lid wake" })).toHaveAttribute("aria-pressed", "false");
	});
	it("stops session-scoped, timed, and automatic wake owners", async () => {
		state.sessions = [awakeSession({ id: "scoped", scope: "session", sessionId: "work" }), awakeSession({ id: "timer", mode: "duration" })];
		state.rules = [{ id: "automatic", enabled: true }] as AwakeState["rules"];
		await show();
		fireEvent.click(coffee());
		await waitFor(() => expect(test.post).toHaveBeenCalledWith("/api/v1/awake/stop"));
		await waitFor(() => expect(coffee()).toHaveAttribute("aria-pressed", "false"));
		expect(state.paused).toBe(true);
		expect(state.sessions.every((s) => s.endedAt)).toBe(true);
	});
	it("shows armed automatic rules even without a manual session", async () => {
		state.rules = [{ id: "automatic", enabled: true }] as AwakeState["rules"];
		await show();
		expect(coffee()).toHaveAttribute("aria-pressed", "true");
		fireEvent.click(coffee());
		await waitFor(() => expect(coffee()).toHaveAttribute("aria-pressed", "false"));
	});
	it.each(["session", "rule"])("does not report a persisted %s wake request as starting", async (source) => {
		if (source === "session") state.sessions = [awakeSession({})];
		if (source === "rule") state.rules = [{ id: "automatic", enabled: true }] as AwakeState["rules"];
		await show();
		expect(coffee()).toHaveAttribute("aria-pressed", "true");
		expect(coffee()).not.toHaveAttribute("aria-busy");
	});

	it.each([
		{ reason: "low_battery", stopBatteryPercent: 10, explanation: /Paused: battery below 10%/ },
		{ reason: "low_battery", stopBatteryPercent: 45, explanation: /Paused: battery below 45%/ },
		{ reason: "critical_heat", stopBatteryPercent: 10, explanation: /Mac cools/ },
		{ reason: "battery_unknown", stopBatteryPercent: 10, explanation: /Battery status unavailable/ },
	])("explains a confirmed $reason safety stop (battery limit $stopBatteryPercent%) and keeps it clearable", async ({ reason, stopBatteryPercent, explanation }) => {
		state.sessions = [awakeSession({})];
		state.settings.stopBatteryPercent = stopBatteryPercent;
		state.active = true;
		await show();
		expect(coffee().querySelector("[data-nav-row-highlight]")).toHaveClass("bg-interactive-active");
		state.active = false;
		state.paused = true;
		state.reason = reason;
		await act(async () => { await client.invalidateQueries({ queryKey: awakeQueryKey }); });
		expect(coffee()).toHaveAttribute("aria-pressed", "true");
		await waitFor(() => expect(screen.getByTestId("awake-inactive-indicator")).toHaveClass("size-2.5"));
		expect(coffee().querySelector("[data-nav-row-highlight]")).not.toHaveClass("bg-interactive-active");
		expect(coffee()).toHaveAccessibleDescription(explanation);
		await userEvent.hover(coffee());
		await screen.findByRole("tooltip");
		expect(screen.getByRole("tooltip")).toHaveTextContent(explanation);
		if (reason === "low_battery") expect(screen.getByRole("tooltip")).toHaveTextContent(`${stopBatteryPercent}%`);
		fireEvent.click(coffee());
		await waitFor(() => expect(coffee()).toHaveAttribute("aria-pressed", "false"));
		expect(test.post).toHaveBeenCalledWith("/api/v1/awake/stop");
	});
	it("clears the red battery marker automatically after recovery while keeping the sidebar-sized coffee icon", async () => {
		state.sessions = [awakeSession({})];
		state.paused = true;
		state.reason = "low_battery";
		await show();
		expect(screen.getByTestId("awake-inactive-indicator")).toHaveClass("icon-triangle-alert", "size-2.5", "text-error", "-right-1", "-top-1");
		expect(coffee().querySelector(".icon-coffee")).toHaveClass("size-icon-md");
		expect(coffee()).toHaveAccessibleDescription("Paused: battery below 10%.\nResumes after charging.");
		state.paused = false;
		state.reason = "";
		state.active = true;
		await act(async () => { await client.invalidateQueries({ queryKey: awakeQueryKey }); });
		await waitFor(() => expect(screen.queryByTestId("awake-inactive-indicator")).toBeNull());
		expect(coffee().querySelector(".icon-coffee")).toHaveClass("size-icon-md");
		expect(coffee().querySelector("[data-nav-row-highlight]")).toHaveClass("bg-interactive-active");
		expect(test.post).not.toHaveBeenCalled();
	});
	it.each(["helper_missing", "unsupported", "isolated_data_dir", "observation_unavailable", "persistence_failed"])("keeps an unmatched armed rule's inactive description generic despite %s", async (reason) => {
		state.rules = [{ id: "automatic", enabled: true }] as AwakeState["rules"];
		state.reason = reason;
		await show();
		const description = "Stay Awake is paused. Click to turn off.";
		expect(coffee()).toHaveAttribute("aria-pressed", "true");
		expect(coffee()).toHaveAccessibleDescription(description);
		await userEvent.hover(coffee());
		expect(await screen.findByRole("tooltip")).toHaveTextContent(description);
	});
	it.each([
		{ paused: false, reason: "low_battery" },
		{ paused: false, reason: "critical_heat" },
		{ paused: false, reason: "battery_unknown" },
		{ paused: true, reason: "observation_unavailable" },
		{ paused: true, reason: "persistence_failed" },
		{ paused: true, reason: "unknown_future_reason" },
	])("does not describe an unconfirmed safety stop ($reason, paused=$paused)", async ({ paused, reason }) => {
		state.sessions = [awakeSession({})];
		state.paused = paused;
		state.reason = reason;
		await show();
		expect(coffee()).toHaveAttribute("aria-pressed", "true");
		expect(coffee()).toHaveAccessibleDescription("Stay Awake is paused. Click to turn off.");
	});
	it("marks configured but inactive rule wake without an active fill", async () => {
		state.rules = [{ id: "automatic", enabled: true }] as AwakeState["rules"];
		await show();
		expect(coffee()).toHaveAccessibleDescription(/Stay Awake is paused/);
		expect(screen.getByTestId("awake-inactive-indicator")).toBeInTheDocument();
		expect(coffee().querySelector("[data-nav-row-highlight]")).not.toHaveClass("bg-interactive-active");
	});
	it("fills the coffee button only when desktop wake is actually held", async () => {
		state.active = true;
		await show();
		expect(coffee()).toHaveAccessibleDescription(/Stay Awake is on/);
		expect(screen.queryByTestId("awake-inactive-indicator")).toBeNull();
		expect(coffee().querySelector("[data-nav-row-highlight]")).toHaveClass("bg-interactive-active");
	});

	it.each([2, 3, 6, 7])("coalesces %s rapid clicks while keeping the button enabled and the latest intent visible", async (clicks) => {
		blockStart = true;
		await show();
		fireEvent.click(coffee());
		await waitFor(() => expect(release).toBeDefined());
		for (let i = 1; i < clicks; i++) {
			fireEvent.click(coffee());
			expect(coffee()).toBeEnabled();
			expect(coffee()).toHaveClass("cursor-pointer");
			await waitFor(() => expect(coffee()).toHaveAttribute("aria-pressed", String((i + 1) % 2 === 1)));
		}
		const wanted = clicks % 2 === 1;
		if (wanted) expect(coffee().querySelector("[data-nav-row-highlight]")).toHaveClass("bg-interactive-active");
		else expect(coffee().querySelector("[data-nav-row-highlight]")).not.toHaveClass("bg-interactive-active");
		await act(async () => release!());
		await waitFor(() => expect(client.isMutating()).toBe(0));
		await waitFor(() => expect(coffee()).toBeEnabled());
		expect(coffee()).toHaveAttribute("aria-pressed", String(wanted));
		expect(state.active).toBe(wanted);
		expect(state.sessions.filter((s) => !s.endedAt)).toHaveLength(wanted ? 1 : 0);
		expect(test.post.mock.calls.filter(([path]) => path === "/api/v1/awake/sessions")).toHaveLength(1);
		expect(test.post.mock.calls.filter(([path]) => path === "/api/v1/awake/stop")).toHaveLength(wanted ? 0 : 1);
	});
	it.each([2, 3, 8, 9])("counts all %s clicks even before the pending-intent subscription re-renders", async (clicks) => {
		blockStart = true;
		await show();
		fireEvent.click(coffee());
		await waitFor(() => expect(release).toBeDefined());
		act(() => { for (let i = 1; i < clicks; i++) fireEvent.click(coffee()); });
		await waitFor(() => expect(coffee()).toHaveAttribute("aria-pressed", String(clicks % 2 === 1)));
		await act(async () => release!());
		await waitFor(() => expect(client.isMutating()).toBe(0));
		expect(state.active).toBe(clicks % 2 === 1);
		expect(state.sessions.filter((s) => !s.endedAt)).toHaveLength(clicks % 2 === 1 ? 1 : 0);
	});
	it("serializes a new start after a delayed stop and reads the latest sessions", async () => {
		state.active = true;
		state.sessions = [awakeSession({ id: "old" })];
		let finishStop: (() => void) | undefined;
		const post = test.post.getMockImplementation()!;
		test.post.mockImplementation(async (path, options) => {
			if (path === "/api/v1/awake/stop") await new Promise<void>((resolve) => { finishStop = resolve; });
			return post(path, options);
		});
		await show();
		fireEvent.click(coffee());
		await waitFor(() => expect(finishStop).toBeDefined());
		fireEvent.click(coffee());
		await waitFor(() => expect(coffee()).toHaveAttribute("aria-pressed", "true"));
		expect(state.sessions).toHaveLength(1);
		await act(async () => finishStop!());
		await waitFor(() => expect(client.isMutating()).toBe(0));
		await waitFor(() => expect(coffee()).toBeEnabled());
		expect(state.active).toBe(true);
		expect(state.sessions.filter((s) => !s.endedAt)).toHaveLength(1);
		expect(state.sessions[0].endedAt).toBeDefined();
	});

	it("rolls back the immediate highlight when a delayed start fails", async () => {
		let fail: ((value: { error: string }) => void) | undefined;
		test.post.mockImplementation(() => new Promise((resolve) => { fail = resolve; }));
		await show();
		fireEvent.click(coffee());
		await waitFor(() => expect(fail).toBeDefined());
		expect(coffee()).toHaveAttribute("aria-pressed", "true");
		expect(coffee().querySelector("[data-nav-row-highlight]")).toHaveClass("bg-interactive-active");
		await act(async () => fail!({ error: "native request failed" }));
		await waitFor(() => expect(client.isMutating()).toBe(0));
		await waitFor(() => expect(coffee()).toBeEnabled());
		expect(coffee()).toHaveAttribute("aria-pressed", "false");
		expect(coffee().querySelector("[data-nav-row-highlight]")).not.toHaveClass("bg-interactive-active");
		expect(coffee()).toHaveAccessibleDescription("Couldn’t update Stay Awake. Try again.");
	});

	it.each(["active", "safety stop", "timeout", "status error", "hung status"])("shows optimistic feedback until native acknowledgement settles (%s)", async (outcome) => {
		const post = test.post.getMockImplementation()!;
		test.post.mockImplementation(async (path, options) => {
			const result = await post(path, options);
			if (path === "/api/v1/awake/sessions") {
				state.active = false;
				state.reason = "starting";
				return { data: snapshot() };
			}
			return result;
		});
		await show();
		vi.useFakeTimers();
		try {
			fireEvent.click(coffee());
			await act(async () => { await vi.advanceTimersByTimeAsync(0); });
			// The POST has finished, but native ownership has not been acknowledged.
			expect(state.sessions).toHaveLength(1);
			for (let i = 0; i < 4; i++) {
				expect(coffee()).not.toHaveAttribute("aria-busy");
				expect(coffee()).toHaveAttribute("aria-pressed", "true");
				expect(coffee()).toHaveClass("cursor-pointer");
				expect(coffee().querySelector("[data-nav-row-highlight]")).toHaveClass("bg-interactive-active");
				expect(coffee()).toHaveAccessibleDescription(/Stay Awake is on/);
				expect(coffee()).toBeEnabled();
				expect(screen.getByRole("button", { name: "Wake" })).toBeDisabled();
				expect(screen.queryByTestId("awake-inactive-indicator")).toBeNull();
				await act(async () => { await vi.advanceTimersByTimeAsync(500); });
			}
			if (outcome === "active") state.active = true;
			if (outcome === "safety stop") {
				state.paused = true;
				state.reason = "low_battery";
			}
			if (outcome === "status error") test.get.mockRejectedValue(new Error("status unavailable"));
			if (outcome === "hung status") test.get.mockImplementation(() => new Promise(() => {}));
			await act(async () => { await vi.advanceTimersByTimeAsync(outcome === "timeout" || outcome === "hung status" ? 3_100 : 600); });
			expect(coffee()).not.toHaveAttribute("aria-busy");
			expect(coffee()).toBeEnabled();
			if (outcome === "active") {
				expect(screen.queryByTestId("awake-inactive-indicator")).toBeNull();
				expect(coffee()).toHaveAccessibleDescription(/Stay Awake is on/);
				expect(coffee().querySelector("[data-nav-row-highlight]")).toHaveClass("bg-interactive-active");
			} else {
				expect(screen.getByTestId("awake-inactive-indicator")).toBeInTheDocument();
				if (outcome === "safety stop") expect(coffee()).toHaveAccessibleDescription(/battery/i);
			}
		} finally {
			client.clear();
			vi.useRealTimers();
		}
	});

	it("replaces closed-lid wake with idle wake when the lid option is turned off", async () => {
		state.sessions = [awakeSession({ id: "lid", lidClosed: true })];
		state.active = true;
		await show();
		fireEvent.click(screen.getByRole("button", { name: "Lid wake" }));
		await waitFor(() => expect(screen.getByRole("button", { name: "Lid wake" })).toHaveAttribute("aria-pressed", "false"));
		expect(state.sessions.filter((s) => !s.endedAt)).toEqual([expect.objectContaining({ lidClosed: false })]);
		expect(coffee()).toHaveAttribute("aria-pressed", "true");
	});
	it("replaces idle wake with closed-lid wake when the lid option is turned on", async () => {
		state.sessions = [awakeSession({ id: "idle", lidClosed: false })];
		state.active = true;
		await show();
		fireEvent.click(screen.getByRole("button", { name: "Lid wake" }));
		await waitFor(() => expect(screen.getByRole("button", { name: "Lid wake" })).toHaveAttribute("aria-pressed", "true"));
		expect(state.sessions.filter((s) => !s.endedAt)).toEqual([expect.objectContaining({ lidClosed: true })]);
		expect(coffee()).toHaveAttribute("aria-pressed", "true");
	});
	it("resumes paused wake before starting", async () => {
		state.paused = true;
		await show();
		fireEvent.click(coffee());
		await waitFor(() => expect(state.active).toBe(true));
		expect(test.post.mock.calls.map(([path]) => path)).toEqual(["/api/v1/awake/resume", "/api/v1/awake/sessions"]);
	});
	it("refreshes a safety stop that happened after the last poll without parsing the error wording", async () => {
		const post = test.post.getMockImplementation()!;
		let attempts = 0;
		test.post.mockImplementation(async (path, options) => {
			if (path === "/api/v1/awake/sessions" && attempts++ === 0) {
				state.paused = true;
				return { error: "A completely reworded daemon error" };
			}
			return post(path, options);
		});
		await show();
		fireEvent.click(coffee());
		await waitFor(() => expect(state.active).toBe(true));
		expect(test.post.mock.calls.map(([path]) => path)).toEqual(["/api/v1/awake/sessions", "/api/v1/awake/resume", "/api/v1/awake/sessions"]);
		expect(screen.queryByRole("alert")).toBeNull();
	});
	it("does not resume or retry an unrelated failure even when its text mentions safety stop", async () => {
		test.post.mockResolvedValue({ error: "unrelated failure mentioning safety stop" });
		await show();
		fireEvent.click(coffee());
		await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("unrelated failure"));
		expect(test.post).toHaveBeenCalledTimes(1);
		expect(state.paused).toBe(false);
	});
	it("preserves the start failure without resuming when refreshed state is unavailable", async () => {
		await show();
		test.post.mockImplementation(async () => {
			test.get.mockRejectedValue(new Error("status unavailable"));
			return { error: "start refused" };
		});
		fireEvent.click(coffee());
		await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("start refused"));
		expect(test.post).toHaveBeenCalledTimes(1);
	});


});

describe("footer Stay Awake menu row", () => {
	// Mirrors the sidebar footer: the trigger holds the state, the row only renders it.
	function FooterMenu() {
		const stay = useFooterStayAwake();
		return (
			<DropdownMenu>
				<DropdownMenuTrigger data-attention={awakeNeedsAttention(stay)}>Menu</DropdownMenuTrigger>
				<DropdownMenuContent>
					<AwakeMenuItem stay={stay} />
				</DropdownMenuContent>
			</DropdownMenu>
		);
	}

	it("keeps a failed toggle badged and explained after the menu closes", async () => {
		const user = userEvent.setup();
		const post = test.post.getMockImplementation()!;
		test.post.mockImplementation(async (path, options) => path === "/api/v1/awake/sessions"
			? { error: "helper unavailable" } : post(path, options));
		render(<QueryClientProvider client={client}><FooterMenu /></QueryClientProvider>);
		const trigger = screen.getByRole("button", { name: "Menu" });
		expect(trigger).toHaveAttribute("data-attention", "false");

		await user.click(trigger);
		const row = await screen.findByTestId("awake-menu-item");
		await waitFor(() => expect(row).not.toHaveAttribute("data-disabled"));
		await user.click(row);
		await screen.findByText("Couldn’t update Stay Awake. Try again.");
		expect(row).toHaveAttribute("aria-checked", "false");

		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByTestId("awake-menu-item")).toBeNull());
		expect(trigger).toHaveAttribute("data-attention", "true");

		await user.click(trigger);
		expect(await screen.findByText("Couldn’t update Stay Awake. Try again.")).toBeVisible();
	});
});
