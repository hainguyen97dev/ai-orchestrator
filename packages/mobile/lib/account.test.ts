import { beforeEach, expect, it, vi } from "vitest";

const secure = new Map<string, string>();

vi.mock("expo-secure-store", () => ({
	getItemAsync: vi.fn(async (key: string) => secure.get(key) ?? null),
	setItemAsync: vi.fn(async (key: string, value: string) => void secure.set(key, value)),
	deleteItemAsync: vi.fn(async (key: string) => void secure.delete(key)),
}));

import { clearPreviousAccount, getAccountAccessToken, loadAccount, loadPreviousAccount, onAccountChange, signInToAccount, signOutOfAccount } from "./account";

beforeEach(() => {
	secure.clear();
	vi.clearAllMocks();
	vi.unstubAllGlobals();
});

it("does not sign in, and opens nothing, while LDAP sign-in is not connected", async () => {
	const fetch = vi.fn();
	vi.stubGlobal("fetch", fetch);
	await expect(signInToAccount()).rejects.toThrow(/not available yet|not connected/);
	expect(fetch).not.toHaveBeenCalled();
	expect(await loadAccount()).toBeNull();
	expect(await getAccountAccessToken()).toBeNull();
});

it("retires a session the removed WorkOS sign-in saved, without refreshing it", async () => {
	secure.set("ao.account.session", JSON.stringify({ id: "user_legacy", email: "person@example.com", refreshToken: "legacy-refresh" }));
	const fetch = vi.fn();
	vi.stubGlobal("fetch", fetch);
	expect(await getAccountAccessToken()).toBeNull();
	expect(await loadAccount()).toBeNull();
	expect(fetch).not.toHaveBeenCalled();
	expect(secure.has("ao.account.session")).toBe(false);
	// Kept so account-host sync can move this phone's machines to the new user ID.
	expect(await loadPreviousAccount()).toEqual({ id: "user_legacy", email: "person@example.com" });
	await clearPreviousAccount("someone-else");
	expect(await loadPreviousAccount()).not.toBeNull();
	await clearPreviousAccount("user_legacy");
	expect(await loadPreviousAccount()).toBeNull();
});

it("drops an unreadable saved session without keeping a previous account", async () => {
	secure.set("ao.account.session", "{not json");
	expect(await loadAccount()).toBeNull();
	expect(secure.has("ao.account.session")).toBe(false);
	expect(await loadPreviousAccount()).toBeNull();
});

it("tells listeners about a sign-out", async () => {
	const listener = vi.fn();
	const stop = onAccountChange(listener);
	await signOutOfAccount();
	stop();
	expect(listener).toHaveBeenCalledWith(null);
});
