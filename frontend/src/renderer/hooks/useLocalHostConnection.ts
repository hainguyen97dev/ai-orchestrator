import type { HostId } from "../lib/session-keys";

/** Local-only connection state after removing the saved remote host registry. */
export function useHostConnection(hostId?: HostId) {
	return { hostId, isRemote: false, baseUrl: undefined, label: undefined };
}

export function useConnectedHosts(): HostId[] { return []; }
