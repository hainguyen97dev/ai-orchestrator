import { useIsMutating, useMutation, useMutationState, useQueryClient } from "@tanstack/react-query";
import { awakeCapability, awakeQueryKey, type AwakeState, useAwake } from "./useAwake";

// idleFallback keeps the sidebar's ordinary idle wake useful if a closed-lid
// helper cannot be prepared on this machine.
type Change = { on: boolean; lidClosed?: boolean; idleFallback?: boolean };
const mutationKey = ["stay-awake-toggle"] as const;

/** Desktop wake controls share the daemon's Awake lease and automatic rules. */
export function useStayAwake(enabled = true) {
	const cache = useQueryClient();
	const awake = useAwake(enabled);
	const sessions = awake.state?.sessions?.filter((session) => !session.endedAt) ?? [];
	const rules = awake.state?.paused ? [] : awake.state?.rules?.filter((rule) => rule.enabled && !rule.suppressed) ?? [];
	const desktopOn = sessions.length > 0 || rules.length > 0 || !!awake.state?.active;
	const desktopLid = sessions.some((session) => session.lidClosed) || rules.some((rule) => rule.lidClosed) || !!awake.state?.lidActive;
	const pending = useMutationState<Change>({
		filters: { mutationKey, status: "pending" },
		select: (mutation) => mutation.state.variables as Change,
	});
	const intent = pending.at(-1);
	const busy = useIsMutating({ mutationKey }) > 0 || awake.busy;
	const active = !!awake.state?.active;
	const on = intent?.on ?? (desktopOn || active);
	const pauseReason = awake.state?.paused ? awake.state.reason : undefined;
	const reason = pauseReason === "low_battery" || pauseReason === "critical_heat" || pauseReason === "battery_unknown" ? pauseReason : undefined;
	const latestChange = () => cache.getMutationCache().findAll({ mutationKey, status: "pending" }).at(-1)?.state.variables as Change | undefined;
	const currentState = () => cache.getQueryData<AwakeState>(awakeQueryKey) ?? awake.state;
	const mutation = useMutation({
		mutationKey,
		scope: { id: "stay-awake-toggle" },
		mutationFn: async (change: Change) => {
			const isLatest = () => latestChange() === change;
			if (!isLatest()) return;
			const start = async (lidClosed = false) => {
				let latest = await awake.actAsync({ kind: "start", request: { scope: "ao", sessionId: "", mode: "indefinite", lidClosed } });
				const deadline = Date.now() + 5_000;
				while (isLatest() && !latest.active && !latest.paused && (!latest.reason || latest.reason === "starting" || latest.reason === "helper_unavailable") && Date.now() < deadline) {
					await new Promise((resolve) => setTimeout(resolve, 500));
					let timeout: number | undefined;
					try {
						const confirmed = await Promise.race([
							cache.fetchQuery<AwakeState>({ queryKey: awakeQueryKey, staleTime: 0 }),
							new Promise<undefined>((resolve) => { timeout = window.setTimeout(resolve, Math.max(0, deadline - Date.now())); }),
						]);
						if (!confirmed) break;
						latest = confirmed;
					} catch {
						break;
					} finally {
						window.clearTimeout(timeout);
					}
				}
			};
			const ensureDesktop = async (lidClosed = false) => {
				if (currentState()?.paused) await awake.actAsync({ kind: "resume" });
				if (currentState()?.sessions?.some((session) => !session.endedAt)) return;
				try {
					await start(lidClosed);
				} catch (error) {
					await cache.cancelQueries({ queryKey: awakeQueryKey });
					const latest = await cache.fetchQuery<AwakeState>({ queryKey: awakeQueryKey, staleTime: 0 }).catch(() => undefined);
					if (!latest?.paused) throw error;
					await awake.actAsync({ kind: "resume" });
					await start(lidClosed);
				}
			};
			if (!change.on) {
				await awake.actAsync({ kind: "stop" });
			} else if (change.lidClosed === true) {
				try {
					await ensureDesktop(true);
				} catch (error) {
					if (!change.idleFallback) throw error;
					await ensureDesktop(false);
				}
			} else {
				await ensureDesktop(false);
			}
		},
	});
	const change = (next: Change) => mutation.mutate(next);
	return {
		on,
		active,
		attention: on && !active && !busy,
		reason: desktopOn ? reason : undefined,
		stopBatteryPercent: awake.state?.settings?.stopBatteryPercent ?? 10,
		lidOn: intent ? intent.on && (intent.lidClosed ?? false) : desktopLid,
		toggle: () => {
			const current = currentState();
			const requested = current?.sessions?.some((session) => !session.endedAt)
				|| (!current?.paused && current?.rules?.some((rule) => rule.enabled && !rule.suppressed))
				|| current?.active;
			change({ on: !(latestChange()?.on ?? requested) });
		},
		set: (on: boolean) => change({ on }),
		setLid: (lidClosed: boolean) => change({ on: true, lidClosed }),
		busy,
		error: mutation.error instanceof Error ? mutation.error.message : null,
		supported: awakeCapability(awake.state, "idle")?.available ?? false,
		starting: intent?.on === true,
		stopping: intent?.on === false,
	};
}
