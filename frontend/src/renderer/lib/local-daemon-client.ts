import { apiClient } from "./api-client";
import type { HostId } from "./session-keys";

/** All session requests now belong to this desktop's loopback daemon. */
export function clientForSessionHost(_hostId?: HostId) { return apiClient; }

/** Remote daemon access was removed in L1 F-13 B1. */
export function clientForHost(_hostId: HostId): typeof apiClient {
  throw new Error("Remote hosts are no longer supported.");
}

export function connectedHosts(): HostId[] { return []; }
export function subscribeConnectedHosts(_listener: () => void): () => void { return () => undefined; }
export function baseUrlForHost(_hostId: HostId): string | undefined { return undefined; }
export function connectedHost(_hostId: HostId): undefined { return undefined; }
export function isQuickTunnelHost(_hostId: HostId): boolean { return false; }
export function labelForHost(_hostId: HostId): undefined { return undefined; }

export async function openRemoteOrchestrator(..._args: unknown[]): Promise<never> {
  throw new Error("Remote hosts are no longer supported.");
}

export async function connectHost(..._args: unknown[]): Promise<never> { throw new Error("Remote hosts are no longer supported."); }
export async function disconnectHost(..._args: unknown[]): Promise<void> {}
export function requestRemoteHostCheck(_hostId: string): void {}
export function probeRemoteSse(_url: string, _types: readonly string[], _onEvent: (event: MessageEvent<string>) => void, ..._callbacks: Array<(...args: unknown[]) => void>): () => void { return () => undefined; }
