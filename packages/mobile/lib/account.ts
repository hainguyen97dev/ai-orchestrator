import * as SecureStore from "expo-secure-store";

// The phone's Orchestrator account. WorkOS AuthKit sign-in was removed; the
// organization's LDAP sign-in (EXPO_PUBLIC_AO_LDAP_URL) replaces it once the
// control plane accepts it. Until then there is no way to sign in, and a
// session WorkOS saved before is retired on first read.
const STORE_KEY = "ao.account.session";
const PREVIOUS_KEY = "ao.account.previous";

/**
 * The LDAP directory sign-in will use: an ldap:// or ldaps:// URL. Public
 * configuration, never a credential; the control plane does the bind.
 */
export const LDAP_URL = process.env.EXPO_PUBLIC_AO_LDAP_URL?.trim() || null;

/** `name` and `avatarUrl` are the person's own, from the sign-in provider, when it has them. */
export type Account = { id: string; email: string; name?: string; avatarUrl?: string };

let credentialWrite: Promise<unknown> = Promise.resolve();

// Serialize credential storage.
function mutateCredentials<T>(operation: () => Promise<T>): Promise<T> {
	const next = credentialWrite.then(operation);
	credentialWrite = next.catch(() => {});
	return next;
}

// A session saved by the removed WorkOS sign-in cannot be used any more. Its
// ID and email are kept so account-host sync can move this phone's machines
// to the account's new ID once LDAP sign-in exists (adoptPreviousAccount in
// accountHosts.ts).
async function retireStoredSession(): Promise<void> {
	const raw = await SecureStore.getItemAsync(STORE_KEY);
	if (!raw) return;
	await mutateCredentials(async () => {
		if (await SecureStore.getItemAsync(STORE_KEY) !== raw) return;
		try {
			const { id, email } = JSON.parse(raw) as Partial<Account>;
			if (id && email) await SecureStore.setItemAsync(PREVIOUS_KEY, JSON.stringify({ id, email } satisfies Account));
		} catch { /* Unreadable: nothing to keep. */ }
		await SecureStore.deleteItemAsync(STORE_KEY);
	});
}

/** The signed-in account. Always null until LDAP sign-in is connected. */
export async function loadAccount(): Promise<Account | null> {
	await retireStoredSession();
	return null;
}

/** The account a retired session belonged to. */
export async function loadPreviousAccount(): Promise<Account | null> {
	const raw = await SecureStore.getItemAsync(PREVIOUS_KEY);
	if (!raw) return null;
	try {
		const { id, email } = JSON.parse(raw) as Account;
		return id && email ? { id, email } : null;
	} catch {
		return null;
	}
}

/** Account-host sync calls this once it has dealt with that account's machines. */
export function clearPreviousAccount(id: string): Promise<void> {
	return mutateCredentials(async () => {
		if ((await loadPreviousAccount())?.id === id) await SecureStore.deleteItemAsync(PREVIOUS_KEY);
	});
}

/** Sign-in is not available yet; callers show this error's message. */
export async function signInToAccount(): Promise<Account | null> {
	throw new Error(LDAP_URL
		? "LDAP sign-in is configured but not connected to Orchestrator Cloud yet."
		: "Orchestrator sign-in is not available yet.");
}

export async function signOutOfAccount(): Promise<void> {
	await mutateCredentials(() => SecureStore.deleteItemAsync(STORE_KEY));
	notifyAccountChange(null);
}

type AccountListener = (account: Account | null) => void;
const accountListeners = new Set<AccountListener>();

function notifyAccountChange(account: Account | null): void {
	for (const listener of accountListeners) {
		try { listener(account); } catch { /* One listener must not stop the others. */ }
	}
}

/** Hear about sign-in and sign-out wherever they happen (Settings, Cloud). */
export function onAccountChange(listener: AccountListener): () => void {
	accountListeners.add(listener);
	return () => { accountListeners.delete(listener); };
}

/** Account APIs use this token; it must never be sent to an AO daemon. None until LDAP sign-in exists. */
export async function getAccountAccessToken(): Promise<string | null> {
	await retireStoredSession();
	return null;
}
