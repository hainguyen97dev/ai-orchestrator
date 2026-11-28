import type { WorkspaceSummary } from "../types/workspace";

type SessionPinCache = { unpins: Record<string, { pinnedAt?: string }>; add: (...args: unknown[]) => void; remove: (...args: unknown[]) => void };
const state: SessionPinCache = { unpins: {}, add: () => undefined, remove: () => undefined };
type CacheHook = { <T>(selector: (value: SessionPinCache) => T): T; getState: () => SessionPinCache; setState: (next: Partial<SessionPinCache>) => void };
const useSessionPinCache: CacheHook = Object.assign(<T>(selector: (value: SessionPinCache) => T): T => selector(state), { getState: () => state, setState: (next: Partial<SessionPinCache>) => { Object.assign(state, next); } });
export const useRemoteUnpinStore = useSessionPinCache;
export function withRemoteUnpins<T extends WorkspaceSummary>(workspace: T, _unpins: SessionPinCache["unpins"]): T { return workspace; }
